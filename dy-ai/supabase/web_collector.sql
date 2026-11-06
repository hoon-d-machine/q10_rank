-- DY-AI 웹 수집기용 Supabase 설정 (SQL Editor 에서 한 번 실행, 다시 실행해도 안전)
--  1) 수집 로그 테이블: 수집 한 번 = dy_collect_runs 한 줄, 단계별 기록 = dy_collect_steps
--  2) inni_replace_* 교체 함수를 로그인한 사용자(authenticated)도 실행할 수 있게
--     (테이블 자체는 계속 잠겨 있고, 이 세 함수로만 "전전월 1일 이후 구간 교체"가 가능)

-- ============================================================
-- 1) 수집 로그
-- ============================================================
create table if not exists dy_collect_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  user_id uuid not null default auth.uid(),
  user_email text default (auth.jwt() ->> 'email'),
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'error', 'cancel')),
  period_start date,
  period_end date,
  summary text
);
create index if not exists dy_collect_runs_started on dy_collect_runs (started_at desc);

create table if not exists dy_collect_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references dy_collect_runs (id) on delete cascade,
  ts timestamptz not null default now(),
  step text not null,
  level text not null default 'info' check (level in ('info', 'ok', 'warn', 'error')),
  message text,
  detail jsonb
);
create index if not exists dy_collect_steps_run on dy_collect_steps (run_id, id);

alter table dy_collect_runs enable row level security;
alter table dy_collect_steps enable row level security;
revoke all on dy_collect_runs, dy_collect_steps from anon;
grant select, insert, update on dy_collect_runs to authenticated;
grant select, insert on dy_collect_steps to authenticated;

-- 로그인한 사람은 모든 로그를 볼 수 있고, 자기 수집 건만 쓰고 고칠 수 있음
drop policy if exists "runs read" on dy_collect_runs;
create policy "runs read" on dy_collect_runs for select to authenticated using (true);
drop policy if exists "runs insert own" on dy_collect_runs;
create policy "runs insert own" on dy_collect_runs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "runs update own" on dy_collect_runs;
create policy "runs update own" on dy_collect_runs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "steps read" on dy_collect_steps;
create policy "steps read" on dy_collect_steps for select to authenticated using (true);
drop policy if exists "steps insert own run" on dy_collect_steps;
create policy "steps insert own run" on dy_collect_steps for insert to authenticated
  with check (exists (select 1 from dy_collect_runs r where r.id = run_id and r.user_id = auth.uid()));

-- ============================================================
-- 2) 교체 함수를 웹(로그인 사용자)에서 호출 가능하게
--    security definer: 함수 소유자 권한으로 실행 → 잠긴 테이블을 함수 안에서만 바꿀 수 있음
-- ============================================================
alter function inni_replace_sales_goods(date, jsonb) security definer set search_path = public;
alter function inni_replace_sales_daily(date, jsonb) security definer set search_path = public;
alter function inni_replace_pageview_daily(date, jsonb) security definer set search_path = public;
grant execute on function inni_replace_sales_goods(date, jsonb) to authenticated;
grant execute on function inni_replace_sales_daily(date, jsonb) to authenticated;
grant execute on function inni_replace_pageview_daily(date, jsonb) to authenticated;
