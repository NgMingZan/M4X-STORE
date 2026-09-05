-- ============================================================
-- M4X STORE V21 — AI VIỆT HÓA LOCKSCREEN TRẢ PHÍ
-- Web + App dùng chung backend Supabase/SePay hiện có.
-- Chạy SAU schema Store + V20 translation memory.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- Sản phẩm hệ thống ẩn. V21 tạo order với số tiền động sau khi phân tích MTZ.
insert into public.products(
  id, category_id, name, slug, description, price, delivery_type,
  stock_mode, sold_count, reserved_count, active
)
values(
  '00000000-0000-4000-8000-000000002100'::uuid,
  null,
  'AI Việt hóa Lockscreen',
  'm4x-ai-viet-hoa-lockscreen-v21',
  'Sản phẩm hệ thống dùng để nhận thanh toán dịch lockscreen theo báo giá tự động.',
  0,
  'service',
  'unlimited',
  0,
  0,
  false
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  delivery_type = 'service',
  stock_mode = 'unlimited',
  active = false;

-- Bảng giá công khai. Admin có thể sửa JSON mà không cần deploy lại code.
create table if not exists public.m4x_theme_paid_pricing (
  id text primary key default 'main',
  enabled boolean not null default true,
  base_price bigint not null default 10000 check (base_price >= 10000),
  max_lockscreen_mb numeric not null default 18,
  max_images integer not null default 20,
  max_mtz_mb numeric not null default 50,
  quote_minutes integer not null default 30,
  size_tiers jsonb not null default '[
    {"max":3,"fee":0},
    {"max":6,"fee":2000},
    {"max":10,"fee":4000},
    {"max":14,"fee":6000},
    {"max":18,"fee":8000}
  ]'::jsonb,
  image_tiers jsonb not null default '[
    {"max":3,"fee":0},
    {"max":8,"fee":4000},
    {"max":14,"fee":8000},
    {"max":20,"fee":12000}
  ]'::jsonb,
  text_tiers jsonb not null default '[
    {"max":20000,"fee":0},
    {"max":50000,"fee":2000},
    {"max":100000,"fee":4000},
    {"max":999999999,"fee":6000}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.m4x_theme_paid_pricing(id)
values ('main')
on conflict (id) do nothing;

alter table public.m4x_theme_paid_pricing enable row level security;
revoke all on public.m4x_theme_paid_pricing from public, anon, authenticated;

-- Job trả phí liên kết 1-1 với order Store để dùng nguyên SePay webhook hiện có.
create table if not exists public.m4x_theme_paid_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  order_code text not null unique,
  source_file_name text not null,
  source_path text not null unique,
  source_sha256 text not null,
  source_mtz_bytes bigint not null default 0,
  lockscreen_entry text not null,
  lockscreen_bytes bigint not null default 0,
  image_count integer not null default 0,
  text_file_count integer not null default 0,
  text_chars integer not null default 0,
  base_price bigint not null,
  size_fee bigint not null default 0,
  image_fee bigint not null default 0,
  text_fee bigint not null default 0,
  amount bigint not null,
  customer_contact text,
  status text not null default 'waiting_payment',
  progress integer not null default 0,
  stage text not null default 'Chờ thanh toán',
  stats jsonb not null default '{}'::jsonb,
  result_path text,
  result_file_name text,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_m4x_theme_paid_jobs_status_created
  on public.m4x_theme_paid_jobs(status, created_at desc);
create index if not exists idx_m4x_theme_paid_jobs_order_code
  on public.m4x_theme_paid_jobs(order_code);

alter table public.m4x_theme_paid_jobs enable row level security;
revoke all on public.m4x_theme_paid_jobs from public, anon, authenticated;

-- Bucket private: chỉ Edge Functions service-role truy cập.
insert into storage.buckets(id, name, public)
values ('theme-translation-private', 'theme-translation-private', false)
on conflict (id) do update set public = false;

-- Tạo order số tiền động + job trong cùng transaction DB.
create or replace function public.m4x_create_theme_paid_order(
  p_source_file_name text,
  p_source_path text,
  p_source_sha256 text,
  p_source_mtz_bytes bigint,
  p_lockscreen_entry text,
  p_lockscreen_bytes bigint,
  p_image_count integer,
  p_text_file_count integer,
  p_text_chars integer,
  p_base_price bigint,
  p_size_fee bigint,
  p_image_fee bigint,
  p_text_fee bigint,
  p_amount bigint,
  p_customer_contact text default null,
  p_quote_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_token text;
  v_order_id uuid;
  v_job_id uuid;
  v_exp timestamptz;
begin
  if p_amount < 10000 then
    raise exception 'Giá dịch tối thiểu là 10.000đ';
  end if;
  if p_image_count < 0 or p_text_chars < 0 or p_lockscreen_bytes <= 0 then
    raise exception 'Thông số báo giá không hợp lệ';
  end if;

  loop
    v_code := 'M4X' || upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
    exit when not exists(select 1 from public.orders where order_code = v_code);
  end loop;
  v_token := encode(gen_random_bytes(32),'hex');
  v_exp := now() + make_interval(mins => greatest(10, least(coalesce(p_quote_minutes,30),120)));

  insert into public.orders(
    order_code, product_id, quantity, amount, customer_contact,
    status, access_token, expires_at
  ) values (
    v_code,
    '00000000-0000-4000-8000-000000002100'::uuid,
    1,
    p_amount,
    nullif(trim(coalesce(p_customer_contact,'')),''),
    'pending',
    v_token,
    v_exp
  ) returning id into v_order_id;

  insert into public.m4x_theme_paid_jobs(
    order_id, order_code, source_file_name, source_path, source_sha256,
    source_mtz_bytes, lockscreen_entry, lockscreen_bytes,
    image_count, text_file_count, text_chars,
    base_price, size_fee, image_fee, text_fee, amount,
    customer_contact, status, progress, stage
  ) values (
    v_order_id, v_code, p_source_file_name, p_source_path, p_source_sha256,
    p_source_mtz_bytes, p_lockscreen_entry, p_lockscreen_bytes,
    p_image_count, p_text_file_count, p_text_chars,
    p_base_price, p_size_fee, p_image_fee, p_text_fee, p_amount,
    nullif(trim(coalesce(p_customer_contact,'')),''),
    'waiting_payment', 0, 'Chờ thanh toán'
  ) returning id into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'order_id', v_order_id,
    'order_code', v_code,
    'access_token', v_token,
    'amount', p_amount,
    'expires_at', v_exp
  );
end;
$$;

revoke all on function public.m4x_create_theme_paid_order(
  text,text,text,bigint,text,bigint,integer,integer,integer,
  bigint,bigint,bigint,bigint,bigint,text,integer
) from public, anon, authenticated;
grant execute on function public.m4x_create_theme_paid_order(
  text,text,text,bigint,text,bigint,integer,integer,integer,
  bigint,bigint,bigint,bigint,bigint,text,integer
) to service_role;

-- Worker claim nguyên tử, tránh client poll làm chạy trùng job.
create or replace function public.m4x_claim_theme_paid_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.m4x_theme_paid_jobs
     set status = 'running',
         progress = greatest(progress, 2),
         stage = 'Bắt đầu Việt hóa',
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_job_id
     and status = 'queued';
  return found;
end;
$$;
revoke all on function public.m4x_claim_theme_paid_job(uuid) from public, anon, authenticated;
grant execute on function public.m4x_claim_theme_paid_job(uuid) to service_role;

notify pgrst, 'reload schema';
commit;

select 'M4X V21 AI Theme Paid Service installed successfully' as result;
