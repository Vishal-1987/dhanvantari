/* Order detail modal with live rider map — shared by the clinic and admin screens. */
(function () {
  const { icons, esc, money } = DV;
  let current = null; // { id, map, rider, close }

  function open(o, { actions = '' } = {}) {
    current?.md.close();
    const live = ['placed', 'accepted', 'ready', 'picked_up'].includes(o.status);
    const md = DV.modal(`Order ${o.code}`, `
      <div class="row wrap" style="gap:8px;margin-bottom:14px">${DV.statusBadge(o.status)}${DV.payBadge(o)}<small>${DV.dateTime(o.createdAt)}</small></div>
      ${DV.stepper(o)}
      <div class="map" id="ovMap" style="height:300px;margin:18px 0"></div>
      <div class="grid2">
        <div><h4>Customer</h4><p style="margin:0">${esc(o.customer.name)}<br><small>${esc(o.address)}</small></p>
          ${o.customer.phone ? `<a class="btn sm ghost" style="margin-top:8px" href="tel:${esc(o.customer.phone)}">${icons.phone} ${esc(o.customer.phone)}</a>` : ''}</div>
        <div><h4>Delivery partner</h4>${o.rider ? `<p style="margin:0">${esc(o.rider.name)}<br><small>${esc(o.rider.vehicle || '')}</small></p>
          ${o.rider.phone ? `<a class="btn sm ghost" style="margin-top:8px" href="tel:${esc(o.rider.phone)}">${icons.phone} ${esc(o.rider.phone)}</a>` : ''}` : `<p class="muted">${live ? 'Waiting for a rider to accept' : '—'}</p>`}</div>
      </div>
      <h4 style="margin-top:18px">Items · from ${esc(o.clinic.name)}</h4>
      ${o.items.map((i) => `<div class="sum"><span>${esc(i.name)} <small>${esc(i.pack)} × ${i.qty}</small> ${i.rx ? '<span class="badge rx">Rx</span>' : ''}</span><span>${money(i.lineTotal)}</span></div>`).join('')}
      <div class="sum"><span>Delivery (${(o.distanceKm || 0).toFixed(1)} km)</span><span>${o.deliveryFee ? money(o.deliveryFee) : 'FREE'}</span></div>
      <div class="sum total"><span>Total</span><span>${money(o.total)}</span></div>
      ${o.notes ? `<p class="badge saffron" style="height:auto;padding:8px 12px;margin-top:12px;white-space:normal">Note: ${esc(o.notes)}</p>` : ''}
      <h4 style="margin-top:18px">Timeline</h4>
      ${o.events.map((e) => `<div class="sum"><span>${esc(DV.STATUS[e.status]?.[0] || e.status.replace('_', ' '))}${e.note ? ` <small>· ${esc(e.note)}</small>` : ''}</span><small>${DV.time(e.at)}</small></div>`).join('')}`,
      { wide: true, foot: actions || '<button class="btn ghost" data-close>Close</button>' });

    const map = DV.makeMap(md.querySelector('#ovMap'), o, 13);
    L.marker([o.clinic.lat, o.clinic.lng], { icon: DV.pinIcon('clinic') }).addTo(map).bindPopup(esc(o.clinic.name));
    L.marker([o.lat, o.lng], { icon: DV.pinIcon('home') }).addTo(map).bindPopup(esc(o.customer.name));
    const pts = [[o.lat, o.lng], [o.clinic.lat, o.clinic.lng]];
    let rider = null;
    if (o.riderLocation && live) {
      rider = L.marker([o.riderLocation.lat, o.riderLocation.lng], { icon: DV.riderIcon(), zIndexOffset: 1000 }).addTo(map);
      pts.push([o.riderLocation.lat, o.riderLocation.lng]);
    }
    map.fitBounds(pts, { padding: [40, 40] });
    DV.route(o.clinic, o).then((r) => L.polyline(r.points.map((p) => [p.lat, p.lng]), { color: '#17402f', weight: 4, opacity: .7, dashArray: r.road ? null : '8 8' }).addTo(map));

    current = { id: o.id, map, rider, md };
    md.addEventListener('close', () => { if (current?.md === md) current = null; });
    return md;
  }

  function moveRider(p) {
    if (!current || current.id !== p.orderId) return;
    if (!current.rider) current.rider = L.marker([p.lat, p.lng], { icon: DV.riderIcon(), zIndexOffset: 1000 }).addTo(current.map);
    else DV.glide(current.rider, p);
  }

  window.OrderView = { open, moveRider, get openId() { return current?.id; }, close() { current?.md.close(); } };
})();
