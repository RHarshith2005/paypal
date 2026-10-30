import { describe, expect, it } from "vitest";
import { assertNonceUnused, NonceRegistry, NonceReplayError } from "./nonce";

describe("nonce registry", () => {
  it("accepts a fresh nonce once", () => {
    const registry = new NonceRegistry();
    const result = registry.claim("nonce-mandate-0001", { at: new Date("2026-03-01T00:00:00.000Z") });

    expect(result.ok).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.has("nonce-mandate-0001")).toBe(true);
  });

  it("rejects a replayed nonce and reports when it was first used", () => {
    const registry = new NonceRegistry();
    const first = registry.claim("nonce-mandate-0001", {
      scope: "mandate",
      at: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(first.ok).toBe(true);

    const replay = registry.claim("nonce-mandate-0001", {
      scope: "mandate",
      at: new Date("2026-03-01T00:00:05.000Z"),
    });

    expect(replay).toEqual({
      ok: false,
      reason: "NONCE_REPLAY",
      firstSeenAt: "2026-03-01T00:00:00.000Z",
      scope: "mandate",
    });
    expect(registry.size).toBe(1);
  });

  it("treats a nonce as global, not per scope", () => {
    const registry = new NonceRegistry();
    expect(registry.claim("nonce-shared-0001", { scope: "mandate" }).ok).toBe(true);
    expect(registry.claim("nonce-shared-0001", { scope: "handshake" }).ok).toBe(false);
  });

  it("throws from use() so a replay cannot be ignored", () => {
    const registry = new NonceRegistry();
    registry.use("nonce-handshake-0001");
    expect(() => registry.use("nonce-handshake-0001")).toThrow(NonceReplayError);
    expect(() => registry.use("nonce-handshake-0001")).toThrow(/already used/);
  });

  it("assertNonceUnused rejects a nonce present in a persisted set", () => {
    expect(() => assertNonceUnused("nonce-mandate-0001", ["nonce-mandate-0002"])).not.toThrow();

    try {
      assertNonceUnused("nonce-mandate-0001", ["nonce-mandate-0001"]);
      throw new Error("expected a NonceReplayError");
    } catch (error) {
      expect(error).toBeInstanceOf(NonceReplayError);
      expect((error as NonceReplayError).code).toBe("NONCE_REPLAY");
    }
  });

  it("snapshots claims deterministically", () => {
    const registry = new NonceRegistry();
    registry.claim("nonce-b", { at: new Date("2026-03-01T00:00:01.000Z") });
    registry.claim("nonce-a", { at: new Date("2026-03-01T00:00:00.000Z") });
    expect(registry.snapshot().map((claim) => claim.nonce)).toEqual(["nonce-a", "nonce-b"]);
  });
});
