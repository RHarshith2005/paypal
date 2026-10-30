import { describe, expect, it } from "vitest";
import { computeTrust, TRUST_EVENT_DELTA } from "./trust";

describe("computeTrust", () => {
  it("starts an agent with no history at the base score", () => {
    const trust = computeTrust([]);
    expect(trust.score).toBe(50);
    expect(trust.grade).toBe("MEDIUM");
    expect(trust.counts).toEqual([]);
  });

  it("adds points for settled deals and receipts", () => {
    const trust = computeTrust([{ type: "DEAL_SETTLED" }, { type: "RECEIPT_SIGNED" }]);
    expect(trust.score).toBe(50 + 3 + 1);
  });

  it("penalises a blocked injection attempt", () => {
    const trust = computeTrust([{ type: "INJECTION_BLOCKED" }]);
    expect(trust.score).toBe(50 + TRUST_EVENT_DELTA.INJECTION_BLOCKED);
    expect(trust.grade).toBe("MEDIUM");
  });

  it("drops to LOW after an invalid signature and a lost dispute", () => {
    const trust = computeTrust([{ type: "INVALID_SIGNATURE" }, { type: "DISPUTE_LOST" }, { type: "DEAL_SETTLED" }]);
    expect(trust.score).toBe(50 - 15 - 8 + 3);
    expect(trust.grade).toBe("LOW");
  });

  it("caps positive gains at +25 and negative at -40", () => {
    const positive = computeTrust(Array.from({ length: 40 }, () => ({ type: "DEAL_SETTLED" as const })));
    expect(positive.score).toBe(75);
    expect(positive.positive).toBe(25);

    const negative = computeTrust(Array.from({ length: 10 }, () => ({ type: "INVALID_SIGNATURE" as const })));
    expect(negative.score).toBe(10);
    expect(negative.negative).toBe(-40);
  });

  it("groups events by type with their contribution", () => {
    const trust = computeTrust([{ type: "DEAL_SETTLED" }, { type: "DEAL_SETTLED" }, { type: "DISPUTE_LOST" }]);
    expect(trust.counts).toEqual([
      { type: "DEAL_SETTLED", count: 2, delta: 6 },
      { type: "DISPUTE_LOST", count: 1, delta: -8 },
    ]);
  });
});
