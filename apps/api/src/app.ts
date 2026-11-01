import { createHash, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { LlmClient } from "./agents/llm";
import { DisputeArbiter } from "./arbiter/service";
import { createCatalogProvider, type CatalogProvider } from "./catalog";
import type { AppConfig } from "./config/env";
import type { Store } from "./db/client";
import { DealEventBus } from "./deals/events";
import { DealOrchestrator } from "./deals/orchestrator";
import { registerErrorHandlers } from "./http/errors";
import { createPaymentProvider, type PaymentProvider } from "./paypal";
import { registerDataRoutes } from "./routes/data";
import { registerDealRoutes } from "./routes/deals";
import { registerDemoRoutes } from "./routes/demo";
import { registerHealthRoute } from "./routes/health";
import { seedDemo } from "./seed/demo";
import { SimulatedTrustAnchor } from "./trust-anchor/anchor";

export interface AppDependencies {
  config: AppConfig;
  store: Store;
  /** Test seams. Production builds them from config. */
  payments?: PaymentProvider;
  catalog?: CatalogProvider;
  llm?: LlmClient | null;
  /** Test seam: a pre-loaded anchor, for example one with a revoked merchant. */
  anchor?: SimulatedTrustAnchor;
  now?: () => Date;
  /** Set false to skip the demo seed (tests, CI). */
  seed?: boolean;
}

function loggerOptions(config: AppConfig): FastifyServerOptions["logger"] {
  if (config.env.nodeEnv === "test") return false;
  const base = {
    level: config.env.logLevel,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
      censor: "[redacted]",
    },
  };
  if (config.env.nodeEnv === "development") {
    return {
      ...base,
      transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    };
  }
  return base;
}

export async function buildApp({ config, store, ...overrides }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: false,
    bodyLimit: 64 * 1024,
    connectionTimeout: 30_000,
  });

  await app.register(cors, {
    origin: config.env.webOrigin,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["content-type", "accept", "x-handshake-write-token"],
  });

  await app.register(rateLimit, {
    max: config.env.rateLimitMax,
    timeWindow: "1 minute",
    // Health checks are polled by the platform and must never be throttled.
    allowList: (request) => request.url.startsWith("/health"),
  });

  // Optional shared write token: when configured, every mutating API call must
  // present it. Off by default for the local single-operator demo.
  if (config.env.writeToken) {
    const expected = createHash("sha256").update(config.env.writeToken).digest();
    app.addHook("onRequest", async (request, reply) => {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
      if (!request.url.startsWith("/api")) return;
      const header = request.headers["x-handshake-write-token"];
      const provided = typeof header === "string" ? createHash("sha256").update(header).digest() : null;
      if (!provided || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        reply.status(401).send({
          error: {
            code: "WRITE_TOKEN_REQUIRED",
            message: "This API requires the configured write token for mutating requests.",
            details: null,
          },
        });
      }
    });
  }

  registerErrorHandlers(app);

  const now = overrides.now ?? (() => new Date());
  const payments = overrides.payments ?? createPaymentProvider(config.paypal, { now: () => now().getTime() });
  registerHealthRoute(app, config, store, payments);
  const catalog = overrides.catalog ?? createCatalogProvider(config, now);
  const llm = overrides.llm === undefined ? LlmClient.create(config) : overrides.llm;
  const anchor = overrides.anchor ?? (await SimulatedTrustAnchor.load(store.db, now));
  const bus = new DealEventBus();

  const orchestrator = new DealOrchestrator({
    db: store.db,
    config,
    payments,
    catalog,
    anchor,
    bus,
    llm,
    now,
    log: app.log,
  });
  const arbiter = new DisputeArbiter({ db: store.db, store, payments, llm, bus, now, log: app.log });

  await app.register(
    async (instance) => {
      registerDataRoutes(instance, store);
      registerDealRoutes(instance, { store, config, orchestrator, arbiter, bus });
      registerDemoRoutes(instance, {
        db: store.db,
        listMandates: () => store.listMandates(),
        orchestrator,
        arbiter,
        now,
      });
    },
    { prefix: "/api" },
  );

  if (config.env.seedDemoData && overrides.seed !== false) {
    try {
      const result = await seedDemo({ db: store.db, orchestrator, arbiter, now });
      if (result.seeded) {
        app.log.info({ cases: result.cases.map((run) => run.caseLabel) }, "Seeded demo cases A and B");
      }
    } catch (error) {
      // An explicit seed request must not silently produce half-seeded data.
      if (overrides.seed === true) throw error;
      app.log.warn({ err: error }, "demo seed failed; starting with an empty ledger");
    }
  }

  app.addHook("onClose", async () => {
    await store.close();
  });

  return app;
}
