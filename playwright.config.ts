import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end demos run against a real API with a dedicated PGlite directory, so a
 * run never touches the demo database you use in the browser.
 *
 * The mock PayPal adapter and the scripted negotiator are used on purpose: the
 * e2e suite must pass with no credentials and no network.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @handshake/api dev",
      url: "http://127.0.0.1:8787/health",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: "development",
        API_HOST: "127.0.0.1",
        API_PORT: "8787",
        WEB_ORIGIN: "http://127.0.0.1:5173",
        PGLITE_DIR: ".data/e2e",
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
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:8787" },
    },
  ],
});
