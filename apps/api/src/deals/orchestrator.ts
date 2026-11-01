import {
  AgentIdentitySchema,
  appendEvidence,
  chainRoot,
  computeTrust,
  DealReceiptBodySchema,
  evaluateHandshake,
  FulfillmentSchema,
  HandshakeMessageSchema,
  MerchantPolicySchema,
  NegotiationTurnSchema,
  PaymentSchema,
  randomNonce,
  transitionDeal,
  type BuyerAttestation,
  type DealEvent,
  type DealEventType,
  type EvidenceEntry,
  type DealStatus,
  type GuardDecision,
  type HandshakeMessage,
  type InjectionFinding,
  type InjectionSignal,
  type MandateView,
  type MerchantAttestation,
  type MerchantPolicy,
  type NegotiationTurn,
  type Offer,
  type RunDealRequest,
  type TrustEvent,
} from "@handshake/shared";
import {
  signDealReceipt,
  signEvidenceEntry,
  signPayload,
  verifyPayload,
  type SigningKey,
} from "@handshake/shared/crypto";
import type { FastifyBaseLogger } from "fastify";
import { sha256Hex } from "@handshake/shared";
import { buyerTurn } from "../agents/buyer";
import type { LlmClient } from "../agents/llm";
import { merchantTurn } from "../agents/merchant";
import type { CatalogProvider } from "../catalog/types";
import type { AppConfig } from "../config/env";
import type { Db } from "../db/queries";
import { getDeal, listMandateViews } from "../db/queries";
import {
  consumeNonce,
  getDealRow,
  insertAttestation,
  insertDeal,
  insertEvent,
  insertMessage,
  listConsumedNonces,
  listEventRows,
  listMessageRows,
  listTrustRows,
  patchDeal,
  reserveLedger,
  setLedgerStatus,
  upsertReceipt,
} from "../db/writes";
import type { PaymentProvider } from "../paypal/types";
import { newId } from "../lib/ids";
import { ensureDemoKeys } from "../services/keys";
import type { SimulatedTrustAnchor } from "../trust-anchor/anchor";
import { DealEventBus } from "./events";
import { planCart } from "./plan";

export const DEMO_MERCHANT_POLICY: MerchantPolicy = MerchantPolicySchema.parse({
  merchantAgentId: "agt_merchant_ridgeway",
  minMarginBps: 2_500,
  maxDiscountFromListBps: 1_500,
  bundleDiscountTiers: [
    { minQuantity: 10, discountBps: 500 },
    { minQuantity: 20, discountBps: 800 },
    { minQuantity: 40, discountBps: 1_000 },
  ],
  maxRounds: 4,
  inventoryFreshnessMs: 15 * 60 * 1000,
});

export interface OrchestratorDeps {
  db: Db;
  config: AppConfig;
  payments: PaymentProvider;
  catalog: CatalogProvider;
  anchor: SimulatedTrustAnchor;
  bus: DealEventBus;
  llm: LlmClient | null;
  now: () => Date;
  log: FastifyBaseLogger;
  policy?: MerchantPolicy;
}

/**
 * The deal pipeline.
 *
 * Every step reads the persisted status before it runs, so `run()` can be called
 * again after a crash and will pick up where the previous attempt stopped. Money
 * movements carry idempotency keys derived from the deal id, and the ledger
 * reservation is keyed by deal id, so a resumed run cannot double-charge.
 */
export class DealOrchestrator {
  private readonly policy: MerchantPolicy;

  constructor(private readonly deps: OrchestratorDeps) {
    this.policy = deps.policy ?? DEMO_MERCHANT_POLICY;
  }

  private get db(): Db {
    return this.deps.db;
  }

  async create(input: RunDealRequest): Promise<string> {
    const mandateView = await this.findMandate(input.mandateId);
    const dealId = newId("deal_");
    await insertDeal(this.db, {
      id: dealId,
      mandateId: mandateView.mandate.id,
      buyerAgentId: mandateView.mandate.agentId,
      merchantAgentId: input.merchantAgentId,
      status: "CREATED",
      misconfiguredAgent: input.misconfiguredAgent,
      hostileMerchant: input.hostileMerchant,
      fulfillmentIntent: input.fulfillment,
    });
    await this.event(dealId, "DEAL_CREATED", `Deal opened under mandate ${mandateView.mandate.id}`, {
      mandateId: mandateView.mandate.id,
      merchantAgentId: input.merchantAgentId,
      misconfiguredAgent: input.misconfiguredAgent,
    });
    return dealId;
  }

  async run(dealId: string): Promise<void> {
    try {
      let row = await getDealRow(this.db, dealId);
      if (!row) throw new Error(`no deal ${dealId}`);
      if (row.status === "FAILED" || row.status === "RESOLVED") return;

      // Each step advances the status itself, so a resumed run re-enters at the
      // first step that has not finished rather than at the state it left.
      if (row.status === "CREATED" || row.status === "HANDSHAKE") {
        if (!(await this.handshakeStep(row.id, row.mandateId, row.buyerAgentId, row.merchantAgentId))) return;
        row = (await getDealRow(this.db, dealId))!;
      }
      if (row.status === "NEGOTIATING") {
        if (!(await this.negotiationStep(row.id, row.mandateId, row.merchantAgentId, row.hostileMerchant))) return;
        row = (await getDealRow(this.db, dealId))!;
      }
      if (row.status === "AGREED") {
        if (!(await this.paymentStep(row.id, row.mandateId, row.buyerAgentId, row.agreedOffer))) return;
        row = (await getDealRow(this.db, dealId))!;
      }
      if (row.status === "PAID") {
        await this.receiptStep(row.id, row.mandateId, row.buyerAgentId, row.merchantAgentId, row.fulfillmentIntent);
      }
    } catch (error) {
      this.deps.log.error({ err: error, dealId }, "deal pipeline crashed");
      await this.fail(dealId, "PIPELINE-ERROR", error instanceof Error ? error.message : "unexpected pipeline error");
    }
  }

  // -------------------------------------------------------------------------
  // Step 1 — handshake
  // -------------------------------------------------------------------------

  private async handshakeStep(
    dealId: string,
    mandateId: string,
    buyerAgentId: string,
    merchantAgentId: string,
  ): Promise<boolean> {
    await this.setStatus(dealId, "HANDSHAKE");
    const keys = await ensureDemoKeys(this.db);
    const mandateView = await this.findMandate(mandateId);
    const catalogDigest = await this.deps.catalog.hash();

    const buyerAttestation: BuyerAttestation = this.deps.anchor.issueBuyerAttestation({
      agentId: buyerAgentId,
      keyId: keys.buyer.keyId,
      mandate: mandateView.mandate,
    });
    const merchantAttestation: MerchantAttestation = this.deps.anchor.issueMerchantAttestation({
      agentId: merchantAgentId,
      keyId: keys.merchant.keyId,
      catalogId: this.deps.catalog.catalogId,
      catalogHash: catalogDigest,
      inventoryCheckedAt: this.deps.catalog.inventoryCheckedAt(),
    });

    await insertAttestation(this.db, buyerAttestation);
    await insertAttestation(this.db, merchantAttestation);
    await this.event(dealId, "ATTESTATION_ISSUED", "Trust anchor issued both attestations (SIMULATED)", {
      buyerAttestationId: buyerAttestation.attestationId,
      merchantAttestationId: merchantAttestation.attestationId,
      provider: buyerAttestation.provider,
    });

    const challengeNonce = randomNonce();
    const responseNonce = randomNonce();
    const usedNonces = await listConsumedNonces(this.db);
    await consumeNonce(this.db, { nonce: challengeNonce, scope: "handshake", dealId });
    await consumeNonce(this.db, { nonce: responseNonce, scope: "handshake", dealId });

    const result = evaluateHandshake(
      {
        dealId,
        mandate: mandateView.mandate,
        buyer: {
          agentId: buyerAgentId,
          keyId: keys.buyer.keyId,
          publicKey: keys.buyer.publicKey,
          attestation: buyerAttestation,
        },
        merchant: {
          agentId: merchantAgentId,
          keyId: keys.merchant.keyId,
          publicKey: keys.merchant.publicKey,
          attestation: merchantAttestation,
        },
        anchorPublicKey: this.deps.anchor.publicKey,
        challengeNonce,
        responseNonce,
        expectedCatalogHash: catalogDigest,
        now: this.deps.now(),
        maxInventoryAgeMs: this.policy.inventoryFreshnessMs,
        revokedMerchantIds: this.deps.anchor.revocationList(),
        usedNonces,
      },
      verifyPayload,
    );

    const buyerIdentity = AgentIdentitySchema.parse({
      agentId: buyerAgentId,
      kind: "BUYER_AGENT",
      displayName: "Procurement agent · Dana Ruiz",
      publicKey: keys.buyer.publicKey,
      attestation: buyerAttestation,
    });
    const merchantIdentity = AgentIdentitySchema.parse({
      agentId: merchantAgentId,
      kind: "MERCHANT_AGENT",
      displayName: "Ridgeway Industrial Supply",
      publicKey: keys.merchant.publicKey,
      attestation: merchantAttestation,
    });

    const now = this.deps.now();
    const at = now.toISOString();
    const messages: HandshakeMessage[] = [
      this.signHandshakeMessage(
        {
          seq: 0,
          type: "CHALLENGE",
          from: merchantAgentId,
          dealId,
          nonce: challengeNonce,
          peerNonce: null,
          identity: merchantIdentity,
          at,
        },
        keys.merchant,
      ),
      this.signHandshakeMessage(
        {
          seq: 1,
          type: "CHALLENGE_RESPONSE",
          from: buyerAgentId,
          dealId,
          nonce: responseNonce,
          peerNonce: challengeNonce,
          identity: buyerIdentity,
          at,
        },
        keys.buyer,
      ),
      this.signHandshakeMessage(
        {
          seq: 2,
          type: "ACCEPT",
          from: merchantAgentId,
          dealId,
          nonce: challengeNonce,
          peerNonce: responseNonce,
          identity: merchantIdentity,
          at,
        },
        keys.merchant,
      ),
    ];

    let handshakeChain = await this.currentTranscript(dealId);
    for (const message of messages) {
      const entry = signEvidenceEntry(
        appendEvidence(handshakeChain, {
          signer: message.from,
          timestamp: message.at,
          type: `HANDSHAKE_${message.type}`,
          payload: message,
        }),
        message.from === buyerAgentId ? keys.buyer : keys.merchant,
      );
      handshakeChain = [...handshakeChain, entry];
      await insertMessage(this.db, {
        id: newId("msg_"),
        dealId,
        kind: "HANDSHAKE",
        seq: message.seq,
        signer: message.from,
        type: entry.type,
        payload: message,
        prevHash: entry.prevHash,
        payloadHash: entry.payloadHash,
        timestamp: entry.timestamp,
      });
      await this.appendTranscript(dealId, {
        signer: message.from,
        type: entry.type,
        payload: { handshake: message.type, from: message.from, nonce: message.nonce },
      });
    }

    await patchDeal(this.db, dealId, {
      sessionId: result.sessionId,
      handshakeResult: result,
    });
    await this.event(dealId, "HANDSHAKE_RESULT", result.ok ? "Handshake accepted" : "Handshake rejected", {
      ok: result.ok,
      reasons: result.reasons,
      checks: result.checks,
      sessionId: result.sessionId,
      simulated: true,
    });

    if (!result.ok) {
      const first = result.checks.find((check) => !check.passed);
      await this.fail(dealId, first?.code ?? "A-HANDSHAKE-FAILED", first?.detail ?? "handshake did not verify");
      return false;
    }

    await this.setStatus(dealId, "NEGOTIATING");
    return true;
  }

  private signHandshakeMessage(body: Omit<HandshakeMessage, "signature">, key: SigningKey): HandshakeMessage {
    return HandshakeMessageSchema.parse({ ...body, signature: signPayload(key, body) });
  }

  // -------------------------------------------------------------------------
  // Step 2 — negotiation
  // -------------------------------------------------------------------------

  private async negotiationStep(
    dealId: string,
    mandateId: string,
    merchantAgentId: string,
    hostile: boolean,
  ): Promise<boolean> {
    const mandateView = await this.findMandate(mandateId);
    const products = await this.deps.catalog.list();
    const plan = planCart(mandateView.mandate, products);
    if (plan.length === 0) {
      await this.fail(dealId, "S-PLAN-01", "the mandate allows no catalog item the buyer can request");
      return false;
    }

    let buyerMessage = `Requesting ${plan.map((line) => `${line.quantity} × ${line.sku}`).join(", ")}. Please quote with your current bundle tier.`;

    for (let round = 1; round <= this.policy.maxRounds; round += 1) {
      const merchant = await merchantTurn(
        {
          policy: this.policy,
          catalog: products,
          round,
          requestedLines: plan,
          buyerMessage,
          hostile,
        },
        { llm: this.deps.llm },
      );

      if (merchant.injection.length > 0) {
        await this.recordInjection(dealId, merchant.injection, "BUYER_AGENT");
      }

      if (!merchant.quote.ok || !merchant.quote.offer) {
        await this.event(dealId, "AGENT_MESSAGE", `Merchant returned no quote (${merchant.quote.ruleId})`, {
          round,
          provenance: merchant.provenance,
          ruleId: merchant.quote.ruleId,
          message: merchant.move.message,
        });
        await this.fail(dealId, merchant.quote.ruleId, merchant.quote.reason);
        return false;
      }

      const offer = merchant.quote.offer;
      await this.agentMessage(
        dealId,
        "MERCHANT_AGENT",
        merchantAgentId,
        merchant.move.message,
        offer,
        merchant.provenance,
        null,
      );

      const buyer = buyerTurn({
        dealId,
        mandate: mandateView.mandate,
        ledger: mandateView.ledger,
        merchantAgentId,
        merchantOffer: offer,
        merchantMessage: merchant.move.message,
        round,
        misconfiguredAgent: (await getDealRow(this.db, dealId))?.misconfiguredAgent ?? false,
        now: this.deps.now(),
      });

      if (buyer.injection.length > 0) {
        await this.recordInjection(dealId, buyer.injection, "MERCHANT_AGENT");
      }

      await this.agentMessage(
        dealId,
        "BUYER_AGENT",
        mandateView.mandate.agentId,
        buyer.move.message,
        null,
        "SIMULATED",
        {
          allowed: buyer.guard.allowed,
          ruleId: buyer.guard.ruleId,
          summary: buyer.guard.summary,
          checks: buyer.guard.checks,
        },
      );

      const guardDecision: GuardDecision = {
        id: newId("gd_"),
        dealId,
        mandateId,
        tool: buyer.tool,
        allowed: buyer.guard.allowed,
        ruleId: buyer.guard.ruleId,
        reasonCodes: buyer.guard.reasonCodes,
        summary: buyer.guard.summary,
        checks: buyer.guard.checks,
        offerTotalMinor: buyer.guard.offerTotalMinor,
        bypassed: buyer.guard.bypassed,
        bypassLabel: buyer.guard.bypassLabel,
        at: this.deps.now().toISOString(),
      };
      await this.recordGuard(dealId, guardDecision);

      if (buyer.move.decision === "ACCEPT") {
        await patchDeal(this.db, dealId, {
          agreedOffer: offer,
          policy: {
            allowed: buyer.guard.allowed,
            ruleId: buyer.guard.ruleId,
            summary: buyer.guard.summary,
            checks: buyer.guard.checks,
          },
        });
        await this.appendTranscript(dealId, {
          signer: merchantAgentId,
          type: "OFFER_AGREED",
          payload: {
            offer,
            round,
            marginBps: merchant.quote.marginBps,
            adjustments: merchant.quote.adjustments,
          },
        });
        await this.event(dealId, "OFFER_AGREED", `Agreed ${offer.totalMinor} minor units in round ${round}`, {
          offer,
          round,
          marginBps: merchant.quote.marginBps,
          guardRuleId: buyer.guard.ruleId,
        });
        await this.setStatus(dealId, "AGREED");
        return true;
      }

      if (buyer.move.decision === "REJECT") {
        await this.fail(
          dealId,
          buyer.guard.ruleId,
          `the buyer agent declined the merchant quote: ${buyer.guard.summary}`,
        );
        return false;
      }

      buyerMessage = buyer.move.message;
    }

    await this.fail(dealId, "N-ROUNDS-LIMIT", `no agreement after ${this.policy.maxRounds} rounds`);
    return false;
  }

  // -------------------------------------------------------------------------
  // Step 3 — payment
  // -------------------------------------------------------------------------

  private async paymentStep(
    dealId: string,
    mandateId: string,
    buyerAgentId: string,
    offer: Offer | null,
  ): Promise<boolean> {
    if (!offer) {
      await this.fail(dealId, "P-NO-AGREEMENT", "no agreed offer to pay for");
      return false;
    }

    // Reserve before any money movement so two concurrent deals cannot overdraw one mandate.
    await reserveLedger(this.db, {
      id: `led_${dealId}`,
      mandateId,
      dealId,
      amountMinor: offer.totalMinor,
    });

    const now = this.deps.now();
    try {
      const created = await this.deps.payments.createOrder({
        amountMinor: offer.totalMinor,
        currency: "USD",
        referenceId: dealId,
        description: `Handshake deal ${dealId}`,
        idempotencyKey: `deal:${dealId}:create`,
      });
      const captured = await this.deps.payments.captureOrder({
        orderId: created.orderId,
        idempotencyKey: `deal:${dealId}:capture`,
      });

      const payment = PaymentSchema.parse({
        provider: captured.provider,
        simulated: captured.simulated,
        orderId: captured.orderId,
        captureId: captured.captureId,
        status: "COMPLETED",
        amountMinor: captured.amountMinor,
        currency: "USD",
        payerActionUrl: captured.payerActionUrl,
        createdAt: now.toISOString(),
        capturedAt: this.deps.now().toISOString(),
        failureReason: null,
      });

      await patchDeal(this.db, dealId, { payment });
      await setLedgerStatus(this.db, dealId, "SETTLED");
      await this.appendTranscript(dealId, {
        signer: "PAYMENTS",
        type: "PAYMENT_CAPTURED",
        payload: {
          provider: payment.provider,
          simulated: payment.simulated,
          orderId: payment.orderId,
          captureId: payment.captureId,
          amountMinor: payment.amountMinor,
        },
      });
      await this.event(
        dealId,
        "PAYMENT_STATUS",
        `${payment.provider === "PAYPAL_MOCK" ? "Simulated" : "Sandbox"} capture completed`,
        { payment },
      );
      await this.setStatus(dealId, "PAID");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "payment failed";
      const payment = PaymentSchema.parse({
        provider: this.deps.payments.name,
        simulated: this.deps.payments.simulated,
        orderId: `FAILED-${dealId}`,
        captureId: null,
        status: "FAILED",
        amountMinor: offer.totalMinor,
        currency: "USD",
        payerActionUrl: null,
        createdAt: now.toISOString(),
        capturedAt: null,
        failureReason: message,
      });
      await patchDeal(this.db, dealId, { payment });
      await setLedgerStatus(this.db, dealId, "VOIDED");
      await this.recordTrust(buyerAgentId, [
        {
          agentId: buyerAgentId,
          type: "PAYMENT_FAILED",
          dealId,
          note: message.slice(0, 200),
          at: this.deps.now().toISOString(),
        },
      ]);
      await this.fail(dealId, "P-PAYMENT-FAILED", message);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Step 4 — dual-signed receipt
  // -------------------------------------------------------------------------

  private async receiptStep(
    dealId: string,
    mandateId: string,
    buyerAgentId: string,
    merchantAgentId: string,
    fulfillmentIntent: string,
  ): Promise<void> {
    const row = await getDealRow(this.db, dealId);
    const offer = row?.agreedOffer ?? null;
    const payment = row?.payment ?? null;
    const keys = await ensureDemoKeys(this.db);
    if (!row || !offer || !payment) {
      await this.fail(dealId, "R-NO-SETTLEMENT", "cannot sign a receipt without an agreed offer and a capture");
      return;
    }

    const transcript = await this.currentTranscript(dealId);
    const attestationRefs = {
      buyer: row.handshakeResult?.buyerAttestationId ?? "att_missing",
      merchant: row.handshakeResult?.merchantAttestationId ?? "att_missing",
    };
    const now = this.deps.now();

    const body = DealReceiptBodySchema.parse({
      version: "handshake.receipt.v1",
      id: `rcpt_${dealId.slice("deal_".length)}`,
      dealId,
      mandateId,
      cart: offer.items,
      agreedPrice: { amountMinor: offer.totalMinor, currency: "USD" },
      negotiationTranscriptHash: chainRoot(transcript),
      attestationRefs,
      paypalOrderId: payment.orderId,
      issuedAt: now.toISOString(),
    });

    const receipt = signDealReceipt(body, {
      buyer: { agentId: buyerAgentId, key: keys.buyer },
      merchant: { agentId: merchantAgentId, key: keys.merchant },
    });

    await upsertReceipt(this.db, receipt);
    await setLedgerStatus(this.db, dealId, "SETTLED");

    const fulfillment =
      fulfillmentIntent === "NOT_DELIVERED"
        ? null
        : FulfillmentSchema.parse({
            carrier: "UPS",
            trackingNumber: `1Z${sha256Hex(dealId).slice(0, 16).toUpperCase()}`,
            deliveredAt: now.toISOString(),
            itemMatchesDescription: fulfillmentIntent === "DELIVERED",
            label: "SIMULATED",
          });

    await patchDeal(this.db, dealId, { fulfillment, completedAt: now });
    await this.appendTranscript(dealId, {
      signer: buyerAgentId,
      type: "RECEIPT_SIGNED",
      payload: { receiptId: receipt.id, digest: receipt.digest, transcriptHash: body.negotiationTranscriptHash },
    });
    await this.event(dealId, "RECEIPT_SIGNED", "Both agents signed the deal receipt", {
      receiptId: receipt.id,
      digest: receipt.digest,
      buyerKeyId: receipt.buyerSignature.signature.keyId,
      merchantKeyId: receipt.merchantSignature.signature.keyId,
    });
    await this.setStatus(dealId, "RECEIPT_SIGNED");

    const at = this.deps.now().toISOString();
    await this.recordTrust(buyerAgentId, [
      { agentId: buyerAgentId, type: "DEAL_SETTLED", dealId, note: "capture settled", at },
      { agentId: buyerAgentId, type: "RECEIPT_SIGNED", dealId, note: "receipt dual-signed", at },
    ]);
    await this.recordTrust(merchantAgentId, [
      { agentId: merchantAgentId, type: "DEAL_SETTLED", dealId, note: "capture settled", at },
      { agentId: merchantAgentId, type: "RECEIPT_SIGNED", dealId, note: "receipt dual-signed", at },
    ]);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async findMandate(mandateId: string): Promise<MandateView> {
    const views = await listMandateViews(this.db);
    const view = views.find((candidate) => candidate.mandate.id === mandateId);
    if (!view) throw new Error(`no mandate ${mandateId}`);
    return view;
  }

  async currentTranscript(dealId: string): Promise<EvidenceEntry[]> {
    const rows = await listMessageRows(this.db, dealId);
    return rows
      .filter((message) => message.kind === "TRANSCRIPT")
      .sort((a, b) => a.seq - b.seq)
      .map((message) => ({
        seq: message.seq,
        prevHash: message.prevHash,
        payloadHash: message.payloadHash,
        signer: message.signer,
        timestamp: message.timestamp.toISOString(),
        type: message.type,
        payload: message.payload,
        signature: null,
      }));
  }

  private async appendTranscript(
    dealId: string,
    input: { signer: string; type: string; payload: unknown },
  ): Promise<void> {
    const chain = await this.currentTranscript(dealId);
    const entry = appendEvidence(chain, {
      signer: input.signer,
      timestamp: this.deps.now().toISOString(),
      type: input.type,
      payload: input.payload,
    });
    await insertMessage(this.db, {
      id: newId("msg_"),
      dealId,
      kind: "TRANSCRIPT",
      seq: entry.seq,
      signer: entry.signer,
      type: entry.type,
      payload: entry.payload,
      prevHash: entry.prevHash,
      payloadHash: entry.payloadHash,
      timestamp: entry.timestamp,
    });
  }

  private async agentMessage(
    dealId: string,
    from: NegotiationTurn["from"],
    _agentId: string,
    message: string,
    offer: Offer | null,
    provenance: NegotiationTurn["provenance"],
    policy: NegotiationTurn["policy"],
  ): Promise<void> {
    const rows = await listMessageRows(this.db, dealId);
    const seq = rows.filter((row) => row.kind === "NEGOTIATION").length;
    const turn = NegotiationTurnSchema.parse({
      seq,
      from,
      kind: offer ? (from === "MERCHANT_AGENT" ? "PROPOSE" : "ACCEPT") : "COUNTER",
      message,
      offer,
      provenance,
      policy,
      at: this.deps.now().toISOString(),
    });
    await insertMessage(this.db, {
      id: newId("msg_"),
      dealId,
      kind: "NEGOTIATION",
      seq,
      signer: from,
      type: turn.kind,
      payload: turn,
      prevHash: "",
      payloadHash: "",
      timestamp: turn.at,
    });
    await this.appendTranscript(dealId, {
      signer: from,
      type: "AGENT_MESSAGE",
      payload: { message, provenance, offerTotalMinor: offer?.totalMinor ?? null },
    });
    await this.event(
      dealId,
      "AGENT_MESSAGE",
      `${from === "MERCHANT_AGENT" ? "Merchant" : "Buyer"}: ${message.slice(0, 120)}`,
      {
        from,
        message,
        provenance,
        offer,
      },
    );
  }

  private async recordGuard(dealId: string, decision: GuardDecision): Promise<void> {
    const row = await getDealRow(this.db, dealId);
    await patchDeal(this.db, dealId, {
      guardDecisions: [...(row?.guardDecisions ?? []), decision],
    });
    await this.appendTranscript(dealId, {
      signer: "MANDATE_GUARD",
      type: "GUARD_DECISION",
      payload: {
        tool: decision.tool,
        allowed: decision.allowed,
        ruleId: decision.ruleId,
        reasonCodes: decision.reasonCodes,
        bypassed: decision.bypassed,
      },
    });
    await this.event(
      dealId,
      decision.bypassed ? "GUARD_BYPASSED" : "GUARD_DECISION",
      `${decision.bypassed ? "DEMO BYPASS" : decision.allowed ? "Allowed" : "Denied"} — ${decision.ruleId}`,
      decision,
    );
  }

  private async recordInjection(dealId: string, findings: InjectionFinding[], source: string): Promise<void> {
    const row = await getDealRow(this.db, dealId);
    const at = this.deps.now().toISOString();
    const signals: InjectionSignal[] = findings.map((finding) => ({
      at,
      source,
      excerpt: finding.excerpt,
      pattern: finding.pattern,
    }));
    await patchDeal(this.db, dealId, {
      injectionSignals: [...(row?.injectionSignals ?? []), ...signals],
    });
    await this.appendTranscript(dealId, {
      signer: source,
      type: "INJECTION_BLOCKED",
      payload: { findings },
    });
    await this.event(dealId, "INJECTION_BLOCKED", `Blocked ${findings.length} injection attempt(s) from ${source}`, {
      source,
      findings,
    });
  }

  private async setStatus(dealId: string, next: DealStatus): Promise<void> {
    const row = await getDealRow(this.db, dealId);
    if (!row) return;
    const status = transitionDeal(row.status, next);
    if (status === row.status) return;
    await patchDeal(this.db, dealId, { status });
    await this.event(dealId, "STATE_CHANGED", `${row.status} → ${status}`, { from: row.status, to: status });
  }

  async fail(dealId: string, ruleId: string, message: string): Promise<void> {
    const row = await getDealRow(this.db, dealId);
    if (!row || row.status === "FAILED") return;
    await patchDeal(this.db, dealId, { status: "FAILED", failure: { ruleId, message: message.slice(0, 400) } });
    await setLedgerStatus(this.db, dealId, "VOIDED");
    await this.appendTranscript(dealId, {
      signer: "ORCHESTRATOR",
      type: "DEAL_FAILED",
      payload: { ruleId, message },
    });
    await this.event(dealId, "DEAL_FAILED", `${ruleId}: ${message.slice(0, 160)}`, { ruleId, message });
  }

  private async event(dealId: string, type: DealEventType, summary: string, data: unknown): Promise<void> {
    const existing = await listEventRows(this.db, dealId);
    const seq = existing.length === 0 ? 0 : Math.max(...existing.map((event) => event.seq)) + 1;
    const event: DealEvent = {
      id: newId("evt_"),
      seq,
      dealId,
      type,
      summary: summary.slice(0, 400),
      data,
      at: this.deps.now().toISOString(),
    };
    await insertEvent(this.db, event);
    this.deps.bus.publish(event);
  }

  private async recordTrust(agentId: string, events: TrustEvent[]): Promise<void> {
    const rows = await listTrustRows(this.db);
    const existing = rows.find((row) => row.agentId === agentId);
    const breakdown = computeTrust([...(existing?.events ?? []), ...events]);
    await this.patchTrust(agentId, events, breakdown.score, breakdown.grade);
  }

  private async patchTrust(agentId: string, events: TrustEvent[], score: number, grade: string): Promise<void> {
    const { appendTrustEvents } = await import("../db/writes");
    await appendTrustEvents(this.db, agentId, events, score, grade);
  }

  /** Exposed for the dispute route so a ruling can reload the deal view. */
  async view(dealId: string) {
    return getDeal(this.db, dealId);
  }
}
