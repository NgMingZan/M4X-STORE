-- M4X AI THEME V22.2
-- Thanh toán: 100% số dư | 100% VietQR | số dư + VietQR phần thiếu
-- Có hoàn số dư tự động nếu đơn mixed hết hạn.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Giữ fix gen_random_bytes từ V22.1
alter function public.m4x_create_theme_paid_order(
  text,text,text,bigint,text,bigint,integer,integer,integer,
  bigint,bigint,bigint,bigint,bigint,text,integer
)
set search_path = public, extensions;

-- Đảm bảo orders có trường tài khoản/phương thức thanh toán.
alter table public.orders
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

alter table public.orders
  add column if not exists payment_method text;

-- Theo dõi phần thanh toán của riêng AI Theme.
alter table public.m4x_theme_paid_jobs
  add column if not exists wallet_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists wallet_amount bigint not null default 0,
  add column if not exists bank_due bigint,
  add column if not exists payment_mode text not null default 'bank',
  add column if not exists wallet_reserved_at timestamptz,
  add column if not exists wallet_refunded_at timestamptz;

alter table public.m4x_theme_paid_jobs
  drop constraint if exists m4x_theme_paid_jobs_payment_mode_check;

alter table public.m4x_theme_paid_jobs
  add constraint m4x_theme_paid_jobs_payment_mode_check
  check (payment_mode in ('bank','wallet','mixed'));

-- ============================================================
-- Dùng số dư M4X cho đơn AI Theme
-- p_mode:
--   wallet = yêu cầu đủ 100% số dư
--   mixed  = dùng tối đa số dư hiện có, QR trả phần thiếu
-- ============================================================
create or replace function public.m4x_theme_apply_wallet(
  p_order_code text,
  p_access_token text,
  p_mode text default 'mixed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o public.orders%rowtype;
  j public.m4x_theme_paid_jobs%rowtype;
  prof public.profiles%rowtype;
  requested_mode text := lower(trim(coalesce(p_mode,'mixed')));
  total bigint;
  wallet_use bigint;
  due bigint;
  new_balance bigint;
  effective_mode text;
begin
  if uid is null then
    raise exception 'Bạn cần đăng nhập để dùng số dư M4X';
  end if;

  if requested_mode not in ('wallet','mixed') then
    raise exception 'Phương thức thanh toán không hợp lệ';
  end if;

  select * into o
  from public.orders
  where order_code = upper(trim(p_order_code))
    and access_token = p_access_token
  for update;

  if not found then
    raise exception 'Không tìm thấy đơn AI Theme';
  end if;

  if o.product_id <> '00000000-0000-4000-8000-000000002100'::uuid then
    raise exception 'Đơn này không phải dịch vụ AI Việt hóa Lockscreen';
  end if;

  select * into j
  from public.m4x_theme_paid_jobs
  where order_id = o.id
  for update;

  if not found then
    raise exception 'Không tìm thấy job AI Theme';
  end if;

  if o.status = 'paid' then
    return jsonb_build_object(
      'result','already_paid',
      'order_code',o.order_code,
      'wallet_used',j.wallet_amount,
      'bank_due',coalesce(j.bank_due,0),
      'payment_mode',j.payment_mode
    );
  end if;

  if o.status <> 'pending' then
    raise exception 'Đơn không còn ở trạng thái chờ thanh toán';
  end if;

  if o.expires_at <= now() then
    raise exception 'Báo giá đã hết hạn';
  end if;

  -- Chặn bấm nhiều lần làm trừ ví nhiều lần.
  if j.wallet_amount > 0 then
    return jsonb_build_object(
      'result','wallet_already_applied',
      'order_code',o.order_code,
      'wallet_used',j.wallet_amount,
      'bank_due',coalesce(j.bank_due,o.amount-j.wallet_amount),
      'payment_mode',j.payment_mode
    );
  end if;

  select * into prof
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Không tìm thấy tài khoản';
  end if;

  if coalesce(prof.is_blocked,false) then
    raise exception 'Tài khoản đang bị khóa';
  end if;

  total := o.amount;

  if requested_mode = 'wallet' then
    if coalesce(prof.balance,0) < total then
      raise exception 'Số dư không đủ. Còn thiếu %đ', total-coalesce(prof.balance,0);
    end if;
    wallet_use := total;
  else
    wallet_use := least(greatest(coalesce(prof.balance,0),0), total);
    if wallet_use <= 0 then
      raise exception 'Số dư hiện tại bằng 0đ. Hãy thanh toán bằng VietQR';
    end if;
  end if;

  due := greatest(total-wallet_use,0);
  effective_mode := case when due=0 then 'wallet' else 'mixed' end;

  update public.profiles
  set balance = balance-wallet_use
  where id = uid
  returning balance into new_balance;

  insert into public.wallet_transactions(
    user_id,amount,type,description,reference
  )
  values(
    uid,
    -wallet_use,
    'purchase',
    case
      when due=0 then 'Thanh toán AI Việt hóa Lockscreen'
      else 'Tạm dùng số dư cho AI Việt hóa Lockscreen'
    end,
    o.order_code
  );

  update public.orders
  set
    user_id = uid,
    payment_method = case when due=0 then 'wallet' else 'sepay' end,
    status = case when due=0 then 'paid' else 'pending' end,
    paid_at = case when due=0 then now() else paid_at end
  where id = o.id;

  update public.m4x_theme_paid_jobs
  set
    wallet_user_id = uid,
    wallet_amount = wallet_use,
    bank_due = due,
    payment_mode = effective_mode,
    wallet_reserved_at = now(),
    wallet_refunded_at = null,
    stage = case
      when due=0 then 'Đã thanh toán bằng số dư M4X'
      else 'Đã dùng số dư · chờ VietQR phần còn thiếu'
    end,
    updated_at = now()
  where id = j.id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    uid,
    case when due=0 then 'Thanh toán thành công' else 'Đã dùng số dư M4X' end,
    case
      when due=0 then 'Đơn '||o.order_code||' đã thanh toán hoàn toàn bằng số dư M4X.'
      else 'Đã dùng '||to_char(wallet_use,'FM999G999G999')||
           'đ. Còn '||to_char(due,'FM999G999G999')||'đ thanh toán qua VietQR.'
    end,
    'purchase',
    o.order_code
  );

  return jsonb_build_object(
    'result',case when due=0 then 'paid' else 'mixed_pending' end,
    'order_code',o.order_code,
    'total',total,
    'wallet_used',wallet_use,
    'bank_due',due,
    'balance_after',new_balance,
    'payment_mode',effective_mode
  );
end;
$$;

revoke all on function public.m4x_theme_apply_wallet(text,text,text)
from public, anon;

grant execute on function public.m4x_theme_apply_wallet(text,text,text)
to authenticated;

-- ============================================================
-- Hoàn lại phần ví nếu đơn mixed hết hạn trước khi QR được trả.
-- ============================================================
create or replace function public.m4x_refund_expired_theme_wallet(
  p_order_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  j public.m4x_theme_paid_jobs%rowtype;
  refunded bigint := 0;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then return 0; end if;

  select * into j
  from public.m4x_theme_paid_jobs
  where order_id=o.id
  for update;

  if not found then return 0; end if;

  if o.status='paid'
     or j.wallet_amount<=0
     or j.wallet_user_id is null
     or j.wallet_refunded_at is not null
     or j.payment_mode<>'mixed' then
    return 0;
  end if;

  refunded := j.wallet_amount;

  update public.profiles
  set balance=balance+refunded
  where id=j.wallet_user_id;

  insert into public.wallet_transactions(
    user_id,amount,type,description,reference
  )
  values(
    j.wallet_user_id,
    refunded,
    'refund',
    'Hoàn số dư đơn AI Theme hết hạn',
    o.order_code
  );

  update public.m4x_theme_paid_jobs
  set
    wallet_refunded_at=now(),
    stage='Đơn hết hạn · đã hoàn số dư M4X',
    updated_at=now()
  where id=j.id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    j.wallet_user_id,
    'Đã hoàn số dư',
    'Đơn '||o.order_code||' hết hạn. Đã hoàn '||
      to_char(refunded,'FM999G999G999')||'đ vào số dư M4X.',
    'refund',
    o.order_code
  );

  return refunded;
end;
$$;

revoke all on function public.m4x_refund_expired_theme_wallet(uuid)
from public, anon, authenticated;

grant execute on function public.m4x_refund_expired_theme_wallet(uuid)
to service_role;

-- ============================================================
-- Expire order: tự hoàn phần số dư mixed trước khi đánh expired.
-- ============================================================
create or replace function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  n integer:=0;
begin
  for r in
    select o.id,o.product_id,o.quantity
    from public.orders o
    where o.status='pending' and o.expires_at<now()
    for update skip locked
  loop
    perform public.m4x_refund_expired_theme_wallet(r.id);

    update public.orders
    set status='expired'
    where id=r.id;

    update public.products
    set reserved_count=greatest(0,reserved_count-r.quantity),
        updated_at=now()
    where id=r.product_id
      and stock_mode='limited';

    n:=n+1;
  end loop;

  return n;
end;
$$;

-- ============================================================
-- SePay: bình thường vẫn khớp full amount.
-- Riêng AI Theme mixed thì chỉ yêu cầu phần bank_due.
-- ============================================================
create or replace function public.process_sepay_payment(
  p_transaction_id text,
  p_order_code text,
  p_amount bigint,
  p_content text,
  p_account text,
  p_raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.orders%rowtype;
  p public.products%rowtype;
  j public.m4x_theme_paid_jobs%rowtype;
  has_theme_job boolean := false;
  expected_amount bigint;
begin
  if exists(
    select 1 from public.payments
    where transaction_id=p_transaction_id
  ) then
    return jsonb_build_object('result','duplicate');
  end if;

  select * into o
  from public.orders
  where order_code=p_order_code
  for update;

  if not found then
    insert into public.payments(
      transaction_id,amount,content,account_number,match_status,raw_data
    )
    values(
      p_transaction_id,p_amount,p_content,p_account,'unmatched',p_raw
    );
    return jsonb_build_object('result','unmatched_order');
  end if;

  select * into j
  from public.m4x_theme_paid_jobs
  where order_id=o.id;

  has_theme_job := found;

  expected_amount := case
    when has_theme_job
      and j.payment_mode='mixed'
      and j.wallet_refunded_at is null
      and j.bank_due is not null
    then j.bank_due
    else o.amount
  end;

  if o.status<>'pending'
     or o.expires_at<now()
     or expected_amount<>p_amount then

    if o.expires_at<now() and o.status='pending' then
      perform public.m4x_refund_expired_theme_wallet(o.id);
    end if;

    insert into public.payments(
      order_id,transaction_id,amount,content,account_number,match_status,raw_data
    )
    values(
      o.id,p_transaction_id,p_amount,p_content,p_account,'review',p_raw
    );

    if o.status='pending' then
      update public.orders set status='review' where id=o.id;
    end if;

    return jsonb_build_object(
      'result','review',
      'expected_amount',expected_amount,
      'received_amount',p_amount
    );
  end if;

  insert into public.payments(
    order_id,transaction_id,amount,content,account_number,match_status,raw_data
  )
  values(
    o.id,p_transaction_id,p_amount,p_content,p_account,'matched',p_raw
  );

  update public.orders
  set
    status='paid',
    paid_at=now(),
    payment_method='sepay'
  where id=o.id;

  select * into p
  from public.products
  where id=o.product_id
  for update;

  if p.stock_mode='limited' then
    update public.products
    set
      reserved_count=greatest(0,reserved_count-o.quantity),
      sold_count=sold_count+o.quantity,
      updated_at=now()
    where id=p.id;
  else
    update public.products
    set sold_count=sold_count+o.quantity,
        updated_at=now()
    where id=p.id;
  end if;

  if has_theme_job and j.payment_mode='mixed' and j.wallet_user_id is not null then
    insert into public.notifications(user_id,title,body,type,reference)
    values(
      j.wallet_user_id,
      'Thanh toán kết hợp thành công',
      'Đơn '||o.order_code||' đã thanh toán đủ bằng số dư M4X + VietQR.',
      'purchase',
      o.order_code
    );
  end if;

  return jsonb_build_object(
    'result','paid',
    'order_id',o.id,
    'expected_amount',expected_amount,
    'wallet_used',case when has_theme_job then j.wallet_amount else 0 end
  );
end;
$$;

revoke all on function public.process_sepay_payment(
  text,text,bigint,text,text,jsonb
) from public,anon,authenticated;

notify pgrst,'reload schema';

commit;

select
  'V22.2 wallet hybrid installed' as result;
