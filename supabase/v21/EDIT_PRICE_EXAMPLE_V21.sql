-- Ví dụ sửa bảng giá V21. Chỉnh số theo ý Admin rồi Run.
update public.m4x_theme_paid_pricing
set
  base_price = 10000,
  max_lockscreen_mb = 18,
  max_images = 20,
  quote_minutes = 30,
  size_tiers = '[{"max":3,"fee":0},{"max":6,"fee":2000},{"max":10,"fee":4000},{"max":14,"fee":6000},{"max":18,"fee":8000}]'::jsonb,
  image_tiers = '[{"max":3,"fee":0},{"max":8,"fee":4000},{"max":14,"fee":8000},{"max":20,"fee":12000}]'::jsonb,
  text_tiers = '[{"max":20000,"fee":0},{"max":50000,"fee":2000},{"max":100000,"fee":4000},{"max":999999999,"fee":6000}]'::jsonb,
  updated_at = now()
where id='main';
