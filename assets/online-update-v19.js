/* =========================================================
   M4X STORE V19 — ONLINE UPDATE NOTIFIER
   Mini App luôn dùng web online. Module này giúp báo có build mới và reload cache-busting.
   ========================================================= */
(() => {
  'use strict';
  const CURRENT_VERSION = '19.0.0';
  const CURRENT_BUILD = 1900;
  const ACK_KEY = 'm4x_online_update_ack_v19';
  let remote = null, checking = false;

  const cfg = () => window.M4X_CONFIG || {};
  const sbClient = () => { try { return typeof sb !== 'undefined' ? sb : window.sb; } catch (_) { return window.sb; } };

  function readAck() { try { return JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); } catch (_) { return {}; } }
  function writeAck(v) { try { localStorage.setItem(ACK_KEY, JSON.stringify(v)); } catch (_) {} }

  async function fetchRelease() {
    const c = sbClient();
    if (c?.from) {
      const { data, error } = await c.from('store_app_release').select('*').eq('id','main').maybeSingle();
      if (!error) return data;
    }
    const C = cfg(), url = String(C.SUPABASE_URL || '').replace(/\/$/, ''), key = String(C.SUPABASE_ANON_KEY || C.SUPABASE_PUBLISHABLE_KEY || '');
    if (!url || !key) return null;
    const r = await fetch(`${url}/rest/v1/store_app_release?id=eq.main&select=*`, { headers: { apikey: key } });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j[0] : j;
  }

  function ensureBar() {
    let el = document.getElementById('m4xUpdateBar');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'm4xUpdateBar';
    el.innerHTML = '<div class="m4x-up-copy"><b id="m4xUpTitle">Có bản cập nhật M4X Store</b><p id="m4xUpMsg"></p></div><div class="m4x-up-actions"><button id="m4xUpLater">Để sau</button><button class="primary" id="m4xUpNow">Cập nhật</button></div>';
    document.body.appendChild(el);
    return el;
  }

  function updateNow() {
    if (!remote) return;
    writeAck({ build: Number(remote.build || 0), token: String(remote.force_reload_token || ''), at: Date.now() });
    const u = new URL(location.href);
    u.searchParams.set('_m4x_build', String(remote.build || Date.now()));
    u.searchParams.set('_m4x_refresh', String(Date.now()));
    location.replace(u.href);
  }

  function show(r) {
    remote = r;
    const bar = ensureBar();
    const title = document.getElementById('m4xUpTitle'), msg = document.getElementById('m4xUpMsg');
    title.textContent = `M4X Store ${r.version || ''} đã sẵn sàng`;
    msg.textContent = r.message || `Build ${r.build}. Bấm Cập nhật để tải giao diện mới.`;
    const later = document.getElementById('m4xUpLater');
    later.style.display = r.mandatory ? 'none' : '';
    later.onclick = () => { writeAck({ build: Number(r.build||0), token:String(r.force_reload_token||''), at:Date.now() }); bar.classList.remove('show'); };
    document.getElementById('m4xUpNow').onclick = updateNow;
    bar.classList.add('show');
    if (r.auto_reload && r.mandatory) setTimeout(updateNow, 2500);
  }

  async function check(force = false) {
    if (checking) return;
    checking = true;
    try {
      const r = await fetchRelease();
      if (!r) return;
      const ack = readAck();
      const build = Number(r.build || 0), token = String(r.force_reload_token || '');
      const newer = build > CURRENT_BUILD && Number(ack.build || 0) < build;
      const tokenChanged = !!token && !!ack.token && ack.token !== token;
      if (!ack.token && token) writeAck({ ...ack, token });
      if (force || newer || tokenChanged) show(r);
    } catch (e) { console.warn('M4X update check:', e); }
    finally { checking = false; }
  }

  window.M4XOnlineUpdate = { currentVersion: CURRENT_VERSION, currentBuild: CURRENT_BUILD, check: () => check(true) };
  setTimeout(check, 1800);
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
