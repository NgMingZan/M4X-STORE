-- ============================================================
-- M4X STORE V21.1 — GHIM AI VIỆT HÓA LOCKSCREEN LÀ SẢN PHẨM #1
-- Chạy sau V21 nếu bạn đã cài V21 trước đó.
-- ============================================================
begin;

alter table public.products
  add column if not exists pinned boolean not null default false;

create index if not exists idx_products_pinned_created
  on public.products(pinned desc, created_at desc);

insert into public.products(
  id, category_id, name, slug, description, price, delivery_type,
  stock_mode, sold_count, reserved_count, active
)
values(
  '00000000-0000-4000-8000-000000002100'::uuid,
  null,
  'AI Việt hóa Lockscreen',
  'm4x-ai-viet-hoa-lockscreen-v21',
  'AI Việt hóa lockscreen: dịch text + chữ trong ảnh. Giá từ 10.000đ và tự tính theo độ nặng, số ảnh, lượng văn bản.',
  10000,
  'service',
  'unlimited',
  0,
  0,
  true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  price = 10000,
  delivery_type = 'service',
  stock_mode = 'unlimited',
  active = true;

update public.products
set pinned = true,
    active = true,
    price = 10000,
    updated_at = now()
where id = '00000000-0000-4000-8000-000000002100'::uuid;

-- Tự gắn vào danh mục AI nếu đã có.
update public.products p
set category_id = c.id
from lateral (
  select id
  from public.categories
  where lower(coalesce(slug,'')) in ('ai','ai-tien-ich','ai-tienich')
     or lower(coalesce(name,'')) = 'ai'
  order by sort_order nulls last, id
  limit 1
) c
where p.id = '00000000-0000-4000-8000-000000002100'::uuid
  and p.category_id is null;

notify pgrst,'reload schema';
commit;

select id,name,price,pinned,active,category_id
from public.products
where id='00000000-0000-4000-8000-000000002100'::uuid;
