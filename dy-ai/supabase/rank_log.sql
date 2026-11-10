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

-- 이니스프리 브랜드(イニスフリー)의 날짜·구분·카테고리별 랭킹 요약 → 대시보드 'rank_d/rank_w/rank_m' 소스
--  cnt: 그 랭킹에 진입한 상품 수(행 수), rank_sum: 그 순위들의 합 (rank_sum ÷ cnt = 평균 순위)
--  period: daily(데일리 뷰티 200위) | weekly | monthly (카테고리: 전체·스킨케어·스킨케어>화장수·스킨케어>미용액·베이스·베이스>루스파우더·포인트)
--  주간·월간은 수집한 날에만 행이 있어요.
drop view if exists inni_rank_daily;
create or replace view inni_rank_cat as
select rank_date, period, category, count(*)::bigint as cnt, coalesce(sum(rank), 0)::bigint as rank_sum
from q10_rank_log
where brand like 'イニスフリー%'
group by rank_date, period, category;
revoke all on inni_rank_cat from anon, authenticated;
