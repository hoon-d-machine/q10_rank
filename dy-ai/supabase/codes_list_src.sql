-- 상품코드 목록: 판매 이력이 없는 신규 상품도 PV·고객·광고 표에서 원본 상품명을 찾는다 (admin.sql 의 dy_codes_list 와 같음)
-- 목록: 코드표 + 데이터에 있는 원본 상품명·브랜드·첫/마지막 판매일
create or replace function dy_codes_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not dy_can('dash.codes') then raise exception 'no permission'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'gd_no', c.gd_no, 'product_name', c.product_name, 'line', c.line, 'category', c.category, 'note', c.note, 'auto_added', c.auto_added,
      'src_name', coalesce(g.gd_nm, o.gd_nm), 'brand_nm', coalesce(g.brand_nm, o.brand_nm), 'first_date', g.d0, 'last_date', g.d1, 'updated_at', c.updated_at) order by c.auto_added desc, c.gd_no)
    from inni_product_codes c
    left join (select gd_no, min(base_date) d0, max(base_date) d1, max(brand_nm) brand_nm, (array_agg(gd_nm order by base_date desc))[1] gd_nm
               from inni_sales_goods group by gd_no) g on g.gd_no = c.gd_no
    -- 판매 이력이 없는 신규 상품은 PV·고객·광고 표의 가장 최근 원본 상품명으로
    left join lateral (select gd_nm, brand_nm from (
        select gd_nm, brand_nm, base_date d from inni_pageview_goods where gd_no = c.gd_no
        union all select gd_nm, brand_nm, snapshot_date from inni_customer_goods where gd_no = c.gd_no
        union all select gd_nm, brand_nm, base_date from inni_ad_goods_daily where gd_no = c.gd_no) u
      where nullif(btrim(gd_nm), '') is not null order by d desc limit 1) o on g.gd_no is null), '[]'::jsonb);
end;
$$;

