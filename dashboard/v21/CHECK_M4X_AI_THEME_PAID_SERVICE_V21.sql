-- M4X V21 — kiểm tra cài đặt
select id, enabled, base_price, max_lockscreen_mb, max_images, max_mtz_mb, quote_minutes,
       size_tiers, image_tiers, text_tiers
from public.m4x_theme_paid_pricing
where id='main';

select id, name, slug, delivery_type, stock_mode, active
from public.products
where id='00000000-0000-4000-8000-000000002100'::uuid;

select id, name, public
from storage.buckets
where id='theme-translation-private';

select order_code, source_file_name, status, progress, stage,
       round(lockscreen_bytes/1048576.0,2) as lockscreen_mb,
       image_count, text_chars, amount, created_at
from public.m4x_theme_paid_jobs
order by created_at desc
limit 10;
