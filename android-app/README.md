# M4X STORE Android

Bản Android đóng gói storefront M4X STORE vào APK, không phụ thuộc GitHub Pages/custom domain khi khách mở app.

## Build bằng GitHub Actions

Tạo 2 Repository Actions secrets:

- SUPABASE_URL
- SUPABASE_ANON_KEY

Sau đó vào Actions > Build M4X STORE APK > Run workflow.

Artifact tạo ra: M4X-STORE-APK / M4X_STORE_v1.0.0.apk

Không bao giờ đưa SUPABASE_SERVICE_ROLE_KEY hoặc SEPAY_WEBHOOK_SECRET vào APK.
