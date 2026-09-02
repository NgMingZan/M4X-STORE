-- ============================================================
-- M4X STORE V8 - PART 2/2
-- Giỏ hàng / mua nhiều sản phẩm / đặt hàng theo yêu cầu
-- Chạy SAU PART 1 và SAU M4X STORE V7.
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. GIỎ HÀNG - MỘT LẦN THANH TOÁN, NHIỀU ĐƠN CON
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists batch_code text;

create index if not exists idx_orders_batch_code
on public.orders(batch_code)
where batch_code is not null;

-- Cho chủ đơn đọc sản phẩm ẩn nếu đó là sản phẩm của đơn họ đã mua
-- (hữu ích cho đơn đặt riêng).
drop policy if exists "owned hidden products read" on public.products;
create policy "owned hidden products read"
on public.products for select to authenticated
using(
  exists(
    select 1
    from public.orders o
    where o.product_id=products.id
      and o.user_id=auth.uid()
      and o.status in ('paid','refunded')
  )
);

create or replace function public.wallet_cart_purchase(p_product_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  prod public.products%rowtype;
  ids uuid[];
  pid uuid;
  total bigint := 0;
  av integer;
  batch text;
  code text;
  token text;
  new_balance bigint;
  result_orders jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  perform public.m4x_enforce_rate_limit('wallet_cart_purchase',5,60);

  select array_agg(x order by x)
  into ids
  from (
    select distinct unnest(coalesce(p_product_ids,array[]::uuid[])) as x
  ) s
  where x is not null;

  if coalesce(array_length(ids,1),0)<1 then
    raise exception 'Giỏ hàng đang trống';
  end if;
  if array_length(ids,1)>20 then
    raise exception 'Mỗi lần thanh toán tối đa 20 sản phẩm';
  end if;

  select * into prof
  from public.profiles
  where id=uid
  for update;

  if not found then raise exception 'Không tìm thấy tài khoản'; end if;
  if prof.is_blocked then raise exception 'Tài khoản đang bị khóa'; end if;

  -- Khóa và kiểm tra toàn bộ sản phẩm trước khi trừ tiền.
  foreach pid in array ids loop
    select * into prod
    from public.products
    where id=pid and active=true
    for update;

    if not found then raise exception 'Có sản phẩm không tồn tại hoặc đã ẩn'; end if;
    if prod.sale_status='coming_soon' then raise exception '% chưa mở bán',prod.name; end if;
    if prod.sale_status='discontinued' then raise exception '% đã ngừng bán',prod.name; end if;
    if prod.sale_status='out_of_stock' then raise exception '% đã hết hàng',prod.name; end if;

    if prod.delivery_type='download' and exists(
      select 1 from public.orders
      where user_id=uid and product_id=prod.id and status='paid'
    ) then
      raise exception 'Bạn đã sở hữu file %. Hãy bỏ khỏi giỏ và tải lại trong Thư viện.',prod.name;
    end if;

    if prod.stock_mode='limited' then
      av:=coalesce(prod.stock_limit,0)-prod.sold_count-prod.reserved_count;
      if av<1 then raise exception '% đã hết hàng',prod.name; end if;
    end if;

    total:=total+prod.price;
  end loop;

  if prof.balance<total then
    raise exception 'Số dư không đủ. Bạn cần nạp thêm %đ',total-prof.balance;
  end if;

  loop
    batch:='CART'||upper(substr(md5(
      random()::text||clock_timestamp()::text||uid::text
    ),1,10));
    exit when not exists(select 1 from public.orders where batch_code=batch);
  end loop;

  update public.profiles
  set balance=balance-total
  where id=uid
  returning balance into new_balance;

  foreach pid in array ids loop
    select * into prod from public.products where id=pid;

    loop
      code:='M4XW'||upper(substr(md5(
        random()::text||clock_timestamp()::text||uid::text||pid::text
      ),1,10));
      exit when not exists(select 1 from public.orders where order_code=code);
    end loop;

    token:=md5(random()::text||clock_timestamp()::text||uid::text)
         ||md5(random()::text||code);

    insert into public.orders(
      order_code,product_id,quantity,amount,customer_contact,status,
      access_token,expires_at,paid_at,user_id,payment_method,
      purchased_version,batch_code
    )
    values(
      code,prod.id,1,prod.price,null,'paid',token,
      now()+interval '10 years',now(),uid,'wallet',
      prod.version_name,batch
    );

    update public.products
    set sold_count=sold_count+1,updated_at=now()
    where id=prod.id;

    result_orders:=result_orders||jsonb_build_array(jsonb_build_object(
      'product_id',prod.id,
      'product_name',prod.name,
      'delivery_type',prod.delivery_type,
      'amount',prod.price,
      'order_code',code,
      'access_token',token
    ));
  end loop;

  insert into public.wallet_transactions(
    user_id,amount,type,description,reference
  )
  values(
    uid,-total,'purchase',
    'Thanh toán giỏ hàng '||array_length(ids,1)||' sản phẩm',batch
  );

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    uid,'Thanh toán giỏ hàng thành công',
    'Đã mua '||array_length(ids,1)||' sản phẩm với tổng giá trị '||
      to_char(total,'FM999G999G999')||'đ.',
    'purchase',batch
  );

  return jsonb_build_object(
    'ok',true,
    'batch_code',batch,
    'count',array_length(ids,1),
    'amount',total,
    'balance_after',new_balance,
    'orders',result_orders
  );
end;
$$;

revoke all on function public.wallet_cart_purchase(uuid[]) from public,anon;
grant execute on function public.wallet_cart_purchase(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 2. ĐẶT HÀNG THEO YÊU CẦU
-- ------------------------------------------------------------
create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null default 'other'
    check(request_type in ('theme','tool','ai','service','other')),
  title text not null,
  description text not null,
  budget bigint check(budget is null or budget>=0),
  quote_amount bigint check(quote_amount is null or quote_amount>=0),
  admin_note text,
  status text not null default 'requested'
    check(status in ('requested','quoted','accepted','rejected','cancelled','completed')),
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  quoted_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_requests_user_updated
on public.custom_requests(user_id,updated_at desc);

alter table public.custom_requests enable row level security;

drop policy if exists "custom request own read" on public.custom_requests;
create policy "custom request own read"
on public.custom_requests for select to authenticated
using(user_id=auth.uid() or public.is_admin());

grant select on public.custom_requests to authenticated;

create or replace function public.create_custom_request(
  p_request_type text,
  p_title text,
  p_description text,
  p_budget bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_request_type,'other')));
  v_title text := trim(coalesce(p_title,''));
  v_desc text := trim(coalesce(p_description,''));
  v_code text;
  v_id uuid;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if exists(select 1 from public.profiles where id=uid and is_blocked=true) then
    raise exception 'Tài khoản đang bị khóa';
  end if;
  perform public.m4x_enforce_rate_limit('custom_request',5,3600);

  if v_type not in ('theme','tool','ai','service','other') then v_type:='other'; end if;
  if char_length(v_title)<3 or char_length(v_title)>120 then
    raise exception 'Tiêu đề từ 3 đến 120 ký tự';
  end if;
  if char_length(v_desc)<10 or char_length(v_desc)>5000 then
    raise exception 'Mô tả yêu cầu từ 10 đến 5000 ký tự';
  end if;
  if p_budget is not null and p_budget<0 then raise exception 'Ngân sách không hợp lệ'; end if;

  loop
    v_code:='REQ'||upper(substr(md5(
      random()::text||clock_timestamp()::text||uid::text
    ),1,10));
    exit when not exists(select 1 from public.custom_requests where request_code=v_code);
  end loop;

  insert into public.custom_requests(
    request_code,user_id,request_type,title,description,budget
  )
  values(v_code,uid,v_type,v_title,v_desc,p_budget)
  returning id into v_id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(uid,'Đã gửi yêu cầu đặt riêng','Mã yêu cầu: '||v_code,'system',v_code);

  return jsonb_build_object('ok',true,'id',v_id,'request_code',v_code);
end;
$$;

revoke all on function public.create_custom_request(text,text,text,bigint) from public,anon;
grant execute on function public.create_custom_request(text,text,text,bigint) to authenticated;

create or replace function public.admin_quote_custom_request(
  p_request_id uuid,
  p_quote_amount bigint,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare r public.custom_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;
  if p_quote_amount is null or p_quote_amount<0 then raise exception 'Giá báo không hợp lệ'; end if;

  select * into r from public.custom_requests where id=p_request_id for update;
  if not found then raise exception 'Yêu cầu không tồn tại'; end if;
  if r.status in ('accepted','completed','cancelled') then
    raise exception 'Yêu cầu này không thể báo giá lại';
  end if;

  update public.custom_requests
  set quote_amount=p_quote_amount,
      admin_note=nullif(trim(coalesce(p_admin_note,'')),''),
      status='quoted',quoted_at=now(),updated_at=now()
  where id=p_request_id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    r.user_id,'M4X đã báo giá yêu cầu của bạn',
    r.request_code||' · Giá: '||to_char(p_quote_amount,'FM999G999G999')||'đ',
    'system',r.request_code
  );
end;
$$;

revoke all on function public.admin_quote_custom_request(uuid,bigint,text) from public,anon;
grant execute on function public.admin_quote_custom_request(uuid,bigint,text) to authenticated;

create or replace function public.accept_custom_quote(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  r public.custom_requests%rowtype;
  prof public.profiles%rowtype;
  prod_id uuid;
  order_id_v uuid;
  code text;
  token text;
  new_balance bigint;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;

  perform pg_advisory_xact_lock(hashtextextended('custom:'||p_request_id::text,0));

  select * into r
  from public.custom_requests
  where id=p_request_id and user_id=uid
  for update;

  if not found then raise exception 'Yêu cầu không tồn tại'; end if;
  if r.status<>'quoted' or r.quote_amount is null then
    raise exception 'Yêu cầu chưa có báo giá để thanh toán';
  end if;

  select * into prof from public.profiles where id=uid for update;
  if prof.is_blocked then raise exception 'Tài khoản đang bị khóa'; end if;
  if prof.balance<r.quote_amount then
    raise exception 'Số dư không đủ. Bạn cần nạp thêm %đ',r.quote_amount-prof.balance;
  end if;

  prod_id:=gen_random_uuid();

  insert into public.products(
    id,category_id,name,slug,description,price,delivery_type,
    stock_mode,stock_limit,sold_count,reserved_count,active
  )
  values(
    prod_id,null,
    '[Đặt riêng] '||r.title,
    'custom-'||lower(r.request_code),
    r.description,
    r.quote_amount,
    'service','unlimited',null,1,0,false
  );

  loop
    code:='M4XC'||upper(substr(md5(
      random()::text||clock_timestamp()::text||uid::text
    ),1,10));
    exit when not exists(select 1 from public.orders where order_code=code);
  end loop;

  token:=md5(random()::text||clock_timestamp()::text||uid::text)
       ||md5(random()::text||code);

  update public.profiles
  set balance=balance-r.quote_amount
  where id=uid
  returning balance into new_balance;

  insert into public.orders(
    order_code,product_id,quantity,amount,customer_contact,status,
    access_token,expires_at,paid_at,user_id,payment_method,purchased_version
  )
  values(
    code,prod_id,1,r.quote_amount,null,'paid',token,
    now()+interval '10 years',now(),uid,'wallet','1.0'
  )
  returning id into order_id_v;

  insert into public.wallet_transactions(
    user_id,amount,type,description,reference
  )
  values(
    uid,-r.quote_amount,'purchase',
    'Thanh toán yêu cầu '||r.request_code,code
  );

  update public.custom_requests
  set status='accepted',product_id=prod_id,order_id=order_id_v,
      accepted_at=now(),updated_at=now()
  where id=r.id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    uid,'Đã thanh toán yêu cầu đặt riêng',
    r.request_code||' · M4X sẽ tiến hành xử lý yêu cầu.',
    'purchase',code
  );

  return jsonb_build_object(
    'ok',true,
    'order_id',order_id_v,
    'order_code',code,
    'amount',r.quote_amount,
    'balance_after',new_balance
  );
end;
$$;

revoke all on function public.accept_custom_quote(uuid) from public,anon;
grant execute on function public.accept_custom_quote(uuid) to authenticated;

create or replace function public.cancel_custom_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;

  update public.custom_requests
  set status='cancelled',updated_at=now()
  where id=p_request_id
    and user_id=uid
    and status in ('requested','quoted');

  if not found then raise exception 'Không thể hủy yêu cầu này'; end if;
end;
$$;

revoke all on function public.cancel_custom_request(uuid) from public,anon;
grant execute on function public.cancel_custom_request(uuid) to authenticated;

create or replace function public.admin_set_custom_request_status(
  p_request_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v text := lower(trim(coalesce(p_status,'')));
  r public.custom_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;
  if v not in ('requested','quoted','rejected','completed') then
    raise exception 'Trạng thái không hợp lệ';
  end if;

  select * into r from public.custom_requests where id=p_request_id;
  if not found then raise exception 'Yêu cầu không tồn tại'; end if;

  if v='completed' and r.status<>'accepted' then
    raise exception 'Chỉ yêu cầu đã thanh toán mới có thể hoàn thành';
  end if;

  update public.custom_requests set status=v,updated_at=now() where id=p_request_id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    r.user_id,
    case when v='completed' then 'Yêu cầu đặt riêng đã hoàn thành'
         when v='rejected' then 'Yêu cầu đặt riêng không được nhận'
         else 'Yêu cầu đặt riêng đã cập nhật' end,
    r.request_code||' · Trạng thái: '||v,
    'system',r.request_code
  );
end;
$$;

revoke all on function public.admin_set_custom_request_status(uuid,text) from public,anon;
grant execute on function public.admin_set_custom_request_status(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
