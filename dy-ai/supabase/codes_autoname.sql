-- 상품코드 자동 등록 때 원본 상품명도 같이 채운다
-- 원인: 자동 등록 트리거가 상품번호만 넣었고, 화면의 원본 상품명은 판매표(inni_sales_goods)에서만 찾아서
--       PV·고객·광고 표로 먼저 들어온 신규 상품은 상품명이 비어 보였다.
-- 고침: 새로 들어온 행의 gd_nm 으로 상품명을 채움(자동 등록 표시 auto_added 는 유지, 화면에서 저장하면 해제). 이미 자동 등록된 빈 상품명도 한 번 채움.

create or replace function inni_codes_autoadd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into inni_product_codes (gd_no, product_name, auto_added)
  select distinct on (btrim(gd_no)) btrim(gd_no), nullif(btrim(gd_nm), ''), true
    from new_rows where gd_no is not null and btrim(gd_no) <> ''
   order by btrim(gd_no), (nullif(btrim(gd_nm), '') is null)
  on conflict (gd_no) do update
    set product_name = excluded.product_name
  where inni_product_codes.auto_added and inni_product_codes.product_name is null and excluded.product_name is not null;
  return null;
end;
$$;
revoke all on function inni_codes_autoadd() from public, anon, authenticated;

-- 이미 자동 등록된 것 중 상품명이 빈 것: 네 표에서 가장 최근 원본 상품명으로
update inni_product_codes c set product_name = s.nm
from (
  select distinct on (gd_no) gd_no, nm from (
    select btrim(gd_no) gd_no, nullif(btrim(gd_nm), '') nm, base_date d from inni_sales_goods
    union all select btrim(gd_no), nullif(btrim(gd_nm), ''), base_date from inni_pageview_goods
    union all select btrim(gd_no), nullif(btrim(gd_nm), ''), snapshot_date from inni_customer_goods
    union all select btrim(gd_no), nullif(btrim(gd_nm), ''), base_date from inni_ad_goods_daily
  ) u where nm is not null order by gd_no, d desc
) s
where c.gd_no = s.gd_no and c.auto_added and c.product_name is null;
