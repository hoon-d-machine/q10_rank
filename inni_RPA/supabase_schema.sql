-- inni_RPA (Qoo10 QSM) 수집 데이터 테이블 / 월 교체 함수
-- 실행 전 검토용. 접근은 service_role(Worker·로컬 스크립트)만 가능하도록 RLS 활성 + 권한 회수.

create table if not exists inni_sales_goods (
  base_date date not null,
  weekday text,
  brand_nm text,
  gd_nm text,
  gd_no text not null,
  outer_gd_no text,
  buy_cnt bigint,
  cancel_cnt bigint,
  net_cnt bigint,
  buy_bpv bigint,
  cancel_bpv bigint,
  net_bpv bigint,
  collected_at timestamptz not null default now(),
  primary key (base_date, gd_no)
);
alter table inni_sales_goods enable row level security;
revoke all on inni_sales_goods from anon, authenticated;

create table if not exists inni_sales_daily (
  base_year smallint,
  base_start_dt date not null,
  base_end_dt date,
  base_weekday_no smallint,
  base_week smallint,
  base_month smallint,
  buy_cnt bigint,
  cancel_cnt bigint,
  total_buy_cnt bigint,
  total_cancel_cnt bigint,
  final_total_buy_cnt bigint,
  buy_bpv bigint,
  cancel_bpv bigint,
  final_buy_bpv bigint,
  collected_at timestamptz not null default now(),
  primary key (base_start_dt)
);
alter table inni_sales_daily enable row level security;
revoke all on inni_sales_daily from anon, authenticated;

create table if not exists inni_pageview_daily (
  base_year smallint,
  base_start_dt date not null,
  base_end_dt date,
  base_weekday_no smallint,
  base_week smallint,
  base_month smallint,
  main_pv bigint,
  mn_megawari_pv bigint,
  mn_megapo_pv bigint,
  mn_myinterest_pv bigint,
  mn_spotlight_brand_pv bigint,
  mn_bestseller_pv bigint,
  mn_beauty_ranking_pv bigint,
  mn_beauty_pv bigint,
  mn_timesale_pv bigint,
  mn_dailydeal_pv bigint,
  mn_groupbuy_pv bigint,
  mn_chancedeal_pv bigint,
  mn_etc_pv bigint,
  search_pv bigint,
  sch_keywordplus_pv bigint,
  sch_powerrank_pv bigint,
  sch_cps_pv bigint,
  sch_timesale_pv bigint,
  sch_etc_pv bigint,
  bestseller_pv bigint,
  beautyhub_pv bigint,
  supplementhub_pv bigint,
  deal_pv bigint,
  dl_todaysmega_pv bigint,
  dl_todaysmega_po_pv bigint,
  dl_timesale_pv bigint,
  dl_dailydeal_pv bigint,
  dl_groupbuy_pv bigint,
  dl_onedaychance_pv bigint,
  wish_pv bigint,
  todaysview_pv bigint,
  cart_pv bigint,
  sellershop_pv bigint,
  special_pv bigint,
  category_pv bigint,
  vip_pv bigint,
  catalog_pv bigint,
  my_pv bigint,
  live_pv bigint,
  external_pv bigint,
  ext_google_pv bigint,
  ext_facebook_pv bigint,
  ext_twitter_pv bigint,
  ext_instagram_pv bigint,
  ext_yahoo_pv bigint,
  ext_kakaku_pv bigint,
  ext_line_pv bigint,
  ext_email_pv bigint,
  ext_others_pv bigint,
  directurl_pv bigint,
  etc_pv bigint,
  total_pv bigint,
  user_cnt bigint,
  add_cnt bigint,
  purchase_cnt bigint,
  purchase_rate numeric,
  collected_at timestamptz not null default now(),
  primary key (base_start_dt)
);
alter table inni_pageview_daily enable row level security;
revoke all on inni_pageview_daily from anon, authenticated;

create or replace function inni_replace_sales_goods(p_from date, p_rows jsonb)
returns integer
language plpgsql
as $$
declare n integer;
begin
  -- p_from 이후 구간을 통째로 교체 (한 트랜잭션: 중간 실패 시 전부 롤백)
  delete from inni_sales_goods where base_date >= p_from;
  insert into inni_sales_goods (base_date, weekday, brand_nm, gd_nm, gd_no, outer_gd_no, buy_cnt, cancel_cnt, net_cnt, buy_bpv, cancel_bpv, net_bpv)
  select base_date, weekday, brand_nm, gd_nm, gd_no, outer_gd_no, buy_cnt, cancel_cnt, net_cnt, buy_bpv, cancel_bpv, net_bpv from jsonb_to_recordset(p_rows) as t(base_date date, weekday text, brand_nm text, gd_nm text, gd_no text, outer_gd_no text, buy_cnt bigint, cancel_cnt bigint, net_cnt bigint, buy_bpv bigint, cancel_bpv bigint, net_bpv bigint);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function inni_replace_sales_goods(date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_sales_daily(p_from date, p_rows jsonb)
returns integer
language plpgsql
as $$
declare n integer;
begin
  -- p_from 이후 구간을 통째로 교체 (한 트랜잭션: 중간 실패 시 전부 롤백)
  delete from inni_sales_daily where base_start_dt >= p_from;
  insert into inni_sales_daily (base_year, base_start_dt, base_end_dt, base_weekday_no, base_week, base_month, buy_cnt, cancel_cnt, total_buy_cnt, total_cancel_cnt, final_total_buy_cnt, buy_bpv, cancel_bpv, final_buy_bpv)
  select base_year, base_start_dt, base_end_dt, base_weekday_no, base_week, base_month, buy_cnt, cancel_cnt, total_buy_cnt, total_cancel_cnt, final_total_buy_cnt, buy_bpv, cancel_bpv, final_buy_bpv from jsonb_to_recordset(p_rows) as t(base_year smallint, base_start_dt date, base_end_dt date, base_weekday_no smallint, base_week smallint, base_month smallint, buy_cnt bigint, cancel_cnt bigint, total_buy_cnt bigint, total_cancel_cnt bigint, final_total_buy_cnt bigint, buy_bpv bigint, cancel_bpv bigint, final_buy_bpv bigint);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function inni_replace_sales_daily(date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_pageview_daily(p_from date, p_rows jsonb)
returns integer
language plpgsql
as $$
declare n integer;
begin
  -- p_from 이후 구간을 통째로 교체 (한 트랜잭션: 중간 실패 시 전부 롤백)
  delete from inni_pageview_daily where base_start_dt >= p_from;
  insert into inni_pageview_daily (base_year, base_start_dt, base_end_dt, base_weekday_no, base_week, base_month, main_pv, mn_megawari_pv, mn_megapo_pv, mn_myinterest_pv, mn_spotlight_brand_pv, mn_bestseller_pv, mn_beauty_ranking_pv, mn_beauty_pv, mn_timesale_pv, mn_dailydeal_pv, mn_groupbuy_pv, mn_chancedeal_pv, mn_etc_pv, search_pv, sch_keywordplus_pv, sch_powerrank_pv, sch_cps_pv, sch_timesale_pv, sch_etc_pv, bestseller_pv, beautyhub_pv, supplementhub_pv, deal_pv, dl_todaysmega_pv, dl_todaysmega_po_pv, dl_timesale_pv, dl_dailydeal_pv, dl_groupbuy_pv, dl_onedaychance_pv, wish_pv, todaysview_pv, cart_pv, sellershop_pv, special_pv, category_pv, vip_pv, catalog_pv, my_pv, live_pv, external_pv, ext_google_pv, ext_facebook_pv, ext_twitter_pv, ext_instagram_pv, ext_yahoo_pv, ext_kakaku_pv, ext_line_pv, ext_email_pv, ext_others_pv, directurl_pv, etc_pv, total_pv, user_cnt, add_cnt, purchase_cnt, purchase_rate)
  select base_year, base_start_dt, base_end_dt, base_weekday_no, base_week, base_month, main_pv, mn_megawari_pv, mn_megapo_pv, mn_myinterest_pv, mn_spotlight_brand_pv, mn_bestseller_pv, mn_beauty_ranking_pv, mn_beauty_pv, mn_timesale_pv, mn_dailydeal_pv, mn_groupbuy_pv, mn_chancedeal_pv, mn_etc_pv, search_pv, sch_keywordplus_pv, sch_powerrank_pv, sch_cps_pv, sch_timesale_pv, sch_etc_pv, bestseller_pv, beautyhub_pv, supplementhub_pv, deal_pv, dl_todaysmega_pv, dl_todaysmega_po_pv, dl_timesale_pv, dl_dailydeal_pv, dl_groupbuy_pv, dl_onedaychance_pv, wish_pv, todaysview_pv, cart_pv, sellershop_pv, special_pv, category_pv, vip_pv, catalog_pv, my_pv, live_pv, external_pv, ext_google_pv, ext_facebook_pv, ext_twitter_pv, ext_instagram_pv, ext_yahoo_pv, ext_kakaku_pv, ext_line_pv, ext_email_pv, ext_others_pv, directurl_pv, etc_pv, total_pv, user_cnt, add_cnt, purchase_cnt, purchase_rate from jsonb_to_recordset(p_rows) as t(base_year smallint, base_start_dt date, base_end_dt date, base_weekday_no smallint, base_week smallint, base_month smallint, main_pv bigint, mn_megawari_pv bigint, mn_megapo_pv bigint, mn_myinterest_pv bigint, mn_spotlight_brand_pv bigint, mn_bestseller_pv bigint, mn_beauty_ranking_pv bigint, mn_beauty_pv bigint, mn_timesale_pv bigint, mn_dailydeal_pv bigint, mn_groupbuy_pv bigint, mn_chancedeal_pv bigint, mn_etc_pv bigint, search_pv bigint, sch_keywordplus_pv bigint, sch_powerrank_pv bigint, sch_cps_pv bigint, sch_timesale_pv bigint, sch_etc_pv bigint, bestseller_pv bigint, beautyhub_pv bigint, supplementhub_pv bigint, deal_pv bigint, dl_todaysmega_pv bigint, dl_todaysmega_po_pv bigint, dl_timesale_pv bigint, dl_dailydeal_pv bigint, dl_groupbuy_pv bigint, dl_onedaychance_pv bigint, wish_pv bigint, todaysview_pv bigint, cart_pv bigint, sellershop_pv bigint, special_pv bigint, category_pv bigint, vip_pv bigint, catalog_pv bigint, my_pv bigint, live_pv bigint, external_pv bigint, ext_google_pv bigint, ext_facebook_pv bigint, ext_twitter_pv bigint, ext_instagram_pv bigint, ext_yahoo_pv bigint, ext_kakaku_pv bigint, ext_line_pv bigint, ext_email_pv bigint, ext_others_pv bigint, directurl_pv bigint, etc_pv bigint, total_pv bigint, user_cnt bigint, add_cnt bigint, purchase_cnt bigint, purchase_rate numeric);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function inni_replace_pageview_daily(date, jsonb) from public, anon, authenticated;

-- 상품코드 마스터 (표기 시 inni_sales_goods.gd_no 와 조인해서 사용)
create table if not exists inni_product_codes (
  gd_no text primary key,
  product_name text,
  line text,
  category text,
  updated_at timestamptz not null default now()
);
alter table inni_product_codes enable row level security;
revoke all on inni_product_codes from anon, authenticated;
