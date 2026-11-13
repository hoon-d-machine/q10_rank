-- 권한을 DB 에서도 강제: 화면에서 숨긴 메뉴·탭의 데이터는 API 로도 읽거나 쓸 수 없게 한다
--   admin.sql(dy_user_perms · dy_can) 다음에 실행. 여러 번 실행해도 됨
--   방식: 기존 함수 X 를 X__raw 로 이름을 바꾸고(실행 권한 회수), 같은 이름·같은 인자의 감싸는 함수 X 를 만들어
--         권한을 확인한 뒤 X__raw 를 부른다 → 화면·확장 프로그램 코드는 그대로 동작
--   권한 확인 규칙 (dy_can: 관리자·'*' 는 전부 통과, 권한 행이 없거나 사용 중지면 전부 막힘)
--     대시보드 읽기(dy_dash_*·dy_rank_days·dy_inni_*_get)      dash.* 권한이 하나라도 있어야 함
--     원본 표 읽기(dy_data_page)                              data.t.<표> 또는 dash.* (대시보드가 같은 함수를 씀)
--     코멘트·설정 저장(dy_inni_comment_set · settings_set)     feat.settings + dash.*
--     월별 목표·광고비 입력(dy_inni_targets_set · ad_manual_set) feat.input + dash.*
--     행사 랭킹(dy_event_meta · rows · config_set)             menu.event
--     수집 저장(inni_replace_* · inni_upsert_mega_events)      feat.collect
--     수집 로그 읽기(dy_collect_runs·steps)                    menu.logs (자기 수집 기록은 항상)
--     내 대시보드 표(dy_dashboards)                            읽기 dash.*, 쓰기 dash.board.custom
--     브랜드 즐겨찾기(brand_favorites)                          menu.event
--   한계: 대시보드의 탭(보드·리포트)은 같은 집계 함수를 같이 써서 탭 단위 구분은 화면에서만 한다

create or replace function dy_can_prefix(p_prefix text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not d.disabled and (d.is_admin or d.perms ? '*'
                     or exists (select 1 from jsonb_array_elements_text(d.perms) k where k like p_prefix || '%'))
                   from dy_user_perms d where d.user_id = auth.uid()), false)
$$;
revoke all on function dy_can_prefix(text) from public, anon;
grant execute on function dy_can_prefix(text) to authenticated;

-- 감싸는 함수 만들기: (함수 이름, 확인식) — 확인식은 인자 이름(p_…)을 그대로 쓸 수 있다
do $do$
declare
  spec text[][] := array[
    ['dy_dash_agg',                'dy_can_prefix(''dash.'')'],
    ['dy_dash_bounds',             'dy_can_prefix(''dash.'')'],
    ['dy_rank_days',               'dy_can_prefix(''dash.'')'],
    ['dy_inni_targets_get',        'dy_can_prefix(''dash.'')'],
    ['dy_inni_ad_manual_get',      'dy_can_prefix(''dash.'')'],
    ['dy_inni_comment_get',        'dy_can_prefix(''dash.'')'],
    ['dy_inni_settings_get',       'dy_can_prefix(''dash.'')'],
    ['dy_data_page',               'dy_can(''data.t.'' || p_source) or dy_can_prefix(''dash.'')'],
    ['dy_inni_comment_set',        'dy_can(''feat.settings'') and dy_can_prefix(''dash.'')'],
    ['dy_inni_settings_set',       'dy_can(''feat.settings'') and dy_can_prefix(''dash.'')'],
    ['dy_inni_targets_set',        'dy_can(''feat.input'') and dy_can_prefix(''dash.'')'],
    ['dy_inni_ad_manual_set',      'dy_can(''feat.input'') and dy_can_prefix(''dash.'')'],
    ['dy_event_meta',              'dy_can(''menu.event'')'],
    ['dy_event_rows',              'dy_can(''menu.event'')'],
    ['dy_event_config_set',        'dy_can(''menu.event'')'],
    ['inni_replace_sales_goods',   'dy_can(''feat.collect'')'],
    ['inni_replace_sales_daily',   'dy_can(''feat.collect'')'],
    ['inni_replace_pageview_daily','dy_can(''feat.collect'')'],
    ['inni_replace_pageview_goods','dy_can(''feat.collect'')'],
    ['inni_replace_customer_daily','dy_can(''feat.collect'')'],
    ['inni_replace_customer_goods','dy_can(''feat.collect'')'],
    ['inni_replace_ad_daily',      'dy_can(''feat.collect'')'],
    ['inni_replace_ad_goods_daily','dy_can(''feat.collect'')'],
    ['inni_replace_ad_keyword_daily','dy_can(''feat.collect'')'],
    ['inni_replace_cpm',           'dy_can(''feat.collect'')'],
    ['inni_upsert_mega_events',    'dy_can(''feat.collect'')']
  ];
  i int; fname text; chk text; oid_ oid; args text; res text; vol "char"; names text[]; call_args text; vol_sql text;
begin
  for i in 1 .. array_length(spec, 1) loop
    fname := spec[i][1]; chk := spec[i][2];
    -- 이미 감쌌으면(__raw 가 있으면) 원본 정의는 __raw 에 있으니 감싸는 함수만 다시 만든다
    select p.oid into oid_ from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fname || '__raw';
    if oid_ is null then
      select p.oid into oid_ from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fname;
      if oid_ is null then raise exception 'function % not found', fname; end if;
      select pg_get_function_arguments(oid_), pg_get_function_result(oid_), p.provolatile, p.proargnames
        into args, res, vol, names from pg_proc p where p.oid = oid_;
      execute format('alter function %I(%s) rename to %I', fname, regexp_replace(args, ' DEFAULT [^,]*', '', 'g'), fname || '__raw');
      execute format('revoke all on function %I(%s) from public, anon, authenticated', fname || '__raw', regexp_replace(args, ' DEFAULT [^,]*', '', 'g'));
    else
      select pg_get_function_arguments(oid_), pg_get_function_result(oid_), p.provolatile, p.proargnames
        into args, res, vol, names from pg_proc p where p.oid = oid_;
    end if;
    select string_agg(format('%I := %I', n, n), ', ') into call_args from unnest(names) n;
    vol_sql := case vol when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end;
    execute format($f$create or replace function %I(%s) returns %s language plpgsql %s security definer set search_path = public as $b$
      begin
        if auth.uid() is null then raise exception 'login required'; end if;
        if not (%s) then raise exception 'no permission'; end if;
        return %I(%s);
      end; $b$$f$, fname, args, res, vol_sql, chk, fname || '__raw', coalesce(call_args, ''));
    execute format('revoke all on function %I(%s) from public, anon', fname, regexp_replace(args, ' DEFAULT [^,]*', '', 'g'));
    execute format('grant execute on function %I(%s) to authenticated', fname, regexp_replace(args, ' DEFAULT [^,]*', '', 'g'));
  end loop;
end $do$;

-- ---------- 표 직접 접근(RLS 정책) ----------
drop policy if exists "runs read" on dy_collect_runs;
create policy "runs read" on dy_collect_runs for select to authenticated using (dy_can('menu.logs') or user_id = auth.uid());
drop policy if exists "runs insert own" on dy_collect_runs;
create policy "runs insert own" on dy_collect_runs for insert to authenticated with check (user_id = auth.uid() and dy_can('feat.collect'));
drop policy if exists "runs update own" on dy_collect_runs;
create policy "runs update own" on dy_collect_runs for update to authenticated using (user_id = auth.uid() and dy_can('feat.collect')) with check (user_id = auth.uid());

drop policy if exists "steps read" on dy_collect_steps;
create policy "steps read" on dy_collect_steps for select to authenticated
  using (dy_can('menu.logs') or exists (select 1 from dy_collect_runs r where r.id = dy_collect_steps.run_id and r.user_id = auth.uid()));
drop policy if exists "steps insert own run" on dy_collect_steps;
create policy "steps insert own run" on dy_collect_steps for insert to authenticated
  with check (dy_can('feat.collect') and exists (select 1 from dy_collect_runs r where r.id = dy_collect_steps.run_id and r.user_id = auth.uid()));

drop policy if exists "dash read" on dy_dashboards;
create policy "dash read" on dy_dashboards for select to authenticated using (dy_can_prefix('dash.'));
drop policy if exists "dash insert own" on dy_dashboards;
create policy "dash insert own" on dy_dashboards for insert to authenticated with check (owner = auth.uid() and dy_can('dash.board.custom'));
drop policy if exists "dash update own" on dy_dashboards;
create policy "dash update own" on dy_dashboards for update to authenticated using (owner = auth.uid() and dy_can('dash.board.custom')) with check (owner = auth.uid());
drop policy if exists "dash delete own" on dy_dashboards;
create policy "dash delete own" on dy_dashboards for delete to authenticated using (owner = auth.uid() and dy_can('dash.board.custom'));

drop policy if exists "fav all" on brand_favorites;
create policy "fav all" on brand_favorites for all to authenticated using (dy_can('menu.event')) with check (dy_can('menu.event'));
