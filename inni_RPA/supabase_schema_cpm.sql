-- QSM Beauty Brand AD(CPM) 수집 표. 접근은 service_role(RPA)만: RLS 활성 + 권한 회수. 다시 실행해도 안전.
create table if not exists inni_cpm_campaign (
  campaign_no integer primary key,
  title text,
  status text,
  campaign_type text,
  max_amt integer,          -- 광고당 최대 금액(엔)
  daily_budget integer,
  total_budget integer,
  start_dt date,
  end_dt date,
  collected_at timestamptz not null default now()
);
alter table inni_cpm_campaign enable row level security;
revoke all on inni_cpm_campaign from anon, authenticated;

create table if not exists inni_cpm_daily (
  base_date date not null,
  campaign_no integer not null,
  impressions bigint not null default 0,    -- 광고 노출 수
  ad_cost numeric not null default 0,       -- 광고비(엔)
  detail_cnt bigint not null default 0,     -- 상품 열람 시작 수
  purchase_cnt bigint not null default 0,   -- 구매 수
  collected_at timestamptz not null default now(),
  primary key (base_date, campaign_no)
);
alter table inni_cpm_daily enable row level security;
revoke all on inni_cpm_daily from anon, authenticated;

create table if not exists inni_cpm_keyword_daily (
  base_date date not null,
  campaign_no integer not null,
  keyword text not null,
  impressions bigint not null default 0,
  collected_at timestamptz not null default now(),
  primary key (base_date, campaign_no, keyword)
);
alter table inni_cpm_keyword_daily enable row level security;
revoke all on inni_cpm_keyword_daily from anon, authenticated;

-- 캠페인은 있는 그대로 갱신하고, p_from~p_to 구간의 일자별 성과·키워드는 통째로 교체 (한 트랜잭션)
create or replace function inni_replace_cpm(p_from date, p_to date, p_campaigns jsonb, p_daily jsonb, p_keywords jsonb)
returns jsonb language plpgsql as $$
declare nc integer; nd integer; nk integer;
begin
  insert into inni_cpm_campaign (campaign_no, title, status, campaign_type, max_amt, daily_budget, total_budget, start_dt, end_dt, collected_at)
  select campaign_no, title, status, campaign_type, max_amt, daily_budget, total_budget, start_dt, end_dt, now()
  from jsonb_to_recordset(p_campaigns) as t(campaign_no integer, title text, status text, campaign_type text, max_amt integer, daily_budget integer, total_budget integer, start_dt date, end_dt date)
  on conflict (campaign_no) do update set title = excluded.title, status = excluded.status, campaign_type = excluded.campaign_type,
    max_amt = excluded.max_amt, daily_budget = excluded.daily_budget, total_budget = excluded.total_budget,
    start_dt = excluded.start_dt, end_dt = excluded.end_dt, collected_at = now();
  get diagnostics nc = row_count;
  delete from inni_cpm_daily where base_date between p_from and p_to;
  insert into inni_cpm_daily (base_date, campaign_no, impressions, ad_cost, detail_cnt, purchase_cnt)
  select base_date, campaign_no, coalesce(impressions, 0), coalesce(ad_cost, 0), coalesce(detail_cnt, 0), coalesce(purchase_cnt, 0)
  from jsonb_to_recordset(p_daily) as t(base_date date, campaign_no integer, impressions bigint, ad_cost numeric, detail_cnt bigint, purchase_cnt bigint)
  where base_date between p_from and p_to;
  get diagnostics nd = row_count;
  delete from inni_cpm_keyword_daily where base_date between p_from and p_to;
  insert into inni_cpm_keyword_daily (base_date, campaign_no, keyword, impressions)
  select base_date, campaign_no, keyword, coalesce(impressions, 0)
  from jsonb_to_recordset(p_keywords) as t(base_date date, campaign_no integer, keyword text, impressions bigint)
  where base_date between p_from and p_to;
  get diagnostics nk = row_count;
  return jsonb_build_object('campaigns', nc, 'daily', nd, 'keywords', nk);
end; $$;
revoke all on function inni_replace_cpm(date, date, jsonb, jsonb, jsonb) from public, anon, authenticated;
