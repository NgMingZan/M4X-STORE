-- M4X STORE V18.3 — HERO / BANNER MANAGER
begin;

create table if not exists public.store_hero_settings (
  id text primary key default 'main',
  enabled boolean not null default false,
  variant text not null default 'custom' check (variant in ('custom','promo')),
  eyebrow text,title text,accent_text text,description text,
  primary_button_text text,
  primary_action text not null default 'none' check (primary_action in ('none','search','community','account','topup','url')),
  primary_url text,
  secondary_button_text text,
  secondary_action text not null default 'none' check (secondary_action in ('none','search','community','account','topup','url')),
  secondary_url text,image_url text,starts_at timestamptz,ends_at timestamptz,
  show_countdown boolean not null default false,auto_restore boolean not null default true,
  updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null
);

insert into public.store_hero_settings(
  id,enabled,variant,eyebrow,title,accent_text,description,primary_button_text,primary_action,
  secondary_button_text,secondary_action,starts_at,ends_at,show_countdown,auto_restore
) values (
  'main',true,'promo','⚡ FLASH SALE · M4X STORE','💥 Nạp tiền nhận ngay','+30%',
  '👉 Nạp càng nhiều, nhận càng nhiều! Tận dụng ưu đãi để mua sắm Theme, App, AI, Tool và các sản phẩm số tại M4X STORE.',
  '💰 Nạp ngay hôm nay','topup',null,'none','2026-09-04 00:00:00+07','2026-09-10 00:30:46+07',true,true
) on conflict(id) do nothing;

alter table public.store_hero_settings enable row level security;
drop policy if exists "store hero public read" on public.store_hero_settings;
create policy "store hero public read" on public.store_hero_settings for select to anon,authenticated using(true);
drop policy if exists "store hero admin insert" on public.store_hero_settings;
create policy "store hero admin insert" on public.store_hero_settings for insert to authenticated with check(public.is_admin());
drop policy if exists "store hero admin update" on public.store_hero_settings;
create policy "store hero admin update" on public.store_hero_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.store_hero_settings to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('store-hero','store-hero',true,6291456,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "m4x hero public read" on storage.objects;
create policy "m4x hero public read" on storage.objects for select to public using(bucket_id='store-hero');
drop policy if exists "m4x hero admin insert" on storage.objects;
create policy "m4x hero admin insert" on storage.objects for insert to authenticated with check(bucket_id='store-hero' and public.is_admin());
drop policy if exists "m4x hero admin update" on storage.objects;
create policy "m4x hero admin update" on storage.objects for update to authenticated using(bucket_id='store-hero' and public.is_admin()) with check(bucket_id='store-hero' and public.is_admin());
drop policy if exists "m4x hero admin delete" on storage.objects;
create policy "m4x hero admin delete" on storage.objects for delete to authenticated using(bucket_id='store-hero' and public.is_admin());

create or replace function public.admin_set_store_hero(
  p_enabled boolean,p_variant text,p_eyebrow text,p_title text,p_accent_text text,p_description text,
  p_primary_button_text text,p_primary_action text,p_primary_url text,
  p_secondary_button_text text,p_secondary_action text,p_secondary_url text,p_image_url text,
  p_starts_at timestamptz,p_ends_at timestamptz,p_show_countdown boolean,p_auto_restore boolean
) returns public.store_hero_settings
language plpgsql security definer set search_path=public as $$
declare r public.store_hero_settings;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;
  if coalesce(p_variant,'') not in ('custom','promo') then raise exception 'Kiểu Hero không hợp lệ'; end if;
  if coalesce(p_primary_action,'none') not in ('none','search','community','account','topup','url') then raise exception 'Action nút chính không hợp lệ'; end if;
  if coalesce(p_secondary_action,'none') not in ('none','search','community','account','topup','url') then raise exception 'Action nút phụ không hợp lệ'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then raise exception 'Thời gian kết thúc phải sau thời gian bắt đầu'; end if;

  insert into public.store_hero_settings(
    id,enabled,variant,eyebrow,title,accent_text,description,primary_button_text,primary_action,primary_url,
    secondary_button_text,secondary_action,secondary_url,image_url,starts_at,ends_at,show_countdown,auto_restore,updated_at,updated_by
  ) values (
    'main',coalesce(p_enabled,false),p_variant,nullif(trim(p_eyebrow),''),nullif(trim(p_title),''),nullif(trim(p_accent_text),''),nullif(trim(p_description),''),
    nullif(trim(p_primary_button_text),''),coalesce(p_primary_action,'none'),nullif(trim(p_primary_url),''),
    nullif(trim(p_secondary_button_text),''),coalesce(p_secondary_action,'none'),nullif(trim(p_secondary_url),''),
    nullif(trim(p_image_url),''),p_starts_at,p_ends_at,coalesce(p_show_countdown,false),coalesce(p_auto_restore,true),now(),auth.uid()
  ) on conflict(id) do update set
    enabled=excluded.enabled,variant=excluded.variant,eyebrow=excluded.eyebrow,title=excluded.title,accent_text=excluded.accent_text,
    description=excluded.description,primary_button_text=excluded.primary_button_text,primary_action=excluded.primary_action,primary_url=excluded.primary_url,
    secondary_button_text=excluded.secondary_button_text,secondary_action=excluded.secondary_action,secondary_url=excluded.secondary_url,
    image_url=excluded.image_url,starts_at=excluded.starts_at,ends_at=excluded.ends_at,show_countdown=excluded.show_countdown,
    auto_restore=excluded.auto_restore,updated_at=now(),updated_by=auth.uid()
  returning * into r;
  return r;
end;$$;

revoke all on function public.admin_set_store_hero(boolean,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,boolean) from public,anon;
grant execute on function public.admin_set_store_hero(boolean,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
