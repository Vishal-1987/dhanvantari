// Deletes ALL Dhanvantari tables and data in the configured database. Run with --yes to confirm.
import pg from 'pg';

if (!process.argv.includes('--yes')) {
  console.log('This permanently deletes every Dhanvantari table and all orders, users and medicines in DATABASE_URL.');
  console.log('Run again with:  npm run reset-db -- --yes');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('DROP TABLE IF EXISTS notifications, order_events, orders, medicines, users, clinics CASCADE');
await client.end();
console.log('Database cleared. Demo data will be re-seeded on the next start.');
