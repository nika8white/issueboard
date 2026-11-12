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
});
