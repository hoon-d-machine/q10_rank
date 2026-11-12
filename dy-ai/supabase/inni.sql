-- inni 탭(월간 리포트)용 입력 데이터: 월별 매출 목표 + 리포트 코멘트 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
-- 표는 잠겨 있고, 로그인한 사용자가 아래 함수로만 읽고 쓴다 (목표·코멘트는 모두가 같이 보는 공용 값).

-- ---- 월별 매출 목표 (금액은 엔 단위로 저장, 화면에서는 천 엔으로 입력) ----
create table if not exists inni_targets (
  ym date primary key,                 -- 그 달 1일
  sales_target bigint not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table inni_targets enable row level security;
revoke all on inni_targets from anon, authenticated;

create or replace function dy_inni_targets_get(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'v', sales_target) order by ym)
                   from inni_targets where ym between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date), '[]'::jsonb);
end; $$;
revoke all on function dy_inni_targets_get(date, date) from public, anon;
grant execute on function dy_inni_targets_get(date, date) to authenticated;

-- p_rows: [{ "ym": "2026-07-01", "v": 9500000 }, ...]  v 가 null 이면 그 달 목표를 지움
create or replace function dy_inni_targets_set(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public
as $$
declare r jsonb; n int := 0; d date;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 120 then raise exception 'bad rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    d := date_trunc('month', (r ->> 'ym')::date)::date;
    if r -> 'v' is null or jsonb_typeof(r -> 'v') = 'null' then
      delete from inni_targets where ym = d;
    else
      if (r ->> 'v')::numeric < 0 then raise exception 'bad value'; end if;
      insert into inni_targets (ym, sales_target, updated_by, updated_at)
      values (d, (r ->> 'v')::numeric::bigint, auth.jwt() ->> 'email', now())
      on conflict (ym) do update set sales_target = excluded.sales_target, updated_by = excluded.updated_by, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function dy_inni_targets_set(jsonb) from public, anon;
grant execute on function dy_inni_targets_set(jsonb) to authenticated;

-- ---- 리포트 코멘트 (리포트 종류 + 기준 월마다 하나) ----
create table if not exists inni_comments (
  report text not null,                -- sales | product | onsite | megapo
  ym date not null,
  body text not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (report, ym)
);
alter table inni_comments enable row level security;
revoke all on inni_comments from anon, authenticated;

create or replace function dy_inni_comment_get(p_report text, p_ym date) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  return (select jsonb_build_object('body', body, 'by', updated_by, 'at', updated_at)
          from inni_comments where report = p_report and ym = date_trunc('month', p_ym)::date);
end; $$;
revoke all on function dy_inni_comment_get(text, date) from public, anon;
grant execute on function dy_inni_comment_get(text, date) to authenticated;

-- 본문이 비어 있으면 코멘트를 지움
create or replace function dy_inni_comment_set(p_report text, p_ym date, p_body text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare d date := date_trunc('month', p_ym)::date;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_report !~ '^(sales|product|onsite|megapo|megawari)(_[a-z]+)?$' then raise exception 'bad report'; end if;
  if length(coalesce(p_body, '')) > 4000 then raise exception 'too long'; end if;
  if coalesce(trim(p_body), '') = '' then
    delete from inni_comments where report = p_report and ym = d;
    return null;
  end if;
  insert into inni_comments (report, ym, body, updated_by, updated_at)
  values (p_report, d, p_body, auth.jwt() ->> 'email', now())
  on conflict (report, ym) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('body', p_body, 'by', auth.jwt() ->> 'email', 'at', now());
end; $$;
revoke all on function dy_inni_comment_set(text, date, text) from public, anon;
grant execute on function dy_inni_comment_set(text, date, text) to authenticated;

-- ---- 화면 설정 (강조 행·열·색, 그래프 종류): 리포트 종류 + 회계연도마다 하나, 모두가 같이 봄 ----
create table if not exists inni_settings (
  report text not null,                -- sales | product | onsite | megapo
  fy int not null,                     -- 회계연도 (BY27 = 2027)
  config jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (report, fy)
);
alter table inni_settings enable row level security;
revoke all on inni_settings from anon, authenticated;

create or replace function dy_inni_settings_get(p_report text, p_fy int) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  return (select config from inni_settings where report = p_report and fy = p_fy);
end; $$;
revoke all on function dy_inni_settings_get(text, int) from public, anon;
grant execute on function dy_inni_settings_get(text, int) to authenticated;

create or replace function dy_inni_settings_set(p_report text, p_fy int, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_report not in ('sales', 'product', 'onsite', 'megapo', 'megawari') then raise exception 'bad report'; end if;
  if p_fy < 2000 or p_fy > 2100 then raise exception 'bad fy'; end if;
  if jsonb_typeof(p_config) <> 'object' or length(p_config::text) > 8000 then raise exception 'bad config'; end if;
  insert into inni_settings (report, fy, config, updated_by, updated_at)
  values (p_report, p_fy, p_config, auth.jwt() ->> 'email', now())
  on conflict (report, fy) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
  return p_config;
end; $$;
revoke all on function dy_inni_settings_set(text, int, jsonb) from public, anon;
grant execute on function dy_inni_settings_set(text, int, jsonb) to authenticated;

-- ---- ONSITE AD: 광고센터 API 에 없는 광고(Beauty AD · Spotlight AD · Singleone)의 월별 광고비 직접 입력 (엔 단위로 저장, 화면에서는 천 엔) ----
create table if not exists inni_ad_manual (
  ym date not null,                    -- 그 달 1일
  item text not null,                  -- beauty | spotlight | singleone
  amount bigint not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (ym, item)
);
alter table inni_ad_manual enable row level security;
revoke all on inni_ad_manual from anon, authenticated;

create or replace function dy_inni_ad_manual_get(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'item', item, 'v', amount) order by ym, item)
                   from inni_ad_manual where ym between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date), '[]'::jsonb);
end; $$;
revoke all on function dy_inni_ad_manual_get(date, date) from public, anon;
grant execute on function dy_inni_ad_manual_get(date, date) to authenticated;

-- p_rows: [{ "ym": "2026-07-01", "item": "beauty", "v": 300000 }, ...]  v 가 null 이면 그 칸을 지움
create or replace function dy_inni_ad_manual_set(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public
as $$
declare r jsonb; n int := 0; d date;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 120 then raise exception 'bad rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r ->> 'item') not in ('beauty', 'spotlight', 'singleone') then raise exception 'bad item'; end if;
    d := date_trunc('month', (r ->> 'ym')::date)::date;
    if r -> 'v' is null or jsonb_typeof(r -> 'v') = 'null' then
      delete from inni_ad_manual where ym = d and item = r ->> 'item';
    else
      if (r ->> 'v')::numeric < 0 then raise exception 'bad value'; end if;
      insert into inni_ad_manual (ym, item, amount, updated_by, updated_at)
      values (d, r ->> 'item', (r ->> 'v')::numeric::bigint, auth.jwt() ->> 'email', now())
      on conflict (ym, item) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function dy_inni_ad_manual_set(jsonb) from public, anon;
grant execute on function dy_inni_ad_manual_set(jsonb) to authenticated;
