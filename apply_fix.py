from pathlib import Path

root = Path('.')
index = root / 'index.html'
workflow = root / '.github/workflows/android-build.yml'

if not index.exists():
    raise SystemExit('Không thấy index.html. Hãy chạy script trong thư mục M4X_STORE_V2.')

s = index.read_text(encoding='utf-8')

repls = [
    ("select('id,display_name,balance')", "select('id,display_name,balance,role')"),
    ("select('order_code,amount,paid_at,products(name,delivery_type)')", "select('order_code,amount,paid_at,access_token,products(name,delivery_type)')"),
]
for a,b in repls:
    if a in s:
        s = s.replace(a,b)

old_tabs = '<div class="tabs"><button class="btn" onclick="openTopup()">+ Nạp tiền</button><button class="btn ghost" onclick="logout()">Đăng xuất</button></div>'
new_tabs = '<div class="tabs"><button class="btn" onclick="openTopup()">+ Nạp tiền</button>${profile?.role===\'admin\'?\'<button class="btn ghost" onclick="location.href=&quot;./admin.html&quot;">Quản trị</button>\':\'\'}<button class="btn ghost" onclick="logout()">Đăng xuất</button></div>'
if old_tabs in s:
    s = s.replace(old_tabs, new_tabs)

old_owned = "${(o||[]).map(x=>`<div class=\"item\"><b>${esc(x.products?.name||'Sản phẩm')}</b><div class=\"muted\">${money(x.amount)} · ${new Date(x.paid_at).toLocaleString('vi-VN')}</div></div>`).join('')||'<div class=\"muted\">Chưa có.</div>'}"
new_owned = "${(o||[]).map(x=>`<div class=\"item\"><div class=\"row\"><div><b>${esc(x.products?.name||'Sản phẩm')}</b><div class=\"muted\">${money(x.amount)} · ${new Date(x.paid_at).toLocaleString('vi-VN')}</div></div>${x.products?.delivery_type==='download'?`<button class=\"btn ghost\" onclick=\"getDownload('${esc(x.order_code)}','${esc(x.access_token)}')\">Tải lại</button>`:''}</div></div>`).join('')||'<div class=\"muted\">Chưa có.</div>'}"
if old_owned in s:
    s = s.replace(old_owned, new_owned)
else:
    print('Cảnh báo: chưa tìm thấy block Sản phẩm đã mua để thêm nút Tải lại.')

old_get = "'Authorization':'Bearer '+C.SUPABASE_ANON_KEY"
new_get = "'Authorization':'Bearer '+((await sb.auth.getSession()).data.session?.access_token||C.SUPABASE_ANON_KEY)"
if old_get in s:
    s = s.replace(old_get, new_get)

index.write_text(s, encoding='utf-8')

if workflow.exists():
    w = workflow.read_text(encoding='utf-8')
    needle = 'cp index.html android-app/app/src/main/assets/index.html'
    add = needle + '\n          cp admin.html android-app/app/src/main/assets/admin.html'
    if needle in w and 'cp admin.html android-app/app/src/main/assets/admin.html' not in w:
        w = w.replace(needle, add)
        workflow.write_text(w, encoding='utf-8')
else:
    print('Cảnh báo: không thấy workflow Android để thêm admin.html.')

print('OK: đã thêm Quản trị trong app, Tải lại ở tài khoản và bundle admin.html vào APK.')
