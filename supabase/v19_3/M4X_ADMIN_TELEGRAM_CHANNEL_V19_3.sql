-- ============================================================
-- M4X STORE V19.3 — ADMIN PORTAL / TELEGRAM CHANNEL CONTROL
-- Chạy SAU M4X_TELEGRAM_CHANNEL_STOCK_V19_2.sql
-- Không xóa dữ liệu. Không mở trực tiếp RLS của bảng Telegram.
-- Admin Portal thao tác qua RPC có kiểm tra role.
-- ============================================================

begin;

create or replace function public.m4x_channel_admin_ok()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role::text,'') in ('admin','super_admin')
  );
$$;

revoke all on function public.m4x_channel_admin_ok() from public,anon,authenticated;

create or replace function public.m4x_admin_channel_get()
returns jsonb
language plpgsql
security definer
set search_path=public,cron
as $$
declare
  s public.telegram_channel_settings%rowtype;
  v_pending integer := 0;
  v_failed integer := 0;
  v_last_sent timestamptz;
  v_cron_active boolean := false;
  v_active_products integer := 0;
  v_limited_products integer := 0;
  v_low_stock integer := 0;
  v_out_stock integer := 0;
begin
  if not public.m4x_channel_admin_ok() then
    raise exception 'Bạn không có quyền Admin';
  end if;

  select * into s
  from public.telegram_channel_settings
  where id='main';

  if s.id is null then
    raise exception 'Chưa cài Telegram Channel V19.2';
  end if;

  select count(*)::integer into v_pending
  from public.telegram_channel_queue where status='pending';

  select count(*)::integer into v_failed
  from public.telegram_channel_queue where status='failed';

  select max(sent_at) into v_last_sent
  from public.telegram_channel_queue where status='sent';

  select exists(
    select 1 from cron.job
    where jobname='m4x-channel-worker-v19-1' and active=true
  ) into v_cron_active;

  select count(*)::integer into v_active_products
  from public.products where active=true;

  select count(*)::integer into v_limited_products
  from public.products where active=true and stock_mode='limited';

  select count(*)::integer into v_low_stock
  from public.products p
  where p.active=true and p.stock_mode='limited'
    and greatest(0,coalesce(p.stock_limit,0)-coalesce(p.sold_count,0)-coalesce(p.reserved_count,0)) between 1 and greatest(1,least(99,coalesce(s.stock_low_threshold,5)));

  select count(*)::integer into v_out_stock
  from public.products p
  where p.active=true and p.stock_mode='limited'
    and greatest(0,coalesce(p.stock_limit,0)-coalesce(p.sold_count,0)-coalesce(p.reserved_count,0))=0;

  return jsonb_build_object(
    'settings', (to_jsonb(s) - 'worker_secret_hash'),
    'queue', jsonb_build_object(
      'pending',v_pending,
      'failed',v_failed,
      'last_sent_at',v_last_sent
    ),
    'worker', jsonb_build_object(
      'cron_active',v_cron_active,
      'job_name','m4x-channel-worker-v19-1'
    ),
    'inventory', jsonb_build_object(
      'active_products',v_active_products,
      'limited_products',v_limited_products,
      'low_stock',v_low_stock,
      'out_stock',v_out_stock
    )
  );
end;
$$;

revoke all on function public.m4x_admin_channel_get() from public,anon;
grant execute on function public.m4x_admin_channel_get() to authenticated;

create or replace function public.m4x_admin_channel_save(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_t1 text;
  v_t2 text;
  v_row public.telegram_channel_settings%rowtype;
begin
  if not public.m4x_channel_admin_ok() then
    raise exception 'Bạn không có quyền Admin';
  end if;

  v_t1 := coalesce(nullif(trim(p_settings->>'daily_time_1'),''),'08:00');
  v_t2 := coalesce(nullif(trim(p_settings->>'daily_time_2'),''),'20:00');

  if v_t1 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ đăng 1 không hợp lệ';
  end if;
  if v_t2 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Giờ đăng 2 không hợp lệ';
  end if;

  update public.telegram_channel_settings
  set
    enabled = coalesce((p_settings->>'enabled')::boolean,enabled),
    timezone = 'Asia/Ho_Chi_Minh',
    daily_enabled = coalesce((p_settings->>'daily_enabled')::boolean,daily_enabled),
    daily_time_1 = v_t1::time,
    daily_time_2 = v_t2::time,
    new_product_enabled = coalesce((p_settings->>'new_product_enabled')::boolean,new_product_enabled),
    hero_enabled = coalesce((p_settings->>'hero_enabled')::boolean,hero_enabled),
    online_update_enabled = coalesce((p_settings->>'online_update_enabled')::boolean,online_update_enabled),
    repost_enabled = coalesce((p_settings->>'repost_enabled')::boolean,repost_enabled),
    repost_days = greatest(1,least(30,coalesce(nullif(p_settings->>'repost_days','')::integer,repost_days))),
    stock_enabled = coalesce((p_settings->>'stock_enabled')::boolean,stock_enabled),
    stock_alert_enabled = coalesce((p_settings->>'stock_alert_enabled')::boolean,stock_alert_enabled),
    stock_low_threshold = greatest(1,least(99,coalesce(nullif(p_settings->>'stock_low_threshold','')::integer,stock_low_threshold))),
    updated_at = now()
  where id='main'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Chưa cài Telegram Channel V19.2';
  end if;

  return (to_jsonb(v_row) - 'worker_secret_hash');
end;
$$;

revoke all on function public.m4x_admin_channel_save(jsonb) from public,anon;
grant execute on function public.m4x_admin_channel_save(jsonb) to authenticated;

create or replace function public.m4x_admin_channel_action(p_action text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_action text := lower(trim(coalesce(p_action,'')));
  v_id bigint;
begin
  if not public.m4x_channel_admin_ok() then
    raise exception 'Bạn không có quyền Admin';
  end if;

  if v_action='stock_sync' then
    v_id := public.m4x_enqueue_channel_event(
      'stock_sync',
      'portal-stock:'||gen_random_uuid()::text,
      jsonb_build_object('source','admin-portal','actor',auth.uid()::text)
    );
  elsif v_action='manual_store' then
    v_id := public.m4x_enqueue_channel_event(
      'manual_store',
      'portal-store:'||gen_random_uuid()::text,
      jsonb_build_object('source','admin-portal','actor',auth.uid()::text)
    );
  elsif v_action='recreate_stock_message' then
    update public.telegram_channel_settings
    set stock_message_id=null,updated_at=now()
    where id='main';
    v_id := public.m4x_enqueue_channel_event(
      'stock_sync',
      'portal-stock-recreate:'||gen_random_uuid()::text,
      jsonb_build_object('source','admin-portal','recreate',true,'actor',auth.uid()::text)
    );
  elsif v_action='retry_failed' then
    update public.telegram_channel_queue
    set status='pending',available_at=now(),last_error=null,updated_at=now()
    where status='failed' and attempts<5;
    return jsonb_build_object('ok',true,'action',v_action,'message','Đã đưa các mục lỗi đủ điều kiện về hàng đợi');
  else
    raise exception 'Action không hợp lệ';
  end if;

  return jsonb_build_object(
    'ok',true,
    'action',v_action,
    'queue_id',v_id,
    'message','Đã đưa yêu cầu vào hàng đợi. Worker xử lý tối đa khoảng 1 phút.'
  );
end;
$$;

revoke all on function public.m4x_admin_channel_action(text) from public,anon;
grant execute on function public.m4x_admin_channel_action(text) to authenticated;

notify pgrst,'reload schema';
commit;

select 'M4X Admin Telegram Channel V19.3 installed successfully' as result;
