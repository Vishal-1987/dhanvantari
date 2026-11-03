import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ROOT, DATA_DIR, TZ, init, one, all, run, tx } from './db.js';
import { seed } from './seed.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
const DEMO = process.env.NODE_ENV !== 'production';
const RZP_KEY = process.env.RAZORPAY_KEY_ID || '';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY = Boolean(RZP_KEY && RZP_SECRET);

const secretFile = path.join(DATA_DIR, '.jwt-secret');
const JWT_SECRET = process.env.JWT_SECRET || (fs.existsSync(secretFile)
  ? fs.readFileSync(secretFile, 'utf8')
  : (() => { const s = crypto.randomBytes(48).toString('hex'); fs.writeFileSync(secretFile, s); return s; })());

await init();
if (await seed()) console.log('Seeded demo data (see README for demo logins).');

const FREE_DELIVERY_ABOVE = 999;
const ACTIVE = ['placed', 'accepted', 'ready', 'picked_up'];
const STATUS_TEXT = {
  awaiting_payment: 'Awaiting payment',
  placed: 'Order placed',
  accepted: 'Accepted by clinic',
  ready: 'Packed & ready for pickup',
  picked_up: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
// "Today" in Indian time, for dashboards.
const LOCAL_DAY = (col) => `(${col} AT TIME ZONE '${TZ}')::date`;
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function haversineKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const deliveryFee = (km, subtotal) =>
  subtotal >= FREE_DELIVERY_ABOVE ? 0 : Math.round(30 + Math.max(0, km - 2) * 8);

const publicUser = (u) => u && ({
  id: u.id, username: u.username, role: u.role, name: u.name, phone: u.phone, email: u.email,
  address: u.address, lat: u.lat, lng: u.lng, clinicId: u.clinic_id, vehicle: u.vehicle,
  online: !!u.online, active: !!u.active, lastSeen: u.last_seen, createdAt: u.created_at,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const userById = (id) => one('SELECT * FROM users WHERE id = ?', id);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Orders are always read with their clinic, customer and rider in one round trip.
const ORDER_SELECT = `
  SELECT o.*,
         c.name AS c_name, c.address AS c_address, c.phone AS c_phone, c.lat AS c_lat, c.lng AS c_lng, c.vaidya AS c_vaidya,
         cu.name AS cu_name, cu.phone AS cu_phone,
         r.name AS r_name, r.phone AS r_phone, r.vehicle AS r_vehicle, r.lat AS r_lat, r.lng AS r_lng
    FROM orders o
    JOIN clinics c ON c.id = o.clinic_id
    JOIN users cu ON cu.id = o.customer_id
    LEFT JOIN users r ON r.id = o.rider_id`;

const getOrder = (id) => one(`${ORDER_SELECT} WHERE o.id = ?`, id);

async function serializeOrders(rows) {
  if (!rows.length) return [];
  const events = await all('SELECT order_id, status, note, at FROM order_events WHERE order_id = ANY(?) ORDER BY id', rows.map((o) => o.id));
  const byOrder = new Map();
  for (const e of events) (byOrder.get(e.order_id) || byOrder.set(e.order_id, []).get(e.order_id)).push({ status: e.status, note: e.note, at: e.at });
  return rows.map((o) => ({
    id: o.id, code: o.code, status: o.status, statusText: STATUS_TEXT[o.status],
    items: JSON.parse(o.items), subtotal: o.subtotal, deliveryFee: o.delivery_fee, total: o.total,
    distanceKm: o.distance_km, paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    address: o.address, lat: o.lat, lng: o.lng, notes: o.notes,
    riderLocation: o.rider_lat != null ? { lat: o.rider_lat, lng: o.rider_lng, heading: o.rider_heading, at: o.rider_updated } : null,
    clinic: { id: o.clinic_id, name: o.c_name, address: o.c_address, phone: o.c_phone, lat: o.c_lat, lng: o.c_lng, vaidya: o.c_vaidya },
    customer: { id: o.customer_id, name: o.cu_name, phone: o.cu_phone },
    rider: o.rider_id ? { id: o.rider_id, name: o.r_name, phone: o.r_phone, vehicle: o.r_vehicle, lat: o.r_lat, lng: o.r_lng } : null,
    events: byOrder.get(o.id) || [],
    createdAt: o.created_at, updatedAt: o.updated_at,
  }));
}
const serializeOrder = async (o) => (o ? (await serializeOrders([o]))[0] : null);

function canSee(user, o) {
  switch (user.role) {
    case 'admin': return true;
    case 'customer': return o.customer_id === user.id;
    case 'clinic': return o.clinic_id === user.clinicId;
    case 'rider': return o.rider_id === user.id || (o.rider_id == null && ['placed', 'accepted', 'ready'].includes(o.status));
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// App + realtime
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) { next(e); }
};

function auth(...roles) {
  return wrap(async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    let claims;
    try { claims = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Please sign in again.' }); }
    const u = await one('SELECT * FROM users WHERE id = ? AND active = 1', claims.id);
    if (!u) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = { id: u.id, role: u.role, clinicId: u.clinic_id, name: u.name };
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'You do not have access to this action.' });
    next();
  });
}

async function notify(userIds, title, body, orderId = null) {
  for (const uid of new Set(userIds)) {
    const { lastInsertRowid: id } = await run('INSERT INTO notifications (user_id, title, body, order_id) VALUES (?,?,?,?)', uid, title, body, orderId);
    io.to(`user:${uid}`).emit('notification', { id, title, body, orderId, read: false, createdAt: new Date().toISOString() });
  }
}

const ids = (rows) => rows.map((r) => r.id);
const clinicStaff = async (clinicId) => ids(await all("SELECT id FROM users WHERE role = 'clinic' AND clinic_id = ? AND active = 1", clinicId));
const admins = async () => ids(await all("SELECT id FROM users WHERE role = 'admin' AND active = 1"));
const onlineRiders = async () => all("SELECT id, lat, lng FROM users WHERE role = 'rider' AND active = 1 AND online = 1");

async function broadcastOrder(o) {
  const data = await serializeOrder(o);
  io.to(`user:${o.customer_id}`).to(`clinic:${o.clinic_id}`).to('role:admin').emit('order:update', data);
  if (o.rider_id) io.to(`user:${o.rider_id}`).emit('order:update', data);
  // The open-order pool that every rider sees.
  if (!o.rider_id && ['placed', 'accepted', 'ready'].includes(o.status)) io.to('role:rider').emit('pool:upsert', data);
  else io.to('role:rider').emit('pool:remove', { id: o.id });
}

async function setStatus(o, status, note) {
  const extra = status === 'delivered' && o.payment_method === 'cod' ? ", payment_status = 'paid'" : '';
  await run(`UPDATE orders SET status = ?, updated_at = now()${extra} WHERE id = ?`, status, o.id);
  await run('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)', o.id, status, note || null);
  return getOrder(o.id);
}

/** Order becomes live: tell the clinic, nearby riders and admin. */
async function announceNewOrder(o) {
  const clinic = { name: o.c_name, lat: o.c_lat, lng: o.c_lng };
  const items = JSON.parse(o.items);
  const summary = `${items.reduce((s, i) => s + i.qty, 0)} item(s) · ₹${o.total} · ${o.payment_method.toUpperCase()}`;
  await notify(await clinicStaff(o.clinic_id), `New order ${o.code}`, `${summary}. Please accept and pack it.`, o.id);

  const riders = await onlineRiders();
  const near = riders
    .map((r) => ({ id: r.id, km: r.lat != null ? haversineKm(r, clinic) : null }))
    .filter((r) => r.km == null || r.km <= 15);
  for (const r of near.length ? near : riders) {
    const dist = r.km != null ? ` — ${r.km.toFixed(1)} km from you` : '';
    await notify([r.id], `Delivery request ${o.code}`, `Pickup at ${clinic.name}${dist}. Drop ${o.distance_km.toFixed(1)} km.`, o.id);
  }
  await notify(await admins(), `New order ${o.code}`, `${summary} → ${clinic.name}`, o.id);
  await broadcastOrder(o);
}

io.use(async (socket, next) => {
  try {
    const claims = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
    const u = await one('SELECT * FROM users WHERE id = ? AND active = 1', claims.id);
    if (!u) return next(new Error('unauthorized'));
    socket.user = { id: u.id, role: u.role, clinicId: u.clinic_id };
    next();
  } catch { next(new Error('unauthorized')); }
});

async function updateRiderLocation(riderId, lat, lng, heading) {
  await run('UPDATE users SET lat = ?, lng = ?, last_seen = now() WHERE id = ?', lat, lng, riderId);
  const live = await all(`UPDATE orders SET rider_lat = ?, rider_lng = ?, rider_heading = ?, rider_updated = now()
                           WHERE rider_id = ? AND status IN ('placed','accepted','ready','picked_up')
                           RETURNING id, customer_id, clinic_id`, lat, lng, heading ?? null, riderId);
  const payload = { riderId, lat, lng, heading: heading ?? null, at: new Date().toISOString() };
  for (const o of live) io.to(`user:${o.customer_id}`).to(`clinic:${o.clinic_id}`).emit('rider:location', { ...payload, orderId: o.id });
  io.to('role:admin').emit('rider:location', payload);
}

io.on('connection', (socket) => {
  const u = socket.user;
  socket.join(`user:${u.id}`);
  socket.join(`role:${u.role}`);
  if (u.clinicId) socket.join(`clinic:${u.clinicId}`);

  socket.on('rider:location', (p) => {
    if (u.role !== 'rider' || !p || !isNum(p.lat) || !isNum(p.lng)) return;
    updateRiderLocation(u.id, p.lat, p.lng, isNum(p.heading) ? p.heading : null).catch((e) => console.error('rider:location', e.message));
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
const findUsername = (username) => one('SELECT * FROM users WHERE lower(username) = lower(?)', String(username).trim());

app.get('/api/config', (req, res) => res.json({
  demo: DEMO,
  payments: { razorpay: RAZORPAY, keyId: RAZORPAY ? RZP_KEY : null },
  freeDeliveryAbove: FREE_DELIVERY_ABOVE,
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password, portal } = req.body || {};
  const u = username && await findUsername(username);
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) throw new HttpError(401, 'Incorrect username or password.');
  if (!u.active) throw new HttpError(403, 'This account has been deactivated. Contact the administrator.');
  if (portal === 'admin' && u.role !== 'admin') throw new HttpError(403, 'This account is not an administrator.');
  res.json({ token: sign(u), user: publicUser(u) });
}));

app.post('/api/auth/register', wrap(async (req, res) => {
  const { username, password, name, phone, email } = req.body || {};
  if (!/^[a-z0-9_.]{3,30}$/i.test(username || '')) throw new HttpError(400, 'Username must be 3–30 letters, numbers, dots or underscores.');
  if (!password || String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (!name?.trim()) throw new HttpError(400, 'Please enter your name.');
  if (await findUsername(username)) throw new HttpError(409, 'That username is taken.');
  const { lastInsertRowid: id } = await run('INSERT INTO users (username, password_hash, role, name, phone, email) VALUES (?,?,?,?,?,?)',
    username, bcrypt.hashSync(password, 10), 'customer', name.trim(), phone || null, email || null);
  const u = await userById(id);
  res.status(201).json({ token: sign(u), user: publicUser(u) });
}));

app.get('/api/me', auth(), wrap(async (req, res) => res.json(publicUser(await userById(req.user.id)))));

app.patch('/api/me', auth(), wrap(async (req, res) => {
  const { name, phone, email, address, lat, lng } = req.body || {};
  const u = await userById(req.user.id);
  await run('UPDATE users SET name = ?, phone = ?, email = ?, address = ?, lat = ?, lng = ? WHERE id = ?',
    name ?? u.name, phone ?? u.phone, email ?? u.email, address ?? u.address,
    isNum(lat) ? lat : u.lat, isNum(lng) ? lng : u.lng, u.id);
  res.json(publicUser(await userById(u.id)));
}));

// ---------------------------------------------------------------------------
// Catalogue & clinics
// ---------------------------------------------------------------------------
const medicineOut = (m) => ({
  id: m.id, name: m.name, category: m.category, form: m.form, pack: m.pack, price: m.price, mrp: m.mrp,
  description: m.description, ingredients: m.ingredients, dosage: m.dosage, rx: !!m.rx, stock: m.stock, active: !!m.active,
});

app.get('/api/medicines', auth(), wrap(async (req, res) => {
  const showAll = req.user.role === 'admin' && req.query.all;
  res.json((await all(`SELECT * FROM medicines ${showAll ? '' : 'WHERE active = 1'} ORDER BY category, name`)).map(medicineOut));
}));

app.get('/api/clinics', auth(), wrap(async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const showAll = req.user.role === 'admin';
  let rows = await all(`SELECT * FROM clinics ${showAll ? '' : 'WHERE active = 1'} ORDER BY name`);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    rows = rows.map((c) => ({ ...c, distanceKm: haversineKm({ lat, lng }, c) })).sort((a, b) => a.distanceKm - b.distanceKm);
  }
  res.json(rows.map((c) => ({ ...c, active: !!c.active })));
}));

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
app.post('/api/orders/quote', auth('customer'), wrap(async (req, res) => {
  res.json(await buildOrder(req.body, true));
}));

async function buildOrder(body, quoteOnly = false) {
  const { items, clinicId, lat, lng } = body || {};
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Your cart is empty.');
  if (!isNum(lat) || !isNum(lng)) throw new HttpError(400, 'Please set your delivery location on the map.');

  const wanted = items.map(({ id, qty }) => ({ id: Number(id), qty: Math.floor(Number(qty)) }));
  const meds = new Map((await all('SELECT * FROM medicines WHERE id = ANY(?) AND active = 1', wanted.map((w) => w.id).filter(Number.isInteger))).map((m) => [m.id, m]));
  const lines = wanted.map(({ id, qty: n }) => {
    const m = meds.get(id);
    if (!m) throw new HttpError(400, 'One of the medicines is no longer available.');
    if (!(n >= 1 && n <= 20)) throw new HttpError(400, `Invalid quantity for ${m.name}.`);
    if (!quoteOnly && m.stock < n) throw new HttpError(409, `Only ${m.stock} left of ${m.name}.`);
    return { id: m.id, name: m.name, pack: m.pack, form: m.form, price: m.price, qty: n, rx: !!m.rx, lineTotal: m.price * n };
  });

  const clinics = (await all('SELECT * FROM clinics WHERE active = 1'))
    .map((c) => ({ ...c, distanceKm: haversineKm({ lat, lng }, c) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!clinics.length) throw new HttpError(503, 'No Ayurvedic clinics are available right now.');
  const clinic = clinicId ? clinics.find((c) => c.id === Number(clinicId)) : clinics[0];
  if (!clinic) throw new HttpError(400, 'Selected clinic is not available.');

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const fee = deliveryFee(clinic.distanceKm, subtotal);
  return {
    lines, clinic: { id: clinic.id, name: clinic.name, address: clinic.address, distanceKm: clinic.distanceKm },
    nearest: clinics.slice(0, 5).map((c) => ({ id: c.id, name: c.name, distanceKm: c.distanceKm })),
    subtotal, deliveryFee: fee, total: subtotal + fee, distanceKm: clinic.distanceKm,
    etaMin: Math.round(15 + clinic.distanceKm * 4),
  };
}

app.post('/api/orders', auth('customer'), wrap(async (req, res) => {
  const { address, notes, paymentMethod, lat, lng } = req.body || {};
  if (!['upi', 'card', 'cod'].includes(paymentMethod)) throw new HttpError(400, 'Choose a payment method.');
  if (!address?.trim()) throw new HttpError(400, 'Please enter your delivery address.');
  const q = await buildOrder(req.body);

  const id = await tx(async () => {
    for (const l of q.lines) {
      // Guarded decrement so two customers can't buy the last unit at the same time.
      const r = await run('UPDATE medicines SET stock = stock - ? WHERE id = ? AND stock >= ?', l.qty, l.id, l.qty);
      if (!r.changes) throw new HttpError(409, `${l.name} just went out of stock.`);
    }
    const code = 'DV' + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomInt(10, 99);
    const status = paymentMethod === 'cod' ? 'placed' : 'awaiting_payment';
    const { lastInsertRowid: orderId } = await run(`INSERT INTO orders (code, customer_id, clinic_id, status, items, subtotal, delivery_fee, total, distance_km,
                     payment_method, address, lat, lng, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code, req.user.id, q.clinic.id, status, JSON.stringify(q.lines), q.subtotal, q.deliveryFee, q.total, q.distanceKm,
      paymentMethod, address.trim(), lat, lng, notes?.trim() || null);
    await run('INSERT INTO order_events (order_id, status) VALUES (?,?)', orderId, status);
    // Remember the address for next time.
    await run('UPDATE users SET address = ?, lat = ?, lng = ? WHERE id = ?', address.trim(), lat, lng, req.user.id);
    return orderId;
  });

  const order = await getOrder(id);
  if (order.status === 'placed') await announceNewOrder(order);
  res.status(201).json(await serializeOrder(order));
}));

app.get('/api/orders', auth(), wrap(async (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'admin') rows = await all(`${ORDER_SELECT} ORDER BY o.id DESC LIMIT 300`);
  else if (u.role === 'customer') rows = await all(`${ORDER_SELECT} WHERE o.customer_id = ? ORDER BY o.id DESC`, u.id);
  else if (u.role === 'clinic') rows = await all(`${ORDER_SELECT} WHERE o.clinic_id = ? AND o.status != 'awaiting_payment' ORDER BY o.id DESC LIMIT 200`, u.clinicId);
  else if (req.query.pool) rows = await all(`${ORDER_SELECT} WHERE o.rider_id IS NULL AND o.status IN ('placed','accepted','ready') ORDER BY o.id DESC`);
  else rows = await all(`${ORDER_SELECT} WHERE o.rider_id = ? ORDER BY o.id DESC LIMIT 100`, u.id);
  res.json(await serializeOrders(rows));
}));

app.get('/api/orders/:id', auth(), wrap(async (req, res) => {
  const o = await getOrder(Number(req.params.id));
  if (!o || !canSee(req.user, o)) throw new HttpError(404, 'Order not found.');
  res.json(await serializeOrder(o));
}));

const TRANSITIONS = {
  clinic: { placed: ['accepted', 'cancelled'], accepted: ['ready', 'cancelled'] },
  rider: { ready: ['picked_up'], picked_up: ['delivered'] },
  customer: { awaiting_payment: ['cancelled'], placed: ['cancelled'] },
};

app.post('/api/orders/:id/status', auth('clinic', 'rider', 'customer', 'admin'), wrap(async (req, res) => {
  const { status, note } = req.body || {};
  let o = await getOrder(Number(req.params.id));
  if (!o || !canSee(req.user, o)) throw new HttpError(404, 'Order not found.');
  const u = req.user;
  if (u.role === 'rider' && o.rider_id !== u.id) throw new HttpError(403, 'Accept this delivery first.');
  const allowed = u.role === 'admin' ? Object.keys(STATUS_TEXT) : TRANSITIONS[u.role][o.status] || [];
  if (!allowed.includes(status)) throw new HttpError(409, `Can't change an order from “${STATUS_TEXT[o.status]}” to “${STATUS_TEXT[status] || status}”.`);

  o = await tx(async () => {
    // Re-check the status inside the transaction so two people can't move the same order at once.
    const locked = await one('SELECT status FROM orders WHERE id = ? FOR UPDATE', o.id);
    if (locked.status !== o.status) throw new HttpError(409, 'This order was just updated by someone else. Refresh and try again.');
    if (status === 'cancelled') {
      for (const l of JSON.parse(o.items)) await run('UPDATE medicines SET stock = stock + ? WHERE id = ?', l.qty, l.id);
      if (o.payment_status === 'paid') await run("UPDATE orders SET payment_status = 'refunded' WHERE id = ?", o.id);
    }
    return setStatus(o, status, note || (status === 'cancelled' ? `Cancelled by ${u.role}` : null));
  });

  const msg = {
    accepted: ['Your order is accepted', `${o.c_name} is preparing your medicines.`],
    ready: ['Order packed', 'Your medicines are packed and waiting for the delivery partner.'],
    picked_up: ['Out for delivery', 'Your delivery partner is on the way. Track them live on the map.'],
    delivered: ['Delivered', 'Your Ayurvedic medicines have been delivered. Stay well!'],
    cancelled: ['Order cancelled', note || 'Your order was cancelled. Any online payment will be refunded.'],
  }[status];
  if (msg && u.role !== 'customer') await notify([o.customer_id], `${msg[0]} · ${o.code}`, msg[1], o.id);
  if (status === 'ready' && o.rider_id) await notify([o.rider_id], `Ready for pickup · ${o.code}`, 'The clinic has packed the order.', o.id);
  if (status === 'ready' && !o.rider_id) await notify(ids(await onlineRiders()), `Pickup waiting · ${o.code}`, 'A packed order still needs a delivery partner.', o.id);
  if (status === 'cancelled') {
    await notify(await clinicStaff(o.clinic_id), `Order cancelled · ${o.code}`, note || '', o.id);
    if (o.rider_id) await notify([o.rider_id], `Order cancelled · ${o.code}`, 'You no longer need to deliver this order.', o.id);
  }
  if (['picked_up', 'delivered'].includes(status)) await notify(await clinicStaff(o.clinic_id), `${STATUS_TEXT[status]} · ${o.code}`, '', o.id);
  await broadcastOrder(o);
  res.json(await serializeOrder(o));
}));

app.post('/api/orders/:id/claim', auth('rider'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const r = await run(`UPDATE orders SET rider_id = ?, updated_at = now()
                       WHERE id = ? AND rider_id IS NULL AND status IN ('placed','accepted','ready')`, req.user.id, id);
  if (!r.changes) throw new HttpError(409, 'Another delivery partner has already taken this order.');
  const rider = await userById(req.user.id);
  await run('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)', id, 'rider_assigned', `${rider.name} will deliver`);
  await run('UPDATE users SET online = 1 WHERE id = ?', rider.id);
  if (rider.lat != null) await run('UPDATE orders SET rider_lat = ?, rider_lng = ?, rider_updated = now() WHERE id = ?', rider.lat, rider.lng, id);
  const o = await getOrder(id);
  await notify([o.customer_id], `Delivery partner assigned · ${o.code}`, `${rider.name} (${rider.vehicle || 'rider'}) will deliver your order.`, o.id);
  await notify(await clinicStaff(o.clinic_id), `Rider assigned · ${o.code}`, `${rider.name} is coming for pickup. ${rider.phone || ''}`, o.id);
  await broadcastOrder(o);
  res.json(await serializeOrder(o));
}));

// --- Payments ---------------------------------------------------------------
async function payableOrder(req) {
  const o = await getOrder(Number(req.params.id));
  if (!o || o.customer_id !== req.user.id) throw new HttpError(404, 'Order not found.');
  if (o.status !== 'awaiting_payment') throw new HttpError(409, 'This order does not need payment.');
  return o;
}

async function markPaid(o, ref) {
  const updated = await tx(async () => {
    const r = await run("UPDATE orders SET payment_status = 'paid', payment_ref = ? WHERE id = ? AND status = 'awaiting_payment'", ref, o.id);
    if (!r.changes) throw new HttpError(409, 'This order does not need payment.');
    return setStatus(o, 'placed', `Paid online · ${ref}`);
  });
  await announceNewOrder(updated);
  return updated;
}

// Demo gateway – only when no real gateway keys are configured.
app.post('/api/orders/:id/pay/demo', auth('customer'), wrap(async (req, res) => {
  if (RAZORPAY) throw new HttpError(400, 'Use the live payment gateway.');
  const o = await payableOrder(req);
  res.json(await serializeOrder(await markPaid(o, 'DEMO-' + crypto.randomBytes(5).toString('hex').toUpperCase())));
}));

app.post('/api/orders/:id/pay/razorpay', auth('customer'), wrap(async (req, res) => {
  if (!RAZORPAY) throw new HttpError(400, 'Online gateway is not configured.');
  const o = await payableOrder(req);
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString('base64') },
    body: JSON.stringify({ amount: Math.round(o.total * 100), currency: 'INR', receipt: o.code }),
  });
  const data = await r.json();
  if (!r.ok) throw new HttpError(502, data?.error?.description || 'Payment gateway error.');
  await run('UPDATE orders SET payment_ref = ? WHERE id = ?', data.id, o.id);
  res.json({ keyId: RZP_KEY, gatewayOrderId: data.id, amount: data.amount, currency: 'INR', code: o.code });
}));

app.post('/api/orders/:id/pay/razorpay/verify', auth('customer'), wrap(async (req, res) => {
  const o = await payableOrder(req);
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const expected = crypto.createHmac('sha256', RZP_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const ok = razorpay_order_id === o.payment_ref && razorpay_signature?.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  if (!ok) throw new HttpError(400, 'Payment could not be verified.');
  res.json(await serializeOrder(await markPaid(o, razorpay_payment_id)));
}));

// --- Rider presence -----------------------------------------------------------
app.post('/api/rider/presence', auth('rider'), wrap(async (req, res) => {
  const { online, lat, lng } = req.body || {};
  await run('UPDATE users SET online = ?, last_seen = now() WHERE id = ?', online ? 1 : 0, req.user.id);
  if (isNum(lat) && isNum(lng)) await updateRiderLocation(req.user.id, lat, lng);
  io.to('role:admin').emit('rider:presence', { riderId: req.user.id, online: !!online });
  res.json(publicUser(await userById(req.user.id)));
}));

// --- Notifications ------------------------------------------------------------
app.get('/api/notifications', auth(), wrap(async (req, res) => {
  const rows = await all(`SELECT id, title, body, order_id AS "orderId", read, created_at AS "createdAt"
                            FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`, req.user.id);
  res.json(rows.map((n) => ({ ...n, read: !!n.read })));
}));
app.post('/api/notifications/read', auth(), wrap(async (req, res) => {
  await run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', req.user.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const admin = auth('admin');

app.get('/api/admin/stats', admin, wrap(async (req, res) => {
  const s = await one(`SELECT
      (SELECT COUNT(*) FROM orders WHERE ${LOCAL_DAY('created_at')} = ${TODAY} AND status != 'awaiting_payment') AS "ordersToday",
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE ${LOCAL_DAY('created_at')} = ${TODAY} AND status NOT IN ('cancelled','awaiting_payment')) AS "revenueToday",
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'delivered') AS "revenueTotal",
      (SELECT COUNT(*) FROM orders WHERE status = ANY(?)) AS "activeOrders",
      (SELECT COUNT(*) FROM orders WHERE status = 'delivered') AS delivered,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
      (SELECT COUNT(*) FROM users WHERE role = 'rider' AND online = 1 AND active = 1) AS "ridersOnline",
      (SELECT COUNT(*) FROM users WHERE role = 'rider') AS riders,
      (SELECT COUNT(*) FROM clinics WHERE active = 1) AS clinics,
      (SELECT COUNT(*) FROM medicines WHERE active = 1) AS medicines,
      (SELECT COUNT(*) FROM medicines WHERE active = 1 AND stock < 20) AS "lowStock"`, ACTIVE);
  const [byStatus, last7] = await Promise.all([
    all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    all(`SELECT to_char(${LOCAL_DAY('created_at')}, 'YYYY-MM-DD') AS d, COUNT(*) AS n,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END),0) AS revenue
           FROM orders WHERE ${LOCAL_DAY('created_at')} >= ${TODAY} - 6 AND status != 'awaiting_payment'
          GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({ ...s, byStatus, last7 });
}));

app.get('/api/admin/users', admin, wrap(async (req, res) => {
  const role = req.query.role;
  const rows = role ? await all('SELECT * FROM users WHERE role = ? ORDER BY id DESC', role) : await all('SELECT * FROM users ORDER BY id DESC');
  res.json(rows.map(publicUser));
}));

app.post('/api/admin/users', admin, wrap(async (req, res) => {
  const { username, password, role, name, phone, clinicId, vehicle } = req.body || {};
  if (!['admin', 'clinic', 'rider', 'customer'].includes(role)) throw new HttpError(400, 'Invalid role.');
  if (!/^[a-z0-9_.]{3,30}$/i.test(username || '')) throw new HttpError(400, 'Username must be 3–30 letters, numbers, dots or underscores.');
  if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (!name?.trim()) throw new HttpError(400, 'Name is required.');
  if (role === 'clinic' && !(await one('SELECT id FROM clinics WHERE id = ?', Number(clinicId)))) throw new HttpError(400, 'Choose the clinic this login belongs to.');
  if (await findUsername(username)) throw new HttpError(409, 'That username is taken.');
  const { lastInsertRowid: id } = await run('INSERT INTO users (username, password_hash, role, name, phone, clinic_id, vehicle) VALUES (?,?,?,?,?,?,?)',
    username, bcrypt.hashSync(password, 10), role, name.trim(), phone || null, role === 'clinic' ? Number(clinicId) : null, vehicle || null);
  res.status(201).json(publicUser(await userById(id)));
}));

app.patch('/api/admin/users/:id', admin, wrap(async (req, res) => {
  const u = await userById(Number(req.params.id));
  if (!u) throw new HttpError(404, 'User not found.');
  const { active, password } = req.body || {};
  if (u.id === req.user.id && active === false) throw new HttpError(400, "You can't deactivate your own account.");
  if (typeof active === 'boolean') {
    await run(active ? 'UPDATE users SET active = 1 WHERE id = ?' : 'UPDATE users SET active = 0, online = 0 WHERE id = ?', u.id);
  }
  if (password) {
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
    await run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 10), u.id);
  }
  res.json(publicUser(await userById(u.id)));
}));

app.post('/api/admin/clinics', admin, wrap(async (req, res) => {
  const { name, kind, address, phone, lat, lng, hours, vaidya } = req.body || {};
  if (!name?.trim() || !address?.trim()) throw new HttpError(400, 'Name and address are required.');
  if (!isNum(lat) || !isNum(lng)) throw new HttpError(400, 'Pick the clinic location on the map.');
  const { lastInsertRowid: id } = await run('INSERT INTO clinics (name, kind, address, phone, lat, lng, hours, vaidya) VALUES (?,?,?,?,?,?,?,?)',
    name.trim(), kind === 'clinic' ? 'clinic' : 'hub', address.trim(), phone || null, lat, lng, hours || '9:00 AM – 9:00 PM', vaidya || null);
  res.status(201).json(await one('SELECT * FROM clinics WHERE id = ?', id));
}));

app.patch('/api/admin/clinics/:id', admin, wrap(async (req, res) => {
  const c = await one('SELECT * FROM clinics WHERE id = ?', Number(req.params.id));
  if (!c) throw new HttpError(404, 'Clinic not found.');
  const b = req.body || {};
  await run('UPDATE clinics SET name = ?, address = ?, phone = ?, hours = ?, vaidya = ?, active = ? WHERE id = ?',
    b.name ?? c.name, b.address ?? c.address, b.phone ?? c.phone, b.hours ?? c.hours, b.vaidya ?? c.vaidya,
    typeof b.active === 'boolean' ? (b.active ? 1 : 0) : c.active, c.id);
  res.json(await one('SELECT * FROM clinics WHERE id = ?', c.id));
}));

app.post('/api/admin/medicines', admin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim() || !b.category?.trim() || !b.form?.trim() || !b.pack?.trim()) throw new HttpError(400, 'Name, category, form and pack size are required.');
  if (!(Number(b.price) > 0)) throw new HttpError(400, 'Enter a valid price.');
  const { lastInsertRowid: id } = await run(`INSERT INTO medicines (name, category, form, pack, price, mrp, description, ingredients, dosage, rx, stock)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    b.name.trim(), b.category.trim(), b.form.trim(), b.pack.trim(), Number(b.price), Number(b.mrp) || null,
    b.description || null, b.ingredients || null, b.dosage || null, b.rx ? 1 : 0, Math.max(0, Math.floor(Number(b.stock)) || 0));
  res.status(201).json(medicineOut(await one('SELECT * FROM medicines WHERE id = ?', id)));
}));

app.patch('/api/admin/medicines/:id', admin, wrap(async (req, res) => {
  const m = await one('SELECT * FROM medicines WHERE id = ?', Number(req.params.id));
  if (!m) throw new HttpError(404, 'Medicine not found.');
  const b = req.body || {};
  await run('UPDATE medicines SET price = ?, mrp = ?, stock = ?, active = ? WHERE id = ?',
    Number(b.price) > 0 ? Number(b.price) : m.price, b.mrp != null ? Number(b.mrp) || null : m.mrp,
    b.stock != null ? Math.max(0, Math.floor(Number(b.stock)) || 0) : m.stock,
    typeof b.active === 'boolean' ? (b.active ? 1 : 0) : m.active, m.id);
  res.json(medicineOut(await one('SELECT * FROM medicines WHERE id = ?', m.id)));
}));

app.get('/api/admin/riders/live', admin, wrap(async (req, res) => {
  res.json((await all("SELECT * FROM users WHERE role = 'rider' AND active = 1")).map(publicUser));
}));

// ---------------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

server.listen(PORT, () => {
  console.log(`Dhanvantari running at http://localhost:${PORT} (database: Neon Postgres)`);
  console.log(`Payments: ${RAZORPAY ? 'Razorpay (live keys configured)' : 'demo gateway — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET for real payments'}`);
});
