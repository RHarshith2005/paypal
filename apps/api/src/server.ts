import { buildApp } from "./app";
import { loadConfig } from "./config/env";
import { createStore } from "./db/client";

const config = loadConfig();
const store = await createStore(config);
const app = await buildApp({ config, store });

if (config.paypal.mode === "mock") {
  app.log.warn(
    { requestedMode: config.paypal.requestedMode },
    "PayPal mock adapter active — payments are SIMULATED. Set PAYPAL_CLIENT_ID/SECRET to use the sandbox.",
  );
}
if (config.ai.runtime === "SIMULATED") {
  app.log.warn("No ANTHROPIC_API_KEY — agent dialogue runs the SIMULATED scripted negotiator.");
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.env.port, host: config.env.host });
app.log.info(
  {
    database: store.driver,
    paypal: config.paypal.mode,
    agentRuntime: config.ai.runtime,
    webOrigin: config.env.webOrigin,
  },
  "Handshake API ready",
);
