import express from "express";
import pg from "pg";

export const pool = new pg.Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "issueboard",
  password: process.env.DB_PASSWORD ?? "issueboard",
  database: process.env.DB_NAME ?? "issueboard",
});

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

export const app = express();
app.use(express.json());

// Liveness: "is the process alive?" Never touches the database.
app.get("/healthz", (_req, res) => { res.send("ok"); });

// Readiness: "can I serve traffic right now?" Fails while the DB is unreachable.
app.get("/readyz", async (_req, res) => {
  // LAB 3: deliberately broken, never ready
  res.status(503).send("not ready");
});

// Lets you verify which build is live after a deploy.
app.get("/api/version", (_req, res) => { res.json({ version: process.env.APP_VERSION ?? "dev" }); });

app.get("/api/issues", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM issues ORDER BY created_at DESC");
  res.json(rows);
});

app.post("/api/issues", async (req, res) => {
  const { title, severity = "medium" } = req.body ?? {};
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const { rows } = await pool.query(
    "INSERT INTO issues (title, severity) VALUES ($1, $2) RETURNING *", [title, severity]);
  res.status(201).json(rows[0]);
});

app.patch("/api/issues/:id", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE issues SET status = $1 WHERE id = $2 RETURNING *", [req.body?.status, req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).end();
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  migrate()
    .then(() => {
      const server = app.listen(port, () => console.log(`api listening on :${port}`));
      // Kubernetes sends SIGTERM before killing a pod: finish open requests, then exit.
      process.on("SIGTERM", () => server.close(() => pool.end()));
    })
    .catch((err) => { console.error("startup failed", err); process.exit(1); });
}