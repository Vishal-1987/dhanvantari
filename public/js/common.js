/* Shared client helpers for every Dhanvantari screen. Exposes window.DV. */
(function () {
  const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bengaluru

  const ico = (d, extra = '') =>
    `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

  const icons = {
    leaf: ico('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'),
    bell: ico('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
    cart: ico('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>'),
    search: ico('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    pin: ico('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    home: ico('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'),
    clinic: ico('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M12 9v6M9 12h6"/>'),
    bike: ico('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"/>'),
    box: ico('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>'),
    check: ico('<path d="M20 6 9 17l-5-5"/>'),
    x: ico('<path d="M18 6 6 18M6 6l12 12"/>'),
    plus: ico('<path d="M5 12h14M12 5v14"/>'),
    minus: ico('<path d="M5 12h14"/>'),
    phone: ico('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>'),
    logout: ico('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    user: ico('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
    lock: ico('<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    card: ico('<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>'),
    upi: ico('<path d="M12 2 4 20h5l3-7 3 7h5Z"/>'),
    cash: ico('<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>'),
    clock: ico('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    route: ico('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
    nav: ico('<path d="m3 11 19-9-9 19-2-8-8-2z"/>'),
    chart: ico('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>'),
    users: ico('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    pill: ico('<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>'),
    rupee: ico('<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/>'),
    shield: ico('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
    locate: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>'),
    play: ico('<polygon points="6 3 20 12 6 21 6 3"/>'),
    stop: ico('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
    refresh: ico('<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>'),
    edit: ico('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  };

  const LOGO = `<svg viewBox="0 0 32 32" fill="none"><path d="M16 4c5 4 7 8.5 7 12.5S20 25 16 28c-4-3-7-7.5-7-11.5S11 8 16 4Z" fill="#8fb59a"/><path d="M16 9v19" stroke="#17402f" stroke-width="1.6"/><path d="M16 15l3.5-3M16 20l-3.5-3M16 24l4-3" stroke="#17402f" stroke-width="1.4" stroke-linecap="round"/><circle cx="24" cy="8" r="2.4" fill="#d48a26"/></svg>`;

  // ---------------------------------------------------------------- session
  const store = {
    get token() { try { return localStorage.getItem('dv_token'); } catch { return null; } },
    set token(v) { try { v ? localStorage.setItem('dv_token', v) : localStorage.removeItem('dv_token'); } catch {} },
    get user() { try { return JSON.parse(localStorage.getItem('dv_user') || 'null'); } catch { return null; } },
    set user(v) { try { v ? localStorage.setItem('dv_user', JSON.stringify(v)) : localStorage.removeItem('dv_user'); } catch {} },
  };

  const HOME = { admin: '/admin', customer: '/shop', clinic: '/clinic', rider: '/rider' };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/auth')) { logout(); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function logout() {
    store.token = null; store.user = null;
    location.href = '/';
  }

  async function requireRole(role) {
    if (!store.token) { location.replace('/'); return new Promise(() => {}); }
    try {
      const me = await api('/me');
      if (me.role !== role) { location.replace(HOME[me.role] || '/'); return new Promise(() => {}); }
      store.user = me;
      return me;
    } catch { logout(); return new Promise(() => {}); }
  }

  // ------------------------------------------------------------- formatting
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const toDate = (s) => new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(' ', 'T') + 'Z');
  const time = (s) => toDate(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const dateTime = (s) => toDate(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  function ago(s) {
    const sec = (Date.now() - toDate(s).getTime()) / 1000;
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
    if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
    return dateTime(s);
  }
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const STATUS = {
    awaiting_payment: ['Awaiting payment', 'grey'],
    placed: ['New', 'saffron'],
    accepted: ['Preparing', 'sky'],
    ready: ['Ready for pickup', 'saffron'],
    picked_up: ['Out for delivery', 'sky'],
    delivered: ['Delivered', ''],
    cancelled: ['Cancelled', 'clay'],
  };
  const statusBadge = (s) => `<span class="badge dot ${STATUS[s]?.[1] ?? 'grey'}">${STATUS[s]?.[0] ?? s}</span>`;
  const payBadge = (o) => {
    const m = { upi: 'UPI', card: 'Card', cod: 'Cash on delivery' }[o.paymentMethod];
    const cls = o.paymentStatus === 'paid' ? '' : o.paymentStatus === 'refunded' ? 'clay' : 'grey';
    return `<span class="badge ${cls}">${m} · ${o.paymentStatus}</span>`;
  };

  function stepper(o) {
    const steps = [['placed', 'Placed'], ['accepted', 'Preparing'], ['ready', 'Packed'], ['picked_up', 'On the way'], ['delivered', 'Delivered']];
    if (o.status === 'cancelled') return `<div class="badge clay" style="height:32px">${icons.x} This order was cancelled</div>`;
    const idx = steps.findIndex(([k]) => k === o.status);
    return `<div class="steps">${steps.map(([, label], i) => `
      <div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
        <div class="sd">${i <= idx ? icons.check : ''}</div>${label}</div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ UI bits
  function toast(title, body = '', type = '') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<div>${type === 'error' ? icons.x : icons.check}</div><div><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ''}</div>`;
    box.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4500);
  }
  const fail = (e) => toast('Something went wrong', e.message, 'error');

  function modal(title, bodyHtml, { wide = false, foot = '' } = {}) {
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn icon" data-close aria-label="Close">${icons.x}</button></div>
      <div class="modal-body">${bodyHtml}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); bd.dispatchEvent(new Event('close')); };
    const onKey = (e) => e.key === 'Escape' && close();
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bd);
    bd.close = close;
    return bd;
  }

  async function busy(btn, fn) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin ${btn.classList.contains('ghost') || btn.classList.contains('soft') ? 'dark' : ''}"></span>`;
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  // Short chime + system notification for incoming alerts.
  let audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.35);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.4);
      });
    } catch {}
  }
  function systemNotify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' && document.hidden) new Notification(title, { body, icon: '/img/icon.svg' });
  }

  // ----------------------------------------------------------------- topbar
  function topbar(user, { roleLabel, extra = '' } = {}) {
    const el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = `
      <a class="brand" href="${HOME[user.role]}"><div class="brand-mark">${LOGO}</div>
        <div><div class="brand-name">Dhanvantari</div><div class="brand-sub">Pure Ayurveda, delivered</div></div></a>
      <span class="role-chip">${esc(roleLabel)}</span>
      <div class="spacer"></div>
      ${extra}
      <div class="bell user-menu"><button class="btn icon" id="bellBtn" aria-label="Notifications">${icons.bell}</button><span class="pip hidden" id="bellPip"></span>
        <div class="dropdown hidden" id="bellDd"><div class="dd-head">Notifications <button class="btn sm ghost" id="markRead">Mark all read</button></div><div class="dd-list" id="bellList"></div></div></div>
      <div class="user-menu"><button class="avatar" id="meBtn" title="${esc(user.name)}">${initials(user.name)}</button>
        <div class="dropdown hidden" id="meDd" style="width:260px">
          <div class="dd-head" style="display:block"><div>${esc(user.name)}</div><small>@${esc(user.username)}</small></div>
          <button class="menu-item" id="enableNotif">${icons.bell} Enable desktop alerts</button>
          <button class="menu-item" id="logoutBtn">${icons.logout} Sign out</button>
        </div></div>`;
    document.body.prepend(el);

    const bellDd = el.querySelector('#bellDd'), meDd = el.querySelector('#meDd');
    el.querySelector('#bellBtn').onclick = (e) => { e.stopPropagation(); meDd.classList.add('hidden'); bellDd.classList.toggle('hidden'); };
    el.querySelector('#meBtn').onclick = (e) => { e.stopPropagation(); bellDd.classList.add('hidden'); meDd.classList.toggle('hidden'); };
    document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) { bellDd.classList.add('hidden'); meDd.classList.add('hidden'); } });
    el.querySelector('#logoutBtn').onclick = logout;
    el.querySelector('#enableNotif').onclick = async () => {
      if (!('Notification' in window)) return toast('Not supported', 'This browser does not support desktop alerts.', 'error');
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Desktop alerts on' : 'Alerts blocked', p === 'granted' ? 'You will be alerted even when this tab is in the background.' : 'Allow notifications in your browser settings.');
    };
    el.querySelector('#markRead').onclick = async () => { await api('/notifications/read', { method: 'POST' }); notifs.forEach((n) => (n.read = true)); renderBell(); };

    let notifs = [];
    const renderBell = () => {
      const unread = notifs.filter((n) => !n.read).length;
      const pip = el.querySelector('#bellPip');
      pip.textContent = unread > 9 ? '9+' : unread;
      pip.classList.toggle('hidden', !unread);
      el.querySelector('#bellList').innerHTML = notifs.length ? notifs.map((n) => `
        <div class="notif ${n.read ? '' : 'unread'}" data-order="${n.orderId || ''}"><div class="ni">${icons.bell}</div>
        <div class="grow"><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<time>${ago(n.createdAt)}</time></div></div>`).join('')
        : `<div class="empty" style="padding:28px"><b>You're all caught up</b>No notifications yet.</div>`;
      el.querySelectorAll('.notif[data-order]').forEach((n) => n.onclick = () => {
        bellDd.classList.add('hidden');
        if (n.dataset.order) window.dispatchEvent(new CustomEvent('dv:open-order', { detail: Number(n.dataset.order) }));
      });
    };
    api('/notifications').then((n) => { notifs = n; renderBell(); }).catch(() => {});

    return {
      push(n) { notifs.unshift(n); renderBell(); chime(); toast(n.title, n.body); systemNotify(n.title, n.body); },
    };
  }

  // ----------------------------------------------------------------- socket
  function connect(bar) {
    const s = io({ auth: { token: store.token } });
    s.on('notification', (n) => bar?.push(n));
    s.on('connect_error', (e) => { if (e.message === 'unauthorized') logout(); });
    return s;
  }

  // -------------------------------------------------------------------- maps
  const pinIcon = (kind) => L.divIcon({
    className: '', iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36],
    html: `<div class="pin ${kind}">${kind === 'home' ? icons.home : icons.clinic}</div>`,
  });
  const riderIcon = (off) => L.divIcon({ className: '', iconSize: [44, 44], iconAnchor: [22, 22], html: `<div class="rider-pin ${off ? 'off' : ''}">${icons.bike}</div>` });

  function makeMap(el, center = DEFAULT_CENTER, zoom = 13) {
    const m = L.map(el, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    setTimeout(() => m.invalidateSize(), 50);
    return m;
  }

  const routeCache = new Map();
  /** Road route between two points via the public OSRM server; falls back to a straight line. */
  async function route(a, b) {
    const key = [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(4)).join(',');
    if (routeCache.has(key)) return routeCache.get(key);
    let result;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      const rt = j.routes?.[0];
      if (!rt) throw new Error('no route');
      result = { points: rt.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), km: rt.distance / 1000, min: rt.duration / 60, road: true };
    } catch {
      const km = haversine(a, b);
      result = { points: [a, b], km, min: km * 3.5, road: false };
    }
    routeCache.set(key, result);
    return result;
  }

  function haversine(a, b) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Smoothly glide a Leaflet marker to a new position. */
  function glide(marker, to, ms = 900) {
    const from = marker.getLatLng();
    const start = performance.now();
    cancelAnimationFrame(marker._dvAnim);
    const stepFn = (now) => {
      const k = Math.min(1, (now - start) / ms);
      marker.setLatLng([from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k]);
      if (k < 1) marker._dvAnim = requestAnimationFrame(stepFn);
    };
    marker._dvAnim = requestAnimationFrame(stepFn);
  }

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location is not available in this browser.'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(new Error('Location permission was denied. Tap the map to set your location instead.')),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function reverseGeocode({ lat, lng }) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`);
      const j = await r.json();
      return j.display_name || '';
    } catch { return ''; }
  }

  window.DV = {
    icons, LOGO, store, api, logout, requireRole, HOME, DEFAULT_CENTER,
    esc, money, toDate, time, dateTime, ago, initials, statusBadge, payBadge, stepper, STATUS,
    toast, fail, modal, busy, topbar, connect, chime,
    makeMap, pinIcon, riderIcon, route, haversine, glide, locate, reverseGeocode,
  };
})();
