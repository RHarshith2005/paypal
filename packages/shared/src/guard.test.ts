import { describe, expect, it } from "vitest";
import { checkOffer, DEMO_BYPASS_RULE_ID } from "./guard";
import { emptyLedger } from "./mandate";
import { MandateSchema, OfferSchema } from "./schemas";
import type { Mandate, Offer } from "./schemas";

const NOW = new Date("2026-03-01T12:00:00.000Z");

const mandate: Mandate = MandateSchema.parse({
  id: "mnd_guard_0001",
  version: "handshake.mandate.v1",
  issuer: { id: "prn_dana", displayName: "Dana Ruiz", keyId: "key_prn_dana", identityLabel: "SIMULATED" },
  agentId: "agt_buyer_01",
  currency: "USD",
  maxTotal: 100_000,
  perItemMax: 25_000,
  allowedCategories: ["PPE"],
  forbiddenSubstitutions: ["latex"],
  merchantAllowlist: ["agt_merchant_ridgeway"],
  maxTransactions: 5,
  issuedAt: "2026-02-27T00:00:00.000Z",
  expiresAt: "2026-03-06T00:00:00.000Z",
  nonce: "nonce-guard-0001",
  signature: { alg: "Ed25519", keyId: "key_prn_dana", value: "c2lnbmF0dXJl" },
});

const offer = (unitPriceMinor = 10_000): Offer =>
  OfferSchema.parse({
    currency: "USD",
    items: [{ sku: "sku_gloves", name: "Nitrile gloves, box of 100", category: "PPE", quantity: 1, unitPriceMinor }],
    totalMinor: unitPriceMinor,
    deliveryDays: 3,
    terms: "Delivered in three business days.",
  });

const guard = (overrides: Parameters<typeof checkOffer>[0] extends infer T ? Partial<T> : never = {}) =>
  checkOffer({
    mandate,
    ledger: emptyLedger(),
    offer: offer(),
    merchantAgentId: "agt_merchant_ridgeway",
    tool: "propose_offer",
    now: NOW,
    ...overrides,
  });

describe("checkOffer", () => {
  it("allows an offer inside the mandate", () => {
    const outcome = guard();
    expect(outcome.allowed).toBe(true);
    expect(outcome.ruleId).toBe("M-OK-00");
    expect(outcome.reasonCodes).toEqual([]);
    expect(outcome.bypassed).toBe(false);
  });

  it("denies with the failing rule ids as reason codes", () => {
    const outcome = guard({ merchantAgentId: "agt_merchant_unknown" });
    expect(outcome.allowed).toBe(false);
    expect(outcome.ruleId).toBe("M-MERCHANT-02");
    expect(outcome.reasonCodes).toContain("M-MERCHANT-02");
  });

  it("denies a cart that exceeds the per-item cap", () => {
    const outcome = guard({ offer: offer(30_000) });
    expect(outcome.allowed).toBe(false);
    expect(outcome.reasonCodes).toEqual(["M-PER-ITEM-07"]);
  });

  it("denies an expired mandate", () => {
    const outcome = guard({ now: new Date("2026-03-07T00:00:00.000Z") });
    expect(outcome.allowed).toBe(false);
    expect(outcome.reasonCodes).toContain("M-EXPIRED-01");
  });

  it("denies a forbidden substitution", () => {
    const latex = OfferSchema.parse({
      currency: "USD",
      items: [
        { sku: "sku_latex", name: "Latex gloves, box of 100", category: "PPE", quantity: 1, unitPriceMinor: 9_000 },
      ],
      totalMinor: 9_000,
      deliveryDays: 3,
      terms: "Delivered in three business days.",
    });
    const outcome = guard({ offer: latex });
    expect(outcome.allowed).toBe(false);
    expect(outcome.reasonCodes).toContain("M-SUBSTITUTION-04");
  });

  it("lets a DEMO bypass through but still records every limit it skipped", () => {
    const outcome = guard({
      offer: offer(30_000),
      bypass: { label: "DEMO_MISCONFIGURATION", reason: "case B: guard not wired into the tool loop" },
    });

    expect(outcome.allowed).toBe(true);
    expect(outcome.bypassed).toBe(true);
    expect(outcome.ruleId).toBe(DEMO_BYPASS_RULE_ID);
    expect(outcome.bypassLabel).toBe("DEMO_MISCONFIGURATION");
    expect(outcome.reasonCodes).toEqual(["G-BYPASS-00", "M-PER-ITEM-07"]);
    expect(outcome.checks.find((check) => check.id === "M-PER-ITEM-07")?.passed).toBe(false);
  });
});
