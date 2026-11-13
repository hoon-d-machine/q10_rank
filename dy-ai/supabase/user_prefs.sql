-- 계정별 화면 설정 저장 (지금은 표 열 너비 'colw'): 계정마다 키 하나에 JSON 하나
--   표는 잠금, 로그인한 본인 것만 아래 함수로 읽고 쓴다. public/assets/col-resize.js 가 쓴다
-- Supabase SQL Editor 에서 한 번 실행 (여러 번 실행해도 됨)

create table if not exists dy_user_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table dy_user_prefs enable row level security;
revoke all on dy_user_prefs from anon, authenticated;

create or replace function dy_pref_get(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  return (select value from dy_user_prefs where user_id = auth.uid() and key = p_key);
end;
$$;

create or replace function dy_pref_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_key !~ '^[a-z0-9_.-]{1,40}$' then raise exception 'bad key'; end if;
  if jsonb_typeof(p_value) <> 'object' or length(p_value::text) > 60000 then raise exception 'bad value'; end if;
  insert into dy_user_prefs (user_id, key, value, updated_at) values (auth.uid(), p_key, p_value, now())
  on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
end;
$$;

revoke all on function dy_pref_get(text), dy_pref_set(text, jsonb) from public, anon;
grant execute on function dy_pref_get(text), dy_pref_set(text, jsonb) to authenticated;
