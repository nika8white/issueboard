import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app, migrate, pool } from "./server.js";

// Runs only when a database is configured, so plain `npm test` still works without one
describe.skipIf(!process.env.DB_HOST)("issues API with a real database", () => {
  beforeAll(async () => {
    await migrate();
  });
  afterAll(async () => {
    await pool.end();
  });

  it("creates an issue and reads it back", async () => {
    const created = await request(app)
      .post("/api/issues")
      .send({ title: "Missing alt text on logo", severity: "high" });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTypeOf("number");

    const list = await request(app).get("/api/issues");
    expect(list.status).toBe(200);
    expect(
      list.body.some((i: { id: number }) => i.id === created.body.id),
    ).toBe(true);
  });

  it("stores a due date exactly as sent", async () => {
    const created = await request(app)
      .post("/api/issues")
      .send({ title: "Pay rent", due_date: "2026-12-01" });
    expect(created.status).toBe(201);
    expect(created.body.due_date).toBe("2026-12-01");
    expect(created.body.severity).toBe("medium");
  });

  it("rejects invalid input", async () => {
    for (const body of [
      {},
      { title: "   " },
      { title: "x", severity: "urgent" },
      { title: "x", due_date: "next week" },
    ]) {
      const res = await request(app).post("/api/issues").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("updates only the fields sent", async () => {
    const { body: issue } = await request(app)
      .post("/api/issues")
      .send({ title: "Draft", severity: "low", due_date: "2026-12-24" });

    const renamed = await request(app).patch(`/api/issues/${issue.id}`).send({ title: "Final" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ title: "Final", severity: "low", due_date: "2026-12-24", status: "open" });

    const done = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .send({ status: "closed", due_date: null });
    expect(done.body).toMatchObject({ title: "Final", status: "closed", due_date: null });

    expect((await request(app).patch(`/api/issues/${issue.id}`).send({ status: "maybe" })).status).toBe(400);
    expect((await request(app).patch(`/api/issues/${issue.id}`).send({})).status).toBe(400);
    expect((await request(app).patch("/api/issues/999999999").send({ title: "x" })).status).toBe(404);
  });

  it("deletes one issue", async () => {
    const { body: issue } = await request(app).post("/api/issues").send({ title: "Temporary" });
    expect((await request(app).delete(`/api/issues/${issue.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/issues/${issue.id}`)).status).toBe(404);
  });

  it("clears completed issues and keeps open ones", async () => {
    const { body: open } = await request(app).post("/api/issues").send({ title: "Still open" });
    const { body: closed } = await request(app).post("/api/issues").send({ title: "Finished" });
    await request(app).patch(`/api/issues/${closed.id}`).send({ status: "closed" });

    expect((await request(app).delete("/api/issues")).status).toBe(400);
    const cleared = await request(app).delete("/api/issues?status=closed");
    expect(cleared.status).toBe(200);
    expect(cleared.body.deleted).toBeGreaterThanOrEqual(1);

    const ids = (await request(app).get("/api/issues")).body.map((i: { id: number }) => i.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(closed.id);
  });
});
