# M4X STORE V2 — bộ khung chạy với Supabase + SePay

Bản này đã có code thật cho:

- Store đọc danh mục/sản phẩm từ Supabase.
- Admin đăng nhập, thêm/xóa danh mục.
- Admin upload ảnh, nhiều ảnh preview và file sản phẩm.
- Sản phẩm có loại giao hàng: download/content/license/service/subscription/external.
- Kho không giới hạn hoặc giới hạn số lượng.
- Tạo đơn 15 phút, giữ hàng trong database.
- QR VietQR động theo đúng số tiền + mã đơn.
- VietinBank dùng nội dung `SEVQR M4X...`.
- SePay HMAC-SHA256 webhook.
- Kiểm tra đúng tài khoản nhận tiền trước khi khớp đơn.
- Chống trùng giao dịch bằng SePay transaction `id`.
- Sau khi paid, tự tạo signed URL 10 phút cho file private.

## BƯỚC 1 — Tạo Supabase

1. Tạo project `M4X STORE` tại Supabase.
2. Mở `SQL Editor`.
3. Copy toàn bộ file `supabase/schema.sql` và bấm Run.

## BƯỚC 2 — Tạo Admin

1. Supabase > Authentication > Users > Add user.
2. Tạo email + password cho bạn.
3. Copy UUID của user.
4. SQL Editor chạy:

```sql
insert into public.profiles(id,role)
values ('UUID_CUA_ADMIN','admin')
on conflict(id) do update set role='admin';
```

## BƯỚC 3 — Điền config web

Mở `config.js` và sửa đúng 2 dòng:

```js
SUPABASE_URL: "https://xxxxx.supabase.co",
SUPABASE_ANON_KEY: "sb_publishable_xxxxx"
```

Tài khoản nhận tiền đã đặt sẵn trong config:

- Bank: VietinBank
- STK: 106885804727
- Chủ TK: NGUYEN MINH DAN

Nếu đổi tài khoản sau này, sửa `config.js` và secret `M4X_BANK_ACCOUNT` cùng lúc.

## BƯỚC 4 — Deploy Edge Functions

Trong Supabase Dashboard > Edge Functions, tạo 3 function theo đúng tên và copy code từ:

- `supabase/functions/create-order/index.ts`
- `supabase/functions/create-download-link/index.ts`
- `supabase/functions/sepay-webhook/index.ts`

Đặt Function Secrets:

```text
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SEPAY_WEBHOOK_SECRET=<secret HMAC bạn tạo ở SePay>
M4X_BANK_ACCOUNT=106885804727
```

Không đưa 3 secret này vào `config.js` hay HTML.

## BƯỚC 5 — Tắt JWT verification cho endpoint public cần thiết

`create-order` và `create-download-link` đang được storefront public gọi bằng anon key. Nếu Dashboard của Supabase yêu cầu JWT verification, cấu hình function để chấp nhận request public/anon theo cách deploy hiện tại của project. `sepay-webhook` phải nhận request từ SePay và bảo vệ bằng HMAC, không dùng JWT của Supabase.

## BƯỚC 6 — SePay

1. Tạo/liên kết tài khoản VietinBank với SePay.
2. Trong cấu hình mã thanh toán, dùng tiền tố `M4X`.
3. Tạo webhook:
   - Event: Tiền vào.
   - Chỉ chọn tài khoản VietinBank nhận tiền của M4X STORE.
   - URL: `https://PROJECT.supabase.co/functions/v1/sepay-webhook`
   - Auth: HMAC-SHA256.
   - Copy secret HMAC và lưu vào `SEPAY_WEBHOOK_SECRET` của Supabase.
4. Gửi thử webhook.

## BƯỚC 7 — Chạy Store

Upload toàn bộ thư mục web lên Vercel/Netlify/GitHub Pages hoặc hosting tĩnh.

- `/index.html` = cửa hàng.
- `/admin.html` = quản trị.

Vào Admin, đăng nhập rồi:

1. Tạo danh mục `Theme`, `Tool`, `Preset`... hoặc bất kỳ mục nào.
2. Thêm sản phẩm.
3. Chọn loại giao hàng.
4. Chọn giới hạn kho nếu cần.
5. Upload ảnh + file.
6. Đăng.

Sản phẩm tự xuất hiện ngoài Store, không sửa HTML.

## BƯỚC 8 — Test thanh toán

1. Tạo một sản phẩm giá nhỏ để test.
2. Mở Store > Mua.
3. Web tạo mã đơn `M4Xxxxxxxxxxx` và QR có nội dung `SEVQR M4Xxxxxxxxxxx`.
4. Chuyển đúng số tiền bằng app ngân hàng.
5. SePay gửi webhook.
6. Store đổi sang `Thanh toán thành công`.
7. Nếu là `download`, nút tải file private xuất hiện.

## HÀNG GIỚI HẠN

Ví dụ stock_limit = 10:

- sold_count = 7
- reserved_count = 1
- còn mua = 2

Khi tạo đơn, database khóa row sản phẩm và tăng `reserved_count`, nên không bán quá số lượng kể cả nhiều khách bấm cùng lúc.

Đơn quá 15 phút sẽ được giải phóng bởi `expire_pending_orders()` khi có thao tác mới. Để tự giải phóng đúng mỗi phút kể cả khi không có ai mở web, bật `pg_cron` và chạy:

```sql
select cron.schedule(
  'm4x-expire-orders',
  '* * * * *',
  $$select public.expire_pending_orders();$$
);
```

## LƯU Ý PRODUCTION

- Không commit service-role key hoặc HMAC secret.
- Test thật bằng số tiền nhỏ trước khi bán.
- Giao dịch sai số tiền / quá hạn sẽ vào trạng thái `review`, không tự giao file.
- File bán nằm trong bucket private; Store chỉ nhận signed URL 10 phút sau khi paid.
- Nên thêm email/Telegram khách hàng, chính sách hoàn tiền và trang lịch sử mua hàng ở bản tiếp theo.


## Thiết lập Supabase ngay trong Admin (không cần dán key trong Termux)
Bản này hỗ trợ lưu Project URL + Publishable key ngay trong trình duyệt. Mở `admin.html`. Nếu `config.js` còn giá trị mẫu, trang sẽ hiện **Thiết lập M4X STORE**. Dán Project URL và Publishable key, bấm **Lưu & kết nối**. Cấu hình được lưu trong `localStorage` của trình duyệt hiện tại và `index.html` trên cùng domain/port sẽ dùng lại cấu hình đó.

> Lưu ý: cách này rất tiện để test trên điện thoại. Khi deploy cho khách truy cập từ thiết bị khác, nên cấu hình public key bằng môi trường deploy hoặc file cấu hình public, vì localStorage chỉ tồn tại trên trình duyệt của bạn. Không bao giờ đưa `service_role`/secret key vào frontend.
