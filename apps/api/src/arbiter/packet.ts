import {
  catalogHash,
  EVIDENCE,
  EvidencePacketSchema,
  type BuyerAttestation,
  type Deal,
  type DeterministicFinding,
  type Dispute,
  type EvidencePacket,
  type Mandate,
  type MerchantAttestation,
} from "@handshake/shared";

export const EXTRA_EVIDENCE = {
  handshake: "ev_handshake",
  attestation: "ev_attestation",
  guardBypass: "ev_guard_bypass",
} as const;

export interface EvidencePacketInput {
  dispute: Pick<Dispute, "id" | "claimType" | "claim" | "openedBy">;
  deal: Deal;
  mandate: Mandate;
  buyerAttestation: BuyerAttestation | null;
  merchantAttestation: MerchantAttestation | null;
  checks: readonly DeterministicFinding[];
  now: Date;
}

/**
 * Assembles the packet the arbiter is allowed to reason over. The `evidenceIds`
 * list is the whitelist: an arbiter answer citing anything else is rejected.
 */
export function buildEvidencePacket(input: EvidencePacketInput): EvidencePacket {
  const { deal, dispute } = input;
  const hasReceipt = deal.receipt !== null;
  const bypassed = deal.guardDecisions.some((decision) => decision.bypassed);

  const evidenceIds = [
    EVIDENCE.mandate,
    EVIDENCE.chain,
    EVIDENCE.transcript,
    EVIDENCE.agreement,
    ...(hasReceipt ? [EVIDENCE.receipt, EVIDENCE.buyerSignature, EVIDENCE.merchantSignature] : []),
    ...(deal.payment ? [EVIDENCE.capture] : []),
    ...(deal.fulfillment ? [EVIDENCE.fulfillment] : []),
    ...(deal.handshakeResult ? [EXTRA_EVIDENCE.handshake] : []),
    ...(input.buyerAttestation && input.merchantAttestation ? [EXTRA_EVIDENCE.attestation] : []),
    ...(bypassed ? [EXTRA_EVIDENCE.guardBypass] : []),
  ];

  const payment = deal.payment ?? {
    provider: "PAYPAL_MOCK" as const,
    simulated: true,
    orderId: "none",
    captureId: null,
    status: "FAILED" as const,
    amountMinor: 0,
    currency: "USD" as const,
    payerActionUrl: null,
    createdAt: input.now.toISOString(),
    capturedAt: null,
    failureReason: null,
  };

  return EvidencePacketSchema.parse({
    id: `pkt_${dispute.id.replace(/^dsp_/, "")}`,
    disputeId: dispute.id,
    dealId: deal.id,
    mandateId: deal.mandateId,
    createdAt: input.now.toISOString(),
    claim: { type: dispute.claimType, text: dispute.claim, openedBy: dispute.openedBy },
    mandate: input.mandate,
    handshake: deal.handshakeResult,
    attestations: { buyer: input.buyerAttestation, merchant: input.merchantAttestation },
    transcript: deal.transcript,
    guardDecisions: deal.guardDecisions,
    receipt: deal.receipt,
    payment: {
      provider: payment.provider,
      orderId: payment.orderId,
      captureId: payment.captureId,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      capturedAt: payment.capturedAt,
      simulated: payment.simulated,
    },
    fulfillment: deal.fulfillment,
    checks: input.checks.map((check) => ({ ...check })),
    evidenceIds,
  });
}

/** Catalog digest helper reused by the packet summary and the handshake attestation. */
export { catalogHash };
