-- ============================================================
-- M4X STORE V20 — AI THEME TRANSLATOR
-- Chạy SAU V19.4/V19.6.x
-- Không xóa dữ liệu cũ.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.m4x_theme_translation_memory (
  source_hash text not null,
  target_lang text not null default 'vi',
  source_text text not null,
  translated_text text not null,
  provider text,
  model text,
  updated_at timestamptz not null default now(),
  primary key (source_hash, target_lang)
);

create index if not exists idx_m4x_theme_translation_memory_updated
on public.m4x_theme_translation_memory(updated_at desc);

alter table public.m4x_theme_translation_memory enable row level security;
revoke all on public.m4x_theme_translation_memory from public, anon, authenticated;

create table if not exists public.m4x_theme_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  chat_id text not null,
  source_file_name text not null,
  source_telegram_file_id text not null,
  mode text not null default 'text',
  status text not null default 'queued',
  stats jsonb not null default '{}'::jsonb,
  result_file_name text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_m4x_theme_translation_jobs_user_created
on public.m4x_theme_translation_jobs(telegram_user_id, created_at desc);

create index if not exists idx_m4x_theme_translation_jobs_status
on public.m4x_theme_translation_jobs(status, created_at desc);

alter table public.m4x_theme_translation_jobs enable row level security;
revoke all on public.m4x_theme_translation_jobs from public, anon, authenticated;

notify pgrst,'reload schema';
commit;

select 'M4X V20 AI THEME TRANSLATOR installed successfully' as result;
