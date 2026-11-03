# Dhanvantari — Ayurvedic medicine delivery

An Ayurveda-only ordering and delivery platform with four connected apps:

| App | URL | Who uses it |
|---|---|---|
| **Sign in** | `/` | Admin portal (username + password) and member sign-in / customer sign-up |
| **Admin console** | `/admin` | Live network map, stats, all orders, clinics & hubs, delivery partners, clinic logins, medicine catalogue |
| **Customer shop** | `/shop` | Browse Ayurvedic medicines, auto-match to the nearest clinic, pay, track the rider live |
| **Clinic desk** | `/clinic` | Get new-order alerts, accept / reject, mark packed, see the rider arriving |
| **Delivery partner** | `/rider` | Go on duty, get delivery alerts, accept, navigate, share live GPS, confirm pickup & delivery |

## How an order flows

1. The customer pins their location on the map. The app picks the **nearest active Ayurvedic hub or clinic** (they can choose another nearby one) and calculates the delivery fee from the distance.
2. The customer pays by **UPI, card, or cash on delivery**.
3. Once the order is placed (or paid), the **clinic staff** and **online delivery partners within 15 km** get an alert right away: in-app, with a sound, and as a desktop notification if they turned those on.
4. A rider accepts the delivery. The clinic accepts the order and marks it packed. The rider confirms pickup.
5. The rider's phone streams GPS over WebSockets. The customer, the clinic and the admin all see the **rider moving on the map** along the road route, with a live ETA.
6. The rider marks it delivered. Cash-on-delivery orders are marked as paid at that point.

## Run it

Requires **Node.js 22.13+** and a **[Neon](https://neon.tech) Postgres** database (the free tier is enough).

1. Create a Neon project and copy its connection string (Dashboard → **Connect**).
2. Copy `.env.example` to `.env` and paste the connection string into `DATABASE_URL`. `.env` is git-ignored, so your password stays on your computer.
3. Install dependencies:

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. On the first start the app creates its tables in Neon and loads the demo data.

### Demo logins (development only)

The database is seeded on first run. These buttons also appear on the sign-in page while `NODE_ENV` is not `production`.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Customer | `demo` | `demo123` |
| Clinic desk (Jayanagar) | `clinic1` … `clinic4` | `clinic123` |
| Delivery partner | `rider1`, `rider2` | `rider123` |

To try the whole flow on one computer, sign in to each role on a **different address** so the logins don't overwrite each other: `http://localhost:3000`, `http://127.0.0.1:3000` and `http://[::1]:3000`. Use **Simulate ride** in the rider app to drive along the real road route without moving.

To wipe the database and start fresh (this deletes all orders, users and medicines):

```bash
npm run reset-db -- --yes
```

## Configuration

Put these in `.env` (or set them as environment variables on your host):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Required.** Neon Postgres connection string |
| `PORT` | Default `3000` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin login created on the **first** run. Set these before going live. |
| `JWT_SECRET` | Session signing key. A random key is generated in `data/` if not set. **Set it when hosting**, so logins survive redeploys. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Turns on real UPI and card payments through Razorpay Checkout, with server-side signature checks. Without them, a clearly labelled **demo gateway** is used and nothing is charged. |
| `NODE_ENV=production` | Hides the demo-login panel |

## Before going live

- **Change the seeded accounts.** Set `ADMIN_PASSWORD` before the first run, then disable or reset the demo clinic, rider and customer accounts in the admin console.
- **Replace the demo clinics.** The four Bengaluru clinics are sample data. Add your real hubs and clinics under *Clinics & hubs* (pick each location on the map), then create a clinic login for each one.
- **Use HTTPS.** Browsers only allow GPS and notifications on HTTPS (or localhost), so riders' phones need the site served over HTTPS.
- **Maps.** Map tiles come from OpenStreetMap, routes from the public OSRM demo server, and address lookup from Nominatim. These free services have fair-use limits. For production traffic, use a paid provider (e.g. Mapbox, Google Maps, or your own OSRM). Only `public/js/common.js` needs to change (`makeMap`, `route`, `reverseGeocode`).
- **Prescription items** (marked *Rx*) are flagged to the clinic for vaidya verification. Uploading a prescription is not built yet.

## Project layout

```
server/
  index.js   REST API, auth (JWT + bcrypt), order state machine, notifications, Socket.IO, Razorpay
  db.js      Neon Postgres connection pool, schema, query + transaction helpers
  seed.js    Demo clinics, Ayurvedic medicine catalogue, demo accounts
  reset.js   Drops all tables (npm run reset-db -- --yes)
public/
  index.html             Sign in / register
  shop.html, js/shop.js  Customer app
  clinic.html            Clinic desk
  rider.html, js/rider.js Delivery partner app
  admin.html, js/admin.js Admin console
  js/common.js           API client, notifications bell, toasts, map + routing helpers
  js/orderview.js        Shared order detail with live map
  css/app.css            Design system
```

> Ayurvedic medicines should be taken under the guidance of a qualified practitioner. Product descriptions in the seed data describe traditional use and are not medical advice.
