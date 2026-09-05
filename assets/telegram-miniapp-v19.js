/* =========================================================
   M4X STORE V19 — TELEGRAM MINI APP BRIDGE
   - Web thường vẫn chạy như cũ.
   - Chỉ kích hoạt khi mở trong Telegram Mini App.
   - Không tin initDataUnsafe cho quyền Admin; server xác thực initData.
   ========================================================= */
(() => {
  'use strict';
  const tg = window.Telegram?.WebApp;
  if (!tg || !tg.initData) return;

  document.documentElement.classList.add('m4x-telegram');
  try { tg.ready(); tg.expand(); } catch (_) {}

  const cfg = () => window.M4X_CONFIG || {};
  const base = () => String(cfg().SUPABASE_URL || '').replace(/\/$/, '');
  const key = () => String(cfg().SUPABASE_ANON_KEY || cfg().SUPABASE_PUBLISHABLE_KEY || '');
  const fn = name => `${base()}/functions/v1/${name}`;
  const state = { user: null, isAdmin: false, authenticated: false };

  function headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (key()) h.apikey = key();
    return h;
  }

  async function auth() {
    if (!base()) return null;
    try {
      const r = await fetch(fn('telegram-auth'), {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ initData: tg.initData })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      state.user = j.user || null;
      state.isAdmin = !!j.is_admin;
      state.authenticated = true;
      window.M4X_TELEGRAM_USER = state.user;
      render(j);
      return j;
    } catch (e) {
      console.warn('M4X Telegram auth:', e);
      return null;
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function render(j) {
    document.querySelectorAll('.m4x-tg-admin-btn,.m4x-tg-chip').forEach(x => x.remove());
    const u = j.user || {};
    const chip = document.createElement('div');
    chip.className = 'm4x-tg-chip';
    chip.innerHTML = `${u.photo_url ? `<img src="${esc(u.photo_url)}" alt="">` : '<i></i>'}<span>${esc(u.first_name || u.username || 'Telegram')}</span>`;
    document.body.appendChild(chip);

    if (j.is_admin) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm4x-tg-admin-btn';
      b.textContent = '👑 Admin';
      b.onclick = () => {
        try { tg.HapticFeedback?.impactOccurred?.('light'); } catch (_) {}
        location.href = './telegram-admin.html';
      };
      document.body.appendChild(b);
    }
  }

  function openLink(url) {
    try {
      const u = new URL(url, location.href);
      if (/^https?:$/.test(u.protocol)) return tg.openLink(u.href);
    } catch (_) {}
  }

  window.M4XTelegram = {
    tg,
    state,
    refresh: auth,
    openAdmin: () => { location.href = './telegram-admin.html'; },
    openLink
  };

  auth();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) auth(); });
})();
