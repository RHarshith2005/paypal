import { describe, expect, it } from "vitest";
import { evaluateMandate, emptyLedger, mandateActive, remainingBudgetMinor, remainingTransactions } from "./mandate";
import { MandateSchema, OfferSchema, type Mandate, type Offer } from "./schemas";

const NOW = new Date("2026-03-01T12:00:00.000Z");

const makeMandate = (overrides: Partial<Mandate> = {}): Mandate =>
  MandateSchema.parse({
    id: "mnd_test_0001",
    version: "handshake.mandate.v1",
    issuer: { id: "prn_dana", displayName: "Dana Ruiz", keyId: "key_prn_dana", identityLabel: "SIMULATED" },
    agentId: "agt_buyer_01",
    currency: "USD",
    maxTotal: 100_000,
    perItemMax: 25_000,
    allowedCategories: ["PPE", "LIGHTING"],
    forbiddenSubstitutions: ["latex", "refurbished"],
    merchantAllowlist: ["agt_merchant_ridgeway"],
    maxTransactions: 5,
    issuedAt: "2026-02-27T00:00:00.000Z",
    expiresAt: "2026-03-06T00:00:00.000Z",
    nonce: "nonce-mandate-0001",
    signature: { alg: "Ed25519", keyId: "key_prn_dana", value: "c2lnbmF0dXJl" },
    ...overrides,
  });

const makeOffer = (
  overrides: Partial<Offer> & { unitPriceMinor?: number; quantity?: number; category?: string; name?: string } = {},
): Offer => {
  const {
    unitPriceMinor = 12_000,
    quantity = 1,
    category = "PPE",
    name = "Nitrile gloves, box of 100",
    ...rest
  } = overrides;
  return OfferSchema.parse({
    currency: "USD",
    items: [{ sku: "sku_gloves", name, category, quantity, unitPriceMinor }],
    totalMinor: unitPriceMinor * quantity,
    deliveryDays: 3,
    terms: "Delivered in three business days.",
    ...rest,
  });
};

describe("evaluateMandate", () => {
  it("allows an offer inside every limit and reports the remaining budget", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer(),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.ruleId).toBe("M-OK-00");
    expect(decision.remainingAfterMinor).toBe(88_000);
    expect(decision.checks).toHaveLength(9);
    expect(decision.checks.every((check) => check.passed)).toBe(true);
  });

  it("blocks an expired mandate", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer(),
      merchantAgentId: "agt_merchant_ridgeway",
      now: new Date("2026-03-06T00:00:01.000Z"),
    });

    expect(mandateActive(makeMandate(), new Date("2026-03-06T00:00:01.000Z"))).toBe(false);
    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-EXPIRED-01");
  });

  it("blocks an offer above the per-item cap", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer({ unitPriceMinor: 30_000 }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-PER-ITEM-07");
  });

  it("caps a single line, not the whole basket", () => {
    const offer = OfferSchema.parse({
      currency: "USD",
      items: [
        { sku: "sku_gloves", name: "Nitrile gloves", category: "PPE", quantity: 1, unitPriceMinor: 20_000 },
        { sku: "sku_lamp", name: "LED work lamp", category: "LIGHTING", quantity: 1, unitPriceMinor: 20_000 },
      ],
      totalMinor: 40_000,
      deliveryDays: 3,
      terms: "Delivered in three business days.",
    });

    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer,
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.offerTotalMinor).toBe(40_000);
  });

  it("blocks an offer that exceeds the remaining lifetime budget", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: { settledMinor: 90_000, reservedMinor: 0, settledCount: 1, reservedCount: 0 },
      offer: makeOffer({ unitPriceMinor: 25_000 }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-BUDGET-08");
  });

  it("counts reserved funds as already spent", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: { settledMinor: 0, reservedMinor: 90_000, settledCount: 0, reservedCount: 1 },
      offer: makeOffer({ unitPriceMinor: 25_000 }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-BUDGET-08");
    expect(decision.remainingBeforeMinor).toBe(10_000);
  });

  it("blocks a merchant that the principal did not approve", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer(),
      merchantAgentId: "agt_merchant_unknown",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-MERCHANT-02");
  });

  it("allows any merchant when the allowlist is null", () => {
    const decision = evaluateMandate({
      mandate: makeMandate({ merchantAllowlist: null }),
      ledger: emptyLedger(),
      offer: makeOffer(),
      merchantAgentId: "agt_merchant_unknown",
      now: NOW,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.checks.find((check) => check.id === "M-MERCHANT-02")?.detail).toMatch(/any merchant/);
  });

  it("blocks a category outside the allowlist even when the price is fine", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer({ category: "FURNITURE" }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-CATEGORY-03");
  });

  it("blocks a forbidden substitution even inside an allowed category", () => {
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: makeOffer({ name: "Latex examination gloves, box of 100" }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-SUBSTITUTION-04");
  });

  it("blocks once the transaction count is exhausted", () => {
    const decision = evaluateMandate({
      mandate: makeMandate({ maxTransactions: 2 }),
      ledger: { settledMinor: 10_000, reservedMinor: 0, settledCount: 2, reservedCount: 0 },
      offer: makeOffer({ unitPriceMinor: 1_000 }),
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-COUNT-09");
  });

  it("rejects an offer whose stated total does not match the line items", () => {
    const offer = makeOffer();
    const tampered = { ...offer, totalMinor: offer.totalMinor - 1 };
    const decision = evaluateMandate({
      mandate: makeMandate(),
      ledger: emptyLedger(),
      offer: tampered as Offer,
      merchantAgentId: "agt_merchant_ridgeway",
      now: NOW,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("M-MATH-06");
  });

  it("refuses a mandate whose per-item cap exceeds its lifetime total", () => {
    expect(() => makeMandate({ perItemMax: 200_000 })).toThrow(/perItemMax/);
  });
});

describe("budget helpers", () => {
  it("never reports a negative remaining budget", () => {
    const mandate = makeMandate();
    const ledger = { settledMinor: 200_000, reservedMinor: 0, settledCount: 1, reservedCount: 0 };
    expect(remainingBudgetMinor(mandate, ledger)).toBe(0);
    expect(remainingTransactions(mandate, ledger)).toBe(4);
  });
});
