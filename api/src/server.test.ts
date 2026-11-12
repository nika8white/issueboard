import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./server.js";

describe("health", () => {
  it("answers /healthz", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(201);
  });
});