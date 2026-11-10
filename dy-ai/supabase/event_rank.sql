-- 행사(메가와리) 랭킹: 수집 설정 + 화면용 읽기 함수 + 즐겨찾기 + 표 잠금 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
--  qoo10_rankings  : 행사 랭킹 수집 결과 (Worker cron 이 서비스 키로 쌓음). 이 파일로 잠가서 로그인 사용자도 함수로만 읽는다.
--  brand_favorites : 브랜드 즐겨찾기(색). 로그인한 사람 모두 보고 고칠 수 있음(공용).
--  dy_event_config : 지금 수집할 행사 번호(SID)와 켜기/끄기 (사이트 '행사 랭킹' 화면에서 바꿈)

create index if not exists qoo10_rankings_sid_idx on qoo10_rankings (event_sid, rank_type, category, collected_at);

-- ---- 수집 설정 ----
create table if not exists dy_event_config (
  id int primary key default 1 check (id = 1),
  event_sid text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into dy_event_config (id) values (1) on conflict (id) do nothing;
alter table dy_event_config enable row level security;
revoke all on dy_event_config from anon, authenticated;

-- Worker(서비스 키) 전용
create or replace function dy_event_config_read() returns jsonb
language sql stable security definer set search_path = public
as $$ select to_jsonb(c) - 'id' from dy_event_config c where id = 1 $$;
revoke all on function dy_event_config_read() from public, anon, authenticated;
grant execute on function dy_event_config_read() to service_role;

create or replace function dy_event_recent_count(p_sid text, p_since timestamp) returns bigint
language sql stable security definer set search_path = public
as $$ select count(*) from qoo10_rankings where event_sid = p_sid and collected_at >= p_since $$;
revoke all on function dy_event_recent_count(text, timestamp) from public, anon, authenticated;
grant execute on function dy_event_recent_count(text, timestamp) to service_role;

-- 상품별 최신 브랜드·카테고리·리뷰수 → { 상품번호: [브랜드, 대, 중, 소, 리뷰수] }
create or replace function dy_event_goods_cache() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(goods_no, jsonb_build_array(coalesce(brand, ''), coalesce(large_category, ''), coalesce(medium_category, ''), coalesce(small_category, ''), coalesce(review_count, 0))), '{}'::jsonb)
  from (select distinct on (goods_no) goods_no, brand, large_category, medium_category, small_category, review_count
        from qoo10_rankings order by goods_no, collected_at desc) t;
$$;
revoke all on function dy_event_goods_cache() from public, anon, authenticated;
grant execute on function dy_event_goods_cache() to service_role;

-- ---- 화면용 (로그인 사용자) ----
-- 행사 목록·랭킹 기준·타겟 목록 + 수집 설정
create or replace function dy_event_meta() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare res jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('sid', event_sid, 'n', n, 'from', d1, 'to', d2) order by d2 desc)
                        from (select event_sid, count(*) n, min(collected_at + interval '9 hours')::date d1, max(collected_at + interval '9 hours')::date d2
                              from qoo10_rankings group by event_sid) e), '[]'::jsonb),
    'rank_types', coalesce((select jsonb_agg(distinct rank_type) from qoo10_rankings), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(distinct category) from qoo10_rankings), '[]'::jsonb),
    'config', (select to_jsonb(c) - 'id' from dy_event_config c where id = 1)
  ) into res;
  return res;
end;
$$;
revoke all on function dy_event_meta() from public, anon;
grant execute on function dy_event_meta() to authenticated;

-- 조건에 맞는 행 (collected_at 은 한국 시각으로 바꿔서). p_sid 가 null 이면 전체 행사
create or replace function dy_event_rows(p_sid text, p_rank_type text, p_category text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare res jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      't', to_char(collected_at + interval '9 hours', 'YYYY-MM-DD"T"HH24:MI:SS'), 'rank', rank, 'brand', brand,
      'goods_no', goods_no, 'goods_name', goods_name, 'sale_price', sale_price, 'review_count', review_count,
      'large', large_category, 'medium', medium_category, 'small', small_category, 'sid', event_sid)
    order by collected_at, rank), '[]'::jsonb)
  into res
  from qoo10_rankings
  where (p_sid is null or event_sid = p_sid)
    and rank_type = p_rank_type and category = p_category
    and (p_from is null or (collected_at + interval '9 hours')::date >= p_from)
    and (p_to is null or (collected_at + interval '9 hours')::date <= p_to);
  return res;
end;
$$;
revoke all on function dy_event_rows(text, text, text, date, date) from public, anon;
grant execute on function dy_event_rows(text, text, text, date, date) to authenticated;

-- 수집할 행사 설정 바꾸기
create or replace function dy_event_config_set(p_sid text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update dy_event_config set event_sid = nullif(trim(p_sid), ''), enabled = coalesce(p_enabled, false),
    updated_at = now(), updated_by = auth.jwt() ->> 'email' where id = 1;
  return (select to_jsonb(c) - 'id' from dy_event_config c where id = 1);
end;
$$;
revoke all on function dy_event_config_set(text, boolean) from public, anon;
grant execute on function dy_event_config_set(text, boolean) to authenticated;

-- ---- 즐겨찾기: 로그인한 사람 모두 읽기·쓰기 ----
alter table brand_favorites enable row level security;
revoke all on brand_favorites from anon;
grant select, insert, update, delete on brand_favorites to authenticated;
drop policy if exists "fav all" on brand_favorites;
create policy "fav all" on brand_favorites for all to authenticated using (true) with check (true);

-- ---- 행사 랭킹 표 잠금 (지금까지는 누구나 공개 키로 읽고 쓸 수 있었음) ----
alter table qoo10_rankings enable row level security;
revoke all on qoo10_rankings from anon, authenticated;
