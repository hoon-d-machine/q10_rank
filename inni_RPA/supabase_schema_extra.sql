-- QSM 추가 수집 표 (상품별 일자 PV · 고객 일자 · 고객-상품 스냅샷) + 기간 교체 함수
-- 접근은 service_role(RPA·백필 스크립트)만: RLS 활성 + 권한 회수. 다시 실행해도 안전.

create table if not exists inni_pageview_goods (
  base_date date not null,
  gd_no text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  main_pv integer,
  mn_megawari_pv integer,
  mn_megapo_pv integer,
  mn_myinterest_pv integer,
  mn_spotlight_brand_pv integer,
  mn_bestseller_pv integer,
  mn_beauty_ranking_pv integer,
  mn_beauty_pv integer,
  mn_timesale_pv integer,
  mn_dailydeal_pv integer,
  mn_groupbuy_pv integer,
  mn_chancedeal_pv integer,
  mn_etc_pv integer,
  search_pv integer,
  sch_keywordplus_pv integer,
  sch_powerrank_pv integer,
  sch_cps_pv integer,
  sch_timesale_pv integer,
  sch_etc_pv integer,
  bestseller_pv integer,
  beautyhub_pv integer,
  supplementhub_pv integer,
  deal_pv integer,
  dl_todaysmega_pv integer,
  dl_todaysmega_po_pv integer,
  dl_timesale_pv integer,
  dl_dailydeal_pv integer,
  dl_groupbuy_pv integer,
  dl_onedaychance_pv integer,
  wish_pv integer,
  todaysview_pv integer,
  cart_pv integer,
  sellershop_pv integer,
  special_pv integer,
  category_pv integer,
  vip_pv integer,
  catalog_pv integer,
  my_pv integer,
  live_pv integer,
  external_pv integer,
  ext_google_pv integer,
  ext_facebook_pv integer,
  ext_twitter_pv integer,
  ext_instagram_pv integer,
  ext_tiktok_pv integer,
  ext_yahoo_pv integer,
  ext_kakaku_pv integer,
  ext_line_pv integer,
  ext_email_pv integer,
  ext_others_pv integer,
  directurl_pv integer,
  etc_pv integer,
  total_pv integer,
  collected_at timestamptz not null default now(),
  primary key (base_date, gd_no)
);
alter table inni_pageview_goods enable row level security;
revoke all on inni_pageview_goods from anon, authenticated;

create table if not exists inni_customer_daily (
  base_date date primary key,
  newbuyer_cnt bigint,
  newbuyer_rate numeric,
  existingbuyer_cnt bigint,
  existingbuyer_rate numeric,
  buyer_cnt bigint,
  shop_follower_inc bigint,
  shop_follower_cnt bigint,
  shop_page_view bigint,
  collected_at timestamptz not null default now()
);
alter table inni_customer_daily enable row level security;
revoke all on inni_customer_daily from anon, authenticated;

-- 찜·장바구니는 '현재 누적값'이라 과거를 받을 수 없고, 수집한 날의 스냅샷으로만 쌓는다
create table if not exists inni_customer_goods (
  snapshot_date date not null,
  gd_no text not null,
  brand_nm text,
  gd_nm text,
  outer_gd_no text,
  wish_cnt bigint,
  basket_cnt bigint,
  collected_at timestamptz not null default now(),
  primary key (snapshot_date, gd_no)
);
alter table inni_customer_goods enable row level security;
revoke all on inni_customer_goods from anon, authenticated;

-- p_from~p_to(양끝 포함) 구간만 교체 (한 트랜잭션: 중간 실패 시 전부 롤백)
create or replace function inni_replace_pageview_goods(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_pageview_goods where base_date between p_from and p_to;
  insert into inni_pageview_goods (base_date, gd_no, brand_nm, gd_nm, outer_gd_no, main_pv, mn_megawari_pv, mn_megapo_pv, mn_myinterest_pv, mn_spotlight_brand_pv, mn_bestseller_pv, mn_beauty_ranking_pv, mn_beauty_pv, mn_timesale_pv, mn_dailydeal_pv, mn_groupbuy_pv, mn_chancedeal_pv, mn_etc_pv, search_pv, sch_keywordplus_pv, sch_powerrank_pv, sch_cps_pv, sch_timesale_pv, sch_etc_pv, bestseller_pv, beautyhub_pv, supplementhub_pv, deal_pv, dl_todaysmega_pv, dl_todaysmega_po_pv, dl_timesale_pv, dl_dailydeal_pv, dl_groupbuy_pv, dl_onedaychance_pv, wish_pv, todaysview_pv, cart_pv, sellershop_pv, special_pv, category_pv, vip_pv, catalog_pv, my_pv, live_pv, external_pv, ext_google_pv, ext_facebook_pv, ext_twitter_pv, ext_instagram_pv, ext_tiktok_pv, ext_yahoo_pv, ext_kakaku_pv, ext_line_pv, ext_email_pv, ext_others_pv, directurl_pv, etc_pv, total_pv)
  select base_date, gd_no, brand_nm, gd_nm, outer_gd_no, main_pv, mn_megawari_pv, mn_megapo_pv, mn_myinterest_pv, mn_spotlight_brand_pv, mn_bestseller_pv, mn_beauty_ranking_pv, mn_beauty_pv, mn_timesale_pv, mn_dailydeal_pv, mn_groupbuy_pv, mn_chancedeal_pv, mn_etc_pv, search_pv, sch_keywordplus_pv, sch_powerrank_pv, sch_cps_pv, sch_timesale_pv, sch_etc_pv, bestseller_pv, beautyhub_pv, supplementhub_pv, deal_pv, dl_todaysmega_pv, dl_todaysmega_po_pv, dl_timesale_pv, dl_dailydeal_pv, dl_groupbuy_pv, dl_onedaychance_pv, wish_pv, todaysview_pv, cart_pv, sellershop_pv, special_pv, category_pv, vip_pv, catalog_pv, my_pv, live_pv, external_pv, ext_google_pv, ext_facebook_pv, ext_twitter_pv, ext_instagram_pv, ext_tiktok_pv, ext_yahoo_pv, ext_kakaku_pv, ext_line_pv, ext_email_pv, ext_others_pv, directurl_pv, etc_pv, total_pv
  from jsonb_to_recordset(p_rows) as t(base_date date, gd_no text, brand_nm text, gd_nm text, outer_gd_no text, main_pv integer, mn_megawari_pv integer, mn_megapo_pv integer, mn_myinterest_pv integer, mn_spotlight_brand_pv integer, mn_bestseller_pv integer, mn_beauty_ranking_pv integer, mn_beauty_pv integer, mn_timesale_pv integer, mn_dailydeal_pv integer, mn_groupbuy_pv integer, mn_chancedeal_pv integer, mn_etc_pv integer, search_pv integer, sch_keywordplus_pv integer, sch_powerrank_pv integer, sch_cps_pv integer, sch_timesale_pv integer, sch_etc_pv integer, bestseller_pv integer, beautyhub_pv integer, supplementhub_pv integer, deal_pv integer, dl_todaysmega_pv integer, dl_todaysmega_po_pv integer, dl_timesale_pv integer, dl_dailydeal_pv integer, dl_groupbuy_pv integer, dl_onedaychance_pv integer, wish_pv integer, todaysview_pv integer, cart_pv integer, sellershop_pv integer, special_pv integer, category_pv integer, vip_pv integer, catalog_pv integer, my_pv integer, live_pv integer, external_pv integer, ext_google_pv integer, ext_facebook_pv integer, ext_twitter_pv integer, ext_instagram_pv integer, ext_tiktok_pv integer, ext_yahoo_pv integer, ext_kakaku_pv integer, ext_line_pv integer, ext_email_pv integer, ext_others_pv integer, directurl_pv integer, etc_pv integer, total_pv integer)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_pageview_goods(date, date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_customer_daily(p_from date, p_to date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_customer_daily where base_date between p_from and p_to;
  insert into inni_customer_daily (base_date, newbuyer_cnt, newbuyer_rate, existingbuyer_cnt, existingbuyer_rate, buyer_cnt, shop_follower_inc, shop_follower_cnt, shop_page_view)
  select base_date, newbuyer_cnt, newbuyer_rate, existingbuyer_cnt, existingbuyer_rate, buyer_cnt, shop_follower_inc, shop_follower_cnt, shop_page_view
  from jsonb_to_recordset(p_rows) as t(base_date date, newbuyer_cnt bigint, newbuyer_rate numeric, existingbuyer_cnt bigint, existingbuyer_rate numeric, buyer_cnt bigint, shop_follower_inc bigint, shop_follower_cnt bigint, shop_page_view bigint)
  where base_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_customer_daily(date, date, jsonb) from public, anon, authenticated;

create or replace function inni_replace_customer_goods(p_date date, p_rows jsonb)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from inni_customer_goods where snapshot_date = p_date;
  insert into inni_customer_goods (snapshot_date, gd_no, brand_nm, gd_nm, outer_gd_no, wish_cnt, basket_cnt)
  select p_date, gd_no, brand_nm, gd_nm, outer_gd_no, wish_cnt, basket_cnt
  from jsonb_to_recordset(p_rows) as t(gd_no text, brand_nm text, gd_nm text, outer_gd_no text, wish_cnt bigint, basket_cnt bigint);
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function inni_replace_customer_goods(date, jsonb) from public, anon, authenticated;
