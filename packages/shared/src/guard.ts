import { evaluateMandate, type MandateDecision } from "./mandate";
import type { GuardTool, Mandate, Offer, SpendLedger } from "./schemas";

/**
 * MandateGuard. Every buyer tool call that could change state passes through
 * `checkOffer` first: search is free, but propose / accept / checkout all carry a
 * cart and a price, and this is where the signed mandate is enforced.
 *
 * The DEMO bypass exists only to reproduce the "misconfigured agent" failure
 * mode. It is opt-in per deal, it is recorded as a ledger entry, and the guard
 * decision that carries it is labelled so the UI and the arbiter can see that the
 * limits were knowingly not enforced.
 */

export const DEMO_BYPASS_RULE_ID = "DEMO-BYPASS-00";
export const DEMO_BYPASS_REASON_CODE = "G-BYPASS-00";

export interface GuardBypass {
  label: "DEMO_MISCONFIGURATION";
  reason: string;
}

export interface GuardInput {
  mandate: Mandate;
  ledger: SpendLedger;
  offer: Offer;
  merchantAgentId: string;
  tool: GuardTool;
  now: Date;
  /** DEMO ONLY. When set, the guard reports the limits and then lets the deal through. */
  bypass?: GuardBypass | null;
}

export interface GuardOutcome {
  allowed: boolean;
  ruleId: string;
  reasonCodes: string[];
  summary: string;
  checks: MandateDecision["checks"];
  offerTotalMinor: number;
  bypassed: boolean;
  bypassLabel: "DEMO_MISCONFIGURATION" | null;
  decision: MandateDecision;
}

export function checkOffer(input: GuardInput): GuardOutcome {
  const decision = evaluateMandate({
    mandate: input.mandate,
    ledger: input.ledger,
    offer: input.offer,
    merchantAgentId: input.merchantAgentId,
    now: input.now,
  });
  const failed = decision.checks.filter((check) => !check.passed).map((check) => check.id);

  if (input.bypass) {
    return {
      allowed: true,
      ruleId: DEMO_BYPASS_RULE_ID,
      reasonCodes: [DEMO_BYPASS_REASON_CODE, ...failed],
      summary:
        failed.length === 0
          ? "DEMO: the guard was bypassed, though every limit happened to pass"
          : `DEMO: the guard was bypassed; ${failed.length} limit(s) would have blocked this purchase`,
      checks: decision.checks,
      offerTotalMinor: decision.offerTotalMinor,
      bypassed: true,
      bypassLabel: "DEMO_MISCONFIGURATION",
      decision,
    };
  }

  return {
    allowed: decision.allowed,
    ruleId: decision.ruleId,
    reasonCodes: failed,
    summary: decision.summary,
    checks: decision.checks,
    offerTotalMinor: decision.offerTotalMinor,
    bypassed: false,
    bypassLabel: null,
    decision,
  };
}
