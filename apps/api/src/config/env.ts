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
  /** Optional shared secret; when set, mutating API calls must present it. */
  API_WRITE_TOKEN: optionalString,
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(100_000).default(300),

  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().min(1).default(".data/pglite"),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  /** live calls the model; replay serves recorded outputs and never touches the network. */
  LLM_MODE: z.enum(["live", "replay"]).default("live"),
  LLM_CACHE_DIR: z.string().min(1).default(".data/llm-replay"),

  PAYPAL_MODE: z.enum(["mock", "sandbox"]).default("mock"),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_RETURN_URL: z.url().default("http://localhost:5173/?paypal=return"),
  PAYPAL_CANCEL_URL: z.url().default("http://localhost:5173/?paypal=cancel"),
  /** Required to verify webhook deliveries; without it verification is SKIPPED, never assumed. */
  PAYPAL_WEBHOOK_ID: optionalString,
  PAYPAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  PAYPAL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  CHANNEL3_ENABLED: z.enum(["true", "false"]).default("false"),
  CHANNEL3_API_KEY: optionalString,
  CHANNEL3_API_BASE: z.url({ protocol: /^https$/ }).optional(),

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
    writeToken: string | undefined;
    rateLimitMax: number;
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
    llmMode: "live" | "replay";
    cacheDir: string;
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
    webhookId: string | undefined;
    timeoutMs: number;
    maxRetries: number;
  };
  catalog: {
    channel3: {
      /** True only when the operator opted in *and* supplied both a key and a base URL. */
      enabled: boolean;
      apiKey: string | undefined;
      apiBase: string | undefined;
    };
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
      writeToken: env.API_WRITE_TOKEN,
      rateLimitMax: env.RATE_LIMIT_MAX,
    },
    database: {
      url: env.DATABASE_URL,
      driver: env.DATABASE_URL ? "postgres" : "pglite",
      pgliteDir: env.PGLITE_DIR,
    },
    ai: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      // Replay serves recorded model output, so it counts as model-authored dialogue.
      runtime: env.ANTHROPIC_API_KEY || env.LLM_MODE === "replay" ? "MODEL" : "SIMULATED",
      llmMode: env.LLM_MODE,
      cacheDir: resolve(projectRoot, env.LLM_CACHE_DIR),
    },
    paypal: {
      requestedMode: env.PAYPAL_MODE,
      mode: effectivePaypalMode,
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      apiBase: env.PAYPAL_API_BASE,
      returnUrl: env.PAYPAL_RETURN_URL,
      cancelUrl: env.PAYPAL_CANCEL_URL,
      webhookId: env.PAYPAL_WEBHOOK_ID,
      timeoutMs: env.PAYPAL_TIMEOUT_MS,
      maxRetries: env.PAYPAL_MAX_RETRIES,
    },
    catalog: {
      channel3: {
        enabled: env.CHANNEL3_ENABLED === "true" && Boolean(env.CHANNEL3_API_KEY && env.CHANNEL3_API_BASE),
        apiKey: env.CHANNEL3_API_KEY,
        apiBase: env.CHANNEL3_API_BASE,
      },
    },
    paths: {
      migrations: join(apiDir, "drizzle"),
    },
  };
}
