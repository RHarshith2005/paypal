import type { ClaimType, Fulfillment, Liability, Offer, PaymentStatus, Remedy } from "./schemas";

/**
 * Stable evidence ids. The arbiter may only cite these, and the API rejects a
 * narrative that cites anything else, so a model cannot invent evidence.
 */
export const EVIDENCE = {
  receipt: "ev_receipt",
  chain: "ev_chain",
  transcript: "ev_transcript",
  capture: "ev_capture",
  fulfillment: "ev_fulfillment",
  mandate: "ev_mandate",
  buyerSignature: "ev_buyer_signature",
  merchantSignature: "ev_merchant_signature",
  agreement: "ev_agreement",
} as const;
export type EvidenceId = (typeof EVIDENCE)[keyof typeof EVIDENCE];

export interface DisputeFacts {
  claimType: ClaimType;
  paymentStatus: PaymentStatus;
  chainValid: boolean;
  buyerSignatureValid: boolean;
  merchantSignatureValid: boolean;
  mandateValidAtCapture: boolean;
  agreement: Offer;
  fulfillment: Fulfillment | null;
  /** Settled capture in minor units, when known. Used to detect partial captures. */
  capturedMinor?: number;
  /** Agreed price in minor units, when known. */
  agreedMinor?: number;
}

export interface LiabilityDecision {
  liability: Liability;
  remedy: Remedy;
  refundPercent: number;
  ruleId: string;
  summary: string;
  citations: EvidenceId[];
}

/**
 * Liability is decided by these rules, never by the narrative model. The model
 * writes the explanation afterwards and can only cite evidence ids that the rule
 * cites or that exist in the packet.
 */
export function decideLiability(facts: DisputeFacts): LiabilityDecision {
  if (facts.paymentStatus !== "COMPLETED") {
    return {
      liability: "UNRESOLVED",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-001-NO-SETTLEMENT",
      summary: "No settled PayPal capture exists for this deal, so no funds can be reallocated.",
      citations: [EVIDENCE.capture],
    };
  }

  if (!facts.chainValid) {
    return {
      liability: "UNRESOLVED",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-002-CHAIN-BROKEN",
      summary: "The signed transcript does not verify, so the packet is not admissible until repaired.",
      citations: [EVIDENCE.chain, EVIDENCE.transcript],
    };
  }

  if (!facts.merchantSignatureValid) {
    return {
      liability: "MERCHANT",
      remedy: "REFUND_FULL",
      refundPercent: 100,
      ruleId: "L-003-MERCHANT-SIGNATURE-INVALID",
      summary: "The merchant's receipt signature does not verify, so the merchant bears the loss.",
      citations: [EVIDENCE.receipt, EVIDENCE.merchantSignature],
    };
  }

  if (!facts.buyerSignatureValid) {
    return {
      liability: "BUYER",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-004-BUYER-SIGNATURE-INVALID",
      summary: "The buyer's receipt signature does not verify, so the claim cannot be attributed to this deal.",
      citations: [EVIDENCE.receipt, EVIDENCE.buyerSignature],
    };
  }

  if (facts.claimType === "MANDATE_BREACH") {
    if (facts.mandateValidAtCapture) {
      return {
        liability: "BUYER",
        remedy: "NO_ACTION",
        refundPercent: 0,
        ruleId: "L-005-MANDATE-RESPECTED",
        summary: "The capture falls inside the signed mandate, so there is no mandate breach to remedy.",
        citations: [EVIDENCE.mandate, EVIDENCE.capture, EVIDENCE.agreement],
      };
    }
    return {
      liability: "MERCHANT",
      remedy: "REFUND_FULL",
      refundPercent: 100,
      ruleId: "L-006-MANDATE-BREACHED",
      summary: "The capture falls outside the signed mandate, so the merchant returns the funds.",
      citations: [EVIDENCE.mandate, EVIDENCE.capture],
    };
  }

  if (facts.claimType === "UNAUTHORIZED_CHARGE") {
    return {
      liability: "BUYER",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-007-AUTHORISED-BY-MANDATE",
      summary: "The charge was signed for by the buyer agent inside a valid mandate, so it is authorised.",
      citations: [EVIDENCE.mandate, EVIDENCE.buyerSignature, EVIDENCE.capture],
    };
  }

  if (facts.claimType === "GOODS_NOT_RECEIVED") {
    if (!facts.fulfillment) {
      return {
        liability: "MERCHANT",
        remedy: "REFUND_FULL",
        refundPercent: 100,
        ruleId: "L-008-NO-FULFILMENT-EVIDENCE",
        summary: "The merchant produced no signed fulfilment record, so the delivery claim fails.",
        citations: [EVIDENCE.fulfillment, EVIDENCE.agreement],
      };
    }
    return {
      liability: "BUYER",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-009-DELIVERY-PROVEN",
      summary: "A signed fulfilment record shows delivery before the dispute window closed.",
      citations: [EVIDENCE.fulfillment, EVIDENCE.capture],
    };
  }

  if (!facts.fulfillment) {
    return {
      liability: "MERCHANT",
      remedy: "REFUND_FULL",
      refundPercent: 100,
      ruleId: "L-010-NO-FULFILMENT-EVIDENCE",
      summary: "The merchant produced no signed fulfilment record, so the description claim stands.",
      citations: [EVIDENCE.fulfillment, EVIDENCE.agreement],
    };
  }

  if (facts.fulfillment.itemMatchesDescription) {
    return {
      liability: "BUYER",
      remedy: "NO_ACTION",
      refundPercent: 0,
      ruleId: "L-011-DESCRIPTION-MATCHED",
      summary: "The delivered goods match the agreed line items and description.",
      citations: [EVIDENCE.fulfillment, EVIDENCE.agreement],
    };
  }

  return {
    liability: "MERCHANT",
    remedy: "REFUND_FULL",
    refundPercent: 100,
    ruleId: "L-012-DESCRIPTION-MISMATCH",
    summary: "The delivered goods do not match the agreed line items, so the merchant refunds in full.",
    citations: [EVIDENCE.fulfillment, EVIDENCE.agreement, EVIDENCE.receipt],
  };
}
