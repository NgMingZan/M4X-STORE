# Supabase Edge Functions

Deploy 3 functions:

- `create-order`
- `create-download-link`
- `sepay-webhook`

Secrets required:

- `SUPABASE_URL` (usually available automatically)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SEPAY_WEBHOOK_SECRET`
- `M4X_BANK_ACCOUNT=106885804727`

The first two functions are called from the storefront. `sepay-webhook` is called only by SePay.
