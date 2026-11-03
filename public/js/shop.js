/* Customer app: browse, cart, checkout, payment, live order tracking. */
(async function () {
  const { icons, api, esc, money, toast, fail, modal, busy } = DV;
  const me = await DV.requireRole('customer');
  const config = await api('/config');
  const app = document.getElementById('app');

  const state = {
    meds: [], clinics: [], orders: [],
    cart: loadCart(),
    loc: me.lat != null ? { lat: me.lat, lng: me.lng, address: me.address || '' } : null,
    view: 'shop', cat: 'All', q: '', trackId: null,
  };

  function loadCart() { try { return new Map(JSON.parse(localStorage.getItem('dv_cart') || '[]')); } catch { return new Map(); } }
  function saveCart() { try { localStorage.setItem('dv_cart', JSON.stringify([...state.cart])); } catch {} renderCartPip(); }

  // ---- top bar ----------------------------------------------------------
  const bar = DV.topbar(me, {
    roleLabel: 'Customer',
    extra: `<button class="loc-chip" id="locChip">${icons.pin}<span id="locText">Set delivery location</span></button>
            <button class="btn icon cart-btn" id="cartBtn" aria-label="Cart">${icons.cart}<span class="pip hidden" id="cartPip"></span></button>`,
  });
  document.getElementById('locChip').onclick = () => pickLocation();
  document.getElementById('cartBtn').onclick = () => openCart();
  const socket = DV.connect(bar);

  function renderLoc() {
    document.getElementById('locText').textContent = state.loc ? (state.loc.address || 'Pinned location').split(',').slice(0, 2).join(',') : 'Set delivery location';
  }
  function renderCartPip() {
    const n = [...state.cart.values()].reduce((a, b) => a + b, 0);
    const pip = document.getElementById('cartPip');
    pip.textContent = n; pip.classList.toggle('hidden', !n);
  }

  // ---- data -------------------------------------------------------------
  async function loadClinics() {
    const p = state.loc ? `?lat=${state.loc.lat}&lng=${state.loc.lng}` : '';
    state.clinics = await api('/clinics' + p);
  }
  const loadOrders = async () => { state.orders = await api('/orders'); };

  [state.meds] = await Promise.all([api('/medicines'), loadClinics(), loadOrders()]);
  // Drop cart lines that no longer exist.
  for (const id of state.cart.keys()) if (!state.meds.find((m) => m.id === id)) state.cart.delete(id);
  renderLoc(); renderCartPip();

  // ---- shell & views -----------------------------------------------------
  function render() {
    if (state.view === 'track') return renderTrack();
    const active = state.orders.filter((o) => ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status)).length;
    app.innerHTML = `
      <div class="page-head">
        <div class="tabs" role="tablist">
          <button class="tab ${state.view === 'shop' ? 'active' : ''}" data-v="shop">${icons.leaf} Medicines</button>
          <button class="tab ${state.view === 'clinics' ? 'active' : ''}" data-v="clinics">${icons.clinic} Nearby clinics</button>
          <button class="tab ${state.view === 'orders' ? 'active' : ''}" data-v="orders">${icons.box} My orders ${active ? `<span class="count">${active}</span>` : ''}</button>
        </div>
      </div>
      <div id="view"></div>
      <p class="disclaimer">Ayurvedic medicines should be taken under the guidance of a qualified Ayurvedic practitioner (vaidya). Items marked <b>Rx</b> are verified by the clinic before dispatch. Product descriptions reflect traditional use and are not medical advice.</p>`;
    app.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { state.view = b.dataset.v; render(); }));
    ({ shop: renderShop, clinics: renderClinics, orders: renderOrders })[state.view]();
  }

  function renderShop() {
    const v = document.getElementById('view');
    const near = state.clinics[0];
    const cats = ['All', ...new Set(state.meds.map((m) => m.category))];
    v.innerHTML = `
      <section class="welcome">
        <div><h1>Namaste, ${esc(me.name.split(' ')[0])}</h1><p>Classical Ayurvedic formulations, delivered from the clinic nearest to you.</p></div>
        <div class="near">${icons.clinic}<div>${near && state.loc
          ? `<b>${esc(near.name)}</b><small>${near.distanceKm.toFixed(1)} km away · ${esc(near.hours)}</small>`
          : `<b>Set your location</b><small>We'll match you to the nearest Ayurvedic hub</small>`}</div>
          ${state.loc ? '' : `<button class="btn sm saffron" id="setLoc">Set</button>`}</div>
      </section>
      <div class="toolbar">
        <div class="input-icon">${icons.search}<input class="input" id="q" placeholder="Search Ashwagandha, Triphala, Chyawanprash…" value="${esc(state.q)}" /></div>
      </div>
      <div class="chips">${cats.map((c) => `<button class="chip ${c === state.cat ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="products" id="grid"></div>`;
    v.querySelector('#setLoc')?.addEventListener('click', () => pickLocation());
    const q = v.querySelector('#q');
    q.oninput = () => { state.q = q.value; renderGrid(); };
    v.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
      state.cat = b.dataset.c;
      v.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b));
      renderGrid();
    }));
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById('grid');
    const q = state.q.trim().toLowerCase();
    const list = state.meds.filter((m) => (state.cat === 'All' || m.category === state.cat) &&
      (!q || [m.name, m.category, m.form, m.ingredients, m.description].join(' ').toLowerCase().includes(q)));
    if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="ei">${icons.search}</div><b>No medicines found</b>Try a different name or category.</div>`; return; }
    grid.innerHTML = list.map((m) => {
      const qty = state.cart.get(m.id) || 0;
      return `<article class="card product">
        <div class="art" style="background:${ART.bg(m)}" data-info="${m.id}">${ART.svg(m)}
          <div class="badges">${m.rx ? '<span class="badge rx">Rx</span>' : ''}${m.stock < 1 ? '<span class="badge clay">Out of stock</span>' : m.stock < 15 ? `<span class="badge saffron">Only ${m.stock} left</span>` : ''}</div></div>
        <div class="pb"><div class="cat">${esc(m.category)} · ${esc(m.form)}</div>
          <h4>${esc(m.name)}</h4><div class="pack">${esc(m.pack)}</div>
          <p class="desc">${esc(m.description)}</p>
          <div class="price-row"><div class="price">${money(m.price)}${m.mrp > m.price ? `<span class="mrp">${money(m.mrp)}</span>` : ''}</div>
            ${qty ? qtyCtl(m.id, qty) : `<button class="btn sm" data-add="${m.id}" ${m.stock < 1 ? 'disabled' : ''}>${icons.plus} Add</button>`}</div></div>
      </article>`;
    }).join('');
    bindQty(grid, renderGrid);
    grid.querySelectorAll('[data-info]').forEach((el) => (el.onclick = () => showMedicine(state.meds.find((m) => m.id === Number(el.dataset.info)))));
  }

  const qtyCtl = (id, qty) => `<div class="qty"><button data-dec="${id}" aria-label="Remove one">${icons.minus}</button><span>${qty}</span><button data-inc="${id}" aria-label="Add one">${icons.plus}</button></div>`;
  function bindQty(root, rerender) {
    root.querySelectorAll('[data-add],[data-inc]').forEach((b) => (b.onclick = () => {
      const id = Number(b.dataset.add || b.dataset.inc);
      const m = state.meds.find((x) => x.id === id);
      const next = (state.cart.get(id) || 0) + 1;
      if (next > Math.min(20, m.stock)) return toast('Limit reached', `You can order up to ${Math.min(20, m.stock)} of ${m.name}.`, 'error');
      state.cart.set(id, next); saveCart(); rerender();
    }));
    root.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => {
      const id = Number(b.dataset.dec);
      const n = (state.cart.get(id) || 0) - 1;
      n > 0 ? state.cart.set(id, n) : state.cart.delete(id);
      saveCart(); rerender();
    }));
  }

  function showMedicine(m) {
    const md = modal(m.name, `
      <div style="background:${ART.bg(m)};border-radius:14px;height:160px;display:grid;place-items:center;margin-bottom:16px">${ART.svg(m).replace('<svg', '<svg style="width:96px;height:96px"')}</div>
      <div class="row wrap" style="margin-bottom:12px"><span class="badge">${esc(m.category)}</span><span class="badge grey">${esc(m.form)} · ${esc(m.pack)}</span>${m.rx ? '<span class="badge rx">Rx · clinic verifies before dispatch</span>' : ''}</div>
      <p>${esc(m.description)}</p>
      <h4>Key ingredients</h4><p class="muted">${esc(m.ingredients || '—')}</p>
      <h4>Suggested use</h4><p class="muted">${esc(m.dosage || 'As directed by your vaidya')}</p>`,
      { foot: `<div class="price grow">${money(m.price)}${m.mrp > m.price ? `<span class="mrp">${money(m.mrp)}</span>` : ''}</div><button class="btn" id="mAdd" ${m.stock < 1 ? 'disabled' : ''}>${icons.cart} Add to cart</button>` });
    md.querySelector('#mAdd').onclick = () => {
      state.cart.set(m.id, Math.min((state.cart.get(m.id) || 0) + 1, 20)); saveCart();
      md.close(); toast('Added to cart', m.name); if (state.view === 'shop') renderGrid();
    };
  }

  function renderClinics() {
    const v = document.getElementById('view');
    v.innerHTML = `
      <div class="card" style="height:360px;margin-bottom:18px;overflow:hidden"><div class="map" id="cmap" style="height:100%"></div></div>
      ${state.loc ? '' : `<p class="muted">${icons.pin} Set your delivery location to see distances.</p>`}
      <div class="clinic-list">${state.clinics.map((c, i) => `
        <div class="card clinic-card"><div class="ch"><div class="ci">${icons.clinic}</div><div class="grow">
          <div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b>${i === 0 && state.loc ? '<span class="badge">Nearest</span>' : ''}</div>
          <small>${esc(c.address)}</small></div></div>
          <div class="row wrap" style="margin-top:12px;gap:8px">
            ${c.distanceKm != null ? `<span class="badge grey">${icons.route} ${c.distanceKm.toFixed(1)} km</span>` : ''}
            <span class="badge grey">${icons.clock} ${esc(c.hours)}</span>
            <span class="badge ${c.kind === 'clinic' ? 'sky' : ''}">${c.kind === 'clinic' ? 'Clinic + consultation' : 'Medicine hub'}</span></div>
          ${c.vaidya ? `<p style="margin:12px 0 0;font-size:13px">Vaidya: <b>${esc(c.vaidya)}</b></p>` : ''}
          <div class="row" style="margin-top:14px"><a class="btn sm ghost" href="tel:${esc(c.phone)}">${icons.phone} Call</a>
            <a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">${icons.nav} Directions</a></div>
        </div>`).join('')}</div>`;
    const map = DV.makeMap(document.getElementById('cmap'), state.loc || state.clinics[0] || DV.DEFAULT_CENTER, 12);
    const pts = [];
    state.clinics.forEach((c) => { L.marker([c.lat, c.lng], { icon: DV.pinIcon('clinic') }).addTo(map).bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.address)}`); pts.push([c.lat, c.lng]); });
    if (state.loc) { L.marker([state.loc.lat, state.loc.lng], { icon: DV.pinIcon('home') }).addTo(map).bindPopup('You'); pts.push([state.loc.lat, state.loc.lng]); }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }

  function renderOrders() {
    const v = document.getElementById('view');
    if (!state.orders.length) {
      v.innerHTML = `<div class="card empty"><div class="ei">${icons.box}</div><b>No orders yet</b>Your Ayurvedic orders will appear here.<div style="margin-top:16px"><button class="btn" id="goShop">Browse medicines</button></div></div>`;
      v.querySelector('#goShop').onclick = () => { state.view = 'shop'; render(); };
      return;
    }
    v.innerHTML = state.orders.map((o) => `
      <div class="card order-card" data-o="${o.id}">
        <div class="row wrap" style="justify-content:space-between">
          <div><b>Order ${esc(o.code)}</b> <small>· ${DV.dateTime(o.createdAt)}</small></div>
          <div class="row" style="gap:8px">${DV.payBadge(o)}${DV.statusBadge(o.status)}</div></div>
        <p class="muted" style="margin:8px 0 0">${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ')}</p>
        <div class="row wrap" style="justify-content:space-between;margin-top:10px">
          <small>${icons.clinic} ${esc(o.clinic.name)}</small><b>${money(o.total)}</b></div>
        ${o.status === 'awaiting_payment' ? `<div class="row" style="margin-top:12px"><button class="btn sm saffron" data-pay="${o.id}">${icons.rupee} Complete payment</button><button class="btn sm ghost" data-cancel="${o.id}">Cancel</button></div>` : ''}
      </div>`).join('');
    v.querySelectorAll('[data-o]').forEach((el) => (el.onclick = (e) => {
      if (e.target.closest('button')) return;
      openTrack(Number(el.dataset.o));
    }));
    v.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => pay(state.orders.find((o) => o.id === Number(b.dataset.pay)))));
    v.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => cancelOrder(Number(b.dataset.cancel))));
  }

  // ---- location picker ---------------------------------------------------
  function pickLocation() {
    return new Promise((resolve) => {
      let picked = state.loc ? { ...state.loc } : null;
      const md = modal('Delivery location', `
        <p class="muted" style="margin-top:-6px">Tap the map to drop a pin at your door, or use your current location.</p>
        <div class="map pick-map" id="pmap"></div>
        <div class="row" style="margin:12px 0"><button class="btn sm soft" id="gps">${icons.locate} Use my current location</button><small id="pcoords" class="muted"></small></div>
        <label class="field"><span>Full address (house no., street, landmark)</span><textarea class="input" id="paddr" rows="2" placeholder="Flat 12, 3rd Cross…">${esc(picked?.address || '')}</textarea></label>`,
        { wide: true, foot: `<button class="btn ghost" data-close>Cancel</button><button class="btn" id="psave">Save location</button>` });
      const map = DV.makeMap(md.querySelector('#pmap'), picked || state.clinics[0] || DV.DEFAULT_CENTER, picked ? 16 : 12);
      let marker = picked ? L.marker([picked.lat, picked.lng], { icon: DV.pinIcon('home'), draggable: true }).addTo(map) : null;
      const coords = md.querySelector('#pcoords'), addr = md.querySelector('#paddr');
      const set = async (ll, fill = true) => {
        picked = { lat: ll.lat, lng: ll.lng, address: addr.value };
        if (!marker) { marker = L.marker(ll, { icon: DV.pinIcon('home'), draggable: true }).addTo(map); marker.on('dragend', () => set(marker.getLatLng())); }
        else marker.setLatLng(ll);
        coords.textContent = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
        if (fill) { const a = await DV.reverseGeocode(ll); if (a && (!addr.value || addr.dataset.auto)) { addr.value = a; addr.dataset.auto = '1'; } }
      };
      marker?.on('dragend', () => set(marker.getLatLng()));
      if (picked) coords.textContent = `${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}`;
      addr.oninput = () => delete addr.dataset.auto;
      map.on('click', (e) => set(e.latlng));
      md.querySelector('#gps').onclick = (e) => busy(e.currentTarget, async () => {
        try { const p = await DV.locate(); map.setView([p.lat, p.lng], 17); await set(p); } catch (ex) { fail(ex); }
      });
      md.querySelector('#psave').onclick = async () => {
        if (!picked) return toast('Drop a pin first', 'Tap your location on the map.', 'error');
        if (!addr.value.trim()) return toast('Add your address', 'House number and street help the rider find you.', 'error');
        state.loc = { lat: picked.lat, lng: picked.lng, address: addr.value.trim() };
        api('/me', { method: 'PATCH', body: { address: state.loc.address, lat: state.loc.lat, lng: state.loc.lng } }).catch(() => {});
        await loadClinics();
        renderLoc(); md.close();
        if (state.view !== 'track') render();
        resolve(state.loc);
      };
      md.addEventListener('close', () => resolve(null));
    });
  }

  // ---- cart & checkout -----------------------------------------------------
  let drawer;
  function openCart() {
    closeCart();
    const bd = document.createElement('div');
    bd.className = 'backdrop'; bd.style.placeItems = 'end';
    drawer = document.createElement('aside');
    drawer.className = 'drawer';
    document.body.append(bd, drawer);
    bd.onclick = closeCart;
    drawer._bd = bd;
    renderCart();
  }
  function closeCart() { if (drawer) { drawer._bd.remove(); drawer.remove(); drawer = null; } }

  let checkout = { clinicId: null, pay: 'upi', notes: '' };
  async function renderCart() {
    if (!drawer) return;
    const lines = [...state.cart].map(([id, qty]) => ({ m: state.meds.find((x) => x.id === id), qty })).filter((l) => l.m);
    const head = `<div class="modal-head"><h3>Your cart</h3><button class="btn icon" id="cClose">${icons.x}</button></div>`;
    if (!lines.length) {
      drawer.innerHTML = head + `<div class="drawer-body"><div class="empty"><div class="ei">${icons.cart}</div><b>Your cart is empty</b>Add Ayurvedic medicines to get started.</div></div>`;
      drawer.querySelector('#cClose').onclick = closeCart;
      return;
    }
    let quote = null, quoteErr = '';
    if (state.loc) {
      try { quote = await api('/orders/quote', { method: 'POST', body: { items: lines.map((l) => ({ id: l.m.id, qty: l.qty })), clinicId: checkout.clinicId, lat: state.loc.lat, lng: state.loc.lng } }); }
      catch (e) { quoteErr = e.message; }
    }
    if (!drawer) return;
    const subtotal = lines.reduce((s, l) => s + l.m.price * l.qty, 0);
    const hasRx = lines.some((l) => l.m.rx);
    drawer.innerHTML = head + `<div class="drawer-body">
      ${lines.map(({ m, qty }) => `<div class="line"><div class="mini" style="background:${ART.bg(m)}">${ART.svg(m)}</div>
        <div class="grow"><b style="font-size:14px">${esc(m.name)}</b><br><small>${esc(m.pack)} · ${money(m.price)}</small></div>${qtyCtl(m.id, qty)}</div>`).join('')}
      ${hasRx ? `<p class="badge rx" style="height:auto;padding:8px 12px;margin-top:12px;white-space:normal;line-height:1.4">Your cart has Rx items. The clinic's vaidya will call to verify before dispatch.</p>` : ''}

      <div class="section-t">Deliver to</div>
      <div class="addr-box">${icons.home}<div class="grow">${state.loc ? `<div style="font-size:14px">${esc(state.loc.address)}</div>` : '<b>No location set</b>'}</div>
        <button class="btn sm ghost" id="cLoc">${state.loc ? 'Change' : 'Set'}</button></div>

      ${quote ? `<div class="section-t">Fulfilled by</div>
        <select class="input" id="cClinic">${quote.nearest.map((c) => `<option value="${c.id}" ${c.id === quote.clinic.id ? 'selected' : ''}>${esc(c.name)} — ${c.distanceKm.toFixed(1)} km</option>`).join('')}</select>
        <small style="display:block;margin-top:6px">${icons.clock} Estimated delivery in about ${quote.etaMin} min</small>` : ''}
      ${quoteErr ? `<p class="badge clay" style="margin-top:12px">${esc(quoteErr)}</p>` : ''}

      <div class="section-t">Payment</div>
      <div class="pay-opts">
        ${[['upi', icons.upi, 'UPI', 'Google Pay, PhonePe, Paytm, BHIM'], ['card', icons.card, 'Credit / debit card', 'Visa, Mastercard, RuPay'], ['cod', icons.cash, 'Cash on delivery', 'Pay the rider in cash or UPI at your door']]
          .map(([k, ic, t, s]) => `<label class="pay-opt"><input type="radio" name="pay" value="${k}" ${checkout.pay === k ? 'checked' : ''}/><div class="pi">${ic}</div><div><b>${t}</b><small>${s}</small></div></label>`).join('')}
      </div>
      <label class="field" style="margin-top:16px"><span>Note for clinic / rider (optional)</span><input class="input" id="cNotes" value="${esc(checkout.notes)}" placeholder="e.g. Call on arrival" /></label>

      <div style="margin-top:8px">
        <div class="sum"><span>Item total</span><span>${money(subtotal)}</span></div>
        <div class="sum"><span>Delivery ${quote ? `(${quote.distanceKm.toFixed(1)} km)` : ''}</span><span>${quote ? (quote.deliveryFee ? money(quote.deliveryFee) : '<b style="color:var(--leaf)">FREE</b>') : '—'}</span></div>
        ${quote && quote.deliveryFee && subtotal < config.freeDeliveryAbove ? `<small>Add ${money(config.freeDeliveryAbove - subtotal)} more for free delivery</small>` : ''}
        <div class="sum total"><span>To pay</span><span>${money(quote ? quote.total : subtotal)}</span></div>
      </div></div>
      <div class="drawer-foot"><button class="btn lg block" id="cPlace" ${quote ? '' : 'disabled'}>${state.loc ? `Place order · ${money(quote?.total ?? subtotal)}` : 'Set delivery location to continue'}</button></div>`;

    drawer.querySelector('#cClose').onclick = closeCart;
    drawer.querySelector('#cLoc').onclick = async () => { closeCart(); const l = await pickLocation(); openCart(); return l; };
    drawer.querySelector('#cClinic')?.addEventListener('change', (e) => { checkout.clinicId = Number(e.target.value); renderCart(); });
    drawer.querySelectorAll('[name=pay]').forEach((r) => (r.onchange = () => (checkout.pay = r.value)));
    drawer.querySelector('#cNotes').oninput = (e) => (checkout.notes = e.target.value);
    bindQty(drawer, () => { renderCart(); if (state.view === 'shop') renderGrid(); });
    drawer.querySelector('#cPlace').onclick = (e) => busy(e.currentTarget, () => placeOrder(lines, quote));
  }

  async function placeOrder(lines, quote) {
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          items: lines.map((l) => ({ id: l.m.id, qty: l.qty })), clinicId: quote.clinic.id,
          lat: state.loc.lat, lng: state.loc.lng, address: state.loc.address, notes: checkout.notes, paymentMethod: checkout.pay,
        },
      });
      state.cart.clear(); saveCart(); closeCart(); checkout.notes = ''; checkout.clinicId = null;
      state.meds = await api('/medicines');
      if (state.view === 'shop') renderGrid();
      upsertOrder(order);
      if (order.status === 'awaiting_payment') await pay(order);
      else { toast('Order placed', `${order.clinic.name} has been notified.`); openTrack(order.id); }
    } catch (e) { fail(e); }
  }

  async function pay(order) {
    if (config.payments.razorpay) return payRazorpay(order);
    const md = modal('Secure payment', `
      <div class="gateway">
        <div class="avatar" style="margin:0 auto;width:56px;height:56px;background:var(--sage-soft);color:var(--forest)">${order.paymentMethod === 'card' ? icons.card : icons.upi}</div>
        <div class="muted" style="margin-top:12px">Order ${esc(order.code)} · ${order.paymentMethod === 'card' ? 'Card' : 'UPI'}</div>
        <div class="amt">${money(order.total)}</div>
        <div class="gw-note"><b>Demo payment gateway.</b> No money will be charged. Add your Razorpay keys on the server (see README) to accept real UPI and card payments.</div>
      </div>`, { foot: `<button class="btn ghost" data-close>Pay later</button><button class="btn" id="gwPay">${icons.lock} Pay ${money(order.total)}</button>` });
    md.querySelector('#gwPay').onclick = (e) => busy(e.currentTarget, async () => {
      try {
        await new Promise((r) => setTimeout(r, 900));
        const paid = await api(`/orders/${order.id}/pay/demo`, { method: 'POST' });
        upsertOrder(paid); md.close();
        toast('Payment successful', `${paid.clinic.name} has been notified.`);
        openTrack(paid.id);
      } catch (ex) { fail(ex); }
    });
    md.addEventListener('close', () => { if (state.view !== 'track') { state.view = 'orders'; render(); } });
  }

  async function payRazorpay(order) {
    try {
      if (!window.Razorpay) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment gateway.')); document.head.appendChild(s); });
      const r = await api(`/orders/${order.id}/pay/razorpay`, { method: 'POST' });
      const rz = new Razorpay({
        key: r.keyId, order_id: r.gatewayOrderId, amount: r.amount, currency: r.currency, name: 'Dhanvantari', description: `Order ${r.code}`,
        prefill: { name: me.name, contact: me.phone || '', email: me.email || '' },
        method: { upi: order.paymentMethod === 'upi', card: order.paymentMethod === 'card', netbanking: false, wallet: false },
        theme: { color: '#17402f' },
        handler: async (resp) => {
          try { const paid = await api(`/orders/${order.id}/pay/razorpay/verify`, { method: 'POST', body: resp }); upsertOrder(paid); toast('Payment successful', `${paid.clinic.name} has been notified.`); openTrack(paid.id); }
          catch (e) { fail(e); }
        },
        modal: { ondismiss: () => { state.view = 'orders'; render(); } },
      });
      rz.open();
    } catch (e) { fail(e); }
  }

  async function cancelOrder(id) {
    if (!confirm('Cancel this order?')) return;
    try { upsertOrder(await api(`/orders/${id}/status`, { method: 'POST', body: { status: 'cancelled' } })); toast('Order cancelled'); state.meds = await api('/medicines'); render(); }
    catch (e) { fail(e); }
  }

  function upsertOrder(o) {
    const i = state.orders.findIndex((x) => x.id === o.id);
    i >= 0 ? (state.orders[i] = o) : state.orders.unshift(o);
  }

  // ---- live tracking -------------------------------------------------------
  let track = null; // { map, home, clinic, rider, line, lastRoute }
  function openTrack(id) { state.view = 'track'; state.trackId = id; render(); window.scrollTo(0, 0); }

  function renderTrack() {
    const o = state.orders.find((x) => x.id === state.trackId);
    if (!o) { state.view = 'orders'; return render(); }
    const live = ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status);
    app.innerHTML = `
      <div class="page-head"><div class="row"><button class="btn ghost" id="back">← My orders</button><div><h2 style="margin:0">Order ${esc(o.code)}</h2><small>${DV.dateTime(o.createdAt)}</small></div></div>
        <div class="row" style="gap:8px">${DV.payBadge(o)}${DV.statusBadge(o.status)}</div></div>
      <div class="track">
        <div class="card" style="overflow:hidden;position:relative"><div class="map" id="tmap"></div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card pad">
            ${live ? `<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:14px"><div><small>${o.status === 'picked_up' ? 'Arriving in' : 'Estimated delivery'}</small><div class="eta" id="eta">—</div></div><small id="dist"></small></div>` : ''}
            ${DV.stepper(o)}
            <p class="muted" style="margin:14px 0 0;font-size:14px" id="statusLine">${statusLine(o)}</p>
          </div>
          ${o.rider ? `<div class="rider-card"><div class="avatar">${DV.initials(o.rider.name)}</div><div class="grow"><b>${esc(o.rider.name)}</b><br><small>${esc(o.rider.vehicle || 'Delivery partner')}</small></div>
            ${o.rider.phone ? `<a class="btn sm" href="tel:${esc(o.rider.phone)}">${icons.phone} Call</a>` : ''}</div>` : live ? `<div class="card pad row"><div class="spin dark"></div><div>Finding a delivery partner near the clinic…</div></div>` : ''}
          <div class="card pad"><div class="row" style="align-items:flex-start"><div class="avatar" style="background:var(--forest);color:#fff">${icons.clinic}</div>
            <div class="grow"><b>${esc(o.clinic.name)}</b><br><small>${esc(o.clinic.address)}</small>${o.clinic.vaidya ? `<br><small>Vaidya: ${esc(o.clinic.vaidya)}</small>` : ''}</div>
            ${o.clinic.phone ? `<a class="btn sm ghost" href="tel:${esc(o.clinic.phone)}">${icons.phone}</a>` : ''}</div></div>
          <div class="card pad">
            <h4>Items</h4>
            ${o.items.map((i) => `<div class="sum"><span>${esc(i.name)} <small>× ${i.qty}</small></span><span>${money(i.lineTotal)}</span></div>`).join('')}
            <div class="sum"><span>Delivery</span><span>${o.deliveryFee ? money(o.deliveryFee) : 'FREE'}</span></div>
            <div class="sum total"><span>Total</span><span>${money(o.total)}</span></div>
            <p style="margin:12px 0 0;font-size:13px" class="muted">${icons.home} ${esc(o.address)}</p>
            ${o.status === 'placed' || o.status === 'awaiting_payment' ? `<button class="btn sm ghost" style="margin-top:12px" id="tCancel">Cancel order</button>` : ''}
            ${o.status === 'awaiting_payment' ? `<button class="btn sm saffron" style="margin:12px 0 0 8px" id="tPay">Complete payment</button>` : ''}
          </div>
        </div>
      </div>`;
    app.querySelector('#back').onclick = () => { track = null; state.view = 'orders'; render(); };
    app.querySelector('#tCancel')?.addEventListener('click', () => cancelOrder(o.id));
    app.querySelector('#tPay')?.addEventListener('click', () => pay(o));

    const map = DV.makeMap(document.getElementById('tmap'), o, 14);
    track = { orderId: o.id, map };
    track.home = L.marker([o.lat, o.lng], { icon: DV.pinIcon('home') }).addTo(map).bindPopup('Your delivery address');
    track.clinic = L.marker([o.clinic.lat, o.clinic.lng], { icon: DV.pinIcon('clinic') }).addTo(map).bindPopup(esc(o.clinic.name));
    const pts = [[o.lat, o.lng], [o.clinic.lat, o.clinic.lng]];
    if (o.riderLocation && live) {
      track.rider = L.marker([o.riderLocation.lat, o.riderLocation.lng], { icon: DV.riderIcon(), zIndexOffset: 1000 }).addTo(map).bindPopup(esc(o.rider?.name || 'Rider'));
      pts.push([o.riderLocation.lat, o.riderLocation.lng]);
    }
    map.fitBounds(pts, { padding: [60, 60] });
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => { const d = L.DomUtil.create('div', 'card map-legend'); d.style.padding = '8px 12px'; d.innerHTML = `<span style="--c:var(--saffron)">You</span><span style="--c:var(--forest)">Clinic</span><span style="--c:var(--sky)">Rider</span>`; return d; };
    legend.addTo(map);
    updateRoute(o, true);
  }

  function statusLine(o) {
    return {
      awaiting_payment: 'Complete payment to send your order to the clinic.',
      placed: 'Waiting for the clinic to accept your order.',
      accepted: 'The clinic is preparing and packing your medicines.',
      ready: o.rider ? `Packed. ${esc(o.rider.name)} is heading to the clinic for pickup.` : 'Packed and waiting for a delivery partner.',
      picked_up: `${esc(o.rider?.name || 'Your rider')} has picked up your order and is on the way.`,
      delivered: 'Delivered. Thank you for choosing Ayurveda!',
      cancelled: 'This order was cancelled. Any online payment will be refunded within 5–7 days.',
    }[o.status];
  }

  async function updateRoute(o, force = false) {
    if (!track || track.orderId !== o.id) return;
    const live = ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status);
    const etaEl = document.getElementById('eta'), distEl = document.getElementById('dist');
    const now = Date.now();
    if (!force && track.lastRoute && now - track.lastRoute < 12000) return;
    track.lastRoute = now;

    const r = o.riderLocation;
    let legs;
    if (o.status === 'picked_up' && r) legs = [[r, o]];
    else if (r && live) legs = [[r, o.clinic], [o.clinic, o]];
    else legs = [[o.clinic, o]];
    const routes = await Promise.all(legs.map(([a, b]) => DV.route(a, b)));
    if (!track || track.orderId !== o.id) return;
    track.line?.remove();
    track.line = L.layerGroup(routes.map((rt, i) => L.polyline(rt.points.map((p) => [p.lat, p.lng]), {
      color: i === routes.length - 1 ? '#17402f' : '#2b6cb0', weight: 5, opacity: .8, dashArray: rt.road ? null : '8 8',
    }))).addTo(track.map);
    if (etaEl && live) {
      const prep = { placed: 12, accepted: 8, ready: 2, picked_up: 0 }[o.status];
      const min = Math.max(1, Math.round(prep + routes.reduce((s, rt) => s + rt.min, 0) * 1.15));
      const km = routes.reduce((s, rt) => s + rt.km, 0);
      etaEl.textContent = `${min} min`;
      distEl.textContent = `${km.toFixed(1)} km ${o.status === 'picked_up' ? 'away' : 'total route'}`;
    }
  }

  // ---- realtime --------------------------------------------------------------
  socket.on('order:update', (o) => {
    const prev = state.orders.find((x) => x.id === o.id);
    upsertOrder(o);
    if (state.view === 'track' && state.trackId === o.id) {
      if (!prev || prev.status !== o.status || (!prev.rider && o.rider)) renderTrack();
    } else if (state.view === 'orders') render();
  });

  socket.on('rider:location', (p) => {
    const o = state.orders.find((x) => x.id === p.orderId);
    if (!o) return;
    o.riderLocation = { lat: p.lat, lng: p.lng, heading: p.heading, at: p.at };
    if (state.view !== 'track' || state.trackId !== o.id || !track) return;
    if (!track.rider) track.rider = L.marker([p.lat, p.lng], { icon: DV.riderIcon(), zIndexOffset: 1000 }).addTo(track.map).bindPopup(esc(o.rider?.name || 'Rider'));
    else DV.glide(track.rider, p);
    if (!track.map.getBounds().pad(-0.1).contains([p.lat, p.lng])) track.map.panTo([p.lat, p.lng]);
    updateRoute(o);
  });

  window.addEventListener('dv:open-order', (e) => { if (state.orders.find((o) => o.id === e.detail)) openTrack(e.detail); });

  // Deep link: /shop#order-12
  const m = location.hash.match(/order-(\d+)/);
  if (m) openTrack(Number(m[1])); else render();
  if (!state.loc) setTimeout(() => toast('Set your delivery location', 'We will match you to the nearest Ayurvedic clinic.'), 600);
})();
