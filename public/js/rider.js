/* Delivery partner app: go online, accept requests, share live GPS, pick up & deliver. */
(async function () {
  const { icons, api, esc, money, toast, fail, busy } = DV;
  let me = await DV.requireRole('rider');
  const bar = DV.topbar(me, { roleLabel: 'Delivery partner' });
  const socket = DV.connect(bar);
  const side = document.getElementById('side');

  const state = {
    pool: await api('/orders?pool=1'),
    mine: await api('/orders'),
    pos: me.lat != null ? { lat: me.lat, lng: me.lng } : null,
    gps: 'off', // off | on | denied
    sim: null,
    fresh: new Set(),
    legText: '',
  };
  const activeJobs = () => state.mine.filter((o) => ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status));

  // ---- map ------------------------------------------------------------------
  const map = DV.makeMap(document.getElementById('map'), state.pos || DV.DEFAULT_CENTER, 13);
  let riderMarker = null;
  const layer = L.layerGroup().addTo(map);
  let routeLayer = L.layerGroup().addTo(map);
  let lastFitKey = '';

  function setRiderMarker() {
    if (!state.pos) return;
    if (!riderMarker) riderMarker = L.marker([state.pos.lat, state.pos.lng], { icon: DV.riderIcon(!me.online), zIndexOffset: 1000 }).addTo(map).bindPopup('You');
    else { DV.glide(riderMarker, state.pos, 800); riderMarker.setIcon(DV.riderIcon(!me.online)); }
  }

  async function drawMap() {
    layer.clearLayers();
    const job = activeJobs()[0];
    const pts = state.pos ? [[state.pos.lat, state.pos.lng]] : [];
    if (job) {
      L.marker([job.clinic.lat, job.clinic.lng], { icon: DV.pinIcon('clinic') }).addTo(layer).bindPopup(`<b>Pickup</b><br>${esc(job.clinic.name)}`);
      L.marker([job.lat, job.lng], { icon: DV.pinIcon('home') }).addTo(layer).bindPopup(`<b>Drop</b><br>${esc(job.customer.name)}<br>${esc(job.address)}`);
      pts.push([job.clinic.lat, job.clinic.lng], [job.lat, job.lng]);
    } else {
      for (const o of state.pool) {
        L.marker([o.clinic.lat, o.clinic.lng], { icon: DV.pinIcon('clinic') }).addTo(layer).bindPopup(`<b>${esc(o.code)}</b><br>Pickup: ${esc(o.clinic.name)}`);
        pts.push([o.clinic.lat, o.clinic.lng]);
      }
    }
    setRiderMarker();
    const key = (job ? job.id + job.status : 'pool' + state.pool.length);
    if (key !== lastFitKey && pts.length) { lastFitKey = key; pts.length > 1 ? map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 }) : map.setView(pts[0], 14); }
    await drawRoute();
  }

  async function drawRoute() {
    const job = activeJobs()[0];
    routeLayer.clearLayers();
    if (!job || !state.pos) { state.legText = ''; return; }
    const toClinic = job.status !== 'picked_up';
    const legs = toClinic ? [[state.pos, job.clinic], [job.clinic, job]] : [[state.pos, job]];
    const rts = await Promise.all(legs.map(([a, b]) => DV.route(a, b)));
    routeLayer.clearLayers();
    rts.forEach((r, i) => L.polyline(r.points.map((p) => [p.lat, p.lng]), { color: i === 0 ? '#2b6cb0' : '#17402f', weight: 6, opacity: i === 0 ? .9 : .45, dashArray: r.road ? null : '8 8' }).addTo(routeLayer));
    const el = document.getElementById('legInfo');
    state.legText = `${rts[0].km.toFixed(1)} km · ~${Math.max(1, Math.round(rts[0].min))} min to ${toClinic ? 'pickup' : 'drop'}`;
    if (el) el.textContent = state.legText;
  }

  // ---- location sharing ------------------------------------------------------
  let watchId = null, lastSent = 0;
  function sendPos(p, force) {
    state.pos = p;
    setRiderMarker();
    const now = Date.now();
    if (force || now - lastSent > 2500) { lastSent = now; socket.emit('rider:location', p); }
  }
  function startGps() {
    if (watchId != null || !navigator.geolocation) { if (!navigator.geolocation) state.gps = 'denied'; return; }
    watchId = navigator.geolocation.watchPosition(
      (g) => {
        state.gps = 'on';
        if (state.sim) return; // simulation drives the marker
        sendPos({ lat: g.coords.latitude, lng: g.coords.longitude, heading: g.coords.heading ?? undefined });
        renderGps(); drawRouteThrottled();
      },
      () => { state.gps = 'denied'; renderGps(); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  }
  function stopGps() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; state.gps = 'off'; }
  let lastRouteDraw = 0;
  function drawRouteThrottled() { if (Date.now() - lastRouteDraw > 10000) { lastRouteDraw = Date.now(); drawRoute(); } }

  function renderGps() {
    const el = document.getElementById('gps');
    if (!el) return;
    const t = state.sim ? 'Simulated ride in progress' : { on: 'Sharing live GPS location', denied: 'GPS unavailable — allow location access, or use “Simulate ride” for a demo', off: 'Location sharing off' }[state.gps];
    el.className = 'gps ' + (state.gps === 'on' || state.sim ? 'on' : '');
    el.innerHTML = `<i></i>${t}`;
  }

  // Demo helper: drive along the real road route so customers can see live tracking without moving.
  async function simulate(job) {
    stopSim();
    const from = state.pos || { lat: job.clinic.lat + 0.01, lng: job.clinic.lng - 0.01 };
    const to = job.status === 'picked_up' ? job : job.clinic;
    const r = await DV.route(from, to);
    const pts = densify(r.points, 70);
    let i = 0;
    state.sim = setInterval(() => {
      if (i >= pts.length) { stopSim(); toast(job.status === 'picked_up' ? 'Arrived at customer' : 'Arrived at clinic', job.status === 'picked_up' ? 'Hand over the order and mark it delivered.' : 'Collect the package and confirm pickup.'); return; }
      const p = pts[i++], q = pts[Math.min(i, pts.length - 1)];
      sendPos({ lat: p.lat, lng: p.lng, heading: bearing(p, q) }, true);
    }, 1000);
    renderSide();
  }
  function stopSim() { if (state.sim) { clearInterval(state.sim); state.sim = null; renderSide(); drawRoute(); } }
  function densify(points, n) {
    if (points.length < 2) return points;
    const segs = []; let total = 0;
    for (let i = 1; i < points.length; i++) { const d = DV.haversine(points[i - 1], points[i]); segs.push(d); total += d; }
    const out = [];
    for (let k = 0; k <= n; k++) {
      let t = (total * k) / n, j = 0;
      while (j < segs.length - 1 && t > segs[j]) { t -= segs[j]; j++; }
      const f = segs[j] ? Math.min(1, t / segs[j]) : 0, a = points[j], b = points[j + 1];
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
    }
    return out;
  }
  const bearing = (a, b) => (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;

  // ---- sidebar -----------------------------------------------------------------
  function renderSide() {
    const job = activeJobs()[0];
    const done = state.mine.filter((o) => o.status === 'delivered');
    const today = done.filter((o) => DV.toDate(o.updatedAt).toDateString() === new Date().toDateString());
    side.innerHTML = `
      <div class="card duty">
        <div class="avatar" style="width:44px;height:44px;background:${me.online ? 'var(--sage-soft)' : '#eee'}">${icons.bike}</div>
        <div class="grow"><b>${me.online ? 'You are online' : 'You are offline'}</b><small>${me.online ? 'Receiving delivery requests nearby' : 'Go online to receive orders'}</small></div>
        <label class="switch"><input type="checkbox" id="duty" ${me.online ? 'checked' : ''}/><span></span></label>
      </div>
      <div id="gps" class="gps"></div>
      <div class="kpis">
        <div class="card"><b>${today.length}</b><small>Today</small></div>
        <div class="card"><b>${done.length}</b><small>All-time</small></div>
        <div class="card"><b>${money(today.reduce((s, o) => s + o.deliveryFee, 0))}</b><small>Fees today</small></div>
      </div>
      ${job ? jobCard(job) : ''}
      <div>
        <div class="row" style="justify-content:space-between;margin:4px 0 10px"><h3 style="margin:0">Delivery requests</h3><button class="btn sm ghost" id="refresh">${icons.refresh}</button></div>
        ${!me.online ? `<div class="card empty"><div class="ei">${icons.bike}</div><b>You're offline</b>Switch on duty to see requests.</div>`
          : state.pool.length ? state.pool.map(reqCard).join('')
          : `<div class="card empty"><div class="ei">${icons.bell}</div><b>No requests right now</b>We'll alert you when a clinic nearby gets an order.</div>`}
      </div>`;
    renderGps();

    side.querySelector('#duty').onchange = (e) => setOnline(e.target.checked);
    side.querySelector('#refresh').onclick = (e) => busy(e.currentTarget, refresh);
    side.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => busy(b, () => claim(Number(b.dataset.claim)))));
    side.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => busy(b, () => setStatus(Number(b.dataset.id), b.dataset.st))));
    side.querySelector('#sim')?.addEventListener('click', () => (state.sim ? stopSim() : simulate(job)));
  }

  function jobCard(o) {
    const picked = o.status === 'picked_up';
    const dest = picked ? o : o.clinic;
    const waiting = !['ready', 'picked_up'].includes(o.status);
    return `<div class="card job">
      <div class="job-top"><div class="row" style="justify-content:space-between"><b>Active delivery · ${esc(o.code)}</b>${DV.statusBadge(o.status)}</div>
        <small id="legInfo">${state.legText || 'Calculating route…'}</small></div>
      <div class="stop ${picked ? 'done' : ''}"><div class="sd" style="background:var(--forest)">${icons.clinic}</div><div class="grow"><small>PICKUP</small><br><b>${esc(o.clinic.name)}</b><br><small>${esc(o.clinic.address)}</small></div>
        ${o.clinic.phone ? `<a class="btn sm ghost" href="tel:${esc(o.clinic.phone)}">${icons.phone}</a>` : ''}</div>
      <div class="stop"><div class="sd" style="background:var(--saffron)">${icons.home}</div><div class="grow"><small>DROP</small><br><b>${esc(o.customer.name)}</b><br><small>${esc(o.address)}</small>
        ${o.notes ? `<br><span class="badge saffron" style="margin-top:6px">${esc(o.notes)}</span>` : ''}</div>
        ${o.customer.phone ? `<a class="btn sm ghost" href="tel:${esc(o.customer.phone)}">${icons.phone}</a>` : ''}</div>
      <div style="padding:14px 18px">
        <div class="sum"><span>${o.items.reduce((s, i) => s + i.qty, 0)} item(s)</span><span>${o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' ? `<b style="color:var(--clay)">Collect ${money(o.total)} cash</b>` : '<b style="color:var(--leaf)">Prepaid</b>'}</span></div>
        ${waiting ? `<p class="muted" style="font-size:13px;margin:8px 0">${icons.clock} The clinic is still packing. Head over — you'll be alerted when it's ready.</p>` : ''}
        <div class="row" style="margin-top:12px">
          <a class="btn ghost grow" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=two-wheeler">${icons.nav} Navigate</a>
          <button class="btn soft grow" id="sim">${state.sim ? `${icons.stop} Stop sim` : `${icons.play} Simulate ride`}</button>
        </div>
        ${o.status === 'ready' ? `<button class="btn lg block" style="margin-top:10px" data-st="picked_up" data-id="${o.id}">${icons.box} Confirm pickup</button>` : ''}
        ${picked ? `<button class="btn lg block saffron" style="margin-top:10px" data-st="delivered" data-id="${o.id}">${icons.check} Mark delivered${o.paymentMethod === 'cod' ? ' & cash collected' : ''}</button>` : ''}
      </div></div>`;
  }

  function reqCard(o) {
    const fromMe = state.pos ? DV.haversine(state.pos, o.clinic) : null;
    return `<div class="card req ${state.fresh.has(o.id) ? 'fresh' : ''}">
      <div class="row" style="justify-content:space-between"><b>${esc(o.code)}</b>${DV.statusBadge(o.status)}</div>
      <div style="font-size:13px;margin:8px 0;color:var(--ink-2)">
        <div>${icons.clinic} ${esc(o.clinic.name)}${fromMe != null ? ` · <b>${fromMe.toFixed(1)} km</b> from you` : ''}</div>
        <div style="margin-top:4px">${icons.home} Drop ${(o.distanceKm || 0).toFixed(1)} km · ${esc(o.address.split(',').slice(-2).join(',').trim())}</div></div>
      <div class="row" style="justify-content:space-between"><span><b>${money(o.deliveryFee || 25)}</b> <small>earning · ${o.paymentMethod === 'cod' ? 'COD' : 'prepaid'}</small></span>
        <button class="btn sm" data-claim="${o.id}" ${activeJobs().length ? 'disabled title="Finish your current delivery first"' : ''}>Accept</button></div></div>`;
  }

  // ---- actions -------------------------------------------------------------------
  async function setOnline(on) {
    try {
      if (on) startGps(); else { stopGps(); stopSim(); }
      me = await api('/rider/presence', { method: 'POST', body: { online: on, ...(state.pos || {}) } });
      if (on) await refresh(); else renderSide();
      setRiderMarker();
      toast(on ? 'You are online' : 'You are offline', on ? 'New delivery requests will alert you.' : '');
    } catch (e) { fail(e); }
  }
  async function refresh() {
    [state.pool, state.mine] = await Promise.all([api('/orders?pool=1'), api('/orders')]);
    renderSide(); drawMap();
  }
  async function claim(id) {
    try {
      const o = await api(`/orders/${id}/claim`, { method: 'POST' });
      state.pool = state.pool.filter((x) => x.id !== id);
      upsertMine(o);
      if (state.pos) sendPos(state.pos, true);
      toast('Delivery accepted', `Head to ${o.clinic.name} for pickup.`);
      renderSide(); drawMap();
    } catch (e) { fail(e); refresh(); }
  }
  async function setStatus(id, status) {
    try {
      stopSim();
      const o = await api(`/orders/${id}/status`, { method: 'POST', body: { status } });
      upsertMine(o);
      toast(status === 'picked_up' ? 'Pickup confirmed' : 'Delivered', status === 'picked_up' ? 'Customer is now tracking you live.' : 'Great work!');
      renderSide(); drawMap();
    } catch (e) { fail(e); }
  }
  const upsertMine = (o) => { const i = state.mine.findIndex((x) => x.id === o.id); i >= 0 ? (state.mine[i] = o) : state.mine.unshift(o); };

  // ---- realtime ----------------------------------------------------------------
  socket.on('pool:upsert', (o) => {
    const i = state.pool.findIndex((x) => x.id === o.id);
    if (i >= 0) state.pool[i] = o; else { state.pool.unshift(o); state.fresh.add(o.id); setTimeout(() => state.fresh.delete(o.id), 5000); }
    renderSide(); if (!activeJobs().length) drawMap();
  });
  socket.on('pool:remove', ({ id }) => {
    const before = state.pool.length;
    state.pool = state.pool.filter((x) => x.id !== id);
    if (before !== state.pool.length) { renderSide(); if (!activeJobs().length) drawMap(); }
  });
  socket.on('order:update', (o) => {
    if (o.rider?.id !== me.id) return;
    upsertMine(o); renderSide(); drawMap();
  });
  socket.on('connect', () => { if (me.online && state.pos) socket.emit('rider:location', state.pos); });

  if (me.online) startGps();
  renderSide();
  drawMap();
})();
