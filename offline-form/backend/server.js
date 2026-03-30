require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Your backend is running!");
});

// Helper to ensure DB is ready
let dbInitialized = false;
async function ensureDB() {
  if (dbInitialized) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_entries (
        id          SERIAL PRIMARY KEY,
        name        TEXT,
        number      TEXT,
        email       TEXT,
        age_group   TEXT,
        source      TEXT,
        pin_code    TEXT,
        feedback    TEXT,
        submitted_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    dbInitialized = true;
    console.log("DB ready");
  } catch (err) {
    console.error("DB init error:", err.message);
    throw err;
  }
}

app.get("/entries", async (req, res) => {
  try {
    await ensureDB();
    const result = await pool.query(
      "SELECT * FROM form_entries ORDER BY created_at DESC LIMIT 100"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("DB fetch error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/submit", async (req, res) => {
  const { name, number, email, ageGroup, source, pinCode, feedback, time } =
    req.body;

  if (!name || !number || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await ensureDB();
    await pool.query(
      `INSERT INTO form_entries
         (name, number, email, age_group, source, pin_code, feedback, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [name, number, email, ageGroup, source, pinCode, feedback, time]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("DB insert error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Local dev only
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel
module.exports = app;
