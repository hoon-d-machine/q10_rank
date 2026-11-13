-- DY-AI 계정 권한 + 상품코드 관리
--   dy_user_perms : 계정별 권한(관리자 여부, 허용 키 목록, 이름·메모, 사용 중지). 표는 잠금, 아래 함수로만 접근
--   권한 키 목록(메뉴·탭·화면 기능)은 화면(public/assets/perm.js 의 CATALOG)이 정한다. DB 는 허용된 키 문자열만 저장
--   계정 생성·비밀번호 변경·삭제는 Worker(/api/admin/*, service key)가 하고, 권한 읽기·쓰기는 아래 함수가 한다 (관리자만)
--   상품코드: inni_product_codes 에 비고·자동 등록 표시를 더하고, 데이터에서 새 상품번호가 들어오면 자동 등록
-- Supabase SQL Editor 에서 한 번 실행 (여러 번 실행해도 됨)

-- ============================================================
-- 1. 계정 권한
-- ============================================================
create table if not exists dy_user_perms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  perms jsonb not null default '[]'::jsonb,
  display_name text,
  note text,
  disabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table dy_user_perms enable row level security;
revoke all on dy_user_perms from anon, authenticated;

-- 지금 있는 계정: 모두 기존처럼 전부 볼 수 있게(권한 키 '*'), 관리자는 아래 3개
insert into dy_user_perms (user_id, is_admin, perms, display_name)
select u.id, u.email in ('admin@dy-ai.local', 'doyon@dy-ai.local', 'xogns1381@gmail.com'), '["*"]'::jsonb, split_part(u.email, '@', 1)
from auth.users u
on conflict (user_id) do nothing;

create or replace function dy_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin and not p.disabled from dy_user_perms p where p.user_id = auth.uid()), false)
$$;

-- 내 권한: { is_admin, perms:[키…] , name, disabled }. 행이 없으면 아무 권한도 없는 계정
create or replace function dy_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r dy_user_perms;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  select * into r from dy_user_perms where user_id = auth.uid();
  if not found then return jsonb_build_object('is_admin', false, 'perms', '[]'::jsonb, 'name', null, 'disabled', false, 'registered', false); end if;
  return jsonb_build_object('is_admin', r.is_admin and not r.disabled, 'perms', r.perms, 'name', r.display_name, 'disabled', r.disabled, 'registered', true);
end;
$$;

create or replace function dy_can(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not p.disabled and (p.is_admin or p.perms ? '*' or p.perms ? p_key) from dy_user_perms p where p.user_id = auth.uid()), false)
$$;

-- 관리자: 계정 목록 (auth.users + 권한)
create or replace function dy_admin_users() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not dy_is_admin() then raise exception 'admin only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'is_admin', coalesce(p.is_admin, false), 'perms', coalesce(p.perms, '[]'::jsonb), 'name', p.display_name, 'note', p.note,
      'disabled', coalesce(p.disabled, false), 'registered', p.user_id is not null) order by u.created_at)
    from auth.users u left join dy_user_perms p on p.user_id = u.id), '[]'::jsonb);
end;
$$;

-- 관리자: 권한·이름·메모 저장 (자기 자신의 관리자 권한은 못 뺌, 마지막 관리자는 못 없앰)
create or replace function dy_admin_set_perms(p_user uuid, p_is_admin boolean, p_perms jsonb, p_name text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare admins int;
begin
  if not dy_is_admin() then raise exception 'admin only'; end if;
  if jsonb_typeof(coalesce(p_perms, '[]'::jsonb)) <> 'array' then raise exception 'perms must be array'; end if;
  if p_user = auth.uid() and not p_is_admin then raise exception '자기 자신의 관리자 권한은 뺄 수 없어요'; end if;
  insert into dy_user_perms (user_id, is_admin, perms, display_name, note, updated_at, updated_by)
  values (p_user, coalesce(p_is_admin, false), coalesce(p_perms, '[]'::jsonb), nullif(btrim(p_name), ''), nullif(btrim(p_note), ''), now(), auth.uid())
  on conflict (user_id) do update set is_admin = excluded.is_admin, perms = excluded.perms, display_name = excluded.display_name,
    note = excluded.note, updated_at = now(), updated_by = auth.uid();
  select count(*) into admins from dy_user_perms where is_admin and not disabled;
  if admins < 1 then raise exception '관리자가 한 명도 없게 만들 수는 없어요'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dy_is_admin(), dy_me(), dy_can(text), dy_admin_users(), dy_admin_set_perms(uuid, boolean, jsonb, text, text) from public, anon;
grant execute on function dy_is_admin(), dy_me(), dy_can(text), dy_admin_users(), dy_admin_set_perms(uuid, boolean, jsonb, text, text) to authenticated;

-- ============================================================
-- 2. 상품코드 관리
-- ============================================================
alter table inni_product_codes add column if not exists note text;
alter table inni_product_codes add column if not exists auto_added boolean not null default false;
alter table inni_product_codes add column if not exists created_at timestamptz not null default now();
alter table inni_product_codes add column if not exists updated_by uuid;

-- 새 상품번호 자동 등록: 판매·PV·광고·찜 데이터에 처음 나온 상품번호를 상품명 없이 등록(상품명은 화면에서 원본 상품명으로 대신 보임)
create or replace function inni_codes_autoadd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into inni_product_codes (gd_no, auto_added)
  select distinct btrim(gd_no), true from new_rows where gd_no is not null and btrim(gd_no) <> ''
  on conflict (gd_no) do nothing;
  return null;
end;
$$;
revoke all on function inni_codes_autoadd() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['inni_sales_goods', 'inni_pageview_goods', 'inni_customer_goods', 'inni_ad_goods_daily'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists %I on %I', 'trg_codes_autoadd_' || t, t);
      execute format('create trigger %I after insert on %I referencing new table as new_rows for each statement execute function inni_codes_autoadd()', 'trg_codes_autoadd_' || t, t);
    end if;
  end loop;
end $$;

-- 지금까지 데이터에 있었는데 코드표에 없는 상품번호도 한 번 등록
insert into inni_product_codes (gd_no, auto_added)
select distinct btrim(gd_no), true from inni_sales_goods where gd_no is not null and btrim(gd_no) <> ''
on conflict (gd_no) do nothing;

-- 목록: 코드표 + 데이터에 있는 원본 상품명·브랜드·첫/마지막 판매일
create or replace function dy_codes_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not dy_can('dash.codes') then raise exception 'no permission'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'gd_no', c.gd_no, 'product_name', c.product_name, 'line', c.line, 'category', c.category, 'note', c.note, 'auto_added', c.auto_added,
      'src_name', g.gd_nm, 'brand_nm', g.brand_nm, 'first_date', g.d0, 'last_date', g.d1, 'updated_at', c.updated_at) order by c.auto_added desc, c.gd_no)
    from inni_product_codes c
    left join (select gd_no, min(base_date) d0, max(base_date) d1, max(brand_nm) brand_nm, (array_agg(gd_nm order by base_date desc))[1] gd_nm
               from inni_sales_goods group by gd_no) g on g.gd_no = c.gd_no), '[]'::jsonb);
end;
$$;

-- 저장(등록·수정 다량): p_rows = [{gd_no, product_name, line, category, note}…]. 키가 없는 칸은 그대로 두고, 빈 문자열은 비움. 상품번호는 숫자·영문만
create or replace function dy_codes_save(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; g text; n_new int := 0; n_upd int := 0; ex boolean;
begin
  if not dy_can('edit.codes') then raise exception 'no permission'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be array'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception '한 번에 3,000행까지만 저장해요'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    g := btrim(coalesce(r->>'gd_no', ''));
    if g = '' then continue; end if;
    if g !~ '^[0-9A-Za-z_-]{1,40}$' then raise exception '상품번호 형식이 올바르지 않아요: %', left(g, 40); end if;
    select exists (select 1 from inni_product_codes where gd_no = g) into ex;
    insert into inni_product_codes (gd_no, product_name, line, category, note, auto_added, updated_at, updated_by)
    values (g, nullif(btrim(r->>'product_name'), ''), nullif(btrim(r->>'line'), ''), nullif(btrim(r->>'category'), ''), nullif(btrim(r->>'note'), ''), false, now(), auth.uid())
    on conflict (gd_no) do update set
      product_name = case when r ? 'product_name' then nullif(btrim(r->>'product_name'), '') else inni_product_codes.product_name end,
      line = case when r ? 'line' then nullif(btrim(r->>'line'), '') else inni_product_codes.line end,
      category = case when r ? 'category' then nullif(btrim(r->>'category'), '') else inni_product_codes.category end,
      note = case when r ? 'note' then nullif(btrim(r->>'note'), '') else inni_product_codes.note end,
      auto_added = false, updated_at = now(), updated_by = auth.uid();
    if ex then n_upd := n_upd + 1; else n_new := n_new + 1; end if;
  end loop;
  return jsonb_build_object('inserted', n_new, 'updated', n_upd);
end;
$$;

create or replace function dy_codes_delete(p_gd_nos jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not dy_can('edit.codes') then raise exception 'no permission'; end if;
  delete from inni_product_codes where gd_no in (select jsonb_array_elements_text(p_gd_nos));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function dy_codes_list(), dy_codes_save(jsonb), dy_codes_delete(jsonb) from public, anon;
grant execute on function dy_codes_list(), dy_codes_save(jsonb), dy_codes_delete(jsonb) to authenticated;
