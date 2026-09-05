-- ============================================================
-- M4X STORE V21.2 — FIX LUỒNG SẢN PHẨM AI VIỆT HÓA
-- Mục tiêu:
-- 1) Sản phẩm vẫn ghim #1, hiển thị "Từ 10.000đ" ở frontend.
-- 2) CẤM mua trực tiếp bằng Ví/giỏ/create-order 10.000đ.
-- 3) Chỉ cho tạo order sau khi server đã phân tích MTZ và tính giá động.
-- Chạy SAU V21/V21.1.
-- ============================================================
begin;

alter table public.products add column if not exists pinned boolean not null default false;

update public.products
set pinned=true,
    active=true,
    price=10000,
    delivery_type='service',
    stock_mode='unlimited',
    description='Gửi file MTZ trước để hệ thống phân tích lockscreen, số ảnh và lượng văn bản. Giá tự tính từ 10.000đ; sau báo giá mới tạo VietQR và bắt đầu dịch.'
where id='00000000-0000-4000-8000-000000002100'::uuid;

-- Chặn mọi order dịch vụ AI được tạo từ luồng mua hàng thường.
-- Chỉ RPC m4x_create_theme_paid_order được phép mở cờ transaction-local này.
create or replace function public.m4x_guard_theme_service_order()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.product_id='00000000-0000-4000-8000-000000002100'::uuid
     and coalesce(current_setting('m4x.theme_dynamic_order',true),'') <> '1' then
    raise exception 'AI Việt hóa Lockscreen không mua trực tiếp. Hãy gửi MTZ để hệ thống phân tích và báo giá trước.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_m4x_guard_theme_service_order on public.orders;
create trigger trg_m4x_guard_theme_service_order
before insert on public.orders
for each row execute function public.m4x_guard_theme_service_order();

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
set search_path=public
as $$
declare
  v_code text;
  v_token text;
  v_order_id uuid;
  v_job_id uuid;
  v_exp timestamptz;
begin
  if p_amount < 10000 then raise exception 'Giá dịch tối thiểu là 10.000đ'; end if;
  if p_image_count < 0 or p_text_chars < 0 or p_lockscreen_bytes <= 0 then raise exception 'Thông số báo giá không hợp lệ'; end if;

  loop
    v_code := 'M4X' || upper(substr(encode(gen_random_bytes(8),'hex'),1,10));
    exit when not exists(select 1 from public.orders where order_code=v_code);
  end loop;
  v_token := encode(gen_random_bytes(32),'hex');
  v_exp := now()+make_interval(mins=>greatest(10,least(coalesce(p_quote_minutes,30),120)));

  -- Chỉ transaction của RPC báo giá được quyền tạo order cho product AI này.
  perform set_config('m4x.theme_dynamic_order','1',true);

  insert into public.orders(
    order_code,product_id,quantity,amount,customer_contact,status,access_token,expires_at
  ) values (
    v_code,'00000000-0000-4000-8000-000000002100'::uuid,1,p_amount,
    nullif(trim(coalesce(p_customer_contact,'')),''),'pending',v_token,v_exp
  ) returning id into v_order_id;

  insert into public.m4x_theme_paid_jobs(
    order_id,order_code,source_file_name,source_path,source_sha256,
    source_mtz_bytes,lockscreen_entry,lockscreen_bytes,image_count,text_file_count,text_chars,
    base_price,size_fee,image_fee,text_fee,amount,customer_contact,status,progress,stage
  ) values (
    v_order_id,v_code,p_source_file_name,p_source_path,p_source_sha256,
    p_source_mtz_bytes,p_lockscreen_entry,p_lockscreen_bytes,p_image_count,p_text_file_count,p_text_chars,
    p_base_price,p_size_fee,p_image_fee,p_text_fee,p_amount,
    nullif(trim(coalesce(p_customer_contact,'')),''),'waiting_payment',0,'Chờ thanh toán'
  ) returning id into v_job_id;

  return jsonb_build_object(
    'job_id',v_job_id,'order_id',v_order_id,'order_code',v_code,
    'access_token',v_token,'amount',p_amount,'expires_at',v_exp
  );
end;
$$;

revoke all on function public.m4x_create_theme_paid_order(
  text,text,text,bigint,text,bigint,integer,integer,integer,
  bigint,bigint,bigint,bigint,bigint,text,integer
) from public,anon,authenticated;
grant execute on function public.m4x_create_theme_paid_order(
  text,text,text,bigint,text,bigint,integer,integer,integer,
  bigint,bigint,bigint,bigint,bigint,text,integer
) to service_role;

notify pgrst,'reload schema';
commit;

select 'V21.2 OK: direct 10k purchase blocked; MTZ quote flow enabled' as result;
