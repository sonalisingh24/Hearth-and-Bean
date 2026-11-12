require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- input helpers ----------
const clean = (s, max = 200) =>
  String(s ?? "")
    .trim()
    .slice(0, max);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const phoneOk = (s) => /^[0-9+\-\s()]{7,16}$/.test(s);

// ---------- admin protection ----------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN || req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---------- public routes ----------
app.get("/api/menu", async (req, res) => {
  try {
    res.json(await db.getMenu());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the menu" });
  }
});

// ---------- orders route -----------
app.post("/api/orders", async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const phone = clean(req.body.phone, 20);
    const note = clean(req.body.note, 300);
    const cart = Array.isArray(req.body.items) ? req.body.items : [];

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (!phoneOk(phone))
      return res.status(400).json({ error: "Enter a valid phone number." });
    if (!cart.length)
      return res.status(400).json({ error: "Your cart is empty." });

    // prices always come from the database, never from the browser
    const menu = await db.getMenu();
    const items = [];
    let total = 0;
    for (const line of cart) {
      const dish = menu.find((m) => m.id === Number(line.id));
      const qty = parseInt(line.qty, 10);
      if (!dish || !(qty >= 1 && qty <= 20)) {
        return res.status(400).json({ error: "Invalid item in cart." });
      }
      items.push({ id: dish.id, name: dish.name, price: dish.price, qty });
      total += dish.price * qty;
    }

    const order = await db.createOrder({ name, phone, note, items, total });
    res.status(201).json({ ok: true, id: order.id, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- admin routes ----------
app.get("/api/admin/check", requireAdmin, (req, res) => {
  res.json({ ok: true });
});
// view everything for the admin page
app.get("/api/admin/data", requireAdmin, async (req, res) => {
  try {
    const [menu, orders, reservations, messages] = await Promise.all([
      db.getAllMenu(),
      db.listOrders(),
      db.listReservations(),
      db.listMessages(),
    ]);
    res.json({ menu, orders, reservations, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// add a menu item
app.post("/api/admin/menu", requireAdmin, async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const category = clean(req.body.category, 40);
    const description = clean(req.body.description, 200);
    const price = Number(req.body.price);
    if (!name || !category)
      return res.status(400).json({ error: "Name and category are required." });
    if (!(price > 0))
      return res.status(400).json({ error: "Price must be more than 0." });
    const item = await db.addMenuItem({ name, category, description, price });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// change a menu item (price, name, description, or hide/show)
app.patch("/api/admin/menu/:id", requireAdmin, async (req, res) => {
  try {
    const fields = {};
    if (req.body.name !== undefined) fields.name = clean(req.body.name, 80);
    if (req.body.description !== undefined)
      fields.description = clean(req.body.description, 200);
    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!(price > 0))
        return res.status(400).json({ error: "Price must be more than 0." });
      fields.price = price;
    }
    if (req.body.available !== undefined)
      fields.available = Boolean(req.body.available);
    const item = await db.updateMenuItem(Number(req.params.id), fields);
    if (!item) return res.status(404).json({ error: "Item not found." });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// delete a menu item
app.delete("/api/admin/menu/:id", requireAdmin, async (req, res) => {
  try {
    const ok = await db.deleteMenuItem(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "Item not found." });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        error: "This item is in past orders. Hide it instead of deleting it.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// change an order's status
const ORDER_STATUSES = ["new", "preparing", "ready", "completed", "cancelled"];
app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  try {
    const status = req.body.status;
    if (!ORDER_STATUSES.includes(status))
      return res.status(400).json({ error: "Invalid status." });
    const order = await db.updateOrderStatus(Number(req.params.id), status);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// change a reservation's status
const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"];
app.patch("/api/admin/reservations/:id", requireAdmin, async (req, res) => {
  try {
    const status = req.body.status;
    if (!RESERVATION_STATUSES.includes(status))
      return res.status(400).json({ error: "Invalid status." });
    const reservation = await db.updateReservationStatus(
      Number(req.params.id),
      status,
    );
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found." });
    res.json(reservation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- reservations and contact ----------
app.post("/api/reservations", async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const phone = clean(req.body.phone, 20);
    const date = clean(req.body.date, 10);
    const time = clean(req.body.time, 5);
    const notes = clean(req.body.notes, 300);
    const guests = parseInt(req.body.guests, 10);

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (!phoneOk(phone))
      return res.status(400).json({ error: "Enter a valid phone number." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "Pick a valid date." });
    if (!/^\d{2}:\d{2}$/.test(time))
      return res.status(400).json({ error: "Pick a valid time." });
    if (!(guests >= 1 && guests <= 12))
      return res
        .status(400)
        .json({ error: "Guests must be between 1 and 12." });

    const today = new Date().toISOString().slice(0, 10);
    if (date < today)
      return res.status(400).json({ error: "Date cannot be in the past." });
    if (time < "08:00" || time > "21:30") {
      return res.status(400).json({
        error: "We are open 8:00 AM to 10:00 PM. Last booking 9:30 PM.",
      });
    }

    const taken = await db.countGuests(date, time);
    if (taken + guests > 30) {
      return res
        .status(409)
        .json({ error: "That slot is full. Please try another time." });
    }

    const r = await db.createReservation({
      name,
      phone,
      date,
      time,
      guests,
      notes,
    });
    res.status(201).json({ ok: true, id: r.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const name = clean(req.body.name, 80);
    const email = clean(req.body.email, 120);
    const message = clean(req.body.message, 1000);
    if (!name || !emailOk(email) || !message) {
      return res
        .status(400)
        .json({ error: "Name, a valid email and a message are required." });
    }
    await db.createMessage({ name, email, message });
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- start ----------
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Hearth & Bean running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Could not connect to the database:", err.message);
  });
