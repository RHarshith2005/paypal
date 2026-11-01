import { decideLiability, type DisputeFacts, type LiabilityDecision } from "./liability";
import { formatUsd } from "./money";
import { ArbiterVerdictSchema } from "./schemas";
import type { ArbiterVerdict, ArbiterVerdictPayload, ClaimType } from "./schemas";

/**
 * The arbiter runs in two stages.
 *
 * Stage 1 is deterministic: signatures, chain integrity, mandate compliance,
 * receipt vs delivered goods. Stage 2 is a model call, and only when stage 1 says
 * the case is genuinely ambiguous. The model never decides liability — it labels
 * the cause and explains it, and `validateArbiterVerdict` throws away any answer
 * that cites evidence the packet does not contain.
 */

export interface DeterministicFinding {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface DeterministicOutcome {
  decision: LiabilityDecision;
  verdict: ArbiterVerdict;
  findings: DeterministicFinding[];
  ambiguous: boolean;
  ambiguityReasons: string[];
  confidence: number;
}

/**
 * Verdicts describe the *cause*; liability describes who bears the loss. They can
 * legitimately differ: when a buyer agent spends outside its mandate, the cause is
 * the agent (BUYER_AGENT_OUT_OF_MANDATE) while the remedy is still a merchant
 * refund (L-006), because the merchant accepted an out-of-mandate capture.
 */
export function verdictFor(decision: LiabilityDecision): ArbiterVerdict {
  switch (decision.ruleId) {
    case "L-006-MANDATE-BREACHED":
      return "BUYER_AGENT_OUT_OF_MANDATE";
    case "L-005-MANDATE-RESPECTED":
    case "L-007-AUTHORISED-BY-MANDATE":
    case "L-009-DELIVERY-PROVEN":
    case "L-011-DESCRIPTION-MATCHED":
      return "VALID_PURCHASE";
    case "L-001-NO-SETTLEMENT":
    case "L-002-CHAIN-BROKEN":
    case "L-004-BUYER-SIGNATURE-INVALID":
      return "AMBIGUOUS_INTENT";
    default:
      return "MERCHANT_FAULT";
  }
}

export function runDeterministicChecks(facts: DisputeFacts): DeterministicOutcome {
  const decision = decideLiability(facts);
  const fulfillment = facts.fulfillment;

  const findings: DeterministicFinding[] = [
    {
      id: "D-01-SETTLEMENT",
      name: "A PayPal capture settled this deal",
      passed: facts.paymentStatus === "COMPLETED",
      detail: `payment status ${facts.paymentStatus}`,
    },
    {
      id: "D-02-CHAIN",
      name: "Signed transcript chain verifies",
      passed: facts.chainValid,
      detail: facts.chainValid ? "every entry hashes to its predecessor" : "the chain does not verify",
    },
    {
      id: "D-03-BUYER-SIGNATURE",
      name: "Buyer receipt signature verifies",
      passed: facts.buyerSignatureValid,
      detail: facts.buyerSignatureValid ? "valid Ed25519 signature" : "signature does not verify",
    },
    {
      id: "D-04-MERCHANT-SIGNATURE",
      name: "Merchant receipt signature verifies",
      passed: facts.merchantSignatureValid,
      detail: facts.merchantSignatureValid ? "valid Ed25519 signature" : "signature does not verify",
    },
    {
      id: "D-05-MANDATE",
      name: "Capture was inside the signed mandate",
      passed: facts.mandateValidAtCapture,
      detail: facts.mandateValidAtCapture
        ? "every mandate limit passed at capture time"
        : "the capture fell outside the signed mandate",
    },
    {
      id: "D-06-FULFILMENT",
      name: "Merchant produced a fulfilment record",
      passed: fulfillment !== null,
      detail: fulfillment
        ? `${fulfillment.carrier} ${fulfillment.trackingNumber}, delivered ${fulfillment.deliveredAt} (SIMULATED)`
        : "no fulfilment record in the packet",
    },
    {
      id: "D-07-DESCRIPTION",
      name: "Delivered goods matched the agreed description",
      passed: fulfillment?.itemMatchesDescription ?? false,
      detail: fulfillment
        ? fulfillment.itemMatchesDescription
          ? "delivered items match the line items"
          : "delivered items do not match the line items"
        : "no delivery to compare",
    },
    {
      id: "D-08-AMOUNT",
      name: "Settled amount matches the agreed price",
      passed:
        facts.capturedMinor === undefined ||
        facts.agreedMinor === undefined ||
        facts.capturedMinor === facts.agreedMinor,
      detail:
        facts.capturedMinor === undefined || facts.agreedMinor === undefined
          ? "amount comparison unavailable"
          : `captured ${formatUsd(facts.capturedMinor)} vs agreed ${formatUsd(facts.agreedMinor)}`,
    },
  ];

  const ambiguityReasons: string[] = [];
  if (
    facts.capturedMinor !== undefined &&
    facts.agreedMinor !== undefined &&
    facts.capturedMinor !== facts.agreedMinor
  ) {
    ambiguityReasons.push(
      `the settled capture (${facts.capturedMinor}) does not match the agreed price (${facts.agreedMinor})`,
    );
  }
  if (facts.claimType === "GOODS_NOT_RECEIVED" && fulfillment && !fulfillment.itemMatchesDescription) {
    ambiguityReasons.push("delivery is recorded, but the delivered item is itself disputed");
  }
  if (decision.ruleId === "L-001-NO-SETTLEMENT" || decision.ruleId === "L-002-CHAIN-BROKEN") {
    ambiguityReasons.push("the packet does not contain enough admissible evidence for a final verdict");
  }

  const ambiguous = ambiguityReasons.length > 0;
  return {
    decision,
    verdict: verdictFor(decision),
    findings,
    ambiguous,
    ambiguityReasons,
    confidence: ambiguous ? 0.4 : 1,
  };
}

export type VerdictValidation =
  { ok: true; value: ArbiterVerdictPayload } | { ok: false; errors: string[]; raw: string };

const describeRaw = (value: unknown): string => {
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
};

export function validateArbiterVerdict(raw: unknown, allowedEvidenceIds: readonly string[]): VerdictValidation {
  const parsed = ArbiterVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [
        "response did not match the required JSON schema",
        ...parsed.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`),
      ],
      raw: describeRaw(raw),
    };
  }

  const unknownRefs = parsed.data.evidenceRefs.filter((ref) => !allowedEvidenceIds.includes(ref));
  if (unknownRefs.length > 0) {
    return {
      ok: false,
      errors: [`cited evidence outside the packet: ${unknownRefs.join(", ")}`],
      raw: describeRaw(raw),
    };
  }

  if (parsed.data.liability.party === "UNRESOLVED" && parsed.data.liability.percent !== 0) {
    return {
      ok: false,
      errors: ["an UNRESOLVED liability must carry percent 0"],
      raw: describeRaw(raw),
    };
  }

  return { ok: true, value: parsed.data };
}

/** Deterministic explanation used when no model is configured or its answer was rejected. */
export function fallbackNarrative(decision: LiabilityDecision, findings: readonly DeterministicFinding[]): string {
  const failed = findings.filter((finding) => !finding.passed);
  const lines = [
    decision.summary,
    `Rule ${decision.ruleId} fixes liability with ${decision.liability} and remedy ${decision.remedy}.`,
    failed.length === 0
      ? "Every deterministic check passed."
      : `Checks that did not pass: ${failed.map((finding) => `${finding.id} (${finding.name})`).join("; ")}.`,
    `Evidence relied on: ${decision.citations.join(", ")}.`,
  ];
  return lines.join("\n\n").slice(0, 3900);
}

export interface DraftInput {
  disputeId: string;
  claimType: ClaimType;
  ruleId: string;
  liability: string;
  remedy: string;
  refundMinor: number;
  orderId: string;
  captureId: string | null;
  evidenceIds: readonly string[];
  narrative: string;
}

/**
 * Ready-to-send response for the merchant's PayPal dispute thread. Deliberately
 * deterministic: a dispute response is a legal-adjacent statement, so it is
 * templated from decided facts rather than written by a model.
 */
export function buildMerchantResponseDraft(input: DraftInput): string {
  const refundLine =
    input.refundMinor > 0
      ? `We have issued a refund of ${formatUsd(input.refundMinor)} against capture ${input.captureId ?? "n/a"}.`
      : `No refund is due under rule ${input.ruleId}.`;
  return [
    `Re: dispute ${input.disputeId} — PayPal order ${input.orderId}`,
    "",
    `We are responding to the ${input.claimType.replaceAll("_", " ").toLowerCase()} claim with the signed evidence packet for this transaction.`,
    "",
    input.narrative,
    "",
    `Deterministic outcome: ${input.ruleId}; liability ${input.liability}; remedy ${input.remedy}. ${refundLine}`,
    "",
    `Attached evidence: ${input.evidenceIds.join(", ")}.`,
    "",
    "Both agents signed the agreed cart, price and transcript root with Ed25519 keys, and the transcript is a hash-chained append-only log. We are happy to provide the canonical JSON payloads for independent verification.",
  ]
    .join("\n")
    .slice(0, 3900);
}
