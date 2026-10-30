import { ApiErrorSchema, HealthSchema, LedgerListSchema, MandateListSchema } from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config/env";
import { createStore } from "../src/db/client";

const config = loadConfig(
  {
    NODE_ENV: "test",
    DATABASE_URL: "",
    SEED_DEMO_DATA: "false",
    PAYPAL_MODE: "mock",
    LOG_LEVEL: "error",
    WEB_ORIGIN: "http://localhost:5173",
  },
  { loadDotEnv: false },
);

let app: FastifyInstance;

beforeAll(async () => {
  const store = await createStore(config);
  app = await buildApp({ config, store });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("reports a healthy database and the simulated payment adapter", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);

    const health = HealthSchema.parse(response.json());
    expect(health.status).toBe("ok");
    expect(health.database.ok).toBe(true);
    expect(health.database.driver).toBe("pglite");
    expect(health.paypal.simulated).toBe(true);
    expect(health.agents.runtime).toBe("SIMULATED");
  });

  it("answers CORS preflight for the configured web origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/mandates",
      headers: { origin: "http://localhost:5173", "access-control-request-method": "GET" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("read routes", () => {
  it("returns an empty mandate list before anything is issued", async () => {
    const response = await app.inject({ method: "GET", url: "/api/mandates" });
    expect(response.statusCode).toBe(200);
    const body = MandateListSchema.parse(response.json());
    expect(body.mandates).toEqual([]);
  });

  it("returns an empty ledger before any deal settles", async () => {
    const response = await app.inject({ method: "GET", url: "/api/ledger" });
    expect(response.statusCode).toBe(200);
    const body = LedgerListSchema.parse(response.json());
    expect(body.entries).toEqual([]);
  });

  it("returns a typed 404 for an unknown deal", async () => {
    const response = await app.inject({ method: "GET", url: "/api/deals/deal_missing_0001" });
    expect(response.statusCode).toBe(404);
    const body = ApiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("DEAL_NOT_FOUND");
  });

  it("returns a typed 404 for an unknown dispute", async () => {
    const response = await app.inject({ method: "GET", url: "/api/disputes/dsp_missing_0001" });
    expect(response.statusCode).toBe(404);
    const body = ApiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("DISPUTE_NOT_FOUND");
  });

  it("returns a typed 404 for an unknown route", async () => {
    const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(response.statusCode).toBe(404);
    const body = ApiErrorSchema.parse(response.json());
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});
