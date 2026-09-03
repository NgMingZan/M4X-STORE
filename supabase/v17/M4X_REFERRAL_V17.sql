
-- ============================================================
-- M4X STORE V17 — REFERRAL / INVITE FRIENDS
-- Default: +5.000đ cho người giới thiệu
-- Điều kiện mặc định: người được giới thiệu mua >= 50.000đ
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. SETTINGS
-- ------------------------------------------------------------
create table if not exists public.referral_settings (
  id smallint primary key default 1 check (id=1),
  active boolean not null default true,
  reward_amount bigint not null default 5000 check (reward_amount>=0),
  min_purchase_amount bigint not null default 50000 check (min_purchase_amount>=0),
  signup_window_hours integer not null default 168 check (signup_window_hours between 1 and 2160),
  max_rewards_per_referrer_per_day integer not null default 20
    check (max_rewards_per_referrer_per_day between 1 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.referral_settings(
  id,active,reward_amount,min_purchase_amount,signup_window_hours,max_rewards_per_referrer_per_day
)
values(1,true,5000,50000,168,20)
on conflict(id) do nothing;

-- ------------------------------------------------------------
-- 2. REFERRAL ACCOUNTS / CODES
-- ------------------------------------------------------------
create table if not exists public.referral_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  referred_by uuid references public.profiles(id) on delete set null,
  bound_at timestamptz,
  created_at timestamptz not null default now(),
  check (referred_by is null or referred_by<>user_id)
);

create index if not exists idx_referral_accounts_code
on public.referral_accounts(code);

create index if not exists idx_referral_accounts_referred_by
on public.referral_accounts(referred_by)
where referred_by is not null;

-- One referred account = one referral reward lifecycle.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  code_used text not null,
  status text not null default 'pending'
    check(status in ('pending','review','rewarded','rejected')),
  qualifying_reference text,
  qualifying_amount bigint,
  reward_amount bigint,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  reviewed_at timestamptz,
  check (referrer_id<>referred_user_id)
);

create index if not exists idx_referrals_referrer_created
on public.referrals(referrer_id,created_at desc);

create index if not exists idx_referrals_status_created
on public.referrals(status,created_at desc);

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------
alter table public.referral_settings enable row level security;
alter table public.referral_accounts enable row level security;
alter table public.referrals enable row level security;

drop policy if exists "referral settings authenticated read" on public.referral_settings;
create policy "referral settings authenticated read"
on public.referral_settings for select to authenticated
using (true);

drop policy if exists "referral account self read" on public.referral_accounts;
create policy "referral account self read"
on public.referral_accounts for select to authenticated
using (user_id=auth.uid() or public.is_admin());

drop policy if exists "referrals related read" on public.referrals;
create policy "referrals related read"
on public.referrals for select to authenticated
using (
  referrer_id=auth.uid()
  or referred_user_id=auth.uid()
  or public.is_admin()
);

grant select on public.referral_settings to authenticated;
grant select on public.referral_accounts to authenticated;
grant select on public.referrals to authenticated;

-- ------------------------------------------------------------
-- 4. INTERNAL CODE CREATOR
-- ------------------------------------------------------------
create or replace function public.m4x_referral_ensure_account(p_uid uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text;
begin
  if p_uid is null then raise exception 'Thiếu tài khoản'; end if;
  if not exists(select 1 from public.profiles where id=p_uid) then
    raise exception 'Không tìm thấy tài khoản';
  end if;

  select code into v_code
  from public.referral_accounts
  where user_id=p_uid;

  if v_code is not null then return v_code; end if;

  loop
    v_code:='M4X-'||upper(substr(md5(
      p_uid::text||random()::text||clock_timestamp()::text
    ),1,6));
    exit when not exists(
      select 1 from public.referral_accounts where code=v_code
    );
  end loop;

  insert into public.referral_accounts(user_id,code)
  values(p_uid,v_code)
  on conflict(user_id) do nothing;

  select code into v_code
  from public.referral_accounts
  where user_id=p_uid;

  return v_code;
end;
$$;

revoke all on function public.m4x_referral_ensure_account(uuid)
from public,anon,authenticated;

-- Backfill codes for current users.
do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where not exists(
      select 1 from public.referral_accounts a where a.user_id=p.id
    )
  loop
    perform public.m4x_referral_ensure_account(r.id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. USER DASHBOARD
-- ------------------------------------------------------------
create or replace function public.get_referral_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  v_code text;
  acc public.referral_accounts%rowtype;
  cfg public.referral_settings%rowtype;
  invited integer:=0;
  success integer:=0;
  pending integer:=0;
  review integer:=0;
  earned bigint:=0;
  can_apply boolean:=false;
  ref_name text;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;

  select * into cfg from public.referral_settings where id=1;
  v_code:=public.m4x_referral_ensure_account(uid);
  select * into acc from public.referral_accounts where user_id=uid;

  select
    count(*)::int,
    count(*) filter(where status='rewarded')::int,
    count(*) filter(where status='pending')::int,
    count(*) filter(where status='review')::int,
    coalesce(sum(reward_amount) filter(where status='rewarded'),0)::bigint
  into invited,success,pending,review,earned
  from public.referrals
  where referrer_id=uid;

  can_apply :=
    acc.referred_by is null
    and exists(
      select 1 from public.profiles p
      where p.id=uid
        and p.created_at >= now()-make_interval(hours=>cfg.signup_window_hours)
    )
    and not exists(
      select 1 from public.orders o
      where o.user_id=uid
        and o.status in ('paid','refunded')
    );

  if acc.referred_by is not null then
    select coalesce(p.display_name,'Thành viên M4X')
    into ref_name
    from public.profiles p
    where p.id=acc.referred_by;
  end if;

  return jsonb_build_object(
    'active',cfg.active,
    'code',v_code,
    'reward_amount',cfg.reward_amount,
    'min_purchase_amount',cfg.min_purchase_amount,
    'signup_window_hours',cfg.signup_window_hours,
    'invited_count',invited,
    'successful_count',success,
    'pending_count',pending,
    'review_count',review,
    'earned_amount',earned,
    'can_apply_code',can_apply,
    'has_referrer',acc.referred_by is not null,
    'referrer_name',ref_name
  );
end;
$$;

revoke all on function public.get_referral_dashboard()
from public,anon;
grant execute on function public.get_referral_dashboard()
to authenticated;

-- ------------------------------------------------------------
-- 6. APPLY INVITE CODE
-- Only new account, within window, no previous paid/refunded order.
-- ------------------------------------------------------------
create or replace function public.apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  code_v text:=upper(trim(coalesce(p_code,'')));
  cfg public.referral_settings%rowtype;
  mine public.referral_accounts%rowtype;
  owner_acc public.referral_accounts%rowtype;
  owner_name text;
begin
  if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if code_v='' then raise exception 'Mã giới thiệu không hợp lệ'; end if;

  perform public.m4x_enforce_rate_limit('apply_referral',5,3600);

  select * into cfg from public.referral_settings where id=1;
  if not cfg.active then raise exception 'Chương trình giới thiệu đang tạm dừng'; end if;

  perform public.m4x_referral_ensure_account(uid);
  select * into mine from public.referral_accounts where user_id=uid for update;

  select * into owner_acc
  from public.referral_accounts
  where code=code_v;

  if not found then raise exception 'Mã giới thiệu không tồn tại'; end if;
  if owner_acc.user_id=uid then raise exception 'Bạn không thể dùng mã của chính mình'; end if;

  if mine.referred_by is not null then
    if mine.referred_by=owner_acc.user_id then
      return jsonb_build_object('ok',true,'already_applied',true);
    end if;
    raise exception 'Tài khoản đã gắn với một người giới thiệu khác';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=uid
      and p.created_at >= now()-make_interval(hours=>cfg.signup_window_hours)
  ) then
    raise exception 'Mã giới thiệu chỉ áp dụng cho tài khoản mới';
  end if;

  if exists(
    select 1 from public.orders o
    where o.user_id=uid
      and o.status in ('paid','refunded')
  ) then
    raise exception 'Tài khoản đã mua hàng nên không thể nhập mã giới thiệu';
  end if;

  update public.referral_accounts
  set referred_by=owner_acc.user_id,bound_at=now()
  where user_id=uid;

  insert into public.referrals(
    referrer_id,referred_user_id,code_used,status
  )
  values(owner_acc.user_id,uid,owner_acc.code,'pending')
  on conflict(referred_user_id) do nothing;

  select coalesce(display_name,'Thành viên M4X')
  into owner_name
  from public.profiles where id=owner_acc.user_id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    uid,
    'Đã áp dụng mã giới thiệu',
    'Bạn đã được giới thiệu bởi '||owner_name||
    '. Khi đơn đủ điều kiện hoàn tất, người giới thiệu sẽ nhận thưởng.',
    'system',owner_acc.code
  );

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    owner_acc.user_id,
    'Có người dùng mã giới thiệu của bạn',
    'Thưởng '||to_char(cfg.reward_amount,'FM999G999G999')||
    'đ sẽ được cộng khi người được giới thiệu mua đơn đủ '||
    to_char(cfg.min_purchase_amount,'FM999G999G999')||'đ.',
    'system',owner_acc.code
  );

  return jsonb_build_object(
    'ok',true,
    'code',owner_acc.code,
    'referrer_name',owner_name,
    'reward_amount',cfg.reward_amount,
    'min_purchase_amount',cfg.min_purchase_amount
  );
end;
$$;

revoke all on function public.apply_referral_code(text)
from public,anon;
grant execute on function public.apply_referral_code(text)
to authenticated;

-- ------------------------------------------------------------
-- 7. INTERNAL REWARD ENGINE
-- Called by paid-order and wallet-purchase triggers.
-- ------------------------------------------------------------
create or replace function public.m4x_try_reward_referral(
  p_buyer uuid,
  p_amount bigint,
  p_reference text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg public.referral_settings%rowtype;
  r public.referrals%rowtype;
  today_count integer:=0;
  new_balance bigint;
begin
  if p_buyer is null or coalesce(p_amount,0)<=0 then return false; end if;

  select * into cfg from public.referral_settings where id=1;
  if not found or not cfg.active then return false; end if;

  select * into r
  from public.referrals
  where referred_user_id=p_buyer
    and status='pending'
  for update;

  if not found then return false; end if;
  if p_amount<cfg.min_purchase_amount then return false; end if;

  -- Do not reward blocked referrer.
  if exists(
    select 1 from public.profiles
    where id=r.referrer_id and is_blocked=true
  ) then
    update public.referrals
    set status='review',
        qualifying_reference=p_reference,
        qualifying_amount=p_amount,
        reward_amount=cfg.reward_amount,
        reviewed_at=now()
    where id=r.id;
    return false;
  end if;

  select count(*)::int into today_count
  from public.referrals
  where referrer_id=r.referrer_id
    and status='rewarded'
    and rewarded_at>=date_trunc('day',now());

  if today_count>=cfg.max_rewards_per_referrer_per_day then
    update public.referrals
    set status='review',
        qualifying_reference=p_reference,
        qualifying_amount=p_amount,
        reward_amount=cfg.reward_amount,
        reviewed_at=now()
    where id=r.id;
    return false;
  end if;

  update public.profiles
  set balance=balance+cfg.reward_amount
  where id=r.referrer_id
  returning balance into new_balance;

  -- History is optional. If an older wallet type CHECK rejects "reward",
  -- do not cancel the referral reward itself.
  begin
    insert into public.wallet_transactions(
      user_id,amount,type,description,reference
    )
    values(
      r.referrer_id,cfg.reward_amount,'reward',
      'Thưởng giới thiệu bạn bè',coalesce(p_reference,'REFERRAL')
    );
  exception when check_violation then
    null;
  end;

  update public.referrals
  set status='rewarded',
      qualifying_reference=p_reference,
      qualifying_amount=p_amount,
      reward_amount=cfg.reward_amount,
      rewarded_at=now()
  where id=r.id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    r.referrer_id,
    'Bạn vừa nhận thưởng giới thiệu',
    '+'||to_char(cfg.reward_amount,'FM999G999G999')||
    'đ đã được cộng vào ví M4X.',
    'system',coalesce(p_reference,'REFERRAL')
  );

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    p_buyer,
    'Đơn hàng đã hoàn tất Referral',
    'Người đã giới thiệu bạn vừa nhận thưởng từ M4X STORE.',
    'system',coalesce(p_reference,'REFERRAL')
  );

  return true;
end;
$$;

revoke all on function public.m4x_try_reward_referral(uuid,bigint,text)
from public,anon,authenticated;

-- Order trigger covers direct paid orders.
create or replace function public.m4x_referral_order_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.user_id is not null
     and new.status='paid'
     and (tg_op='INSERT' or old.status is distinct from new.status)
  then
    perform public.m4x_try_reward_referral(
      new.user_id,new.amount,new.order_code
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_m4x_referral_order_paid on public.orders;
create trigger trg_m4x_referral_order_paid
after insert or update of status on public.orders
for each row
execute function public.m4x_referral_order_trigger();

-- Wallet trigger covers cart aggregate totals and custom purchases.
create or replace function public.m4x_referral_wallet_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.type='purchase' and new.amount<0 then
    perform public.m4x_try_reward_referral(
      new.user_id,abs(new.amount),new.reference
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_m4x_referral_wallet_purchase on public.wallet_transactions;
create trigger trg_m4x_referral_wallet_purchase
after insert on public.wallet_transactions
for each row
execute function public.m4x_referral_wallet_trigger();

-- ------------------------------------------------------------
-- 8. ADMIN
-- ------------------------------------------------------------
create or replace function public.admin_set_referral_settings(
  p_active boolean,
  p_reward_amount bigint,
  p_min_purchase_amount bigint,
  p_signup_window_hours integer,
  p_daily_limit integer
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;

  if p_reward_amount<0 or p_reward_amount>1000000 then
    raise exception 'Tiền thưởng không hợp lệ';
  end if;
  if p_min_purchase_amount<0 or p_min_purchase_amount>100000000 then
    raise exception 'Giá trị đơn tối thiểu không hợp lệ';
  end if;
  if p_signup_window_hours<1 or p_signup_window_hours>2160 then
    raise exception 'Thời gian tài khoản mới không hợp lệ';
  end if;
  if p_daily_limit<1 or p_daily_limit>10000 then
    raise exception 'Giới hạn/ngày không hợp lệ';
  end if;

  update public.referral_settings
  set active=p_active,
      reward_amount=p_reward_amount,
      min_purchase_amount=p_min_purchase_amount,
      signup_window_hours=p_signup_window_hours,
      max_rewards_per_referrer_per_day=p_daily_limit,
      updated_at=now()
  where id=1;
end;
$$;

revoke all on function public.admin_set_referral_settings(
  boolean,bigint,bigint,integer,integer
) from public,anon;
grant execute on function public.admin_set_referral_settings(
  boolean,bigint,bigint,integer,integer
) to authenticated;

create or replace function public.admin_approve_referral(p_referral_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  cfg public.referral_settings%rowtype;
  r public.referrals%rowtype;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;

  select * into cfg from public.referral_settings where id=1;
  select * into r from public.referrals where id=p_referral_id for update;
  if not found then raise exception 'Referral không tồn tại'; end if;
  if r.status<>'review' then raise exception 'Referral này không ở trạng thái cần duyệt'; end if;

  update public.profiles
  set balance=balance+coalesce(r.reward_amount,cfg.reward_amount)
  where id=r.referrer_id;

  begin
    insert into public.wallet_transactions(
      user_id,amount,type,description,reference
    )
    values(
      r.referrer_id,coalesce(r.reward_amount,cfg.reward_amount),'reward',
      'Thưởng Referral được Admin duyệt',
      coalesce(r.qualifying_reference,'REFERRAL')
    );
  exception when check_violation then
    null;
  end;

  update public.referrals
  set status='rewarded',
      reward_amount=coalesce(reward_amount,cfg.reward_amount),
      rewarded_at=now(),
      reviewed_at=now()
  where id=r.id;

  insert into public.notifications(user_id,title,body,type,reference)
  values(
    r.referrer_id,'Referral đã được Admin duyệt',
    '+'||to_char(coalesce(r.reward_amount,cfg.reward_amount),'FM999G999G999')||
    'đ đã được cộng vào ví.',
    'system',coalesce(r.qualifying_reference,'REFERRAL')
  );
end;
$$;

revoke all on function public.admin_approve_referral(uuid)
from public,anon;
grant execute on function public.admin_approve_referral(uuid)
to authenticated;

create or replace function public.admin_reject_referral(p_referral_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare r public.referrals%rowtype;
begin
  if not public.is_admin() then raise exception 'Không có quyền Admin'; end if;

  select * into r from public.referrals where id=p_referral_id for update;
  if not found then raise exception 'Referral không tồn tại'; end if;
  if r.status='rewarded' then raise exception 'Referral đã trả thưởng, không thể từ chối trực tiếp'; end if;

  update public.referrals
  set status='rejected',reviewed_at=now()
  where id=r.id;
end;
$$;

revoke all on function public.admin_reject_referral(uuid)
from public,anon;
grant execute on function public.admin_reject_referral(uuid)
to authenticated;

notify pgrst,'reload schema';
commit;
