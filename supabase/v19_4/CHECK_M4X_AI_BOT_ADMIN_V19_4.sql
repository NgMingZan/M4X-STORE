select * from public.m4x_store_control where id='main';
select count(*) as ai_caption_history from public.telegram_ai_caption_history;
select count(*) as telegram_admin_sessions from public.telegram_admin_sessions;
select tgname as purchase_gate_trigger
from pg_trigger
where tgname='trg_m4x_purchase_gate' and not tgisinternal;
