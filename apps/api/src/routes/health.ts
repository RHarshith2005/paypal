import { HealthSchema, type Health } from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env";
import type { Store } from "../db/client";
import type { PaymentProvider } from "../paypal/types";
import { API_VERSION } from "../version";

export function registerHealthRoute(
  app: FastifyInstance,
  config: AppConfig,
  store: Store,
  payments: PaymentProvider,
): void {
  app.get("/health", async (_request, reply) => {
    const ping = await store.ping();
    const fallback = payments.runtimeStatus?.();
    const health: Health = HealthSchema.parse({
      status: ping.ok ? "ok" : "degraded",
      service: "handshake-api",
      version: API_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      database: {
        driver: store.driver,
        ok: ping.ok,
        latencyMs: ping.latencyMs,
        error: ping.error,
      },
      paypal: {
        mode: config.paypal.mode,
        configured: Boolean(config.paypal.clientId && config.paypal.clientSecret),
        simulated: payments.simulated,
        fallback: fallback?.fallback ?? false,
      },
      agents: {
        runtime: config.ai.runtime,
        model: config.ai.model,
        dialogue:
          config.ai.runtime === "SIMULATED"
            ? "SCRIPTED"
            : config.ai.llmMode === "replay"
              ? "REPLAY"
              : "LIVE",
      },
    });
    reply.status(ping.ok ? 200 : 503).send(health);
  });
}
