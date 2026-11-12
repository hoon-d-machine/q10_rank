-- DY-AI '데이터' 메뉴용 Supabase 설정 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
--  dy_data_page : 원본 표를 기간·검색·페이지로 읽는 읽기 전용 함수 (엑셀 다운로드도 이 함수를 페이지별로 호출)
-- inni_* 표는 계속 잠겨 있고, 로그인 사용자는 이 함수로만 읽는다 (dashboard.sql 과 같은 방식).
--
--   p_source : 'goods'(inni_sales_goods) | 'sales'(inni_sales_daily) | 'pageview'(inni_pageview_daily) | 'pvgoods'(상품별 일자 PV) | 'customer'(고객 일자) | 'custgoods'(찜·장바구니 스냅샷) | 'products'(inni_product_codes) | 'rank'(q10_rank_log, 일간·주간·월간 랭킹)
--   p_from/p_to : 날짜 범위 (goods 는 base_date, sales·pageview 는 base_start_dt, rank 는 rank_date 기준, products 는 무시)
--   p_q      : 검색어 (goods: 상품명·브랜드·상품코드·외부상품코드·제품명·라인·카테고리 / products: 상품번호·제품명·라인·카테고리)
--   p_limit  : 한 번에 가져올 행 수 (1~1000), p_offset : 건너뛸 행 수
-- 결과: { "total": 조건에 맞는 전체 행 수, "rows": [ {열: 값, ...} ] }  (goods 행에는 상품코드표의 product_name·line·category 가 붙음)

create or replace function dy_data_page(
  p_source text,
  p_from date default null,
  p_to date default null,
  p_q text default null,
  p_limit int default 100,
  p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  tbl text; dcol text; ord text; w text := 'true';
  lim int; off int; qq text; total bigint; rows_ jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  lim := least(greatest(coalesce(p_limit, 100), 1), 1000);
  off := greatest(coalesce(p_offset, 0), 0);

  case p_source
    when 'goods'    then tbl := 'inni_sales_goods';     dcol := 'base_date';     ord := 't.base_date desc, t.gd_no';
    when 'sales'    then tbl := 'inni_sales_daily';     dcol := 'base_start_dt'; ord := 't.base_start_dt desc';
    when 'pageview' then tbl := 'inni_pageview_daily';  dcol := 'base_start_dt'; ord := 't.base_start_dt desc';
    when 'products' then tbl := 'inni_product_codes';   dcol := null;            ord := 't.gd_no';
    when 'pvgoods'  then tbl := 'inni_pageview_goods';  dcol := 'base_date';     ord := 't.base_date desc, t.total_pv desc nulls last, t.gd_no';
    when 'customer' then tbl := 'inni_customer_daily';  dcol := 'base_date';     ord := 't.base_date desc';
    when 'custgoods' then tbl := 'inni_customer_goods'; dcol := 'snapshot_date'; ord := 't.snapshot_date desc, t.wish_cnt desc nulls last, t.gd_no';
    when 'rank'     then tbl := 'q10_rank_log';         dcol := 'rank_date';     ord := 't.rank_date desc, t.category, t.rank';   -- supabase/rank_log.sql 먼저
    else raise exception 'bad source';
  end case;

  if dcol is not null then
    if p_from is not null then w := w || format(' and t.%I >= $1', dcol); end if;
    if p_to   is not null then w := w || format(' and t.%I <= $2', dcol); end if;
  end if;

  if coalesce(trim(p_q), '') <> '' then
    -- LIKE 특수문자(\ % _)는 글자 그대로 찾도록 이스케이프
    qq := '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if p_source in ('goods', 'pvgoods', 'custgoods') then
      w := w || ' and (t.gd_nm ilike $3 or t.brand_nm ilike $3 or t.gd_no ilike $3 or t.outer_gd_no ilike $3'
             || ' or t.gd_no in (select m.gd_no from inni_product_codes m'
             || '  where m.product_name ilike $3 or m.line ilike $3 or m.category ilike $3))';
    elsif p_source = 'rank' then
      w := w || ' and (t.product_name ilike $3 or t.brand ilike $3 or t.category ilike $3)';
    elsif p_source = 'products' then
      w := w || ' and (t.gd_no ilike $3 or t.product_name ilike $3 or t.line ilike $3 or t.category ilike $3)';
    end if;
  end if;

  execute format('select count(*) from %I t where %s', tbl, w) into total using p_from, p_to, qq;

  if p_source in ('goods', 'pvgoods', 'custgoods') then
    execute format(
      'select coalesce(jsonb_agg(x order by rn), ''[]''::jsonb) from ('
      || ' select (to_jsonb(t) - ''collected_at'')'
      || '   || jsonb_build_object(''product_name'', p.product_name, ''line'', p.line, ''category'', p.category) as x,'
      || '   row_number() over (order by %s) as rn'
      || ' from %I t left join inni_product_codes p on p.gd_no = t.gd_no'
      || ' where %s order by %s limit %s offset %s) s',
      ord, tbl, w, ord, lim, off) into rows_ using p_from, p_to, qq;
  else
    execute format(
      'select coalesce(jsonb_agg(x order by rn), ''[]''::jsonb) from ('
      || ' select (to_jsonb(t) - ''collected_at'') as x, row_number() over (order by %s) as rn'
      || ' from %I t where %s order by %s limit %s offset %s) s',
      ord, tbl, w, ord, lim, off) into rows_ using p_from, p_to, qq;
  end if;

  return jsonb_build_object('total', total, 'rows', rows_);
end;
$$;
revoke all on function dy_data_page(text, date, date, text, int, int) from public, anon;
grant execute on function dy_data_page(text, date, date, text, int, int) to authenticated;
