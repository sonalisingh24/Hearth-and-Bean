require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const COLS = 'id, name, category, description, price::float as price, available';

const SEED = [
  // paste the same 10 items from your seed.js here
  { name: 'Espresso', category: 'Coffee', description: 'Rich, bold single shot', price: 120 },
];

async function init() {
  // paste your five "create table" statements here, changed to "create table if not exists"
  const r = await pool.query('select count(*)::int as n from menu_items');
  if (r.rows[0].n === 0) {
    for (const m of SEED) {
      await pool.query(
        'insert into menu_items (name, category, description, price) values ($1,$2,$3,$4)',
        [m.name, m.category, m.description, m.price]
      );
    }
  }
}

async function getMenu() {
  const r = await pool.query(`select ${COLS} from menu_items where available = true order by category, id`);
  return r.rows;
}

async function getAllMenu() {
  const r = await pool.query(`select ${COLS} from menu_items order by category, id`);
  return r.rows;
}

async function addMenuItem({ name, category, description, price }) {
  const r = await pool.query(
    `insert into menu_items (name, category, description, price) values ($1,$2,$3,$4) returning ${COLS}`,
    [name, category, description || '', price]
  );
  return r.rows[0];
}

async function updateMenuItem(id, f) {
  const r = await pool.query(
    `update menu_items set
       name = coalesce($1, name), description = coalesce($2, description),
       price = coalesce($3, price), available = coalesce($4, available)
     where id = $5 returning ${COLS}`,
    [f.name ?? null, f.description ?? null, f.price ?? null, f.available ?? null, id]
  );
  return r.rows[0] || null;
}

async function deleteMenuItem(id) {
  const r = await pool.query('delete from menu_items where id = $1', [id]);
  return r.rowCount > 0;
}

module.exports = { pool, init, getMenu, getAllMenu, addMenuItem, updateMenuItem, deleteMenuItem };