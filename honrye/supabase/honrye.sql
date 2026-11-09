-- honrye(전통 혼례 식순) 수정 내용 저장용 Supabase 설정 (SQL Editor 에서 실행, 다시 실행해도 안전)
--   honrye_content : 화면에 보일 식순 내용(JSON). slug 로 구분 (실제 페이지는 'main')
--   honrye_auth    : 수정용 PIN 의 해시 (PIN 원문은 저장하지 않음)
--   honrye_attempts: 틀린 PIN 시도 기록 (10분 안에 8번 틀리면 잠깐 잠김)
-- 표는 모두 잠가 두고(anon 접근 불가), 아래 함수로만 읽고 쓴다.
--   honrye_get(slug)                      → 누구나 읽기 { rev, data, updated_at } (없으면 null)
--   honrye_check_pin(pin)                 → { ok } | { ok:false, error:'bad_pin'|'locked' }
--   honrye_save(pin, data, slug, rev)     → { ok, rev } | { ok:false, error:'bad_pin'|'locked'|'stale'|'bad_data'|'bad_slug', rev }
--   honrye_set_pin(old_pin, new_pin)      → { ok } | { ok:false, error:... }
-- 틀린 시도를 기록하려면 오류를 던지지 않고 결과값으로 돌려줘야 한다(오류를 던지면 기록도 함께 취소됨).

create extension if not exists pgcrypto with schema extensions;

create table if not exists honrye_content (
  slug text primary key,
  data jsonb not null,
  rev integer not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists honrye_auth (
  id integer primary key default 1 check (id = 1),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists honrye_attempts (
  id bigserial primary key,
  ts timestamptz not null default now()
);
alter table honrye_content enable row level security;
alter table honrye_auth enable row level security;
alter table honrye_attempts enable row level security;
revoke all on honrye_content, honrye_auth, honrye_attempts from public, anon, authenticated;

-- 내부용: PIN 확인 + 시도 기록/잠금. 'ok' | 'bad_pin' | 'locked'
create or replace function honrye_verify(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare h text;
begin
  delete from honrye_attempts where ts < now() - interval '1 day';
  if (select count(*) from honrye_attempts where ts > now() - interval '10 minutes') >= 8 then
    return 'locked';
  end if;
  select pin_hash into h from honrye_auth where id = 1;
  if h is null or p_pin is null or crypt(p_pin, h) <> h then
    insert into honrye_attempts default values;
    return 'bad_pin';
  end if;
  delete from honrye_attempts;
  return 'ok';
end;
$$;
revoke all on function honrye_verify(text) from public, anon, authenticated;

create or replace function honrye_get(p_slug text default 'main') returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('rev', rev, 'data', data, 'updated_at', updated_at)
  from honrye_content where slug = p_slug;
$$;

create or replace function honrye_check_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare st text;
begin
  st := honrye_verify(p_pin);
  if st = 'ok' then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'error', st);
end;
$$;

create or replace function honrye_save(
  p_pin text, p_data jsonb, p_slug text default 'main', p_expected_rev integer default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare st text; cur integer; newrev integer;
begin
  st := honrye_verify(p_pin);
  if st <> 'ok' then return jsonb_build_object('ok', false, 'error', st); end if;
  if p_slug is null or p_slug !~ '^[a-z0-9-]{1,40}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_slug');
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'steps') is distinct from 'array'
     or jsonb_array_length(p_data -> 'steps') not between 1 and 40
     or octet_length(p_data::text) > 300000 then
    return jsonb_build_object('ok', false, 'error', 'bad_data');
  end if;
  select rev into cur from honrye_content where slug = p_slug for update;
  if cur is not null and p_expected_rev is not null and p_expected_rev <> cur then
    return jsonb_build_object('ok', false, 'error', 'stale', 'rev', cur);
  end if;
  insert into honrye_content (slug, data, rev) values (p_slug, p_data, 1)
  on conflict (slug) do update
    set data = excluded.data, rev = honrye_content.rev + 1, updated_at = now()
  returning rev into newrev;
  return jsonb_build_object('ok', true, 'rev', newrev);
end;
$$;

create or replace function honrye_set_pin(p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare st text;
begin
  st := honrye_verify(p_old);
  if st <> 'ok' then return jsonb_build_object('ok', false, 'error', st); end if;
  if p_new is null or length(p_new) < 4 or length(p_new) > 32 then
    return jsonb_build_object('ok', false, 'error', 'bad_new_pin');
  end if;
  update honrye_auth set pin_hash = crypt(p_new, gen_salt('bf')), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function honrye_get(text), honrye_check_pin(text), honrye_save(text, jsonb, text, integer), honrye_set_pin(text, text) from public;
grant execute on function honrye_get(text), honrye_check_pin(text), honrye_save(text, jsonb, text, integer), honrye_set_pin(text, text) to anon, authenticated;
