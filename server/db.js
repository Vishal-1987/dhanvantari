import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'dhanvantari.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clinics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'hub',      -- hub | clinic
    address     TEXT NOT NULL,
    phone       TEXT,
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    hours       TEXT DEFAULT '9:00 AM – 9:00 PM',
    vaidya      TEXT,                              -- in-house Ayurvedic physician
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','customer','clinic','rider')),
    name          TEXT NOT NULL,
    phone         TEXT,
    email         TEXT,
    address       TEXT,
    lat           REAL,
    lng           REAL,
    clinic_id     INTEGER REFERENCES clinics(id),
    vehicle       TEXT,
    online        INTEGER NOT NULL DEFAULT 0,
    last_seen     TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medicines (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    form          TEXT NOT NULL,          -- Churna, Vati, Taila, Arishta, Avaleha, Ghrita, Kashayam, Capsule
    pack          TEXT NOT NULL,          -- e.g. 100 g, 60 tablets
    price         REAL NOT NULL,
    mrp           REAL,
    description   TEXT,
    ingredients   TEXT,
    dosage        TEXT,
    rx            INTEGER NOT NULL DEFAULT 0,  -- needs clinic / vaidya verification
    stock         INTEGER NOT NULL DEFAULT 100,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    customer_id     INTEGER NOT NULL REFERENCES users(id),
    clinic_id       INTEGER NOT NULL REFERENCES clinics(id),
    rider_id        INTEGER REFERENCES users(id),
    status          TEXT NOT NULL,
    items           TEXT NOT NULL,           -- JSON snapshot of line items
    subtotal        REAL NOT NULL,
    delivery_fee    REAL NOT NULL,
    total           REAL NOT NULL,
    distance_km     REAL,
    payment_method  TEXT NOT NULL,           -- upi | card | cod
    payment_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | refunded | failed
    payment_ref     TEXT,
    address         TEXT NOT NULL,
    lat             REAL NOT NULL,
    lng             REAL NOT NULL,
    notes           TEXT,
    rider_lat       REAL,
    rider_lng       REAL,
    rider_heading   REAL,
    rider_updated   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  INTEGER NOT NULL REFERENCES orders(id),
    status    TEXT NOT NULL,
    note      TEXT,
    at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    body        TEXT,
    order_id    INTEGER,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_clinic   ON orders(clinic_id);
  CREATE INDEX IF NOT EXISTS idx_orders_rider    ON orders(rider_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id, read);
`);

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
