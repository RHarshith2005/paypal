import {
  ArbiterVerdictSchema,
  buildMerchantResponseDraft,
  chainRoot,
  checkOffer,
  computeTrust,
  fallbackNarrative,
  percentOf,
  canTransition,
  runDeterministicChecks,
  transitionDeal,
  validateArbiterVerdict,
  verifyChain,
  type ArbiterVerdictPayload,
  type DealView,
  type Dispute,
  type DisputeFacts,
  type EvidencePacket,
  type Mandate,
  type Offer,
  type OpenDisputeRequest,
  type Ruling,
} from "@handshake/shared";
import { OfferSchema } from "@handshake/shared";
import { verifyDealReceipt } from "@handshake/shared/crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/queries";
import { listMandateViews } from "../db/queries";
import {
  getAgentRow,
  getAttestationRow,
  insertEvent,
  patchDeal,
  saveEvidencePacket,
  upsertDispute,
  listTrustRows,
  appendTrustEvents,
} from "../db/writes";
import type { Store } from "../db/client";
import { newId } from "../lib/ids";
import type { PaymentProvider } from "../paypal/types";
import type { LlmClient } from "../agents/llm";
import { DealEventBus } from "../deals/events";
import { buildEvidencePacket, EXTRA_EVIDENCE } from "./packet";

export interface ArbiterDeps {
  db: Db;
  store: Store;
  payments: PaymentProvider;
  llm: LlmClient | null;
  bus: DealEventBus;
  now: () => Date;
  log: FastifyBaseLogger;
}

const ARBITER_SYSTEM = [
  "You are a commerce dispute arbiter reviewing a signed evidence packet.",
  "The deterministic checks have already run. You do not decide liability: the platform fixes that from the rules.",
  "Your job is to label the cause, explain it, and cite only evidence ids present in the packet.",
  "If the packet is genuinely ambiguous, say so with verdict AMBIGUOUS_INTENT and a lower confidence.",
  "Never invent an evidence id, a tracking number, an amount, or a PayPal id.",
].join("\n");

const ARBITER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "liability", "evidenceRefs", "reasoning", "confidence"],
  properties: {
    verdict: {
      type: "string",
      enum: ["MERCHANT_FAULT", "BUYER_AGENT_OUT_OF_MANDATE", "AMBIGUOUS_INTENT", "VALID_PURCHASE"],
    },
    liability: {
      type: "object",
      additionalProperties: false,
      required: ["party", "percent"],
      properties: {
        party: { type: "string", enum: ["BUYER", "MERCHANT", "PLATFORM", "UNRESOLVED"] },
        percent: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    evidenceRefs: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
    reasoning: { type: "string", minLength: 20, maxLength: 2000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

export class DisputeArbiter {
  constructor(private readonly deps: ArbiterDeps) {}

  async open(dealId: string, input: OpenDisputeRequest): Promise<Dispute> {
    const view = await this.deps.store.getDeal(dealId);
    if (!view) throw new Error(`no deal ${dealId}`);
    const { deal } = view;

    const mandateView = (await listMandateViews(this.deps.db)).find(
      (candidate) => candidate.mandate.id === deal.mandateId,
    );
    if (!mandateView) throw new Error(`no mandate ${deal.mandateId}`);

    const buyerAgent = await getAgentRow(this.deps.db, deal.buyerAgentId);
    const merchantAgent = await getAgentRow(this.deps.db, deal.merchantAgentId);

    const buyerAttestation = deal.handshakeResult
      ? ((await getAttestationRow(this.deps.db, deal.handshakeResult.buyerAttestationId))?.body ?? null)
      : null;
    const merchantAttestation = deal.handshakeResult
      ? ((await getAttestationRow(this.deps.db, deal.handshakeResult.merchantAttestationId))?.body ?? null)
      : null;

    const chain = verifyChain(deal.transcript);
    const receiptVerification =
      deal.receipt && buyerAgent && merchantAgent
        ? verifyDealReceipt(deal.receipt, { buyer: buyerAgent.publicKey, merchant: merchantAgent.publicKey })
        : null;

    const agreement = this.agreementFor(view);
    const capturedMinor = deal.payment?.amountMinor ?? 0;
    const mandateValidAtCapture = this.mandateHeldAtCapture(mandateView.mandate, agreement, deal, mandateView.ledger);

    const facts: DisputeFacts = {
      claimType: input.claimType,
      paymentStatus: deal.payment?.status ?? "FAILED",
      chainValid: chain.valid,
      buyerSignatureValid: receiptVerification?.buyerSignatureValid ?? false,
      merchantSignatureValid: receiptVerification?.merchantSignatureValid ?? false,
      mandateValidAtCapture,
      agreement,
      fulfillment: deal.fulfillment,
      capturedMinor,
      agreedMinor: agreement.totalMinor,
    };

    const deterministic = runDeterministicChecks(facts);
    const disputeId = newId("dsp_");
    const packet = buildEvidencePacket({
      dispute: { id: disputeId, claimType: input.claimType, claim: input.claim, openedBy: input.openedBy },
      deal,
      mandate: mandateView.mandate,
      buyerAttestation: buyerAttestation && buyerAttestation.kind === "BUYER" ? buyerAttestation : null,
      merchantAttestation: merchantAttestation && merchantAttestation.kind === "MERCHANT" ? merchantAttestation : null,
      checks: deterministic.findings,
      now: this.deps.now(),
    });

    const model = deterministic.ambiguous ? await this.consultModel(packet, deterministic.decision.liability) : null;

    const verdict: ArbiterVerdictPayload["verdict"] = model?.accepted.verdict ?? deterministic.verdict;
    const confidence = model?.accepted.confidence ?? deterministic.confidence;
    const narrative = model?.accepted.reasoning ?? fallbackNarrative(deterministic.decision, deterministic.findings);
    const citations = [
      ...new Set([
        ...deterministic.decision.citations,
        ...(deal.guardDecisions.some((decision) => decision.bypassed) ? [EXTRA_EVIDENCE.guardBypass] : []),
      ]),
    ];

    const refundMinor =
      deterministic.decision.remedy === "NO_ACTION"
        ? 0
        : percentOf(agreement.totalMinor, deterministic.decision.refundPercent);

    const now = this.deps.now();
    const ruling: Ruling = {
      id: newId("rul_"),
      disputeId,
      dealId: deal.id,
      liability: deterministic.decision.liability,
      remedy: deterministic.decision.remedy,
      refundMinor,
      ruleId: deterministic.decision.ruleId,
      ruleSummary: deterministic.decision.summary,
      citations,
      narrative: `${narrative}${await this.refundNote(deal, refundMinor, disputeId)}`,
      narrativeSource: model?.accepted ? "MODEL" : "SIMULATED",
      verdict,
      confidence,
      decidedBy: model?.accepted ? "MODEL_ASSISTED" : "DETERMINISTIC",
      draftResponse: buildMerchantResponseDraft({
        disputeId,
        claimType: input.claimType,
        ruleId: deterministic.decision.ruleId,
        liability: deterministic.decision.liability,
        remedy: deterministic.decision.remedy,
        refundMinor,
        orderId: deal.payment?.orderId ?? "unknown",
        captureId: deal.payment?.captureId ?? null,
        evidenceIds: packet.evidenceIds,
        narrative,
      }),
      rejectedModelOutput: model?.rejected ?? null,
      decidedAt: now.toISOString(),
    };

    const dispute = this.assembleDispute(disputeId, deal.id, input, packet, ruling, now);

    // The packet carries a foreign key to the dispute, so the dispute row goes first.
    await upsertDispute(this.deps.db, dispute);
    await saveEvidencePacket(this.deps.db, packet);
    await this.advanceDeal(deal, disputeId);
    await this.recordTrust(deal, dispute);

    return dispute;
  }

  private agreementFor(view: DealView): Offer {
    if (view.deal.agreedOffer) return view.deal.agreedOffer;
    if (view.deal.receipt) {
      return OfferSchema.parse({
        currency: "USD",
        items: view.deal.receipt.cart,
        totalMinor: view.deal.receipt.agreedPrice.amountMinor,
        deliveryDays: 3,
        terms: "Agreed in the signed negotiation transcript.",
      });
    }
    // A deal that never agreed has nothing to arbitrate; a zero-line offer keeps the
    // packet schema valid so the arbiter can still rule "no settlement".
    return {
      currency: "USD",
      items: [{ sku: "sku_none", name: "No agreed item", category: "NONE", quantity: 1, unitPriceMinor: 1 }],
      totalMinor: 1,
      deliveryDays: 0,
      terms: "No agreement was reached.",
    };
  }

  private mandateHeldAtCapture(
    mandate: Mandate,
    agreement: Offer,
    deal: DealView["deal"],
    ledger: { settledMinor: number; reservedMinor: number; settledCount: number; reservedCount: number },
  ): boolean {
    const captured = deal.payment?.amountMinor ?? agreement.totalMinor;
    const before = {
      settledMinor: Math.max(0, ledger.settledMinor - captured),
      reservedMinor: ledger.reservedMinor,
      settledCount: Math.max(0, ledger.settledCount - (deal.payment ? 1 : 0)),
      reservedCount: ledger.reservedCount,
    };
    return checkOffer({
      mandate,
      ledger: before,
      offer: agreement,
      merchantAgentId: deal.merchantAgentId,
      tool: "request_checkout",
      now: this.deps.now(),
    }).allowed;
  }

  private async consultModel(
    packet: EvidencePacket,
    expectedLiability: string,
  ): Promise<{ accepted: ArbiterVerdictPayload; rejected: string | null } | null> {
    if (!this.deps.llm) return null;
    const result = await this.deps.llm.callTool({
      toolName: "arbitrate",
      toolDescription: "Return the verdict, liability party, evidence ids cited and a short reasoning.",
      inputSchema: ARBITER_JSON_SCHEMA,
      system: ARBITER_SYSTEM,
      user: [
        `Claim: ${packet.claim.type} — ${packet.claim.text}`,
        `Deterministic rule: ${packet.checks.map((check) => `${check.id} ${check.passed ? "passed" : "failed"}`).join(", ")}`,
        `Allowed evidence ids: ${packet.evidenceIds.join(", ")}`,
        `Packet summary: ${JSON.stringify({
          mandate: { id: packet.mandate.id, maxTotal: packet.mandate.maxTotal, perItemMax: packet.mandate.perItemMax },
          payment: packet.payment,
          fulfillment: packet.fulfillment,
          receipt: packet.receipt ? { digest: packet.receipt.digest, agreedPrice: packet.receipt.agreedPrice } : null,
          guardDecisions: packet.guardDecisions.map((decision) => ({
            tool: decision.tool,
            allowed: decision.allowed,
            ruleId: decision.ruleId,
            bypassed: decision.bypassed,
          })),
        })}`,
      ].join("\n"),
      schema: ArbiterVerdictSchema,
    });

    if (!result.ok) {
      this.deps.log.warn({ reason: result.reason }, "arbiter model call failed; using deterministic narrative");
      return null;
    }

    const validation = validateArbiterVerdict(result.value, packet.evidenceIds);
    if (!validation.ok) {
      this.deps.log.warn({ errors: validation.errors }, "rejected arbiter model answer");
      return null;
    }
    if (validation.value.liability.party !== expectedLiability) {
      // The model may explain, never overrule, the deterministic liability.
      return null;
    }
    return { accepted: validation.value, rejected: null };
  }

  private assembleDispute(
    disputeId: string,
    dealId: string,
    input: OpenDisputeRequest,
    packet: EvidencePacket,
    ruling: Ruling,
    now: Date,
  ): Dispute {
    return {
      id: disputeId,
      dealId,
      claimType: input.claimType,
      claim: input.claim,
      openedBy: input.openedBy,
      status: "RULED",
      evidenceIds: packet.evidenceIds,
      ruling,
      createdAt: now.toISOString(),
    };
  }

  private async advanceDeal(deal: DealView["deal"], disputeId: string): Promise<void> {
    // A dispute can be filed against a deal that never settled. The ruling is
    // still recorded; the status only moves where the machine allows it.
    const disputed = canTransition(deal.status, "DISPUTED") ? transitionDeal(deal.status, "DISPUTED") : deal.status;
    if (disputed !== deal.status) await patchDeal(this.deps.db, deal.id, { status: disputed });
    await this.event(deal.id, "DISPUTE_OPENED", `Dispute ${disputeId} opened`, {
      disputeId,
      from: deal.status,
    });
    if (canTransition(disputed, "RESOLVED")) {
      await patchDeal(this.deps.db, deal.id, { status: "RESOLVED" });
    }
    await this.event(deal.id, "DEAL_RESOLVED", "Arbiter ruled on the dispute packet", { disputeId });
  }

  private async refundNote(deal: DealView["deal"], refundMinor: number, disputeId: string): Promise<string> {
    if (refundMinor <= 0) return "";
    const captureId = deal.payment?.captureId;
    if (!captureId) return "\n\nNo capture id is present, so no refund could be issued automatically.";
    try {
      const refund = await this.deps.payments.refund({
        captureId,
        amountMinor: refundMinor,
        note: `Handshake dispute ${disputeId}`,
        idempotencyKey: `refund:${disputeId}`,
      });
      return `\n\nRefund ${refund.refundId} issued for ${refund.amountDecimal} ${refund.currency}${
        refund.simulated ? " (SIMULATED capture, no funds moved)" : ""
      }.`;
    } catch (error) {
      return `\n\nAutomatic refund failed: ${error instanceof Error ? error.message : "unknown error"}.`;
    }
  }

  private async recordTrust(deal: DealView["deal"], dispute: Dispute): Promise<void> {
    const loser = dispute.ruling?.liability === "MERCHANT" ? deal.merchantAgentId : deal.buyerAgentId;
    const winner = loser === deal.merchantAgentId ? deal.buyerAgentId : deal.merchantAgentId;
    const at = this.deps.now().toISOString();
    const rows = await listTrustRows(this.deps.db);

    const apply = async (agentId: string, type: "DISPUTE_LOST" | "DISPUTE_WON") => {
      const existing = rows.find((row) => row.agentId === agentId);
      const event = {
        agentId,
        type,
        dealId: deal.id,
        note: `dispute ${dispute.id}: ${dispute.ruling?.ruleId ?? "no ruling"}`.slice(0, 200),
        at,
      } as const;
      const breakdown = computeTrust([...(existing?.events ?? []), event]);
      await appendTrustEvents(this.deps.db, agentId, [event], breakdown.score, breakdown.grade);
    };

    await apply(loser, "DISPUTE_LOST");
    await apply(winner, "DISPUTE_WON");
  }

  private async event(dealId: string, type: "DISPUTE_OPENED" | "DEAL_RESOLVED", summary: string, data: unknown) {
    const { listEventRows } = await import("../db/writes");
    const existing = await listEventRows(this.deps.db, dealId);
    const seq = existing.length === 0 ? 0 : Math.max(...existing.map((event) => event.seq)) + 1;
    const event = {
      id: newId("evt_"),
      seq,
      dealId,
      type,
      summary: summary.slice(0, 400),
      data,
      at: this.deps.now().toISOString(),
    } as const;
    await insertEvent(this.deps.db, event);
    this.deps.bus.publish(event);
  }

  /** Exposed for the UI: the transcript root the receipt committed to. */
  static transcriptRoot(deal: DealView["deal"]): string {
    return chainRoot(deal.transcript);
  }
}
