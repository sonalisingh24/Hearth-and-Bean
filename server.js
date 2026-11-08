const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Get /api/menu: send the available menu items to the browser
app.get("/api/menu", async (req, res) => {
  try {
    const items = await db.getMenu();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load the menu" });
  }
});
//Connecting to the database before opening the kitchen
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Hearth & Bean running at http://localhost:${PORT}");
    });
  })
  .catch((err) => {
    console.error("Could not connect to the database:", err.message);
  });
//input helpers
const clean = (s, max = 200) =>
  String(s ?? "")
    .trim()
    .slice(0, max);
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const phoneOk = (s) => /^[0-9+\-\s()]{7,16}$/.test(s);
