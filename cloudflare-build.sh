#!/usr/bin/env bash
set -e

rm -rf dist
mkdir -p dist

cp index.html admin.html theme-translator.html dist/
cp -r assets dist/assets
test -f dist/theme-translator.html || (echo 'Missing theme-translator.html' && exit 1)
test -f dist/assets/theme-paid-v21-page.js || (echo 'Missing theme translator JS' && exit 1)
test -f dist/assets/theme-paid-v21-6.css || (echo 'Missing theme translator CSS' && exit 1)

cat > dist/config.js <<EOF2
window.M4X_CONFIG = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
  PUBLIC_STORE_URL: "${PUBLIC_STORE_URL}",
  BANK: {
    name: "VietinBank",
    account: "106885804727",
    holder: "NGUYEN MINH DAN",
    store: "M4X STORE"
  },
  ORDER_EXPIRE_MINUTES: 15,
  GITHUB_REPO: "NgMingZan/M4X-STORE"
};
EOF2

touch dist/.nojekyll
