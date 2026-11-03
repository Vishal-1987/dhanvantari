/* Admin console: live overview, orders, clinics, riders, clinic logins, medicines. */
(async function () {
  const { icons, api, esc, money, toast, fail, modal, busy } = DV;
  const me = await DV.requireRole('admin');
  const bar = DV.topbar(me, { roleLabel: 'Administrator' });
  const socket = DV.connect(bar);
  const nav = document.getElementById('nav'), main = document.getElementById('main');

  const state = { view: 'overview', orders: [], clinics: [], riders: [], staff: [], meds: [], stats: null, filter: 'all' };
  let liveMap = null; const riderMarkers = new Map();

  const VIEWS = [
    ['overview', icons.chart, 'Overview'], ['orders', icons.box, 'Orders'],
    ['grp', 'Network'], ['clinics', icons.clinic, 'Clinics & hubs'], ['riders', icons.bike, 'Delivery partners'], ['staff', icons.users, 'Clinic logins'],
    ['grp', 'Catalogue'], ['medicines', icons.pill, 'Medicines'],
  ];

  async function load() {
    [state.orders, state.clinics, state.riders, state.staff, state.meds, state.stats] = await Promise.all([
      api('/orders'), api('/clinics'), api('/admin/users?role=rider'), api('/admin/users?role=clinic'), api('/medicines?all=1'), api('/admin/stats'),
    ]);
  }

  function renderNav() {
    const active = state.orders.filter((o) => ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status)).length;
    nav.innerHTML = VIEWS.map(([k, ic, label]) => k === 'grp' ? `<div class="grp">${ic}</div>`
      : `<button class="${state.view === k ? 'active' : ''}" data-v="${k}">${ic} ${label}${k === 'orders' && active ? `<span class="cnt">${active}</span>` : ''}</button>`).join('');
    nav.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { state.view = b.dataset.v; render(); }));
  }

  function render() {
    renderNav();
    liveMap = null; riderMarkers.clear();
    ({ overview, orders: ordersView, clinics: clinicsView, riders: ridersView, staff: staffView, medicines: medsView })[state.view]();
  }

  const head = (title, sub, action = '') => `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;

  // ---- overview --------------------------------------------------------------
  function overview() {
    const s = state.stats;
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });
    const byDay = Object.fromEntries(s.last7.map((r) => [r.d, r]));
    const maxN = Math.max(1, ...s.last7.map((r) => r.n));
    main.innerHTML = head(`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${esc(me.name.split(' ')[0])}`, 'Live view of your Ayurvedic delivery network.') + `
      <div class="stats">
        ${tile(icons.box, 'Orders today', s.ordersToday, `${s.activeOrders} in progress`)}
        ${tile(icons.rupee, 'Revenue today', money(s.revenueToday), `${money(s.revenueTotal)} delivered all-time`)}
        ${tile(icons.bike, 'Riders online', `${s.ridersOnline}<small style="font-size:16px;color:var(--ink-3)"> / ${s.riders}</small>`, 'Delivery partners on duty')}
        ${tile(icons.clinic, 'Active clinics', s.clinics, `${s.customers} registered customers`)}
        ${tile(icons.pill, 'Medicines', s.medicines, s.lowStock ? `<span style="color:var(--clay)">${s.lowStock} low on stock</span>` : 'Stock healthy')}
      </div>
      <div class="two">
        <div class="card" style="overflow:hidden"><div class="card-head"><h3>Live network map</h3><div class="map-legend"><span style="--c:var(--forest)">Clinic</span><span style="--c:var(--sky)">Rider online</span><span style="--c:#8a948f">Offline</span></div></div>
          <div class="map" id="lmap" style="height:420px;border-radius:0"></div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card"><div class="card-head"><h3>Orders · last 7 days</h3></div><div class="card-body">
            <div class="bars">${days.map((d) => { const r = byDay[d]; return `<div class="b" title="${r ? r.n + ' orders · ' + money(r.revenue) : 'No orders'}"><small>${r?.n || ''}</small><i style="height:${((r?.n || 0) / maxN) * 120}px"></i><small>${new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>`; }).join('')}</div></div></div>
          <div class="card"><div class="card-head"><h3>Needs attention</h3></div>${attention()}</div>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>Latest orders</h3><button class="btn sm ghost" id="allOrders">View all</button></div>${orderTable(state.orders.slice(0, 8))}</div>`;
    main.querySelector('#allOrders').onclick = () => { state.view = 'orders'; render(); };
    bindOrderRows();

    liveMap = DV.makeMap(main.querySelector('#lmap'), DV.DEFAULT_CENTER, 12);
    const pts = [];
    state.clinics.forEach((c) => { L.marker([c.lat, c.lng], { icon: DV.pinIcon('clinic') }).addTo(liveMap).bindPopup(`<b>${esc(c.name)}</b>`); pts.push([c.lat, c.lng]); });
    state.riders.filter((r) => r.lat != null && r.active).forEach((r) => {
      riderMarkers.set(r.id, L.marker([r.lat, r.lng], { icon: DV.riderIcon(!r.online), zIndexOffset: 1000 }).addTo(liveMap).bindPopup(`<b>${esc(r.name)}</b><br>${r.online ? 'Online' : 'Offline'}`));
      pts.push([r.lat, r.lng]);
    });
    state.orders.filter((o) => ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status)).forEach((o) => {
      L.marker([o.lat, o.lng], { icon: DV.pinIcon('home') }).addTo(liveMap).bindPopup(`<b>${esc(o.code)}</b><br>${esc(o.customer.name)}`);
    });
    if (pts.length > 1) liveMap.fitBounds(pts, { padding: [40, 40] });
  }
  const tile = (ic, k, v, s) => `<div class="card stat"><div class="k"><span class="si">${ic}</span>${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

  function attention() {
    const now = Date.now();
    const age = (o) => (now - DV.toDate(o.updatedAt).getTime()) / 60000;
    const items = [
      ...state.orders.filter((o) => o.status === 'placed' && age(o) > 5).map((o) => [o, `Not accepted by clinic for ${Math.round(age(o))} min`]),
      ...state.orders.filter((o) => ['ready', 'accepted'].includes(o.status) && !o.rider).map((o) => [o, 'No delivery partner assigned']),
    ].slice(0, 6);
    const low = state.meds.filter((m) => m.active && m.stock < 20).slice(0, 4);
    if (!items.length && !low.length) return `<div class="empty" style="padding:28px"><div class="ei">${icons.check}</div><b>All clear</b>Nothing needs your attention.</div>`;
    return `<div>${items.map(([o, t]) => `<div class="notif" data-o="${o.id}"><div class="ni" style="background:var(--saffron-soft);color:#8d5a12">${icons.clock}</div><div class="grow"><b>${esc(o.code)} · ${esc(o.clinic.name.split(' — ')[1] || o.clinic.name)}</b><p>${t}</p></div></div>`).join('')}
      ${low.map((m) => `<div class="notif" data-med="${m.id}"><div class="ni" style="background:var(--clay-soft);color:var(--clay)">${icons.pill}</div><div class="grow"><b>${esc(m.name)}</b><p>Only ${m.stock} left in stock</p></div></div>`).join('')}</div>`;
  }

  // ---- orders ------------------------------------------------------------------
  function orderTable(list) {
    if (!list.length) return `<div class="empty"><div class="ei">${icons.box}</div><b>No orders</b></div>`;
    return `<div class="table-wrap"><table class="t"><thead><tr><th>Order</th><th>Customer</th><th>Clinic</th><th>Rider</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th></tr></thead><tbody>
      ${list.map((o) => `<tr class="click" data-o="${o.id}"><td><b>${esc(o.code)}</b></td><td>${esc(o.customer.name)}</td><td>${esc(o.clinic.name.split(' — ')[1] || o.clinic.name)}</td>
        <td>${o.rider ? esc(o.rider.name) : '<small>—</small>'}</td><td>${money(o.total)}</td><td>${DV.payBadge(o)}</td><td>${DV.statusBadge(o.status)}</td><td><small>${DV.ago(o.createdAt)}</small></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function bindOrderRows() {
    main.querySelectorAll('[data-o]').forEach((el) => (el.onclick = () => openOrder(Number(el.dataset.o))));
    main.querySelectorAll('[data-med]').forEach((el) => (el.onclick = () => { state.view = 'medicines'; render(); }));
  }
  function openOrder(id) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) return;
    const can = !['delivered', 'cancelled'].includes(o.status);
    const md = OrderView.open(o, { actions: `<button class="btn ghost" data-close>Close</button>${can ? `<button class="btn danger" id="ovCancel">Cancel order</button>` : ''}` });
    md.querySelector('#ovCancel')?.addEventListener('click', async (e) => {
      const note = prompt('Reason for cancelling (shared with the customer):', 'Cancelled by Dhanvantari support');
      if (note === null) return;
      await busy(e.currentTarget, async () => {
        try { upsert(await api(`/orders/${o.id}/status`, { method: 'POST', body: { status: 'cancelled', note } })); md.close(); toast('Order cancelled'); render(); }
        catch (ex) { fail(ex); }
      });
    });
  }

  function ordersView() {
    const F = [['all', 'All'], ['live', 'In progress'], ['placed', 'New'], ['picked_up', 'Out for delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];
    const list = state.orders.filter((o) => state.filter === 'all' || (state.filter === 'live' ? ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status) : o.status === state.filter));
    main.innerHTML = head('Orders', 'Every order across all clinics, updated live.') +
      `<div class="filters">${F.map(([k, l]) => `<button class="chip ${state.filter === k ? 'active' : ''}" data-f="${k}" style="height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--line);background:${state.filter === k ? 'var(--forest)' : '#fff'};color:${state.filter === k ? '#fff' : 'var(--ink-2)'};cursor:pointer;font:500 13px var(--font)">${l}</button>`).join('')}</div>
      <div class="card">${orderTable(list)}</div>`;
    main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; render(); }));
    bindOrderRows();
  }

  // ---- clinics -------------------------------------------------------------------
  function clinicsView() {
    main.innerHTML = head('Clinics & hubs', 'Ayurvedic medicine hubs and clinics that fulfil orders. Customers are routed to the nearest active one.', `<button class="btn" id="addClinic">${icons.plus} Add clinic</button>`) + `
      <div class="card" style="overflow:hidden;margin-bottom:16px"><div class="map" id="cmap" style="height:300px;border-radius:0"></div></div>
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Type</th><th>Vaidya</th><th>Phone</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody>
      ${state.clinics.map((c) => `<tr><td><b>${esc(c.name)}</b><br><small>${esc(c.address)}</small></td><td>${c.kind === 'clinic' ? '<span class="badge sky">Clinic</span>' : '<span class="badge">Hub</span>'}</td>
        <td>${esc(c.vaidya || '—')}</td><td>${esc(c.phone || '—')}</td><td>${state.orders.filter((o) => o.clinic.id === c.id).length}</td>
        <td>${c.active ? '<span class="badge dot">Active</span>' : '<span class="badge dot grey">Paused</span>'}</td>
        <td><button class="btn sm ghost" data-toggle="${c.id}">${c.active ? 'Pause' : 'Activate'}</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
    const map = DV.makeMap(main.querySelector('#cmap'), DV.DEFAULT_CENTER, 11);
    state.clinics.forEach((c) => L.marker([c.lat, c.lng], { icon: DV.pinIcon('clinic') }).addTo(map).bindPopup(esc(c.name)));
    if (state.clinics.length > 1) map.fitBounds(state.clinics.map((c) => [c.lat, c.lng]), { padding: [40, 40] });
    main.querySelector('#addClinic').onclick = addClinic;
    main.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => busy(b, async () => {
      const c = state.clinics.find((x) => x.id === Number(b.dataset.toggle));
      try { await api(`/admin/clinics/${c.id}`, { method: 'PATCH', body: { active: !c.active } }); state.clinics = await api('/clinics'); render(); }
      catch (e) { fail(e); }
    })));
  }

  function addClinic() {
    let pos = null;
    const md = modal('Add clinic or hub', `
      <form id="cf">
        <div class="grid2"><label class="field"><span>Name</span><input class="input" name="name" required placeholder="Ayurveda Hub — Koramangala" /></label>
          <label class="field"><span>Type</span><select class="input" name="kind"><option value="hub">Medicine hub</option><option value="clinic">Clinic (with vaidya)</option></select></label></div>
        <label class="field"><span>Address</span><input class="input" name="address" required /></label>
        <div class="grid2"><label class="field"><span>Phone</span><input class="input" name="phone" /></label>
          <label class="field"><span>Vaidya / physician</span><input class="input" name="vaidya" placeholder="Dr. …, BAMS" /></label></div>
        <label class="field"><span>Opening hours</span><input class="input" name="hours" value="9:00 AM – 9:00 PM" /></label>
        <label class="field"><span>Location — click the map to place the pin</span></label>
        <div class="map" id="amap" style="height:260px;border-radius:12px"></div>
      </form>`, { wide: true, foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn" id="cSave">Save clinic</button>` });
    const map = DV.makeMap(md.querySelector('#amap'), DV.DEFAULT_CENTER, 11);
    let mk;
    map.on('click', async (e) => {
      pos = e.latlng;
      mk ? mk.setLatLng(pos) : (mk = L.marker(pos, { icon: DV.pinIcon('clinic') }).addTo(map));
      const a = md.querySelector('[name=address]');
      if (!a.value) a.value = await DV.reverseGeocode(pos);
    });
    md.querySelector('#cSave').onclick = (e) => busy(e.currentTarget, async () => {
      const f = Object.fromEntries(new FormData(md.querySelector('#cf')));
      try {
        await api('/admin/clinics', { method: 'POST', body: { ...f, lat: pos?.lat, lng: pos?.lng } });
        state.clinics = await api('/clinics'); md.close(); toast('Clinic added', 'Create a clinic login so staff can receive orders.'); render();
      } catch (ex) { fail(ex); }
    });
  }

  // ---- people --------------------------------------------------------------------
  function peopleTable(list, cols) {
    return `<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Name</th><th>Username</th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}<th>Status</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td><div class="row" style="gap:10px"><div class="avatar">${DV.initials(u.name)}</div><div><b>${esc(u.name)}</b><br><small>${esc(u.phone || '')}</small></div></div></td><td><code>${esc(u.username)}</code></td>
        ${cols.map((c) => `<td>${c[1](u)}</td>`).join('')}
        <td>${u.active ? '<span class="badge dot">Active</span>' : '<span class="badge dot clay">Disabled</span>'}</td>
        <td><div class="row" style="gap:6px"><button class="btn sm ghost" data-pw="${u.id}">Reset password</button><button class="btn sm ghost" data-act="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'Disable' : 'Enable'}</button></div></td></tr>`).join('')
        || `<tr><td colspan="${cols.length + 4}" class="muted" style="text-align:center;padding:24px">None yet</td></tr>`}
      </tbody></table></div></div>`;
  }
  function bindPeople(reload) {
    main.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => busy(b, async () => {
      try { await api(`/admin/users/${b.dataset.act}`, { method: 'PATCH', body: { active: b.dataset.on === '1' } }); await reload(); render(); } catch (e) { fail(e); }
    })));
    main.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = async () => {
      const pw = prompt('New password (min 6 characters):');
      if (!pw) return;
      try { await api(`/admin/users/${b.dataset.pw}`, { method: 'PATCH', body: { password: pw } }); toast('Password updated'); } catch (e) { fail(e); }
    }));
  }

  function ridersView() {
    main.innerHTML = head('Delivery partners', 'Riders receive new order alerts when online and share live location while delivering.', `<button class="btn" id="add">${icons.plus} Add rider</button>`) +
      peopleTable(state.riders, [
        ['Vehicle', (u) => esc(u.vehicle || '—')],
        ['Duty', (u) => u.online ? '<span class="badge dot sky">Online</span>' : '<span class="badge dot grey">Offline</span>'],
        ['Deliveries', (u) => state.orders.filter((o) => o.rider?.id === u.id && o.status === 'delivered').length],
        ['Last seen', (u) => u.lastSeen ? `<small>${DV.ago(u.lastSeen)}</small>` : '<small>—</small>'],
      ]);
    main.querySelector('#add').onclick = () => addUser('rider');
    bindPeople(async () => (state.riders = await api('/admin/users?role=rider')));
  }

  function staffView() {
    main.innerHTML = head('Clinic logins', 'Staff accounts that receive and pack orders for a clinic.', `<button class="btn" id="add">${icons.plus} Add clinic login</button>`) +
      peopleTable(state.staff, [['Clinic', (u) => esc(state.clinics.find((c) => c.id === u.clinicId)?.name || '—')]]);
    main.querySelector('#add').onclick = () => addUser('clinic');
    bindPeople(async () => (state.staff = await api('/admin/users?role=clinic')));
  }

  function addUser(role) {
    const md = modal(role === 'rider' ? 'Add delivery partner' : 'Add clinic login', `
      <form id="uf">
        <label class="field"><span>Full name</span><input class="input" name="name" required /></label>
        <div class="grid2"><label class="field"><span>Username</span><input class="input" name="username" required /></label>
          <label class="field"><span>Temporary password</span><input class="input" name="password" type="text" minlength="6" required /></label></div>
        <label class="field"><span>Mobile</span><input class="input" name="phone" type="tel" /></label>
        ${role === 'rider' ? `<label class="field"><span>Vehicle</span><input class="input" name="vehicle" placeholder="Bike · KA 01 AB 1234" /></label>`
          : `<label class="field"><span>Clinic</span><select class="input" name="clinicId">${state.clinics.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>`}
      </form>`, { foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn" id="uSave">Create account</button>` });
    md.querySelector('#uSave').onclick = (e) => busy(e.currentTarget, async () => {
      const f = Object.fromEntries(new FormData(md.querySelector('#uf')));
      try {
        await api('/admin/users', { method: 'POST', body: { ...f, role } });
        if (role === 'rider') state.riders = await api('/admin/users?role=rider'); else state.staff = await api('/admin/users?role=clinic');
        md.close(); toast('Account created', `Share the username and password with ${f.name}.`); render();
      } catch (ex) { fail(ex); }
    });
  }

  // ---- medicines -----------------------------------------------------------------
  function medsView() {
    main.innerHTML = head('Medicines', `${state.meds.length} Ayurvedic products. Edit price and stock inline.`, `<button class="btn" id="addMed">${icons.plus} Add medicine</button>`) + `
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Medicine</th><th>Category</th><th>Form · pack</th><th>Price (₹)</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${state.meds.map((m) => `<tr data-id="${m.id}"><td><b>${esc(m.name)}</b> ${m.rx ? '<span class="badge rx">Rx</span>' : ''}</td><td>${esc(m.category)}</td><td>${esc(m.form)} · ${esc(m.pack)}</td>
        <td><input class="inline-input" data-f="price" type="number" min="1" value="${m.price}" /></td>
        <td><input class="inline-input" data-f="stock" type="number" min="0" value="${m.stock}" style="${m.stock < 20 ? 'border-color:var(--clay);color:var(--clay)' : ''}" /></td>
        <td>${m.active ? '<span class="badge dot">Listed</span>' : '<span class="badge dot grey">Hidden</span>'}</td>
        <td><div class="row" style="gap:6px"><button class="btn sm soft" data-save>Save</button><button class="btn sm ghost" data-vis="${m.active ? 0 : 1}">${m.active ? 'Hide' : 'List'}</button></div></td></tr>`).join('')}
      </tbody></table></div></div>`;
    main.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = Number(tr.dataset.id);
      const save = (body, btn) => busy(btn, async () => {
        try { const m = await api(`/admin/medicines/${id}`, { method: 'PATCH', body }); state.meds[state.meds.findIndex((x) => x.id === id)] = m; toast('Saved', m.name); render(); }
        catch (e) { fail(e); }
      });
      tr.querySelector('[data-save]').onclick = (e) => save({ price: Number(tr.querySelector('[data-f=price]').value), stock: Number(tr.querySelector('[data-f=stock]').value) }, e.currentTarget);
      tr.querySelector('[data-vis]').onclick = (e) => save({ active: e.currentTarget.dataset.vis === '1' }, e.currentTarget);
    });
    main.querySelector('#addMed').onclick = addMed;
  }

  function addMed() {
    const cats = [...new Set(state.meds.map((m) => m.category))];
    const forms = ['Churna', 'Vati', 'Arishta', 'Kashayam', 'Taila', 'Avaleha', 'Ghrita', 'Extract', 'Capsule'];
    const md = modal('Add medicine', `
      <form id="mf">
        <label class="field"><span>Name</span><input class="input" name="name" required placeholder="Punarnavadi Mandoor" /></label>
        <div class="grid2"><label class="field"><span>Category</span><input class="input" name="category" list="cats" required /><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label class="field"><span>Form</span><select class="input" name="form">${forms.map((f) => `<option>${f}</option>`).join('')}</select></label></div>
        <div class="grid2"><label class="field"><span>Pack size</span><input class="input" name="pack" required placeholder="60 tablets" /></label>
          <label class="field"><span>Opening stock</span><input class="input" name="stock" type="number" min="0" value="50" /></label></div>
        <div class="grid2"><label class="field"><span>Price (₹)</span><input class="input" name="price" type="number" min="1" required /></label>
          <label class="field"><span>MRP (₹)</span><input class="input" name="mrp" type="number" min="1" /></label></div>
        <label class="field"><span>Description (traditional use)</span><textarea class="input" name="description" rows="2"></textarea></label>
        <label class="field"><span>Key ingredients</span><input class="input" name="ingredients" /></label>
        <label class="field"><span>Suggested use</span><input class="input" name="dosage" /></label>
        <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="rx" /> Requires vaidya verification (Rx)</label>
      </form>`, { wide: true, foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn" id="mSave">Add medicine</button>` });
    md.querySelector('#mSave').onclick = (e) => busy(e.currentTarget, async () => {
      const f = Object.fromEntries(new FormData(md.querySelector('#mf')));
      try {
        await api('/admin/medicines', { method: 'POST', body: { ...f, rx: !!f.rx } });
        state.meds = await api('/medicines?all=1'); md.close(); toast('Medicine added', f.name); render();
      } catch (ex) { fail(ex); }
    });
  }

  // ---- realtime --------------------------------------------------------------------
  const upsert = (o) => { const i = state.orders.findIndex((x) => x.id === o.id); i >= 0 ? (state.orders[i] = o) : state.orders.unshift(o); };
  let statsTimer;
  socket.on('order:update', (o) => {
    upsert(o);
    clearTimeout(statsTimer);
    statsTimer = setTimeout(async () => { state.stats = await api('/admin/stats'); if (state.view === 'overview') render(); }, 400);
    if (state.view === 'orders') render(); else renderNav();
    if (OrderView.openId === o.id) openOrder(o.id);
  });
  socket.on('rider:location', (p) => {
    const r = state.riders.find((x) => x.id === p.riderId);
    if (r) { r.lat = p.lat; r.lng = p.lng; }
    if (p.orderId) OrderView.moveRider(p);
    if (!liveMap) return;
    const m = riderMarkers.get(p.riderId);
    if (m) DV.glide(m, p);
    else if (r) riderMarkers.set(r.id, L.marker([p.lat, p.lng], { icon: DV.riderIcon(!r.online), zIndexOffset: 1000 }).addTo(liveMap).bindPopup(esc(r.name)));
  });
  socket.on('rider:presence', ({ riderId, online }) => {
    const r = state.riders.find((x) => x.id === riderId);
    if (r) r.online = online;
    riderMarkers.get(riderId)?.setIcon(DV.riderIcon(!online));
    if (state.view === 'riders') render();
  });
  window.addEventListener('dv:open-order', (e) => openOrder(e.detail));

  await load();
  render();
})();
