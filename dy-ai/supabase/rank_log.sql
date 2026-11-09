-- Q10 랭킹 기록 (data/*.csv 3개: 일간 베스트셀러·공식 주간·공식 월간) → DB
-- Supabase SQL Editor 에서 한 번 실행, 다시 실행해도 안전. 이 파일을 먼저, 그다음 dashboard.sql 을 다시 실행한다.
-- 표는 잠금(로그인 사용자도 직접 못 읽음). 쓰기는 서비스 키(csv_logger.py·로컬 적재 스크립트), 읽기는 아래 뷰를 거친 dy_dash_agg 로만.

create table if not exists q10_rank_log (
  rank_date date not null,        -- CSV 의 일자
  category text not null,         -- 데일리 뷰티 | 전체_주간 | 스킨케어>화장수_월간 ...
  rank int not null,
  brand text,
  product_name text,
  price int,
  period text not null,           -- daily | weekly | monthly (카테고리 이름에서 계산)
  primary key (rank_date, category, rank)
);
alter table q10_rank_log enable row level security;
revoke all on q10_rank_log from anon, authenticated;
create index if not exists q10_rank_log_brand_idx on q10_rank_log (rank_date, brand);

-- 이니스프리 브랜드(イニスフリー)의 날짜별 랭킹 요약 → 대시보드 'rank' 소스
--  *_cnt: 순위 안에 든 상품 수, *_top10/50: 10위·50위 안 상품 수, *_rank_sum: 순위 합(÷cnt = 평균 순위)
--  주간·월간은 수집한 날에만 값이 있어요(다른 날은 0).
create or replace view inni_rank_daily as
select rank_date,
  count(*) filter (where category = '데일리 뷰티' and brand like 'イニスフリー%')::bigint as d_cnt,
  count(*) filter (where category = '데일리 뷰티' and brand like 'イニスフリー%' and rank <= 10)::bigint as d_top10,
  count(*) filter (where category = '데일리 뷰티' and brand like 'イニスフリー%' and rank <= 50)::bigint as d_top50,
  coalesce(sum(rank) filter (where category = '데일리 뷰티' and brand like 'イニスフリー%'), 0)::bigint as d_rank_sum,
  count(*) filter (where category = '전체_주간' and brand like 'イニスフリー%')::bigint as w_cnt,
  count(*) filter (where category = '전체_주간' and brand like 'イニスフリー%' and rank <= 10)::bigint as w_top10,
  count(*) filter (where category = '전체_주간' and brand like 'イニスフリー%' and rank <= 50)::bigint as w_top50,
  coalesce(sum(rank) filter (where category = '전체_주간' and brand like 'イニスフリー%'), 0)::bigint as w_rank_sum,
  count(*) filter (where category = '전체_월간' and brand like 'イニスフリー%')::bigint as m_cnt,
  count(*) filter (where category = '전체_월간' and brand like 'イニスフリー%' and rank <= 10)::bigint as m_top10,
  count(*) filter (where category = '전체_월간' and brand like 'イニスフリー%' and rank <= 50)::bigint as m_top50,
  coalesce(sum(rank) filter (where category = '전체_월간' and brand like 'イニスフリー%'), 0)::bigint as m_rank_sum
from q10_rank_log
group by rank_date;
revoke all on inni_rank_daily from anon, authenticated;
