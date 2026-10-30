import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const projectRoot = resolve(apiDir, "../..");

/** Load .env files if present. Real environment variables always win. */
function loadEnvFiles(): void {
  const candidates = [join(projectRoot, ".env.local"), join(projectRoot, ".env"), join(apiDir, ".env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch {
      // A malformed .env should not crash the process before zod can explain it.
    }
  }
}

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),

  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().min(1).default(".data/pglite"),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),

  PAYPAL_MODE: z.enum(["mock", "sandbox"]).default("mock"),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_RETURN_URL: z.url().default("http://localhost:5173/?paypal=return"),
  PAYPAL_CANCEL_URL: z.url().default("http://localhost:5173/?paypal=cancel"),

  SEED_DEMO_DATA: z.enum(["true", "false"]).default("true"),
});

export type PaypalMode = "mock" | "sandbox";
export type AgentRuntime = "MODEL" | "SIMULATED";
export type DatabaseDriver = "postgres" | "pglite";

export interface AppConfig {
  env: {
    nodeEnv: "development" | "test" | "production";
    port: number;
    host: string;
    logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    webOrigin: string;
    seedDemoData: boolean;
  };
  database: {
    url: string | undefined;
    driver: DatabaseDriver;
    pgliteDir: string;
  };
  ai: {
    apiKey: string | undefined;
    model: string;
    runtime: AgentRuntime;
  };
  paypal: {
    /** Requested mode from the environment. */
    requestedMode: PaypalMode;
    /** Effective mode: sandbox only when credentials are actually present. */
    mode: PaypalMode;
    clientId: string | undefined;
    clientSecret: string | undefined;
    apiBase: string;
    returnUrl: string;
    cancelUrl: string;
  };
  paths: {
    migrations: string;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env, options: { loadDotEnv?: boolean } = {}): AppConfig {
  if (options.loadDotEnv !== false) loadEnvFiles();
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const hasPaypalCredentials = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  const effectivePaypalMode: PaypalMode = env.PAYPAL_MODE === "sandbox" && hasPaypalCredentials ? "sandbox" : "mock";

  return {
    env: {
      nodeEnv: env.NODE_ENV,
      port: env.API_PORT,
      host: env.API_HOST,
      logLevel: env.LOG_LEVEL,
      webOrigin: env.WEB_ORIGIN,
      seedDemoData: env.SEED_DEMO_DATA === "true",
    },
    database: {
      url: env.DATABASE_URL,
      driver: env.DATABASE_URL ? "postgres" : "pglite",
      pgliteDir: env.PGLITE_DIR,
    },
    ai: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      runtime: env.ANTHROPIC_API_KEY ? "MODEL" : "SIMULATED",
    },
    paypal: {
      requestedMode: env.PAYPAL_MODE,
      mode: effectivePaypalMode,
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      apiBase: env.PAYPAL_API_BASE,
      returnUrl: env.PAYPAL_RETURN_URL,
      cancelUrl: env.PAYPAL_CANCEL_URL,
    },
    paths: {
      migrations: join(apiDir, "drizzle"),
    },
  };
}
