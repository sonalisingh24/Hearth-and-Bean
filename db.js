require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const COLS = 'id, name, category, description, price::float as price, available';

const SEED = [
  { name: 'Espresso', category: 'Coffee', description: 'Rich, bold single shot', price: 120 },
  { name: 'Cappuccino', category: 'Coffee', description: 'Espresso with steamed milk foam', price: 160 },
  { name: 'Cold Coffee', category: 'Coffee', description: 'Chilled blended coffee with ice cream', price: 180 },
  { name: 'Masala Chai', category: 'Tea', description: 'Spiced Indian tea', price: 80 },
  { name: 'Veg Sandwich', category: 'Snacks', description: 'Grilled with cheese and veggies', price: 140 },
  { name: 'French Fries', category: 'Snacks', description: 'Crispy salted fries', price: 110 },
  { name: 'Pasta Alfredo', category: 'Meals', description: 'Creamy white sauce pasta', price: 280 },
  { name: 'Margherita Pizza', category: 'Meals', description: 'Classic cheese and tomato', price: 320 },
  { name: 'Chocolate Brownie', category: 'Desserts', description: 'Warm brownie with chocolate sauce', price: 150 },
  { name: 'Cheesecake', category: 'Desserts', description: 'Baked New York style slice', price: 190 },
];

async function init() {
  await pool.query(`
    create table if not exists menu_items (
      id serial primary key,
      name text not null,
      category text not null,
      description text default '',
      price numeric(10,2) not null check (price > 0),
      available boolean default true
    );
    create table if not exists reservations (
      id serial primary key,
      name text not null,
      phone text not null,
      date date not null,
      time time not null,
      guests int not null check (guests between 1 and 12),
      notes text default '',
      status text default 'pending',
      created_at timestamptz default now()
    );
    create table if not exists orders (
      id serial primary key,
      name text not null,
      phone text not null,
      note text default '',
      total numeric(10,2) not null,
      status text default 'new',
      created_at timestamptz default now()
    );
    create table if not exists order_items (
      id serial primary key,
      order_id int references orders(id) on delete cascade,
      menu_item_id int references menu_items(id),
      name text not null,
      price numeric(10,2) not null,
      qty int not null
    );
    create table if not exists messages (
      id serial primary key,
      name text not null,
      email text not null,
      message text not null,
      created_at timestamptz default now()
    );
  `);

  // seed only when the menu is empty
  const r = await pool.query('select count(*)::int as n from menu_items');
  if (r.rows[0].n === 0) {
    for (const m of SEED) {
      await pool.query(
        'insert into menu_items (name, category, description, price) values ($1,$2,$3,$4)',
        [m.name, m.category, m.description, m.price]
      );
    }
    console.log('Seeded starter menu');
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
    `insert into menu_items (name, category, description, price)
     values ($1,$2,$3,$4) returning ${COLS}`,
    [name, category, description || '', price]
  );
  return r.rows[0];
}

async function updateMenuItem(id, f) {
  const r = await pool.query(
    `update menu_items set
       name = coalesce($1, name),
       description = coalesce($2, description),
       price = coalesce($3, price),
       available = coalesce($4, available)
     where id = $5 returning ${COLS}`,
    [f.name ?? null, f.description ?? null, f.price ?? null, f.available ?? null, id]
  );
  return r.rows[0] || null;
}

async function deleteMenuItem(id) {
  const r = await pool.query('delete from menu_items where id = $1', [id]);
  return r.rowCount > 0;
}
async function createOrder({ name, phone, note, items, total }) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const o = await client.query(
      `insert into orders (name, phone, note, total)
       values ($1,$2,$3,$4) returning id`,
      [name, phone, note || '', total]
    );
    const orderId = o.rows[0].id;
    for (const it of items) {
      await client.query(
        `insert into order_items (order_id, menu_item_id, name, price, qty)
         values ($1,$2,$3,$4,$5)`,
        [orderId, it.id, it.name, it.price, it.qty]
      );
    }
    await client.query('commit');
    return { id: orderId, total };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

async function listOrders() {
  const r = await pool.query(`
    select o.id, o.name, o.phone, o.note, o.total::float as total, o.status,
           o.created_at as "createdAt",
           coalesce(json_agg(json_build_object(
             'id', i.menu_item_id, 'name', i.name,
             'price', i.price::float, 'qty', i.qty
           )) filter (where i.id is not null), '[]') as items
    from orders o
    left join order_items i on i.order_id = o.id
    group by o.id
    order by o.id desc
  `);
  return r.rows;
}

async function updateOrderStatus(id, status) {
  const r = await pool.query(
    `update orders set status = $1 where id = $2
     returning id, status`,
    [status, id]
  );
  return r.rows[0] || null;
}
async function createReservation({ name, phone, date, time, guests, notes }) {
  const r = await pool.query(
    `insert into reservations (name, phone, date, time, guests, notes)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [name, phone, date, time, guests, notes || '']
  );
  return { id: r.rows[0].id };
}

// total guests already booked for one date + time (cancelled ones don't count)
async function countGuests(date, time) {
  const r = await pool.query(
    `select coalesce(sum(guests), 0)::int as n
     from reservations
     where date = $1 and time = $2 and status <> 'cancelled'`,
    [date, time]
  );
  return r.rows[0].n;
}

async function listReservations() {
  const r = await pool.query(
    `select id, name, phone, to_char(date, 'YYYY-MM-DD') as date,
            to_char(time, 'HH24:MI') as time, guests, notes, status,
            created_at as "createdAt"
     from reservations order by id desc`
  );
  return r.rows;
}

async function updateReservationStatus(id, status) {
  const r = await pool.query(
    `update reservations set status = $1 where id = $2 returning id, status`,
    [status, id]
  );
  return r.rows[0] || null;
}

async function createMessage({ name, email, message }) {
  const r = await pool.query(
    `insert into messages (name, email, message) values ($1,$2,$3) returning id`,
    [name, email, message]
  );
  return { id: r.rows[0].id };
}

async function listMessages() {
  const r = await pool.query(
    `select id, name, email, message, created_at as "createdAt"
     from messages order by id desc`
  );
  return r.rows;
}
module.exports = {
  pool, init,
  getMenu, getAllMenu, addMenuItem, updateMenuItem, deleteMenuItem,
  createOrder, listOrders, updateOrderStatus,
  createReservation, countGuests, listReservations, updateReservationStatus,
  createMessage, listMessages,
};