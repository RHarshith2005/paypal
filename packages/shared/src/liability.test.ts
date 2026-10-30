import { describe, expect, it } from "vitest";
import { decideLiability, EVIDENCE, type DisputeFacts } from "./liability";
import { OfferSchema } from "./schemas";

const agreement = OfferSchema.parse({
  currency: "USD",
  items: [
    {
      sku: "sku_gloves",
      name: "Nitrile gloves, box of 100",
      category: "PPE",
      quantity: 2,
      unitPriceMinor: 12_500,
    },
  ],
  totalMinor: 25_000,
  deliveryDays: 3,
  terms: "Delivered in three business days, packed in cases of twelve.",
});

const facts = (overrides: Partial<DisputeFacts> = {}): DisputeFacts => ({
  claimType: "GOODS_NOT_RECEIVED",
  paymentStatus: "COMPLETED",
  chainValid: true,
  buyerSignatureValid: true,
  merchantSignatureValid: true,
  mandateValidAtCapture: true,
  agreement,
  fulfillment: {
    carrier: "UPS",
    trackingNumber: "1Z999AA10123456784",
    deliveredAt: "2026-03-02T10:00:00.000Z",
    itemMatchesDescription: true,
    label: "SIMULATED",
  },
  ...overrides,
});

describe("decideLiability", () => {
  it("refuses to rule when no capture settled", () => {
    const decision = decideLiability(facts({ paymentStatus: "FAILED" }));
    expect(decision.liability).toBe("UNRESOLVED");
    expect(decision.remedy).toBe("NO_ACTION");
    expect(decision.ruleId).toBe("L-001-NO-SETTLEMENT");
  });

  it("rejects the packet when the transcript chain does not verify", () => {
    const decision = decideLiability(facts({ chainValid: false }));
    expect(decision.liability).toBe("UNRESOLVED");
    expect(decision.citations).toContain(EVIDENCE.chain);
  });

  it("holds the merchant liable when its receipt signature is invalid", () => {
    const decision = decideLiability(facts({ merchantSignatureValid: false }));
    expect(decision.liability).toBe("MERCHANT");
    expect(decision.remedy).toBe("REFUND_FULL");
    expect(decision.refundPercent).toBe(100);
  });

  it("rejects claims whose buyer signature does not verify", () => {
    const decision = decideLiability(facts({ buyerSignatureValid: false }));
    expect(decision.liability).toBe("BUYER");
    expect(decision.remedy).toBe("NO_ACTION");
  });

  it("awards the buyer when the merchant has no fulfilment record", () => {
    const decision = decideLiability(facts({ fulfillment: null }));
    expect(decision.liability).toBe("MERCHANT");
    expect(decision.remedy).toBe("REFUND_FULL");
    expect(decision.ruleId).toBe("L-008-NO-FULFILMENT-EVIDENCE");
  });

  it("rejects a not-received claim when delivery is proven", () => {
    const decision = decideLiability(facts());
    expect(decision.liability).toBe("BUYER");
    expect(decision.remedy).toBe("NO_ACTION");
    expect(decision.ruleId).toBe("L-009-DELIVERY-PROVEN");
  });

  it("refunds a description mismatch in full", () => {
    const decision = decideLiability(
      facts({
        claimType: "NOT_AS_DESCRIBED",
        fulfillment: {
          carrier: "UPS",
          trackingNumber: "1Z999AA10123456784",
          deliveredAt: "2026-03-02T10:00:00.000Z",
          itemMatchesDescription: false,
          label: "SIMULATED",
        },
      }),
    );
    expect(decision.liability).toBe("MERCHANT");
    expect(decision.remedy).toBe("REFUND_FULL");
    expect(decision.ruleId).toBe("L-012-DESCRIPTION-MISMATCH");
  });

  it("rejects an unauthorised-charge claim when the mandate covered the charge", () => {
    const decision = decideLiability(facts({ claimType: "UNAUTHORIZED_CHARGE" }));
    expect(decision.liability).toBe("BUYER");
    expect(decision.ruleId).toBe("L-007-AUTHORISED-BY-MANDATE");
  });

  it("refunds when the capture exceeded the mandate", () => {
    const decision = decideLiability(facts({ claimType: "MANDATE_BREACH", mandateValidAtCapture: false }));
    expect(decision.liability).toBe("MERCHANT");
    expect(decision.remedy).toBe("REFUND_FULL");
    expect(decision.ruleId).toBe("L-006-MANDATE-BREACHED");
  });

  it("rejects a mandate-breach claim when the capture was inside the mandate", () => {
    const decision = decideLiability(facts({ claimType: "MANDATE_BREACH" }));
    expect(decision.liability).toBe("BUYER");
  });
});
