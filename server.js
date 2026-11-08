require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- input helpers ----------
const clean = (s, max = 200) => String(s ?? "").trim().slice(0, max);
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

// ---------- admin routes ----------
app.get("/api/admin/check", requireAdmin, (req, res) => {
  res.json({ ok: true });
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
    if (!phoneOk(phone)) return res.status(400).json({ error: "Enter a valid phone number." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Pick a valid date." });
    if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Pick a valid time." });
    if (!(guests >= 1 && guests <= 12)) return res.status(400).json({ error: "Guests must be between 1 and 12." });

    const today = new Date().toISOString().slice(0, 10);
    if (date < today) return res.status(400).json({ error: "Date cannot be in the past." });
    if (time < "08:00" || time > "21:30") {
      return res.status(400).json({ error: "We are open 8:00 AM to 10:00 PM. Last booking 9:30 PM." });
    }

    const taken = await db.countGuests(date, time);
    if (taken + guests > 30) {
      return res.status(409).json({ error: "That slot is full. Please try another time." });
    }

    const r = await db.createReservation({ name, phone, date, time, guests, notes });
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
      return res.status(400).json({ error: "Name, a valid email and a message are required." });
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