-- ============================================================
-- M4X STORE V8 - PART 1/2
-- Giao diện tài khoản / avatar / huy hiệu / Community Chat
-- Chạy SAU M4X STORE V7.
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. AVATAR + HỒ SƠ CÔNG KHAI AN TOÀN CHO COMMUNITY
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_path text;

create table if not exists public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  avatar_path text,
  role text not null default 'user',
  updated_at timestamptz not null default now()
);

alter table public.community_profiles enable row level security;

drop policy if exists "community profiles authenticated read" on public.community_profiles;
create policy "community profiles authenticated read"
on public.community_profiles for select to authenticated
using (true);

grant select on public.community_profiles to authenticated;

create or replace function public.m4x_sync_community_profile()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.community_profiles(user_id,display_name,avatar_path,role,updated_at)
  values(new.id,new.display_name,new.avatar_path,new.role,now())
  on conflict(user_id) do update
  set display_name=excluded.display_name,
      avatar_path=excluded.avatar_path,
      role=excluded.role,
      updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_m4x_sync_community_profile on public.profiles;
create trigger trg_m4x_sync_community_profile
after insert or update of display_name,avatar_path,role
on public.profiles
for each row execute function public.m4x_sync_community_profile();

insert into public.community_profiles(user_id,display_name,avatar_path,role)
select id,display_name,avatar_path,role
from public.profiles
on conflict(user_id) do update
set display_name=excluded.display_name,
    avatar_path=excluded.avatar_path,
    role=excluded.role,
    updated_at=now();

create or replace function public.set_my_avatar(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  v text := nullif(trim(coalesce(p_avatar_path,'')),'');
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if v is null then
    update public.profiles set avatar_path=null where id=uid;
    return null;
  end if;
  if v not like uid::text||'/%' then
    raise exception 'Đường dẫn avatar không hợp lệ';
  end if;
  update public.profiles set avatar_path=v where id=uid;
  return v;
end;
$$;

revoke all on function public.set_my_avatar(text) from public,anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- Avatar public vì dùng làm ảnh đại diện trong phòng cộng đồng.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'avatars','avatars',true,5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=true,
    file_size_limit=5242880,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "avatar upload own" on storage.objects;
create policy "avatar upload own"
on storage.objects for insert to authenticated
with check(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own"
on storage.objects for update to authenticated
using(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
)
with check(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own"
on storage.objects for delete to authenticated
using(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=auth.uid()::text
);

-- ------------------------------------------------------------
-- 2. HUY HIỆU TÀI KHOẢN
-- ------------------------------------------------------------
create table if not exists public.account_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge text not null check(
    badge in ('early_user','vip','top_buyer','beta_tester','contributor')
  ),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id,badge)
);

alter table public.account_badges enable row level security;

drop policy if exists "badges authenticated read" on public.account_badges;
create policy "badges authenticated read"
on public.account_badges for select to authenticated
using(true);

grant select on public.account_badges to authenticated;

create or replace function public.admin_set_badges(
  p_user_id uuid,
  p_badges text[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;

  if exists(
    select 1
    from unnest(coalesce(p_badges,array[]::text[])) as x(badge_value)
    where badge_value not in ('early_user','vip','top_buyer','beta_tester','contributor')
  ) then
    raise exception 'Có huy hiệu không hợp lệ';
  end if;

  delete from public.account_badges where user_id=p_user_id;

  insert into public.account_badges(user_id,badge,granted_by)
  select p_user_id,b,auth.uid()
  from (
    select distinct unnest(coalesce(p_badges,array[]::text[])) as b
  ) x
  where b is not null and b<>'';
end;
$$;

revoke all on function public.admin_set_badges(uuid,text[]) from public,anon;
grant execute on function public.admin_set_badges(uuid,text[]) to authenticated;

create or replace function public.admin_sync_top_buyers(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;
  p_limit:=greatest(1,least(coalesce(p_limit,10),100));

  delete from public.account_badges where badge='top_buyer';

  insert into public.account_badges(user_id,badge,granted_by)
  select o.user_id,'top_buyer',auth.uid()
  from public.orders o
  where o.status='paid' and o.user_id is not null
  group by o.user_id
  order by sum(o.amount) desc
  limit p_limit
  on conflict(user_id,badge) do nothing;

  get diagnostics n=row_count;
  return n;
end;
$$;

revoke all on function public.admin_sync_top_buyers(integer) from public,anon;
grant execute on function public.admin_sync_top_buyers(integer) to authenticated;

-- ------------------------------------------------------------
-- 3. MODERATOR + MODERATION
-- ------------------------------------------------------------
create table if not exists public.community_moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_until timestamptz,
  banned boolean not null default false,
  reason text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.community_moderators enable row level security;
alter table public.community_moderation enable row level security;

drop policy if exists "community moderators read" on public.community_moderators;
create policy "community moderators read"
on public.community_moderators for select to authenticated
using(true);

drop policy if exists "community moderation self or staff read" on public.community_moderation;
create policy "community moderation self or staff read"
on public.community_moderation for select to authenticated
using(
  user_id=auth.uid()
  or public.is_admin()
  or exists(select 1 from public.community_moderators m where m.user_id=auth.uid())
);

grant select on public.community_moderators to authenticated;
grant select on public.community_moderation to authenticated;

create or replace function public.is_chat_moderator()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_admin()
  or exists(
    select 1 from public.community_moderators where user_id=auth.uid()
  );
$$;

grant execute on function public.is_chat_moderator() to authenticated;

create or replace function public.admin_set_community_moderator(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;

  if p_enabled then
    insert into public.community_moderators(user_id,granted_by)
    values(p_user_id,auth.uid())
    on conflict(user_id) do nothing;
  else
    delete from public.community_moderators where user_id=p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_set_community_moderator(uuid,boolean) from public,anon;
grant execute on function public.admin_set_community_moderator(uuid,boolean) to authenticated;

create or replace function public.moderate_community_user(
  p_user_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_action text := lower(trim(coalesce(p_action,'')));
  target_role text;
begin
  if not public.is_chat_moderator() then raise exception 'Không có quyền quản lý chat'; end if;
  if p_user_id=auth.uid() then raise exception 'Không thể tự áp dụng thao tác này'; end if;

  select role into target_role from public.profiles where id=p_user_id;
  if target_role='admin' and not public.is_admin() then
    raise exception 'MOD không thể quản lý Admin';
  end if;

  insert into public.community_moderation(user_id,updated_by)
  values(p_user_id,auth.uid())
  on conflict(user_id) do nothing;

  if v_action='mute_1h' then
    update public.community_moderation
    set muted_until=now()+interval '1 hour',reason=p_reason,updated_by=auth.uid(),updated_at=now()
    where user_id=p_user_id;
  elsif v_action='mute_24h' then
    update public.community_moderation
    set muted_until=now()+interval '24 hours',reason=p_reason,updated_by=auth.uid(),updated_at=now()
    where user_id=p_user_id;
  elsif v_action='unmute' then
    update public.community_moderation
    set muted_until=null,reason=null,updated_by=auth.uid(),updated_at=now()
    where user_id=p_user_id;
  elsif v_action='ban' then
    update public.community_moderation
    set banned=true,reason=p_reason,updated_by=auth.uid(),updated_at=now()
    where user_id=p_user_id;
  elsif v_action='unban' then
    update public.community_moderation
    set banned=false,reason=null,updated_by=auth.uid(),updated_at=now()
    where user_id=p_user_id;
  else
    raise exception 'Thao tác không hợp lệ';
  end if;
end;
$$;

revoke all on function public.moderate_community_user(uuid,text,text) from public,anon;
grant execute on function public.moderate_community_user(uuid,text,text) to authenticated;

-- ------------------------------------------------------------
-- 4. COMMUNITY CHAT - 1 PHÒNG CHUNG
-- ------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  image_path text,
  reply_to uuid references public.chat_messages(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check(
    nullif(trim(coalesce(message,'')),'') is not null
    or image_path is not null
  )
);

create index if not exists idx_chat_messages_created
on public.chat_messages(created_at desc);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique(message_id,reporter_id)
);

create table if not exists public.community_settings (
  id integer primary key default 1 check(id=1),
  pinned_message_id uuid references public.chat_messages(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.community_settings(id) values(1)
on conflict(id) do nothing;

alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
alter table public.community_settings enable row level security;

drop policy if exists "chat authenticated read" on public.chat_messages;
create policy "chat authenticated read"
on public.chat_messages for select to authenticated
using(true);

drop policy if exists "chat reports staff read" on public.chat_reports;
create policy "chat reports staff read"
on public.chat_reports for select to authenticated
using(public.is_chat_moderator());

drop policy if exists "community settings read" on public.community_settings;
create policy "community settings read"
on public.community_settings for select to authenticated
using(true);

grant select on public.chat_messages to authenticated;
grant select on public.chat_reports to authenticated;
grant select on public.community_settings to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'community-images','community-images',false,5242880,
  array['image/jpeg','image/png','image/webp','image/gif']::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=5242880,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "community image auth read" on storage.objects;
create policy "community image auth read"
on storage.objects for select to authenticated
using(bucket_id='community-images');

drop policy if exists "community image own upload" on storage.objects;
create policy "community image own upload"
on storage.objects for insert to authenticated
with check(
  bucket_id='community-images'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "community image own delete" on storage.objects;
create policy "community image own delete"
on storage.objects for delete to authenticated
using(
  bucket_id='community-images'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_chat_moderator()
  )
);

create or replace function public.send_community_message(
  p_message text,
  p_image_path text default null,
  p_reply_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  v_message text := nullif(trim(coalesce(p_message,'')),'');
  v_image text := nullif(trim(coalesce(p_image_path,'')),'');
  v_id uuid;
  modrow public.community_moderation%rowtype;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if exists(select 1 from public.profiles where id=uid and is_blocked=true) then
    raise exception 'Tài khoản đang bị khóa';
  end if;

  select * into modrow from public.community_moderation where user_id=uid;
  if found then
    if modrow.banned then raise exception 'Bạn đã bị chặn khỏi Community Chat'; end if;
    if modrow.muted_until is not null and modrow.muted_until>now() then
      raise exception 'Bạn đang bị tạm khóa chat đến %',modrow.muted_until;
    end if;
  end if;

  perform public.m4x_enforce_rate_limit('community_message',6,10);

  if v_message is null and v_image is null then raise exception 'Tin nhắn đang trống'; end if;
  if v_message is not null and char_length(v_message)>1000 then raise exception 'Tin nhắn tối đa 1000 ký tự'; end if;
  if v_image is not null and v_image not like uid::text||'/%' then raise exception 'Ảnh chat không hợp lệ'; end if;

  if p_reply_to is not null and not exists(
    select 1 from public.chat_messages where id=p_reply_to and deleted_at is null
  ) then
    raise exception 'Tin nhắn được trả lời không tồn tại';
  end if;

  insert into public.chat_messages(user_id,message,image_path,reply_to)
  values(uid,v_message,v_image,p_reply_to)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_community_message(text,text,uuid) from public,anon;
grant execute on function public.send_community_message(text,text,uuid) to authenticated;

create or replace function public.delete_community_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  select user_id into owner_id from public.chat_messages where id=p_message_id;
  if owner_id is null then raise exception 'Tin nhắn không tồn tại'; end if;

  if owner_id<>uid and not public.is_chat_moderator() then
    raise exception 'Không có quyền xóa tin nhắn này';
  end if;

  update public.chat_messages
  set deleted_at=now(),deleted_by=uid,message=null,image_path=null
  where id=p_message_id;
end;
$$;

revoke all on function public.delete_community_message(uuid) from public,anon;
grant execute on function public.delete_community_message(uuid) to authenticated;

create or replace function public.report_community_message(
  p_message_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if not exists(select 1 from public.chat_messages where id=p_message_id) then
    raise exception 'Tin nhắn không tồn tại';
  end if;

  insert into public.chat_reports(message_id,reporter_id,reason)
  values(p_message_id,uid,nullif(trim(coalesce(p_reason,'')),''))
  on conflict(message_id,reporter_id) do update
  set reason=excluded.reason,status='open',created_at=now();
end;
$$;

revoke all on function public.report_community_message(uuid,text) from public,anon;
grant execute on function public.report_community_message(uuid,text) to authenticated;

create or replace function public.pin_community_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_chat_moderator() then raise exception 'Không có quyền ghim tin'; end if;
  if p_message_id is not null and not exists(
    select 1 from public.chat_messages where id=p_message_id and deleted_at is null
  ) then raise exception 'Tin nhắn không tồn tại'; end if;

  update public.community_settings
  set pinned_message_id=p_message_id,updated_by=auth.uid(),updated_at=now()
  where id=1;
end;
$$;

revoke all on function public.pin_community_message(uuid) from public,anon;
grant execute on function public.pin_community_message(uuid) to authenticated;

-- Realtime cho phòng chat chung.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='chat_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.chat_messages';
    end if;

    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='community_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.community_settings';
    end if;
  end if;
end $$;


create or replace function public.admin_resolve_chat_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v text := lower(trim(coalesce(p_status,'')));
begin
  if not public.is_chat_moderator() then raise exception 'Không có quyền xử lý báo cáo'; end if;
  if v not in ('resolved','dismissed') then raise exception 'Trạng thái không hợp lệ'; end if;
  update public.chat_reports set status=v where id=p_report_id;
  if not found then raise exception 'Báo cáo không tồn tại'; end if;
end;
$$;

revoke all on function public.admin_resolve_chat_report(uuid,text) from public,anon;
grant execute on function public.admin_resolve_chat_report(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
