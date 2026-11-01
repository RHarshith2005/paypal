import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env";

const load = (source: NodeJS.ProcessEnv) => loadConfig(source, { loadDotEnv: false });

describe("environment loading", () => {
  it("treats an empty optional channel3 base as unset, not invalid", () => {
    // Copying .env.example yields empty optional values; that must boot.
    const config = load({ NODE_ENV: "test", CHANNEL3_API_BASE: "", CHANNEL3_ENABLED: "false" });
    expect(config.catalog.channel3.apiBase).toBeUndefined();
    expect(config.catalog.channel3.enabled).toBe(false);
  });

  it("refuses a non-https catalog base", () => {
    expect(() => load({ NODE_ENV: "test", CHANNEL3_API_BASE: "http://evil.example" })).toThrow(/Invalid environment/);
  });

  it("keeps sandbox mode only when both credentials are present", () => {
    const withoutSecret = load({ NODE_ENV: "test", PAYPAL_MODE: "sandbox", PAYPAL_CLIENT_ID: "abc" });
    expect(withoutSecret.paypal.mode).toBe("mock");

    const withSecret = load({
      NODE_ENV: "test",
      PAYPAL_MODE: "sandbox",
      PAYPAL_CLIENT_ID: "abc",
      PAYPAL_CLIENT_SECRET: "def",
    });
    expect(withSecret.paypal.mode).toBe("sandbox");
  });

  it("treats replay as model-authored dialogue without a key", () => {
    const config = load({ NODE_ENV: "test", LLM_MODE: "replay" });
    expect(config.ai.runtime).toBe("MODEL");
    expect(config.ai.llmMode).toBe("replay");
  });

  it("fails closed on an unknown log level", () => {
    expect(() => load({ NODE_ENV: "test", LOG_LEVEL: "verbose" })).toThrow(/Invalid environment/);
  });
});
