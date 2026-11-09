-- DY-AI 대시보드용 Supabase 설정 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
--  1) dy_dash_agg   : 기간·단위·지표·묶음(브랜드/상품/요일)별 합계 (읽기 전용 집계 함수)
--  2) dy_dash_bounds: 표마다 데이터가 있는 첫날·마지막 날
--  3) dy_dashboards : 대시보드 저장 (로그인한 사람 모두 보기, 만든 사람만 수정·삭제)
-- inni_* 표는 계속 잠겨 있고, 로그인 사용자는 이 함수들로만 합계를 읽는다.

-- ============================================================
-- 1) 집계 함수
--   p_source : 'sales'(inni_sales_daily) | 'pageview'(inni_pageview_daily) | 'goods'(inni_sales_goods) | 'rank'(inni_rank_daily 뷰)
--   p_grain  : 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'
--   p_cols   : 합계를 낼 숫자 열 (표의 숫자 열만 허용)
--   p_dim    : null | 'weekday' | 'brand_nm' | 'gd_no'  (brand_nm·gd_no 는 goods 만)
--   p_top    : p_dim 이 있을 때 기간 전체 p_top_col 합계 상위 N 개만
-- 결과: [{ "p": 기간 시작일, "d": 묶음 값, "l": 표시 이름, "n": 날짜 수, "<열>": 합계, ... }]
-- ============================================================
create or replace function dy_dash_agg(
  p_source text, p_grain text, p_from date, p_to date, p_cols text[],
  p_dim text default null, p_top int default null, p_top_col text default null
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  tbl text; dcol text; allowed text[]; c text;
  pexpr text; dexpr text; lexpr text; sums text; topw text := ''; q text; res jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'bad range'; end if;
  if p_to - p_from > 3700 then raise exception 'range too long'; end if;

  case p_source
    when 'sales' then tbl := 'inni_sales_daily'; dcol := 'base_start_dt';
    when 'pageview' then tbl := 'inni_pageview_daily'; dcol := 'base_start_dt';
    when 'goods' then tbl := 'inni_sales_goods'; dcol := 'base_date';
    when 'rank' then tbl := 'inni_rank_daily'; dcol := 'rank_date';   -- supabase/rank_log.sql 먼저 실행
    else raise exception 'bad source %', p_source;
  end case;

  select array_agg(column_name::text) into allowed
  from information_schema.columns
  where table_schema = 'public' and table_name = tbl
    and data_type in ('bigint', 'integer', 'smallint', 'numeric', 'double precision', 'real')
    and column_name not in ('base_year', 'base_weekday_no', 'base_week', 'base_month', 'purchase_rate');

  if p_cols is null or array_length(p_cols, 1) is null then raise exception 'no cols'; end if;
  foreach c in array p_cols loop
    if not c = any(allowed) then raise exception 'bad col %', c; end if;
  end loop;
  if p_top_col is not null and not p_top_col = any(allowed) then raise exception 'bad top col %', p_top_col; end if;

  pexpr := case p_grain
    when 'day' then format('%I', dcol)
    when 'week' then format('date_trunc(''week'', %I)::date', dcol)
    when 'month' then format('date_trunc(''month'', %I)::date', dcol)
    when 'quarter' then format('date_trunc(''quarter'', %I)::date', dcol)
    when 'year' then format('date_trunc(''year'', %I)::date', dcol)
    when 'all' then '$1'
    else null end;
  if pexpr is null then raise exception 'bad grain %', p_grain; end if;

  if p_dim is null then dexpr := 'null::text'; lexpr := 'null::text';
  elsif p_dim = 'weekday' then dexpr := format('extract(isodow from %I)::int::text', dcol); lexpr := 'null::text';
  elsif p_dim = 'brand_nm' and p_source = 'goods' then dexpr := 'coalesce(brand_nm, ''(없음)'')'; lexpr := 'null::text';
  elsif p_dim = 'gd_no' and p_source = 'goods' then dexpr := 'gd_no'; lexpr := 'max(gd_nm)';
  else raise exception 'bad dim %', p_dim;
  end if;

  select string_agg(format('sum(%I)::float8 as %I', x, x), ', ') into sums from unnest(p_cols) x;

  if p_dim is not null and p_top is not null and p_top > 0 then
    topw := format(' and %s in (select %s from %I where %I between $1 and $2 group by 1 order by sum(%I) desc nulls last limit %s)',
      dexpr, dexpr, tbl, dcol, coalesce(p_top_col, p_cols[1]), least(p_top, 200));
  end if;

  q := format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.p, t.d), ''[]''::jsonb) from (' ||
    'select %s as p, %s as d, %s as l, count(distinct %I)::int as n, %s from %I where %I between $1 and $2%s group by 1, 2' ||
    ') t',
    pexpr, dexpr, lexpr, dcol, sums, tbl, dcol, topw);
  execute q into res using p_from, p_to;
  return res;
end;
$$;
revoke all on function dy_dash_agg(text, text, date, date, text[], text, int, text) from public, anon;
grant execute on function dy_dash_agg(text, text, date, date, text[], text, int, text) to authenticated;

-- ============================================================
-- 2) 데이터 범위
-- ============================================================
create or replace function dy_dash_bounds() returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'sales', (select jsonb_build_object('min', min(base_start_dt), 'max', max(base_start_dt)) from inni_sales_daily),
    'pageview', (select jsonb_build_object('min', min(base_start_dt), 'max', max(base_start_dt)) from inni_pageview_daily),
    'goods', (select jsonb_build_object('min', min(base_date), 'max', max(base_date)) from inni_sales_goods),
    'rank', (select jsonb_build_object('min', min(rank_date), 'max', max(rank_date)) from inni_rank_daily)
  ) end;
$$;
revoke all on function dy_dash_bounds() from public, anon;
grant execute on function dy_dash_bounds() to authenticated;

-- ============================================================
-- 3) 대시보드 저장
-- ============================================================
create table if not exists dy_dashboards (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  owner_email text default (auth.jwt() ->> 'email'),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table dy_dashboards enable row level security;
revoke all on dy_dashboards from anon;
grant select, insert, update, delete on dy_dashboards to authenticated;

drop policy if exists "dash read" on dy_dashboards;
create policy "dash read" on dy_dashboards for select to authenticated using (true);
drop policy if exists "dash insert own" on dy_dashboards;
create policy "dash insert own" on dy_dashboards for insert to authenticated with check (owner = auth.uid());
drop policy if exists "dash update own" on dy_dashboards;
create policy "dash update own" on dy_dashboards for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "dash delete own" on dy_dashboards;
create policy "dash delete own" on dy_dashboards for delete to authenticated using (owner = auth.uid());
