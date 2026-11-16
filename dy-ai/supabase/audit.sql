-- 변경 이력 + 롤백 (편집 가능한 모든 표)
--   - 대상 표에 행 단위 트리거를 걸어 입력·수정·삭제를 dy_audit_log 에 남긴다 (누가·언제·무엇이 어떻게 바뀌었는지, 바뀌기 전/후 전체 행)
--   - 어느 화면·RPC 로 저장해도 표에 닿는 순간 기록된다 (화면 코드에 의존하지 않음)
--   - 되돌리기: dy_audit_rollback(ids) — 관리자만. 그 뒤에 또 바뀐 행은 건너뛰고 알려 준다 (force 로 덮어쓰기 가능). 되돌린 것도 이력에 남는다.
--   - 제외: 자동 수집 표(inni_sales_* 등), 수집 로그, 화면 환경설정(dy_user_prefs: 열 너비·색)
--   여러 번 실행해도 안전(idempotent).

create table if not exists dy_audit_log (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  txid       bigint not null default txid_current(),     -- 같은 저장 동작은 같은 값
  user_id    uuid,
  user_email text,                                         -- 사람이 아닌 작업(수집 등)은 비어 있음
  tbl        text not null,
  op         text not null check (op in ('I', 'U', 'D')),
  pk         jsonb not null,
  old_row    jsonb,
  new_row    jsonb,
  via        text,                                         -- 'rollback' 이면 되돌리기로 생긴 변경
  reverts    bigint                                        -- 되돌린 이력 id
);
create index if not exists dy_audit_log_ts on dy_audit_log (ts desc);
create index if not exists dy_audit_log_tbl on dy_audit_log (tbl, ts desc);
create index if not exists dy_audit_log_reverts on dy_audit_log (reverts) where reverts is not null;
alter table dy_audit_log enable row level security;
revoke all on dy_audit_log from public, anon, authenticated;

create or replace function dy_audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pkcols text[]; o jsonb; n jsonb; k jsonb; uid uuid; em text;
  strip text[] := array['updated_at', 'updated_by'];
begin
  select array_agg(a.attname::text order by a.attnum) into pkcols
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = tg_relid and i.indisprimary;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (o - strip) = (n - strip) then return null; end if;   -- 수정 시각만 바뀐 건 기록하지 않음
  select coalesce(jsonb_object_agg(c, coalesce(n, o) -> c), '{}'::jsonb) into k from unnest(coalesce(pkcols, array[]::text[])) c;
  begin uid := auth.uid(); exception when others then uid := null; end;
  if uid is not null then select email into em from auth.users where id = uid; end if;
  insert into dy_audit_log (user_id, user_email, tbl, op, pk, old_row, new_row, via, reverts)
  values (uid, em, tg_table_name, left(tg_op, 1), k, o, n,
          nullif(current_setting('dy.audit_via', true), ''), nullif(current_setting('dy.audit_reverts', true), '')::bigint);
  return null;
end;
$$;
revoke all on function dy_audit_trg() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['inni_product_codes', 'inni_comments', 'inni_settings', 'inni_targets', 'inni_ad_manual',
                           'dy_dashboards', 'brand_favorites', 'dy_event_config', 'dy_user_perms'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_audit on %I', t);
      execute format('create trigger trg_audit after insert or update or delete on %I for each row execute function dy_audit_trg()', t);
    end if;
  end loop;
end $$;

-- 목록 (관리자): 표·사용자·기간으로 거르고, before_id 보다 오래된 것부터 limit 개
create or replace function dy_audit_list(p_tbl text default null, p_user text default null, p_from timestamptz default null,
                                         p_to timestamptz default null, p_limit int default 100, p_before bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not dy_is_admin() then raise exception 'no permission'; end if;
  return coalesce((select jsonb_agg(x order by x.id desc) from (
    select l.id, l.ts, l.txid, l.user_email, l.tbl, l.op, l.pk, l.old_row, l.new_row, l.via, l.reverts,
           exists (select 1 from dy_audit_log r where r.reverts = l.id) as rolled_back
      from dy_audit_log l
     where (p_tbl is null or p_tbl = '' or l.tbl = p_tbl)
       and (p_user is null or p_user = '' or l.user_email ilike '%' || p_user || '%' or (p_user = 'system' and l.user_email is null))
       and (p_from is null or l.ts >= p_from) and (p_to is null or l.ts < p_to)
       and (p_before is null or l.id < p_before)
     order by l.id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb);
end;
$$;

-- 되돌리기 (관리자): 입력 → 삭제, 수정 → 이전 값, 삭제 → 다시 입력. 최신 이력부터 거꾸로 처리.
-- 그 행이 이력 이후에 또 바뀌었으면 건너뛰고 skipped 에 이유를 담는다 (p_force 면 덮어씀).
create or replace function dy_audit_rollback(p_ids bigint[], p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e dy_audit_log%rowtype; cur jsonb; expected jsonb; w text; cols text; done int := 0; skipped jsonb := '[]'::jsonb;
  strip text[] := array['updated_at', 'updated_by'];
  allowed text[] := array['inni_product_codes', 'inni_comments', 'inni_settings', 'inni_targets', 'inni_ad_manual',
                          'dy_dashboards', 'brand_favorites', 'dy_event_config', 'dy_user_perms'];
begin
  if not dy_is_admin() then raise exception 'no permission'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('done', 0, 'skipped', skipped); end if;
  if cardinality(p_ids) > 500 then raise exception '한 번에 500건까지만 되돌려요'; end if;
  for e in select * from dy_audit_log where id = any(p_ids) order by id desc loop
    if not (e.tbl = any(allowed)) then skipped := skipped || jsonb_build_object('id', e.id, 'reason', '되돌릴 수 없는 표'); continue; end if;
    select string_agg(format('t.%I = %L', key, value), ' and ') into w from jsonb_each_text(e.pk);
    if w is null then skipped := skipped || jsonb_build_object('id', e.id, 'reason', '기본키가 없어 되돌릴 수 없음'); continue; end if;
    execute format('select to_jsonb(t) from %I t where %s', e.tbl, w) into cur;
    expected := case when e.op = 'D' then null else e.new_row end;
    if not p_force and cur is distinct from expected
       and not (cur is not null and expected is not null and (cur - strip) = (expected - strip)) then
      skipped := skipped || jsonb_build_object('id', e.id, 'reason', '이 변경 뒤에 다시 바뀌어서 건너뜀 (먼저 최근 변경을 되돌리거나 강제로 되돌리세요)');
      continue;
    end if;
    perform set_config('dy.audit_via', 'rollback', true);
    perform set_config('dy.audit_reverts', e.id::text, true);
    if e.op = 'I' then
      execute format('delete from %I t where %s', e.tbl, w);
    elsif e.op = 'U' then
      select string_agg(format('%I = r.%I', key, key), ', ') into cols from jsonb_object_keys(e.old_row) key;
      if cur is null then   -- 지금은 지워져 있음(강제): 이전 값으로 다시 입력
        execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', e.tbl, e.tbl) using e.old_row;
      else
        execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where %s', e.tbl, cols, e.tbl, w) using e.old_row;
      end if;
    else
      if cur is not null then   -- 지금 다시 생겨 있음(강제): 이전 값으로 덮어씀
        select string_agg(format('%I = r.%I', key, key), ', ') into cols from jsonb_object_keys(e.old_row) key;
        execute format('update %I t set %s from jsonb_populate_record(null::%I, $1) r where %s', e.tbl, cols, e.tbl, w) using e.old_row;
      else
        execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', e.tbl, e.tbl) using e.old_row;
      end if;
    end if;
    perform set_config('dy.audit_via', '', true);
    perform set_config('dy.audit_reverts', '', true);
    done := done + 1;
  end loop;
  return jsonb_build_object('done', done, 'skipped', skipped);
end;
$$;

revoke all on function dy_audit_list(text, text, timestamptz, timestamptz, int, bigint), dy_audit_rollback(bigint[], boolean) from public, anon;
grant execute on function dy_audit_list(text, text, timestamptz, timestamptz, int, bigint), dy_audit_rollback(bigint[], boolean) to authenticated;
