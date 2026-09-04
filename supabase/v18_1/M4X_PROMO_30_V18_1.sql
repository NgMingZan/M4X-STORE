-- ============================================================
-- M4X STORE V18 — NẠP TIỀN +30%
-- Hết hạn: 00:30:46 ngày 10/09/2026 (UTC+7)
-- Chạy SAU toàn bộ SQL V2 -> V17 hiện có.
-- Chỉ thay thế hàm xử lý nạp ví; không xóa dữ liệu.
-- ============================================================

begin;

create or replace function public.process_wallet_topup(
  p_transaction_id text,
  p_topup_code text,
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
  t public.topups%rowtype;
  promo_deadline constant timestamptz := '2026-09-10 00:30:46+07';
  bonus bigint := 0;
  total_credit bigint := 0;
begin
  if p_transaction_id is null or trim(p_transaction_id)='' then
    raise exception 'Thiếu transaction id';
  end if;

  if exists (
    select 1 from public.topups where bank_transaction_id=p_transaction_id
  ) then
    return jsonb_build_object('result','duplicate');
  end if;

  select * into t
  from public.topups
  where topup_code=upper(trim(p_topup_code))
  for update;

  if not found then
    return jsonb_build_object('result','unmatched_topup');
  end if;

  if t.status='paid' then
    return jsonb_build_object('result','already_paid');
  end if;

  if t.status<>'pending' or t.expires_at<now() or t.amount<>p_amount then
    update public.topups
    set status='review',bank_transaction_id=p_transaction_id
    where id=t.id;
    return jsonb_build_object('result','review');
  end if;

  -- Khuyến mãi tính theo thời điểm webhook xác nhận tiền vào.
  if now() < promo_deadline then
    bonus := (p_amount * 30) / 100;
  end if;
  total_credit := p_amount + bonus;

  update public.profiles
  set balance=balance+total_credit
  where id=t.user_id;

  insert into public.wallet_transactions(
    user_id,amount,type,description,reference
  ) values (
    t.user_id,p_amount,'topup','Nạp tiền qua ngân hàng',t.topup_code
  );

  if bonus > 0 then
    insert into public.wallet_transactions(
      user_id,amount,type,description,reference
    ) values (
      t.user_id,bonus,'topup','Thưởng khuyến mãi nạp tiền +30%',t.topup_code||'-BONUS30'
    );
  end if;

  update public.topups
  set status='paid',paid_at=now(),bank_transaction_id=p_transaction_id
  where id=t.id;

  -- Bảng notifications đã có từ V4; nếu project hiện tại có bảng này thì gửi thông báo.
  if to_regclass('public.notifications') is not null then
    insert into public.notifications(user_id,title,body,type,reference)
    values(
      t.user_id,
      case when bonus>0 then 'Nạp tiền +30% thành công' else 'Nạp tiền thành công' end,
      case when bonus>0 then
        'Đã cộng '||to_char(total_credit,'FM999G999G999')||'đ vào ví (gồm +'||to_char(bonus,'FM999G999G999')||'đ khuyến mãi).'
      else
        'Đã cộng '||to_char(p_amount,'FM999G999G999')||'đ vào số dư M4X STORE.'
      end,
      'topup',t.topup_code
    );
  end if;

  return jsonb_build_object(
    'result','paid',
    'user_id',t.user_id,
    'amount',p_amount,
    'bonus',bonus,
    'credited_amount',total_credit,
    'promo_applied',bonus>0,
    'promo_deadline',promo_deadline
  );
end;
$$;

revoke all on function public.process_wallet_topup(
  text,text,bigint,text,text,jsonb
) from public,anon,authenticated;

grant execute on function public.process_wallet_topup(
  text,text,bigint,text,text,jsonb
) to service_role;

notify pgrst, 'reload schema';
commit;
