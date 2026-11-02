import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshot capture config.
 *
 * Separate from playwright.config.ts so `pnpm test:e2e` never picks up the
 * capture walk. It boots the same API + web pair with mock payments and the
 * scripted negotiator, so the shots need no credentials.
 */
export default defineConfig({
  testDir: "./capture",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1991, height: 1415 },
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1991, height: 1415 } } }],
  webServer: [
    {
      command: "pnpm --filter @handshake/api dev",
      url: "http://127.0.0.1:8787/health",
      timeout: 180_000,
      reuseExistingServer: true,
      env: {
        NODE_ENV: "development",
        API_HOST: "127.0.0.1",
        API_PORT: "8787",
        WEB_ORIGIN: "http://127.0.0.1:5173",
        PGLITE_DIR: ".data/capture",
        SEED_DEMO_DATA: "true",
        PAYPAL_MODE: "mock",
        LLM_MODE: "live",
        DATABASE_URL: "",
      },
    },
    {
      command: "pnpm --filter @handshake/web dev --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      timeout: 120_000,
      reuseExistingServer: true,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:8787" },
    },
  ],
});
