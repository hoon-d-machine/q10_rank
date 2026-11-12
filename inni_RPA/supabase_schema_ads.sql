-- 광고센터 일별 광고비·광고 매출 (일자 × 광고유형). ad_type='all' 은 전체(스토어 총 매출 포함). 다시 실행해도 안전.
create table if not exists inni_ad_daily (
  base_date date not null,
  ad_type text not null,
  ad_price numeric not null default 0,
  ad_sales numeric not null default 0,
  total_sales numeric,
  collected_at timestamptz not null default now(),
  primary key (base_date, ad_type)
);
alter table inni_ad_daily enable row level security;
revoke all on inni_ad_daily from anon, authenticated;

create or replace function inni_replace_ad_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_daily where base_date between p_from and p_to;
  insert into inni_ad_daily (base_date, ad_type, ad_price, ad_sales, total_sales)
  select base_date, ad_type, coalesce(ad_price, 0), coalesce(ad_sales, 0), total_sales
  from jsonb_to_recordset(p_rows) as t(base_date date, ad_type text, ad_price numeric, ad_sales numeric, total_sales numeric)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_daily(date, date, jsonb) from public, anon, authenticated;

-- 키워드별 일자 노출·클릭·구매수량 (광고센터 트래픽 > 키워드). 구간마다 상위 20개 키워드만 받을 수 있어 7일 단위로 모은다.
-- ad_type: 'all'(전체) 또는 keywordplus / cps / power_rankup. rank_in_window = 그 7일 구간 안의 순위.
create table if not exists inni_ad_keyword_daily (
  base_date date not null,
  ad_type text not null,
  keyword text not null,
  rank_in_window integer,
  expose_cnt bigint not null default 0,
  click_cnt bigint not null default 0,
  purchase_cnt bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, ad_type, keyword)
);
alter table inni_ad_keyword_daily enable row level security;
revoke all on inni_ad_keyword_daily from anon, authenticated;

create or replace function inni_replace_ad_keyword_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_keyword_daily where base_date between p_from and p_to;
  insert into inni_ad_keyword_daily (base_date, ad_type, keyword, rank_in_window, expose_cnt, click_cnt, purchase_cnt)
  select base_date, ad_type, keyword, rank_in_window, coalesce(expose_cnt, 0), coalesce(click_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_rows) as t(base_date date, ad_type text, keyword text, rank_in_window integer, expose_cnt bigint, click_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_keyword_daily(date, date, jsonb) from public, anon, authenticated;

-- 상품별 일자 × 광고유형 광고비·광고 매출·노출·클릭·장바구니·구매 (광고센터 /api/goods/rank). 상품에 안 묶이는 광고분은 빠진다(전체는 inni_ad_daily).
create table if not exists inni_ad_goods_daily (
  base_date date not null,
  gd_no text not null,
  ad_type text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  ad_price numeric not null default 0,
  ad_sales numeric not null default 0,
  expose_cnt bigint not null default 0,
  click_cnt bigint not null default 0,
  cart_cnt bigint not null default 0,
  purchase_cnt bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, gd_no, ad_type)
);
alter table inni_ad_goods_daily enable row level security;
revoke all on inni_ad_goods_daily from anon, authenticated;

create or replace function inni_replace_ad_goods_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_ad_goods_daily where base_date between p_from and p_to;
  insert into inni_ad_goods_daily (base_date, gd_no, ad_type, brand_nm, gd_nm, outer_gd_no, ad_price, ad_sales, expose_cnt, click_cnt, cart_cnt, purchase_cnt)
  select base_date, gd_no, ad_type, brand_nm, gd_nm, outer_gd_no, coalesce(ad_price, 0), coalesce(ad_sales, 0),
         coalesce(expose_cnt, 0), coalesce(click_cnt, 0), coalesce(cart_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_rows) as t(base_date date, gd_no text, ad_type text, brand_nm text, gd_nm text, outer_gd_no text,
       ad_price numeric, ad_sales numeric, expose_cnt bigint, click_cnt bigint, cart_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_ad_goods_daily(date, date, jsonb) from public, anon, authenticated;
