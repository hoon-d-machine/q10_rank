-- DY-AI 대시보드용 Supabase 설정 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
--  1) dy_dash_agg   : 기간·단위·지표·묶음(브랜드/상품/요일)별 합계 (읽기 전용 집계 함수)
--  2) dy_dash_bounds: 표마다 데이터가 있는 첫날·마지막 날
--  3) dy_dashboards : 대시보드 저장 (로그인한 사람 모두 보기, 만든 사람만 수정·삭제)
-- inni_* 표는 계속 잠겨 있고, 로그인 사용자는 이 함수들로만 합계를 읽는다.

-- ============================================================
-- 0) 상품별 일자 뷰: 판매(inni_sales_goods) + 상품별 PV(inni_pageview_goods)를 (날짜, 상품)으로 합침
--    'goods' 소스가 이 뷰를 읽어서, 상품 매출 지표와 상품 PV·CVR 지표를 같은 묶음(상품·브랜드)으로 쓸 수 있다.
--    (inni_RPA/supabase_schema_extra.sql 을 먼저 실행해 inni_pageview_goods 가 있어야 함)
-- ============================================================
create or replace view inni_goods_daily as
select coalesce(s.base_date, p.base_date) as base_date,
       coalesce(s.gd_no, p.gd_no) as gd_no,
       coalesce(s.brand_nm, p.brand_nm) as brand_nm,
       coalesce(s.gd_nm, p.gd_nm) as gd_nm,
       s.buy_cnt, s.cancel_cnt, s.net_cnt, s.buy_bpv, s.cancel_bpv, s.net_bpv,
       p.main_pv, p.mn_megawari_pv, p.mn_megapo_pv, p.mn_myinterest_pv, p.mn_spotlight_brand_pv, p.mn_bestseller_pv, p.mn_beauty_ranking_pv, p.mn_beauty_pv, p.mn_timesale_pv, p.mn_dailydeal_pv, p.mn_groupbuy_pv, p.mn_chancedeal_pv, p.mn_etc_pv, p.search_pv, p.sch_keywordplus_pv, p.sch_powerrank_pv, p.sch_cps_pv, p.sch_timesale_pv, p.sch_etc_pv, p.bestseller_pv, p.beautyhub_pv, p.supplementhub_pv, p.deal_pv, p.dl_todaysmega_pv, p.dl_todaysmega_po_pv, p.dl_timesale_pv, p.dl_dailydeal_pv, p.dl_groupbuy_pv, p.dl_onedaychance_pv, p.wish_pv, p.todaysview_pv, p.cart_pv, p.sellershop_pv, p.special_pv, p.category_pv, p.vip_pv, p.catalog_pv, p.my_pv, p.live_pv, p.external_pv, p.ext_google_pv, p.ext_facebook_pv, p.ext_twitter_pv, p.ext_instagram_pv, p.ext_tiktok_pv, p.ext_yahoo_pv, p.ext_kakaku_pv, p.ext_line_pv, p.ext_email_pv, p.ext_others_pv, p.directurl_pv, p.etc_pv, p.total_pv
from inni_sales_goods s
full join inni_pageview_goods p on p.base_date = s.base_date and p.gd_no = s.gd_no;
revoke all on inni_goods_daily from anon, authenticated;

-- ============================================================
-- 1) 집계 함수
--   p_source : 'sales'(inni_sales_daily) | 'pageview'(inni_pageview_daily) | 'goods'(inni_goods_daily 뷰: 상품 판매+PV) | 'customer'(inni_customer_daily) | 'custgoods'(inni_customer_goods 스냅샷) | 'rank_d'·'rank_w'·'rank_m'(inni_rank_cat 뷰의 일간·주간·월간)
--   p_grain  : 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'
--   p_cols   : 합계를 낼 숫자 열 (표의 숫자 열만 허용)
--   p_dim    : null | 'weekday' | 'brand_nm' | 'gd_no' | 'category'  (brand_nm·gd_no 는 goods 만, category 는 rank_* 만)
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
  pexpr text; dexpr text; lexpr text; sums text; topw text := ''; extra text := ''; q text; res jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'bad range'; end if;
  if p_to - p_from > 3700 then raise exception 'range too long'; end if;

  case p_source
    when 'sales' then tbl := 'inni_sales_daily'; dcol := 'base_start_dt';
    when 'pageview' then tbl := 'inni_pageview_daily'; dcol := 'base_start_dt';
    when 'goods' then tbl := 'inni_goods_daily'; dcol := 'base_date';
    when 'customer' then tbl := 'inni_customer_daily'; dcol := 'base_date';        -- inni_RPA/supabase_schema_extra.sql
    when 'custgoods' then tbl := 'inni_customer_goods'; dcol := 'snapshot_date';  -- 찜·장바구니 스냅샷(누적값)
    when 'ad' then tbl := 'inni_ad_daily'; dcol := 'base_date';                    -- inni_RPA/supabase_schema_ads.sql (광고유형별 일자)
    when 'adgoods' then tbl := 'inni_ad_goods_daily'; dcol := 'base_date';         -- 상품 × 광고유형 일자
    when 'cpm' then tbl := 'inni_cpm_daily'; dcol := 'base_date';                  -- Beauty Brand AD(CPM) 캠페인 일자별 (inni_RPA/supabase_schema_cpm.sql)
    when 'rank_d' then tbl := 'inni_rank_cat'; dcol := 'rank_date'; extra := ' and period = ''daily''';     -- supabase/rank_log.sql 먼저 실행
    when 'rank_w' then tbl := 'inni_rank_cat'; dcol := 'rank_date'; extra := ' and period = ''weekly''';
    when 'rank_m' then tbl := 'inni_rank_cat'; dcol := 'rank_date'; extra := ' and period = ''monthly''';
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
  elsif p_dim = 'ad_type' and p_source in ('ad', 'adgoods') then dexpr := 'ad_type'; lexpr := 'null::text';
  elsif p_dim = 'brand_nm' and p_source in ('goods', 'custgoods', 'adgoods') then dexpr := 'coalesce(brand_nm, ''(없음)'')'; lexpr := 'null::text';
  elsif p_dim = 'gd_no' and p_source in ('goods', 'custgoods', 'adgoods') then dexpr := 'gd_no'; lexpr := 'max(gd_nm)';
  elsif p_dim = 'category' and p_source like 'rank\_%' then dexpr := 'category'; lexpr := 'null::text';
  else raise exception 'bad dim %', p_dim;
  end if;

  select string_agg(format('sum(%I)::float8 as %I', x, x), ', ') into sums from unnest(p_cols) x;

  if p_dim is not null and p_top is not null and p_top > 0 then
    topw := format(' and %s in (select %s from %I where %I between $1 and $2%s group by 1 order by sum(%I) desc nulls last limit %s)',
      dexpr, dexpr, tbl, dcol, extra, coalesce(p_top_col, p_cols[1]), least(p_top, 200));
  end if;

  q := format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.p, t.d), ''[]''::jsonb) from (' ||
    'select %s as p, %s as d, %s as l, count(distinct %I)::int as n, %s from %I where %I between $1 and $2%s%s group by 1, 2' ||
    ') t',
    pexpr, dexpr, lexpr, dcol, sums, tbl, dcol, extra, topw);
  -- 찜·장바구니 스냅샷은 수집한 날 아침에 찍혀서(전날 마감 기준) 기준일(어제)의 하루 뒤까지 포함한다
  execute q into res using p_from, case when p_source = 'custgoods' then p_to + 1 else p_to end;
  return res;
end;
$$;
revoke all on function dy_dash_agg(text, text, date, date, text[], text, int, text) from public, anon;
grant execute on function dy_dash_agg(text, text, date, date, text[], text, int, text) to authenticated;

-- 일간 랭킹 데이터가 있는 날짜 목록 (이니스프리가 한 개도 안 들어간 날도 '데이터 있음'으로 알기 위해)
create or replace function dy_rank_days(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when auth.uid() is null then null
    else coalesce((select jsonb_agg(d order by d) from (select distinct rank_date d from q10_rank_log where period = 'daily' and rank_date between p_from and p_to) t), '[]'::jsonb) end
$$;
revoke all on function dy_rank_days(date, date) from public, anon;
grant execute on function dy_rank_days(date, date) to authenticated;

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
    'customer', (select jsonb_build_object('min', min(base_date), 'max', max(base_date)) from inni_customer_daily),
    'custgoods', (select jsonb_build_object('min', min(snapshot_date), 'max', max(snapshot_date)) from inni_customer_goods),
    'ad', (select jsonb_build_object('min', min(base_date), 'max', max(base_date)) from inni_ad_daily),
    'adgoods', (select jsonb_build_object('min', min(base_date), 'max', max(base_date)) from inni_ad_goods_daily),
    'cpm', (select jsonb_build_object('min', min(base_date), 'max', max(base_date)) from inni_cpm_daily),
    'rank', (select jsonb_build_object('min', min(rank_date), 'max', max(rank_date)) from q10_rank_log)
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
