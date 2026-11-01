import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  DEAL_STATES,
  IllegalDealTransitionError,
  isTerminal,
  transitionDeal,
} from "./deal-machine";

describe("deal state machine", () => {
  it("walks the happy path from CREATED to RECEIPT_SIGNED", () => {
    const path = ["CREATED", "HANDSHAKE", "NEGOTIATING", "AGREED", "PAID", "RECEIPT_SIGNED"] as const;
    for (let index = 1; index < path.length; index += 1) {
      expect(canTransition(path[index - 1]!, path[index]!)).toBe(true);
    }
  });

  it("refuses to pay before an agreement exists", () => {
    expect(canTransition("NEGOTIATING", "PAID")).toBe(false);
    expect(() => assertTransition("NEGOTIATING", "PAID")).toThrow(IllegalDealTransitionError);
  });

  it("refuses to sign a receipt before the capture", () => {
    expect(canTransition("AGREED", "RECEIPT_SIGNED")).toBe(false);
  });

  it("allows a dispute only after a signed receipt", () => {
    expect(canTransition("RECEIPT_SIGNED", "DISPUTED")).toBe(true);
    expect(canTransition("PAID", "DISPUTED")).toBe(false);
  });

  it("treats repeating the current state as a no-op so a resume is idempotent", () => {
    expect(transitionDeal("PAID", "PAID")).toBe("PAID");
    expect(transitionDeal("AGREED", "PAID")).toBe("PAID");
  });

  it("marks RESOLVED and FAILED as terminal", () => {
    expect(isTerminal("RESOLVED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("RECEIPT_SIGNED")).toBe(false);
    expect(canTransition("RESOLVED", "DISPUTED")).toBe(false);
  });

  it("exposes the nine documented states", () => {
    expect(DEAL_STATES).toHaveLength(9);
    expect(DEAL_STATES).toContain("RECEIPT_SIGNED");
  });
});
