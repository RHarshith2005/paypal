import { describe, expect, it } from "vitest";
import { runDeterministicChecks, validateArbiterVerdict } from "./arbiter";
import type { DisputeFacts } from "./liability";
import { OfferSchema } from "./schemas";

const agreement = OfferSchema.parse({
  currency: "USD",
  items: [
    {
      sku: "sku_gloves",
      name: "Nitrile gloves, box of 100",
      category: "PPE",
      quantity: 2,
      unitPriceMinor: 9_000,
    },
  ],
  totalMinor: 18_000,
  deliveryDays: 3,
  terms: "Delivered in three business days.",
});

const delivered = {
  carrier: "UPS",
  trackingNumber: "1Z999AA10123456784",
  deliveredAt: "2026-03-02T10:00:00.000Z",
  itemMatchesDescription: true,
  label: "SIMULATED" as const,
};

const caseA = (): DisputeFacts => ({
  claimType: "GOODS_NOT_RECEIVED",
  paymentStatus: "COMPLETED",
  chainValid: true,
  buyerSignatureValid: true,
  merchantSignatureValid: true,
  mandateValidAtCapture: true,
  agreement,
  fulfillment: delivered,
  capturedMinor: 18_000,
  agreedMinor: 18_000,
});

const caseB = (): DisputeFacts => ({
  ...caseA(),
  claimType: "MANDATE_BREACH",
  mandateValidAtCapture: false,
});

describe("runDeterministicChecks", () => {
  it("rules a valid purchase when delivery is proven and the mandate was respected", () => {
    const outcome = runDeterministicChecks(caseA());
    expect(outcome.ambiguityReasons).toEqual([]);
    expect(outcome.ambiguous).toBe(false);
    expect(outcome.decision.ruleId).toBe("L-009-DELIVERY-PROVEN");
    expect(outcome.verdict).toBe("VALID_PURCHASE");
    expect(outcome.decision.liability).toBe("BUYER");
    expect(outcome.confidence).toBe(1);
    expect(outcome.findings.every((finding) => finding.passed)).toBe(true);
  });

  it("rules the buyer agent out of mandate when the capture exceeded it", () => {
    const outcome = runDeterministicChecks(caseB());
    expect(outcome.decision.ruleId).toBe("L-006-MANDATE-BREACHED");
    expect(outcome.verdict).toBe("BUYER_AGENT_OUT_OF_MANDATE");
    expect(outcome.decision.liability).toBe("MERCHANT");
    expect(outcome.decision.remedy).toBe("REFUND_FULL");
    expect(outcome.findings.find((finding) => finding.id === "D-05-MANDATE")?.passed).toBe(false);
  });

  it("flags a partial capture as ambiguous instead of guessing", () => {
    const outcome = runDeterministicChecks({ ...caseA(), capturedMinor: 9_000 });
    expect(outcome.ambiguous).toBe(true);
    expect(outcome.ambiguityReasons[0]).toMatch(/does not match the agreed price/);
    expect(outcome.confidence).toBeLessThan(1);
  });

  it("flags conflicting delivery evidence as ambiguous", () => {
    const outcome = runDeterministicChecks({
      ...caseA(),
      fulfillment: { ...delivered, itemMatchesDescription: false },
    });
    expect(outcome.ambiguous).toBe(true);
    expect(outcome.ambiguityReasons[0]).toMatch(/delivered item is itself disputed/);
  });
});

describe("validateArbiterVerdict", () => {
  const allowed = ["ev_receipt", "ev_capture", "ev_mandate"];

  const valid = {
    verdict: "MERCHANT_FAULT",
    liability: { party: "MERCHANT", percent: 100 },
    evidenceRefs: ["ev_receipt", "ev_capture"],
    reasoning: "The merchant captured funds without producing a matching fulfilment record.",
    confidence: 0.82,
  };

  it("accepts an answer that only cites evidence in the packet", () => {
    const result = validateArbiterVerdict(valid, allowed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.verdict).toBe("MERCHANT_FAULT");
  });

  it("rejects an answer citing evidence that is not in the packet", () => {
    const result = validateArbiterVerdict({ ...valid, evidenceRefs: ["ev_receipt", "ev_invented"] }, allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/outside the packet/);
  });

  it("rejects an answer that does not match the schema", () => {
    const result = validateArbiterVerdict({ verdict: "MERCHANT_FAULT", liability: { party: "MERCHANT" } }, allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/required JSON schema/);
  });

  it("rejects an UNRESOLVED liability that still splits a percentage", () => {
    const result = validateArbiterVerdict({ ...valid, liability: { party: "UNRESOLVED", percent: 50 } }, allowed);
    expect(result.ok).toBe(false);
  });
});
