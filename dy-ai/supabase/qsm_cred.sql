-- Qoo10(QSM) 로그인 정보 팀 공용 저장 (확장이 로그인 창에 자동 입력할 때 씀)
--   - 값은 Supabase Vault 에 암호화해서 한 벌만 보관. 표에는 평문이 없고 일반 계정은 표·Vault 에 접근 못 함
--   - 저장·삭제: 관리자만 (dy_qsm_cred_set / dy_qsm_cred_clear)
--   - 읽기: 수집 권한(feat.collect) 계정 (dy_qsm_cred_get). 읽을 때마다 dy_qsm_cred_log 에 누가 언제 읽었는지 남김 (값은 안 남김)
--   - 상태(설정 여부·수정 시각·아이디 일부): 수집 권한 계정 (dy_qsm_cred_status)
--   - 저장·삭제는 변경 이력(dy_audit_log, 표 이름 qsm_login)에도 남음 (값 없이)
-- 여러 번 실행해도 안전(idempotent).

create table if not exists dy_qsm_cred_meta (
  id          int primary key check (id = 1),
  secret_id   uuid not null,
  id_hint     text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_email text
);
create table if not exists dy_qsm_cred_log (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  user_id    uuid,
  user_email text,
  action     text not null check (action in ('get', 'set', 'clear'))
);
create index if not exists dy_qsm_cred_log_ts on dy_qsm_cred_log (ts desc);
alter table dy_qsm_cred_meta enable row level security;
alter table dy_qsm_cred_log enable row level security;
revoke all on dy_qsm_cred_meta, dy_qsm_cred_log from public, anon, authenticated;

create or replace function dy_qsm_cred_actor(out uid uuid, out em text)
language plpgsql stable security definer set search_path = public as $$
begin
  begin uid := auth.uid(); exception when others then uid := null; end;
  if uid is not null then select email into em from auth.users where id = uid; end if;
end;
$$;
revoke all on function dy_qsm_cred_actor() from public, anon, authenticated;

-- 읽기: { id, pw, ep } 또는 null (저장 안 됨)
create or replace function dy_qsm_cred_get() returns jsonb
language plpgsql security definer set search_path = public as $$
declare m dy_qsm_cred_meta%rowtype; s text; a record;
begin
  if not dy_can('feat.collect') then raise exception 'no permission'; end if;
  select * into m from dy_qsm_cred_meta where id = 1;
  if not found then return null; end if;
  select decrypted_secret into s from vault.decrypted_secrets where id = m.secret_id;
  if s is null then return null; end if;
  select * into a from dy_qsm_cred_actor();
  insert into dy_qsm_cred_log (user_id, user_email, action) values (a.uid, a.em, 'get');
  return s::jsonb;
end;
$$;

-- 상태: 값 없이 설정 여부·수정 정보·아이디 일부(앞 2글자)
create or replace function dy_qsm_cred_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m dy_qsm_cred_meta%rowtype;
begin
  if not dy_can('feat.collect') then raise exception 'no permission'; end if;
  select * into m from dy_qsm_cred_meta where id = 1;
  if not found then return jsonb_build_object('set', false); end if;
  return jsonb_build_object('set', true, 'id_hint', m.id_hint, 'updated_at', m.updated_at, 'updated_by', m.updated_email);
end;
$$;

-- 저장 (관리자): 아이디 필수, 비밀번호·확인용 아이디는 비어 있어도 됨
create or replace function dy_qsm_cred_set(p_id text, p_pw text, p_ep text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare m dy_qsm_cred_meta%rowtype; payload text; sid uuid; a record; existed boolean;
begin
  if not dy_is_admin() then raise exception 'no permission'; end if;
  if coalesce(btrim(p_id), '') = '' then raise exception '아이디를 입력해 주세요'; end if;
  payload := jsonb_build_object('id', btrim(p_id), 'pw', coalesce(p_pw, ''), 'ep', btrim(coalesce(p_ep, '')))::text;
  select * into m from dy_qsm_cred_meta where id = 1; existed := found;
  select * into a from dy_qsm_cred_actor();
  if existed then
    perform vault.update_secret(m.secret_id, payload, 'dy_qsm_cred', 'Qoo10 QSM 로그인 정보 (팀 공용)');
    sid := m.secret_id;
  else
    sid := vault.create_secret(payload, 'dy_qsm_cred', 'Qoo10 QSM 로그인 정보 (팀 공용)');
  end if;
  insert into dy_qsm_cred_meta (id, secret_id, id_hint, updated_at, updated_by, updated_email)
  values (1, sid, left(btrim(p_id), 2) || '***', now(), a.uid, a.em)
  on conflict (id) do update set secret_id = excluded.secret_id, id_hint = excluded.id_hint, updated_at = now(), updated_by = a.uid, updated_email = a.em;
  insert into dy_qsm_cred_log (user_id, user_email, action) values (a.uid, a.em, 'set');
  insert into dy_audit_log (user_id, user_email, tbl, op, pk, old_row, new_row)
  values (a.uid, a.em, 'qsm_login', case when existed then 'U' else 'I' end, '{}'::jsonb, null,
          jsonb_build_object('action', case when existed then '로그인 정보 변경' else '로그인 정보 저장' end, 'id_hint', left(btrim(p_id), 2) || '***'));
  return jsonb_build_object('ok', true);
end;
$$;

-- 삭제 (관리자)
create or replace function dy_qsm_cred_clear() returns jsonb
language plpgsql security definer set search_path = public as $$
declare m dy_qsm_cred_meta%rowtype; a record;
begin
  if not dy_is_admin() then raise exception 'no permission'; end if;
  select * into m from dy_qsm_cred_meta where id = 1;
  if not found then return jsonb_build_object('ok', true, 'cleared', false); end if;
  select * into a from dy_qsm_cred_actor();
  delete from vault.secrets where id = m.secret_id;
  delete from dy_qsm_cred_meta where id = 1;
  insert into dy_qsm_cred_log (user_id, user_email, action) values (a.uid, a.em, 'clear');
  insert into dy_audit_log (user_id, user_email, tbl, op, pk, old_row, new_row)
  values (a.uid, a.em, 'qsm_login', 'D', '{}'::jsonb, jsonb_build_object('action', '로그인 정보 삭제', 'id_hint', m.id_hint), null);
  return jsonb_build_object('ok', true, 'cleared', true);
end;
$$;

revoke all on function dy_qsm_cred_get(), dy_qsm_cred_status(), dy_qsm_cred_set(text, text, text), dy_qsm_cred_clear() from public, anon;
grant execute on function dy_qsm_cred_get(), dy_qsm_cred_status(), dy_qsm_cred_set(text, text, text), dy_qsm_cred_clear() to authenticated;
