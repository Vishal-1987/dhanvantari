/* Customer app: storefront, product details, cart, checkout, payment, live order tracking. */
(async function () {
  const { icons, api, esc, money, toast, fail, modal, busy } = DV;
  const me = await DV.requireRole('customer');
  const config = await api('/config');
  const app = document.getElementById('app');

  const CONCERN_ICON = {
    'Immunity': icons.shield, 'Digestion': icons.flame, 'Stress & Sleep': icons.moon, 'Respiratory': icons.wind,
    'Joint & Pain': icons.activity, 'Heart & BP': icons.heart, 'Diabetes Care': icons.droplet, 'Skin & Hair': icons.sparkles,
    "Women's Health": icons.flower, 'Daily Wellness': icons.sun,
  };
  const SORTS = { popular: 'Most popular', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low', name: 'Name A–Z' };

  const state = {
    meds: [], clinics: [], orders: [],
    cart: loadCart(),
    loc: me.lat != null ? { lat: me.lat, lng: me.lng, address: me.address || '' } : null,
    view: 'shop', cat: 'All', q: '', sort: 'popular', trackId: null,
  };

  function loadCart() { try { return new Map(JSON.parse(localStorage.getItem('dv_cart') || '[]')); } catch { return new Map(); } }
  function saveCart() { try { localStorage.setItem('dv_cart', JSON.stringify([...state.cart])); } catch {} renderCartPip(); }

  const NAV = [['shop', icons.leaf, 'Shop'], ['clinics', icons.clinic, 'Clinics'], ['orders', icons.box, 'Orders']];

  // ---- top bar, bottom nav, footer -------------------------------------------
  const bar = DV.topbar(me, {
    roleLabel: 'Customer',
    nav: `<nav class="topnav" id="topnav"></nav>`,
    extra: `<button class="loc-chip" id="locChip">${icons.pin}<div style="min-width:0"><small>Deliver to</small><span id="locText">Set location</span></div></button>
            <button class="btn icon cart-btn" id="cartBtn" aria-label="Cart">${icons.cart}<span class="pip hidden" id="cartPip"></span></button>`,
  });
  document.getElementById('locChip').onclick = () => pickLocation();
  document.getElementById('cartBtn').onclick = () => openCart();
  const socket = DV.connect(bar);

  function renderNav() {
    const active = state.orders.filter((o) => ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status)).length;
    const view = state.view === 'track' ? 'orders' : state.view;
    const html = (cls) => NAV.map(([k, ic, label]) => `<button class="${view === k ? 'active' : ''}" data-v="${k}">${ic}<span>${label}</span>${k === 'orders' && active ? `<span class="count">${active}</span>` : ''}</button>`).join('')
      + (cls === 'bottom' ? `<button data-cart>${icons.cart}<span>Cart</span>${cartCount() ? `<span class="count">${cartCount()}</span>` : ''}</button>` : '');
    const top = document.getElementById('topnav'), bottom = document.getElementById('bottomnav');
    top.innerHTML = html('top'); bottom.innerHTML = html('bottom');
    [top, bottom].forEach((n) => {
      n.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => go(b.dataset.v)));
      n.querySelector('[data-cart]')?.addEventListener('click', openCart);
    });
  }
  function go(view) { state.view = view; track = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  document.getElementById('footer').innerHTML = `
    <div class="inner">
      <div><a class="brand" href="/shop"><div class="brand-mark">${DV.LOGO}</div><div><div class="brand-name">Dhanvantari</div><div class="brand-sub">Pure Ayurveda, delivered</div></div></a>
        <p style="margin-top:16px;max-width:320px">Classical Ayurvedic formulations from verified hubs and clinics near you, packed by practitioners and tracked to your door.</p></div>
      <div><h4>Shop</h4><ul><li>Immunity</li><li>Digestion</li><li>Stress &amp; Sleep</li><li>Joint &amp; Pain</li></ul></div>
      <div><h4>Our promise</h4><ul><li>Authentic classical texts</li><li>Vaidya-verified Rx items</li><li>Live delivery tracking</li><li>Secure payments</li></ul></div>
      <div><h4>Need help?</h4><ul><li>${icons.phone} +91 90000 00000</li><li>Open 8 AM – 10 PM</li><li>Bengaluru, India</li></ul></div>
    </div>
    <div class="legal"><span>© ${new Date().getFullYear()} Dhanvantari Ayurveda</span>
      <span>Ayurvedic medicines should be taken under the guidance of a qualified vaidya. Descriptions reflect traditional use and are not medical advice.</span></div>`;

  function renderLoc() {
    document.getElementById('locText').textContent = state.loc ? (state.loc.address || 'Pinned location').split(',').slice(0, 2).join(',') : 'Set location';
  }
  const cartCount = () => [...state.cart.values()].reduce((a, b) => a + b, 0);
  function renderCartPip() {
    const n = cartCount();
    const pip = document.getElementById('cartPip');
    pip.textContent = n; pip.classList.toggle('hidden', !n);
    renderNav();
  }
  function bumpCart() { const b = document.getElementById('cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }

  // ---- data -------------------------------------------------------------
  async function loadClinics() {
    const p = state.loc ? `?lat=${state.loc.lat}&lng=${state.loc.lng}` : '';
    state.clinics = await api('/clinics' + p);
  }
  const loadOrders = async () => { state.orders = await api('/orders'); };

  try {
    [state.meds] = await Promise.all([api('/medicines'), loadClinics(), loadOrders()]);
  } catch {
    app.innerHTML = `<div class="card empty" style="max-width:520px;margin:40px auto"><div class="ei">${icons.refresh}</div><b>We couldn't load the store</b>Please check your internet connection and try again.
      <div style="margin-top:16px"><button class="btn" onclick="location.reload()">${icons.refresh} Try again</button></div></div>`;
    return;
  }
  for (const id of state.cart.keys()) if (!state.meds.find((m) => m.id === id)) state.cart.delete(id);
  const bestsellers = () => new Set(state.meds.filter((m) => m.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 4).map((m) => m.id));
  renderLoc(); renderCartPip();

  // ---- shell -------------------------------------------------------------
  function render() {
    renderNav();
    if (state.view === 'track') return renderTrack();
    ({ shop: renderShop, clinics: renderClinics, orders: renderOrders })[state.view]();
  }

  // ---- storefront --------------------------------------------------------
  function renderShop() {
    const near = state.clinics[0];
    const eta = near && state.loc ? Math.round(15 + near.distanceKm * 4) : null;
    const cats = [...new Set(state.meds.map((m) => m.category))];
    const picks = state.meds.filter((m) => m.featured);
    app.innerHTML = `
      <section class="hero">
        <svg class="mandala" viewBox="0 0 200 200" fill="none" stroke="#fff" stroke-width=".6">
          <circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="70"/><circle cx="100" cy="100" r="44"/>
          ${[...Array(12)].map((_, i) => `<path transform="rotate(${i * 30} 100 100)" d="M100 4c14 22 14 44 0 66c-14-22-14-44 0-66Z"/>`).join('')}
        </svg>
        <div>
          <div class="eyebrow">Namaste, ${esc(me.name.split(' ')[0])}</div>
          <h1>Authentic Ayurveda,<br>from your <em>nearest vaidya</em> to your door.</h1>
          <p class="lead">${state.meds.length} classical formulations, sourced from verified Ayurvedic hubs and clinics, packed by practitioners and tracked live.</p>
          <form class="searchbar" id="heroSearch">${icons.search}<input id="hq" placeholder="Search Ashwagandha, Triphala, Chyawanprash…" value="${esc(state.q)}" autocomplete="off" />
            <button class="btn saffron" type="submit">Search</button></form>
          <div class="popular">Popular: ${['Ashwagandha', 'Triphala', 'Chyawanprash', 'Kumkumadi'].map((p) => `<button data-pop="${p}">${p}</button>`).join('')}</div>
        </div>
        <div class="deliver-card">
          ${near && state.loc ? `
            <div class="dc-top"><div class="dc-ic">${icons.clinic}</div><div class="grow"><small>Delivering from</small><div style="font-weight:700;line-height:1.3">${esc(near.name)}</div></div></div>
            <div class="dc-stats"><div><b>${near.distanceKm.toFixed(1)}</b><small>km away</small></div><div><b>~${eta}</b><small>minutes</small></div><div><b>${state.clinics.length}</b><small>clinics nearby</small></div></div>`
          : `<div class="dc-top"><div class="dc-ic">${icons.pin}</div><div class="grow"><b>Where should we deliver?</b><br><small>We match you to the nearest Ayurvedic hub.</small></div></div>
             <button class="btn block saffron" style="margin:16px 0" id="setLoc">${icons.locate} Set delivery location</button>`}
          <ul class="ticks"><li>${icons.check} Classical formulations, genuine stock</li><li>${icons.check} Rx items verified by a vaidya</li><li>${icons.check} Free delivery above ${money(config.freeDeliveryAbove)}</li></ul>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><div class="eyebrow">Shop by health concern</div><h2>What would you like support with?</h2></div></div>
        <div class="concerns">${cats.map((c) => `
          <button class="concern ${state.cat === c ? 'active' : ''}" data-cat="${esc(c)}" style="--c:${ART.color(c)};--bgc:${ART.palette(c)[0]}">
            <span class="ci">${CONCERN_ICON[c] || icons.leaf}</span><span><b>${esc(c)}</b><small>${state.meds.filter((m) => m.category === c).length} products</small></span></button>`).join('')}</div>
      </section>

      ${picks.length ? `<section class="section">
        <div class="section-head"><div><div class="eyebrow">${icons.award} Vaidya's picks</div><h2>Trusted classics our practitioners recommend</h2></div></div>
        <div class="picks" id="picks"></div></section>` : ''}

      <section class="section" id="catalog">
        <div class="section-head"><div><div class="eyebrow">Full catalogue</div><h2 id="catTitle"></h2></div></div>
        <div class="toolbar">
          <div class="chips" id="chips" style="flex:1;min-width:0"></div>
          <select class="input sort" id="sort" aria-label="Sort products">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${state.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="products" id="grid"></div>
      </section>

      <section class="section trust">
        ${[[icons.leaf, 'Authentic formulations', 'Made to classical texts by licensed Ayurvedic pharmacies.'],
           [icons.shield, 'Vaidya verified', 'Rx medicines are checked by the clinic’s physician before dispatch.'],
           [icons.truck, 'Live tracking', 'Watch your delivery partner on the map until your door.'],
           [icons.lock, 'Secure payments', 'UPI, cards or cash on delivery — whatever suits you.']]
          .map(([i, t, s]) => `<div class="card"><div class="ti">${i}</div><div><b>${t}</b><small>${s}</small></div></div>`).join('')}
      </section>`;

    app.querySelector('#setLoc')?.addEventListener('click', () => pickLocation());
    const hq = app.querySelector('#hq');
    hq.oninput = () => { state.q = hq.value; renderGrid(); };
    app.querySelector('#heroSearch').onsubmit = (e) => { e.preventDefault(); state.q = hq.value; renderGrid(); scrollToCatalog(); };
    app.querySelectorAll('[data-pop]').forEach((b) => (b.onclick = () => { hq.value = state.q = b.dataset.pop; state.cat = 'All'; renderShopParts(); scrollToCatalog(); }));
    app.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { state.cat = state.cat === b.dataset.cat ? 'All' : b.dataset.cat; renderShopParts(); scrollToCatalog(); }));
    app.querySelector('#sort').onchange = (e) => { state.sort = e.target.value; renderGrid(); };
    if (picks.length) { const p = app.querySelector('#picks'); p.innerHTML = picks.map(card).join(''); bindCards(p); }
    renderShopParts();
  }

  const scrollToCatalog = () => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  function renderShopParts() {
    const cats = ['All', ...new Set(state.meds.map((m) => m.category))];
    const chips = document.getElementById('chips');
    chips.innerHTML = cats.map((c) => `<button class="chip ${c === state.cat ? 'active' : ''}" data-c="${esc(c)}">${c === 'All' ? '' : CONCERN_ICON[c] || ''}${esc(c)}</button>`).join('');
    chips.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { state.cat = b.dataset.c; renderShopParts(); }));
    document.querySelectorAll('.concern').forEach((el) => el.classList.toggle('active', el.dataset.cat === state.cat));
    renderGrid();
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const list = state.meds.filter((m) => (state.cat === 'All' || m.category === state.cat) &&
      (!q || [m.name, m.category, m.form, m.ingredients, m.description, m.botanical, ...m.benefits].join(' ').toLowerCase().includes(q)));
    const by = {
      popular: (a, b) => b.sold - a.sold || b.featured - a.featured || a.name.localeCompare(b.name),
      'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
    }[state.sort];
    return list.sort(by);
  }

  function renderGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const list = filtered();
    document.getElementById('catTitle').innerHTML = `${state.q ? `Results for “${esc(state.q)}”` : state.cat === 'All' ? 'All Ayurvedic medicines' : esc(state.cat)} <small class="result-count">· ${list.length} products</small>`;
    if (!list.length) {
      grid.innerHTML = `<div class="card empty" style="grid-column:1/-1"><div class="ei">${icons.search}</div><b>No medicines found</b>Try a different name, herb or concern.<div style="margin-top:14px"><button class="btn ghost" id="clr">Clear search</button></div></div>`;
      grid.querySelector('#clr').onclick = () => { state.q = ''; state.cat = 'All'; const hq = document.getElementById('hq'); if (hq) hq.value = ''; renderShopParts(); };
      return;
    }
    grid.innerHTML = list.map(card).join('');
    bindCards(grid);
  }

  function card(m) {
    const qty = state.cart.get(m.id) || 0;
    const off = m.mrp > m.price ? Math.round((1 - m.price / m.mrp) * 100) : 0;
    const best = bestsellers().has(m.id);
    return `<article class="card lift product" data-id="${m.id}">
      <div class="shot" style="background:${ART.bg(m)}" data-info="${m.id}">${ART.svg(m)}
        <div class="tl">${best ? `<span class="badge solid-saffron">${icons.trend} Bestseller</span>` : m.featured ? `<span class="badge solid">${icons.award} Vaidya's pick</span>` : ''}${m.rx ? '<span class="badge rx">Rx</span>' : ''}
          ${m.stock < 1 ? '<span class="badge clay">Out of stock</span>' : m.stock < 15 ? `<span class="badge saffron">Only ${m.stock} left</span>` : ''}</div>
        ${off ? `<div class="tr"><span class="off">${off}% OFF</span></div>` : ''}</div>
      <div class="pb">
        ${m.botanical ? `<div class="bot">${esc(m.botanical)}</div>` : ''}
        <h4 data-info="${m.id}">${esc(m.name)}</h4>
        <div class="meta"><span>${esc(m.form)} · ${esc(m.pack)}</span>${dosha(m)}</div>
        <div class="price-row"><div class="price">${money(m.price)}${off ? `<span class="mrp">${money(m.mrp)}</span>` : ''}</div>
          ${qty ? qtyCtl(m.id, qty) : `<button class="btn sm" data-add="${m.id}" ${m.stock < 1 ? 'disabled' : ''}>${icons.plus} Add</button>`}</div>
      </div></article>`;
  }
  const dosha = (m) => m.dosha.length ? `<span class="dosha" title="Balances ${m.dosha.join(', ')}">${m.dosha.map((d) => `<span class="${d}">${d}</span>`).join('')}</span>` : '';

  function bindCards(root) {
    bindQty(root, () => refreshCards());
    root.querySelectorAll('[data-info]').forEach((el) => (el.onclick = () => showMedicine(state.meds.find((m) => m.id === Number(el.dataset.info)))));
  }
  /** Re-render only the price rows so cards don't flicker. */
  function refreshCards() {
    document.querySelectorAll('.product[data-id]').forEach((el) => {
      const m = state.meds.find((x) => x.id === Number(el.dataset.id));
      if (!m) return;
      const qty = state.cart.get(m.id) || 0;
      const row = el.querySelector('.price-row > :last-child');
      row.outerHTML = qty ? qtyCtl(m.id, qty) : `<button class="btn sm" data-add="${m.id}" ${m.stock < 1 ? 'disabled' : ''}>${icons.plus} Add</button>`;
    });
    document.querySelectorAll('.products, .picks').forEach((g) => bindQty(g, refreshCards));
  }

  const qtyCtl = (id, qty, lg = false) => `<div class="qty ${lg ? 'lg' : ''}"><button data-dec="${id}" aria-label="Remove one">${icons.minus}</button><span>${qty}</span><button data-inc="${id}" aria-label="Add one">${icons.plus}</button></div>`;
  function addToCart(id, n = 1) {
    const m = state.meds.find((x) => x.id === id);
    const next = (state.cart.get(id) || 0) + n;
    const cap = Math.min(20, m.stock);
    if (next > cap) { toast('Limit reached', `You can order up to ${cap} of ${m.name}.`, 'error'); return false; }
    state.cart.set(id, next); saveCart(); bumpCart();
    return true;
  }
  function bindQty(root, rerender) {
    root.querySelectorAll('[data-add],[data-inc]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      if (addToCart(Number(b.dataset.add || b.dataset.inc)) && b.dataset.add) toast('Added to cart', state.meds.find((m) => m.id === Number(b.dataset.add)).name);
      rerender();
    }));
    root.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.dec);
      const n = (state.cart.get(id) || 0) - 1;
      n > 0 ? state.cart.set(id, n) : state.cart.delete(id);
      saveCart(); rerender();
    }));
  }

  // ---- product detail ------------------------------------------------------
  function showMedicine(m) {
    let qty = 1;
    const off = m.mrp > m.price ? Math.round((1 - m.price / m.mrp) * 100) : 0;
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal xl" role="dialog" aria-modal="true" aria-label="${esc(m.name)}"><div class="pd">
      <div class="pd-shot" style="background:${ART.bg(m)}"><button class="btn icon pd-close" data-close aria-label="Close" style="background:#fff">${icons.x}</button>${ART.svg(m)}</div>
      <div class="pd-info">
        <div class="row wrap" style="gap:6px"><span class="badge">${CONCERN_ICON[m.category] || ''} ${esc(m.category)}</span>${m.featured ? `<span class="badge solid">${icons.award} Vaidya's pick</span>` : ''}${m.rx ? '<span class="badge rx">Rx</span>' : ''}</div>
        <h2>${esc(m.name)}</h2>
        ${m.botanical ? `<div class="bot">${esc(m.botanical)}</div>` : ''}
        <div class="pd-price"><span class="price">${money(m.price)}</span>${off ? `<span class="mrp">MRP ${money(m.mrp)}</span><span class="off">${off}% OFF</span>` : ''}</div>
        <small>${esc(m.form)} · ${esc(m.pack)} · Inclusive of all taxes</small>
        <p style="margin:16px 0 0;color:var(--ink-2)">${esc(m.description)}</p>
        ${m.benefits.length ? `<ul class="benefits">${m.benefits.map((b) => `<li>${icons.check}<span>${esc(b)}</span></li>`).join('')}</ul>` : ''}
        <dl class="facts">
          ${m.dosha.length ? `<div><dt>Balances</dt><dd>${dosha(m)}</dd></div>` : ''}
          <div><dt>Ingredients</dt><dd>${esc(m.ingredients || '—')}</dd></div>
          <div><dt>How to use</dt><dd>${esc(m.dosage || 'As directed by your vaidya')}</dd></div>
          <div><dt>Availability</dt><dd>${m.stock < 1 ? '<span style="color:var(--clay)">Out of stock</span>' : m.stock < 15 ? `Only ${m.stock} left` : 'In stock · ships from the nearest clinic'}</dd></div>
        </dl>
        ${m.rx ? `<p class="note rx" style="margin-top:16px">This medicine needs a vaidya's approval. The clinic will call you to verify before dispatch.</p>` : ''}
        <div class="pd-buy"><div id="pdQty"></div><button class="btn lg grow" id="pdAdd" ${m.stock < 1 ? 'disabled' : ''}>${icons.cart} Add to cart</button></div>
      </div></div></div>`;
    const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => e.key === 'Escape' && close();
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bd);
    const q = bd.querySelector('#pdQty');
    const drawQty = () => {
      q.innerHTML = qtyCtl(m.id, qty, true);
      q.querySelector('[data-dec]').onclick = () => { qty = Math.max(1, qty - 1); drawQty(); };
      q.querySelector('[data-inc]').onclick = () => { qty = Math.min(qty + 1, Math.max(1, Math.min(20, m.stock))); drawQty(); };
    };
    drawQty();
    bd.querySelector('#pdAdd').onclick = () => {
      if (!addToCart(m.id, qty)) return;
      close(); toast('Added to cart', `${m.name} × ${qty}`);
      refreshCards();
    };
  }

  // ---- clinics -------------------------------------------------------------
  function renderClinics() {
    app.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Our network</div><h1>Ayurvedic clinics near you</h1><p>Every order is packed by the nearest verified hub or clinic.</p></div>
        ${state.loc ? '' : `<button class="btn" id="setLoc">${icons.locate} Set my location</button>`}</div>
      <div class="card" style="height:380px;margin-bottom:20px;overflow:hidden"><div class="map" id="cmap" style="height:100%;border-radius:0"></div></div>
      <div class="clinic-list">${state.clinics.map((c, i) => `
        <div class="card lift clinic-card"><div class="ch"><div class="ci">${icons.clinic}</div><div class="grow">
          <div class="row" style="justify-content:space-between;align-items:flex-start"><b style="font-size:15.5px;line-height:1.35">${esc(c.name)}</b>${i === 0 && state.loc ? '<span class="badge solid">Nearest</span>' : ''}</div>
          <small>${esc(c.address)}</small></div></div>
          <div class="row wrap" style="margin-top:14px;gap:6px">
            ${c.distanceKm != null ? `<span class="badge grey">${icons.route} ${c.distanceKm.toFixed(1)} km</span>` : ''}
            <span class="badge grey">${icons.clock} ${esc(c.hours)}</span>
            <span class="badge ${c.kind === 'clinic' ? 'sky' : ''}">${c.kind === 'clinic' ? 'Clinic + consultation' : 'Medicine hub'}</span></div>
          ${c.services ? `<div class="services">${c.services.split('|').map((s) => `<span class="badge saffron">${esc(s)}</span>`).join('')}</div>` : ''}
          ${c.vaidya ? `<p style="margin:14px 0 0;font-size:13.5px">${icons.user} Vaidya: <b>${esc(c.vaidya)}</b></p>` : ''}
          <div class="row" style="margin-top:auto;padding-top:16px"><a class="btn sm ghost grow" href="tel:${esc(c.phone)}">${icons.phone} Call</a>
            <a class="btn sm ghost grow" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">${icons.nav} Directions</a></div>
        </div>`).join('')}</div>`;
    app.querySelector('#setLoc')?.addEventListener('click', () => pickLocation());
    const map = DV.makeMap(document.getElementById('cmap'), state.loc || state.clinics[0] || DV.DEFAULT_CENTER, 12);
    const pts = [];
    state.clinics.forEach((c) => { L.marker([c.lat, c.lng], { icon: DV.pinIcon('clinic') }).addTo(map).bindPopup(`<b>${esc(c.name)}</b><br>${esc(c.address)}`); pts.push([c.lat, c.lng]); });
    if (state.loc) { L.marker([state.loc.lat, state.loc.lng], { icon: DV.pinIcon('home') }).addTo(map).bindPopup('You'); pts.push([state.loc.lat, state.loc.lng]); }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }

  // ---- orders --------------------------------------------------------------
  function renderOrders() {
    const head = `<div class="page-head"><div><div class="eyebrow">Your account</div><h1>My orders</h1><p>Track live deliveries and view past orders.</p></div></div>`;
    if (!state.orders.length) {
      app.innerHTML = head + `<div class="card empty"><div class="ei">${icons.box}</div><b>No orders yet</b>Your Ayurvedic orders will appear here.<div style="margin-top:16px"><button class="btn" id="goShop">Browse medicines</button></div></div>`;
      app.querySelector('#goShop').onclick = () => go('shop');
      return;
    }
    app.innerHTML = head + state.orders.map((o) => {
      const thumbs = o.items.slice(0, 3).map((i) => state.meds.find((m) => m.id === i.id) || { ...i, category: '' });
      return `<div class="card lift order-card" data-o="${o.id}">
        <div class="thumbs">${thumbs.map((m) => `<div style="background:${ART.bg(m)}">${ART.svg(m)}</div>`).join('')}</div>
        <div class="grow">
          <div class="row wrap" style="justify-content:space-between;gap:8px"><div><b>Order ${esc(o.code)}</b> <small>· ${DV.dateTime(o.createdAt)}</small></div>
            <div class="row" style="gap:6px">${DV.payBadge(o)}${DV.statusBadge(o.status)}</div></div>
          <p class="muted" style="margin:6px 0 0;font-size:14px">${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ')}</p>
          <div class="row wrap" style="justify-content:space-between;margin-top:8px"><small>${icons.clinic} ${esc(o.clinic.name)}</small><b>${money(o.total)}</b></div>
          ${o.status === 'awaiting_payment' ? `<div class="row" style="margin-top:12px"><button class="btn sm saffron" data-pay="${o.id}">${icons.rupee} Complete payment</button><button class="btn sm ghost" data-cancel="${o.id}">Cancel</button></div>`
            : ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status) ? `<div style="margin-top:12px"><button class="btn sm soft">${icons.nav} Track live</button></div>` : ''}
        </div></div>`;
    }).join('');
    app.querySelectorAll('[data-o]').forEach((el) => (el.onclick = (e) => {
      if (e.target.closest('[data-pay],[data-cancel]')) return;
      openTrack(Number(el.dataset.o));
    }));
    app.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => pay(state.orders.find((o) => o.id === Number(b.dataset.pay)))));
    app.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => cancelOrder(Number(b.dataset.cancel))));
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
      let marker = null;
      const coords = md.querySelector('#pcoords'), addr = md.querySelector('#paddr');
      const set = async (ll, fill = true) => {
        picked = { lat: ll.lat, lng: ll.lng, address: addr.value };
        if (!marker) { marker = L.marker(ll, { icon: DV.pinIcon('home'), draggable: true }).addTo(map); marker.on('dragend', () => set(marker.getLatLng())); }
        else marker.setLatLng(ll);
        coords.textContent = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
        if (fill) { const a = await DV.reverseGeocode(ll); if (a && (!addr.value || addr.dataset.auto)) { addr.value = a; addr.dataset.auto = '1'; } }
      };
      if (picked) set(picked, false);
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
    bd.className = 'backdrop';
    drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.setAttribute('aria-label', 'Cart');
    document.body.append(bd, drawer);
    bd.onclick = closeCart;
    drawer._bd = bd;
    renderCart();
  }
  function closeCart() { if (drawer) { drawer._bd.remove(); drawer.remove(); drawer = null; } }

  const checkout = { clinicId: null, pay: 'upi', notes: '' };
  async function renderCart() {
    if (!drawer) return;
    const lines = [...state.cart].map(([id, qty]) => ({ m: state.meds.find((x) => x.id === id), qty })).filter((l) => l.m);
    const head = `<div class="modal-head"><h3>Your cart${lines.length ? ` <small style="font-family:var(--font);font-size:14px">· ${cartCount()} item${cartCount() === 1 ? '' : 's'}</small>` : ''}</h3><button class="btn icon" id="cClose" aria-label="Close">${icons.x}</button></div>`;
    if (!lines.length) {
      drawer.innerHTML = head + `<div class="drawer-body"><div class="empty"><div class="ei">${icons.cart}</div><b>Your cart is empty</b>Add Ayurvedic medicines to get started.<div style="margin-top:16px"><button class="btn" id="cShop">Browse medicines</button></div></div></div>`;
      drawer.querySelector('#cClose').onclick = closeCart;
      drawer.querySelector('#cShop').onclick = () => { closeCart(); go('shop'); };
      return;
    }
    let quote = null, quoteErr = '';
    if (state.loc) {
      try { quote = await api('/orders/quote', { method: 'POST', body: { items: lines.map((l) => ({ id: l.m.id, qty: l.qty })), clinicId: checkout.clinicId, lat: state.loc.lat, lng: state.loc.lng } }); }
      catch (e) { quoteErr = e.message; }
    }
    if (!drawer) return;
    const subtotal = lines.reduce((s, l) => s + l.m.price * l.qty, 0);
    const savings = lines.reduce((s, l) => s + Math.max(0, (l.m.mrp || l.m.price) - l.m.price) * l.qty, 0);
    const hasRx = lines.some((l) => l.m.rx);
    const toFree = config.freeDeliveryAbove - subtotal;
    drawer.innerHTML = head + `<div class="drawer-body">
      ${toFree > 0 ? `<div class="note warm">${icons.truck} Add <b>${money(toFree)}</b> more for free delivery<div class="progress"><i style="width:${Math.min(100, (subtotal / config.freeDeliveryAbove) * 100)}%"></i></div></div>`
        : `<div class="note" style="background:var(--sage-soft);color:var(--forest)">${icons.truck} You've unlocked <b>free delivery</b></div>`}
      ${lines.map(({ m, qty }) => `<div class="line"><div class="mini" style="background:${ART.bg(m)}">${ART.svg(m)}</div>
        <div class="grow"><b style="font-size:14px">${esc(m.name)}</b><br><small>${esc(m.pack)} · ${money(m.price)}</small></div>
        <div style="text-align:right">${qtyCtl(m.id, qty)}<div style="font-weight:700;font-size:14px;margin-top:4px">${money(m.price * qty)}</div></div></div>`).join('')}
      ${hasRx ? `<p class="note rx" style="margin-top:14px">Your cart has Rx items. The clinic's vaidya will call to verify before dispatch.</p>` : ''}

      <div class="section-t">Deliver to</div>
      <div class="addr-box">${icons.home}<div class="grow">${state.loc ? `<div style="font-size:14px">${esc(state.loc.address)}</div>` : '<b>No location set</b>'}</div>
        <button class="btn sm ghost" id="cLoc">${state.loc ? 'Change' : 'Set'}</button></div>

      ${quote ? `<div class="section-t">Fulfilled by</div>
        <select class="input" id="cClinic">${quote.nearest.map((c) => `<option value="${c.id}" ${c.id === quote.clinic.id ? 'selected' : ''}>${esc(c.name)} — ${c.distanceKm.toFixed(1)} km</option>`).join('')}</select>
        <small style="display:block;margin-top:6px">${icons.clock} Estimated delivery in about ${quote.etaMin} min</small>` : ''}
      ${quoteErr ? `<p class="note rx" style="margin-top:12px">${esc(quoteErr)}</p>` : ''}

      <div class="section-t">Payment method</div>
      <div class="pay-opts">
        ${[['upi', icons.upi, 'UPI', 'Google Pay, PhonePe, Paytm, BHIM'], ['card', icons.card, 'Credit / debit card', 'Visa, Mastercard, RuPay'], ['cod', icons.cash, 'Cash on delivery', 'Pay the rider in cash or UPI at your door']]
          .map(([k, ic, t, s]) => `<label class="pay-opt"><input type="radio" name="pay" value="${k}" ${checkout.pay === k ? 'checked' : ''}/><div class="pi">${ic}</div><div><b>${t}</b><small>${s}</small></div></label>`).join('')}
      </div>
      <label class="field" style="margin-top:16px"><span>Note for clinic / rider (optional)</span><input class="input" id="cNotes" value="${esc(checkout.notes)}" placeholder="e.g. Call on arrival" /></label>

      <div class="section-t">Bill details</div>
      <div class="sum"><span>Item total (MRP)</span><span>${money(subtotal + savings)}</span></div>
      ${savings ? `<div class="sum" style="color:var(--leaf)"><span>Discount</span><span>− ${money(savings)}</span></div>` : ''}
      <div class="sum"><span>Delivery ${quote ? `(${quote.distanceKm.toFixed(1)} km)` : ''}</span><span>${quote ? (quote.deliveryFee ? money(quote.deliveryFee) : '<b style="color:var(--leaf)">FREE</b>') : '—'}</span></div>
      <div class="sum total"><span>To pay</span><span>${money(quote ? quote.total : subtotal)}</span></div>
      </div>
      <div class="drawer-foot"><button class="btn lg block" id="cPlace" ${quote ? '' : 'disabled'}>${state.loc ? `${icons.lock} Place order · ${money(quote?.total ?? subtotal)}` : 'Set delivery location to continue'}</button></div>`;

    drawer.querySelector('#cClose').onclick = closeCart;
    drawer.querySelector('#cLoc').onclick = async () => { closeCart(); await pickLocation(); openCart(); };
    drawer.querySelector('#cClinic')?.addEventListener('change', (e) => { checkout.clinicId = Number(e.target.value); renderCart(); });
    drawer.querySelectorAll('[name=pay]').forEach((r) => (r.onchange = () => (checkout.pay = r.value)));
    drawer.querySelector('#cNotes').oninput = (e) => (checkout.notes = e.target.value);
    bindQty(drawer, () => { renderCart(); refreshCards(); });
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
      refreshCards();
      upsertOrder(order);
      if (order.status === 'awaiting_payment') await pay(order);
      else { toast('Order placed', `${order.clinic.name} has been notified.`); openTrack(order.id); }
    } catch (e) { fail(e); }
  }

  async function pay(order) {
    if (config.payments.razorpay) return payRazorpay(order);
    const md = modal('Secure payment', `
      <div class="gateway">
        <div class="avatar" style="margin:0 auto;width:60px;height:60px;background:var(--sage-soft);color:var(--forest)">${order.paymentMethod === 'card' ? icons.card : icons.upi}</div>
        <div class="muted" style="margin-top:12px">Order ${esc(order.code)} · ${order.paymentMethod === 'card' ? 'Card' : 'UPI'}</div>
        <div class="amt">${money(order.total)}</div>
        <p class="note warm" style="text-align:left;margin-top:14px"><b>Demo payment gateway.</b> No money will be charged. Add Razorpay keys on the server (see README) to accept real UPI and card payments.</p>
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
    md.addEventListener('close', () => { if (state.view !== 'track') go('orders'); });
  }

  async function payRazorpay(order) {
    try {
      if (!window.Razorpay) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment gateway.')); document.head.appendChild(s); });
      const r = await api(`/orders/${order.id}/pay/razorpay`, { method: 'POST' });
      const rz = new Razorpay({
        key: r.keyId, order_id: r.gatewayOrderId, amount: r.amount, currency: r.currency, name: 'Dhanvantari', description: `Order ${r.code}`,
        prefill: { name: me.name, contact: me.phone || '', email: me.email || '' },
        method: { upi: order.paymentMethod === 'upi', card: order.paymentMethod === 'card', netbanking: false, wallet: false },
        theme: { color: '#143a2b' },
        handler: async (resp) => {
          try { const paid = await api(`/orders/${order.id}/pay/razorpay/verify`, { method: 'POST', body: resp }); upsertOrder(paid); toast('Payment successful', `${paid.clinic.name} has been notified.`); openTrack(paid.id); }
          catch (e) { fail(e); }
        },
        modal: { ondismiss: () => go('orders') },
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
    renderNav();
  }

  // ---- live tracking -------------------------------------------------------
  let track = null; // { orderId, map, home, clinic, rider, line, lastRoute }
  function openTrack(id) { state.view = 'track'; state.trackId = id; render(); window.scrollTo(0, 0); }

  function renderTrack() {
    const o = state.orders.find((x) => x.id === state.trackId);
    if (!o) { state.view = 'orders'; return render(); }
    const live = ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status);
    app.innerHTML = `
      <div class="page-head"><div class="row"><button class="btn ghost" id="back">← Orders</button><div><h2 style="margin:0">Order ${esc(o.code)}</h2><small>${DV.dateTime(o.createdAt)}</small></div></div>
        <div class="row" style="gap:8px">${DV.payBadge(o)}${DV.statusBadge(o.status)}</div></div>
      <div class="track">
        <div class="card" style="overflow:hidden;position:relative"><div class="map" id="tmap" style="border-radius:0"></div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card pad">
            ${live ? `<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:16px"><div><small>${o.status === 'picked_up' ? 'Arriving in' : 'Estimated delivery'}</small><div class="eta" id="eta">—</div></div><small id="dist"></small></div>` : ''}
            ${DV.stepper(o)}
            <p class="muted" style="margin:14px 0 0;font-size:14px">${statusLine(o)}</p>
          </div>
          ${o.rider ? `<div class="rider-card"><div class="avatar">${DV.initials(o.rider.name)}</div><div class="grow"><b>${esc(o.rider.name)}</b><br><small>${esc(o.rider.vehicle || 'Delivery partner')}</small></div>
            ${o.rider.phone ? `<a class="btn sm" href="tel:${esc(o.rider.phone)}">${icons.phone} Call</a>` : ''}</div>` : live ? `<div class="card pad row"><div class="spin dark"></div><div>Finding a delivery partner near the clinic…</div></div>` : ''}
          <div class="card pad"><div class="row" style="align-items:flex-start"><div class="avatar" style="background:var(--forest);color:#fff">${icons.clinic}</div>
            <div class="grow"><b>${esc(o.clinic.name)}</b><br><small>${esc(o.clinic.address)}</small>${o.clinic.vaidya ? `<br><small>Vaidya: ${esc(o.clinic.vaidya)}</small>` : ''}</div>
            ${o.clinic.phone ? `<a class="btn sm ghost" href="tel:${esc(o.clinic.phone)}" aria-label="Call clinic">${icons.phone}</a>` : ''}</div></div>
          <div class="card pad">
            <h4>Items</h4>
            ${o.items.map((i) => `<div class="sum"><span>${esc(i.name)} <small>× ${i.qty}</small></span><span>${money(i.lineTotal)}</span></div>`).join('')}
            <div class="sum"><span>Delivery</span><span>${o.deliveryFee ? money(o.deliveryFee) : 'FREE'}</span></div>
            <div class="sum total"><span>Total</span><span>${money(o.total)}</span></div>
            <p style="margin:12px 0 0;font-size:13px" class="muted">${icons.home} ${esc(o.address)}</p>
            <div class="row" style="margin-top:12px">
              ${o.status === 'placed' || o.status === 'awaiting_payment' ? `<button class="btn sm ghost" id="tCancel">Cancel order</button>` : ''}
              ${o.status === 'awaiting_payment' ? `<button class="btn sm saffron" id="tPay">Complete payment</button>` : ''}</div>
          </div>
        </div>
      </div>`;
    app.querySelector('#back').onclick = () => go('orders');
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
      color: i === routes.length - 1 ? '#143a2b' : '#2a6aa8', weight: 5, opacity: .8, dashArray: rt.road ? null : '8 8',
    }))).addTo(track.map);
    const etaEl = document.getElementById('eta'), distEl = document.getElementById('dist');
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
