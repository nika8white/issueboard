import express from "express";
import pg from "pg";

export const pool = new pg.Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "issueboard",
  password: process.env.DB_PASSWORD ?? "issueboard",
  database: process.env.DB_NAME ?? "issueboard",
});

// Return DATE columns as plain "YYYY-MM-DD" strings instead of JS Dates,
// so a due date never shifts by a day because of time zones.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS issues (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  // Additive, idempotent migration: safe to run on every start and on existing data.
  await pool.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date DATE`);
}

const SEVERITIES = ["low", "medium", "high"];
const STATUSES = ["open", "closed"];
const MAX_TITLE = 200;

type IssueFields = { title?: string; severity?: string; status?: string; due_date?: string | null };

// Checks only the fields that are present; returns the clean values or an error message.
function validate(body: Record<string, unknown>): { fields: IssueFields } | { error: string } {
  const fields: IssueFields = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) return { error: "title must be a non-empty string" };
    if (body.title.trim().length > MAX_TITLE) return { error: `title must be at most ${MAX_TITLE} characters` };
    fields.title = body.title.trim();
  }
  if ("severity" in body) {
    if (typeof body.severity !== "string" || !SEVERITIES.includes(body.severity))
      return { error: `severity must be one of ${SEVERITIES.join(", ")}` };
    fields.severity = body.severity;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUSES.includes(body.status))
      return { error: `status must be one of ${STATUSES.join(", ")}` };
    fields.status = body.status;
  }
  if ("due_date" in body) {
    const d = body.due_date;
    if (d === null || d === "") fields.due_date = null;
    else if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))) fields.due_date = d;
    else return { error: "due_date must be YYYY-MM-DD or null" };
  }
  return { fields };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const app = express();
app.use(express.json());

// Liveness: "is the process alive?" Never touches the database.
app.get("/healthz", (_req, res) => { res.send("ok"); });

// Readiness: "can I serve traffic right now?" Fails while the DB is unreachable.
app.get("/readyz", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.send("ready"); }
  catch { res.status(503).send("db unavailable"); }
});

// Lets you verify which build is live after a deploy.
app.get("/api/version", (_req, res) => { res.json({ version: process.env.APP_VERSION ?? "dev" }); });

app.get("/api/issues", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM issues ORDER BY created_at DESC, id DESC");
  res.json(rows);
});

app.post("/api/issues", async (req, res) => {
  const body = { severity: "medium", ...(req.body ?? {}) };
  if (!("title" in body)) { res.status(400).json({ error: "title is required" }); return; }
  const result = validate(body);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const { title, severity, due_date = null } = result.fields;
  const { rows } = await pool.query(
    "INSERT INTO issues (title, severity, due_date) VALUES ($1, $2, $3) RETURNING *",
    [title, severity, due_date]);
  res.status(201).json(rows[0]);
});

// Partial update: only the fields sent are changed.
app.patch("/api/issues/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(404).end(); return; }
  const result = validate(req.body ?? {});
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  const entries = Object.entries(result.fields);
  if (entries.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }
  // Column names come from the fixed list in validate(), never from the request.
  const sets = entries.map(([key], i) => `${key} = $${i + 1}`).join(", ");
  const { rows } = await pool.query(
    `UPDATE issues SET ${sets} WHERE id = $${entries.length + 1} RETURNING *`,
    [...entries.map(([, v]) => v), id]);
  rows[0] ? res.json(rows[0]) : res.status(404).end();
});

app.delete("/api/issues/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(404).end(); return; }
  const { rowCount } = await pool.query("DELETE FROM issues WHERE id = $1", [id]);
  res.status(rowCount ? 204 : 404).end();
});

// "Clear completed": DELETE /api/issues?status=closed. Refuses to run without the filter.
app.delete("/api/issues", async (req, res) => {
  if (req.query.status !== "closed") { res.status(400).json({ error: "only ?status=closed is supported" }); return; }
  const { rowCount } = await pool.query("DELETE FROM issues WHERE status = 'closed'");
  res.json({ deleted: rowCount });
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