begin;
update public.m4x_theme_paid_pricing
set enabled=true,base_price=10000,max_mtz_mb=100,max_lockscreen_mb=60,max_images=1000,
size_tiers='[{"max":5,"fee":0},{"max":10,"fee":2000},{"max":20,"fee":5000},{"max":35,"fee":9000},{"max":60,"fee":15000}]'::jsonb,
image_tiers='[{"max":50,"fee":0},{"max":150,"fee":3000},{"max":300,"fee":6000},{"max":500,"fee":10000},{"max":750,"fee":15000},{"max":1000,"fee":20000}]'::jsonb,
text_tiers='[{"max":20000,"fee":0},{"max":50000,"fee":2000},{"max":100000,"fee":4000},{"max":200000,"fee":7000},{"max":500000,"fee":10000},{"max":999999999,"fee":15000}]'::jsonb,
updated_at=now()
where id='main';
notify pgrst,'reload schema';
commit;
select * from public.m4x_theme_paid_pricing where id='main';
