import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config/env";
import type { Store } from "./db/client";
import { registerErrorHandlers } from "./http/errors";
import { registerDataRoutes } from "./routes/data";
import { registerHealthRoute } from "./routes/health";

export interface AppDependencies {
  config: AppConfig;
  store: Store;
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

export async function buildApp({ config, store }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(config), trustProxy: false });

  await app.register(cors, {
    origin: config.env.webOrigin,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  });

  registerErrorHandlers(app);
  registerHealthRoute(app, config, store);
  await app.register(
    async (instance) => {
      registerDataRoutes(instance, store);
    },
    { prefix: "/api" },
  );

  app.addHook("onClose", async () => {
    await store.close();
  });

  return app;
}
