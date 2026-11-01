import type {
  Attestation,
  DealEvent,
  DealReceipt,
  DealStatus,
  Dispute,
  EvidencePacket,
  Fulfillment,
  GuardDecision,
  HandshakeResult,
  InjectionSignal,
  LedgerEntry,
  Mandate,
  Offer,
  Payment,
  PolicyCheck,
  PublicKey,
  TrustEvent,
} from "@handshake/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "./queries";
import {
  agents,
  attestations,
  consumedNonces,
  dealEvents,
  deals,
  disputes,
  evidencePackets,
  ledgerEntries,
  mandates,
  messages,
  principalKeys,
  receipts,
  trustAnchorKeys,
  trustScores,
} from "./schema";

// ---------------------------------------------------------------------------
// Agents and the trust anchor
// ---------------------------------------------------------------------------

export interface AgentRow {
  agentId: string;
  kind: "BUYER_AGENT" | "MERCHANT_AGENT" | "ARBITER";
  displayName: string;
  keyId: string;
  publicKey: PublicKey;
  privateKeyPem: string;
}

export async function upsertAgent(db: Db, row: AgentRow): Promise<void> {
  await db
    .insert(agents)
    .values({
      id: row.agentId,
      kind: row.kind,
      displayName: row.displayName,
      keyId: row.keyId,
      publicKey: row.publicKey,
      privateKeyPkcs8: row.privateKeyPem,
    })
    .onConflictDoUpdate({
      target: agents.id,
      set: {
        displayName: row.displayName,
        keyId: row.keyId,
        publicKey: row.publicKey,
        privateKeyPkcs8: row.privateKeyPem,
      },
    });
}

export async function listAgentRows(db: Db) {
  return db.select().from(agents).orderBy(asc(agents.id));
}

export async function insertMandate(db: Db, mandate: Mandate): Promise<void> {
  await db
    .insert(mandates)
    .values({
      id: mandate.id,
      issuer: mandate.issuer,
      agentId: mandate.agentId,
      currency: mandate.currency,
      maxTotal: mandate.maxTotal,
      perItemMax: mandate.perItemMax,
      allowedCategories: mandate.allowedCategories,
      forbiddenSubstitutions: mandate.forbiddenSubstitutions,
      merchantAllowlist: mandate.merchantAllowlist,
      maxTransactions: mandate.maxTransactions,
      issuedAt: new Date(mandate.issuedAt),
      expiresAt: new Date(mandate.expiresAt),
      nonce: mandate.nonce,
      signature: mandate.signature,
    })
    .onConflictDoNothing();
}

export async function getAgentRow(db: Db, agentId: string) {
  const [row] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return row ?? null;
}

export async function loadAnchorKeyRow(db: Db) {
  const [row] = await db.select().from(trustAnchorKeys).limit(1);
  return row ?? null;
}

export async function saveAnchorKeyRow(
  db: Db,
  row: { keyId: string; publicKey: PublicKey; privateKeyPem: string },
): Promise<void> {
  await db
    .insert(trustAnchorKeys)
    .values({ keyId: row.keyId, publicKey: row.publicKey, privateKeyPkcs8: row.privateKeyPem })
    .onConflictDoNothing();
}

export async function loadPrincipalKeyRow(db: Db) {
  const [row] = await db.select().from(principalKeys).limit(1);
  return row ?? null;
}

export async function savePrincipalKeyRow(
  db: Db,
  row: { keyId: string; principalId: string; publicKey: PublicKey; privateKeyPem: string },
): Promise<void> {
  await db
    .insert(principalKeys)
    .values({
      keyId: row.keyId,
      principalId: row.principalId,
      publicKey: row.publicKey,
      privateKeyPkcs8: row.privateKeyPem,
    })
    .onConflictDoNothing();
}

export async function insertAttestation(db: Db, attestation: Attestation): Promise<void> {
  await db
    .insert(attestations)
    .values({
      id: attestation.attestationId,
      kind: attestation.kind,
      subjectAgentId: attestation.subjectAgentId,
      body: attestation,
      issuedAt: new Date(attestation.issuedAt),
      expiresAt: new Date(attestation.validUntil),
    })
    .onConflictDoNothing();
}

export async function getAttestationRow(db: Db, attestationId: string) {
  const [row] = await db.select().from(attestations).where(eq(attestations.id, attestationId)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Nonces
// ---------------------------------------------------------------------------

/** Claims a nonce exactly once. Returns false when it was already used (a replay). */
export async function consumeNonce(
  db: Db,
  input: { nonce: string; scope: string; dealId: string | null },
): Promise<boolean> {
  const inserted = await db
    .insert(consumedNonces)
    .values({ nonce: input.nonce, scope: input.scope, dealId: input.dealId, usedAt: new Date() })
    .onConflictDoNothing()
    .returning({ nonce: consumedNonces.nonce });
  return inserted.length > 0;
}

export async function listConsumedNonces(db: Db): Promise<string[]> {
  const rows = await db.select({ nonce: consumedNonces.nonce }).from(consumedNonces);
  return rows.map((row) => row.nonce);
}

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export interface NewDealRow {
  id: string;
  mandateId: string;
  buyerAgentId: string;
  merchantAgentId: string;
  status: DealStatus;
  misconfiguredAgent: boolean;
  hostileMerchant: boolean;
  /** How the demo merchant behaves after capture: DELIVERED | NOT_DELIVERED | NOT_AS_DESCRIBED. */
  fulfillmentIntent: string;
}

export async function insertDeal(db: Db, row: NewDealRow): Promise<void> {
  await db.insert(deals).values({
    id: row.id,
    mandateId: row.mandateId,
    buyerAgentId: row.buyerAgentId,
    merchantAgentId: row.merchantAgentId,
    status: row.status,
    misconfiguredAgent: row.misconfiguredAgent,
    hostileMerchant: row.hostileMerchant,
    fulfillmentIntent: row.fulfillmentIntent,
    guardDecisions: [],
  });
}

export async function patchDeal(
  db: Db,
  dealId: string,
  patch: Partial<{
    status: DealStatus;
    sessionId: string | null;
    handshakeResult: HandshakeResult | null;
    guardDecisions: GuardDecision[];
    agreedOffer: Offer | null;
    policy: PolicyCheck | null;
    payment: Payment | null;
    fulfillment: Fulfillment | null;
    injectionSignals: InjectionSignal[];
    failure: { ruleId: string; message: string } | null;
    completedAt: Date;
  }>,
): Promise<void> {
  await db.update(deals).set(patch).where(eq(deals.id, dealId));
}

export async function getDealRow(db: Db, dealId: string) {
  const [row] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function insertEvent(db: Db, event: DealEvent): Promise<void> {
  await db
    .insert(dealEvents)
    .values({
      id: event.id,
      dealId: event.dealId,
      seq: event.seq,
      type: event.type,
      summary: event.summary,
      data: event.data,
      at: new Date(event.at),
    })
    .onConflictDoNothing();
}

export async function listEventRows(db: Db, dealId: string) {
  return db.select().from(dealEvents).where(eq(dealEvents.dealId, dealId)).orderBy(asc(dealEvents.seq));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function insertMessage(
  db: Db,
  row: {
    id: string;
    dealId: string;
    kind: "HANDSHAKE" | "NEGOTIATION" | "TRANSCRIPT";
    seq: number;
    signer: string;
    type: string;
    payload: unknown;
    prevHash: string;
    payloadHash: string;
    timestamp: string;
  },
): Promise<void> {
  await db
    .insert(messages)
    .values({ ...row, timestamp: new Date(row.timestamp) })
    .onConflictDoNothing();
}

export async function listMessageRows(db: Db, dealId: string) {
  return db.select().from(messages).where(eq(messages.dealId, dealId)).orderBy(asc(messages.seq));
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export async function upsertReceipt(db: Db, receipt: DealReceipt): Promise<void> {
  const { digest, buyerSignature, merchantSignature, ...body } = receipt;
  await db
    .insert(receipts)
    .values({
      id: receipt.id,
      dealId: receipt.dealId,
      body,
      digest,
      buyerSignature,
      merchantSignature,
      issuedAt: new Date(receipt.issuedAt),
    })
    .onConflictDoUpdate({
      target: receipts.dealId,
      set: {
        id: receipt.id,
        body,
        digest,
        buyerSignature,
        merchantSignature,
        issuedAt: new Date(receipt.issuedAt),
      },
    });
}

export async function getReceiptRow(db: Db, dealId: string) {
  const [row] = await db.select().from(receipts).where(eq(receipts.dealId, dealId)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Reserves funds against a mandate. The id is derived from the deal id, so a
 * resumed deal cannot reserve twice; the unique primary key does the work.
 */
export async function reserveLedger(
  db: Db,
  row: { id: string; mandateId: string; dealId: string; amountMinor: number },
): Promise<void> {
  await db
    .insert(ledgerEntries)
    .values({ ...row, status: "RESERVED" })
    .onConflictDoNothing();
}

export async function setLedgerStatus(db: Db, dealId: string, status: LedgerEntry["status"]): Promise<void> {
  await db
    .update(ledgerEntries)
    .set({ status })
    .where(and(eq(ledgerEntries.dealId, dealId)));
}

export async function getLedgerRows(db: Db, dealId: string) {
  return db.select().from(ledgerEntries).where(eq(ledgerEntries.dealId, dealId));
}

// ---------------------------------------------------------------------------
// Disputes and evidence
// ---------------------------------------------------------------------------

export async function upsertDispute(db: Db, dispute: Dispute): Promise<void> {
  await db
    .insert(disputes)
    .values({
      id: dispute.id,
      dealId: dispute.dealId,
      claimType: dispute.claimType,
      claim: dispute.claim,
      openedBy: dispute.openedBy,
      status: dispute.status,
      evidenceIds: dispute.evidenceIds,
      ruling: dispute.ruling,
      createdAt: new Date(dispute.createdAt),
      ruledAt: dispute.ruling ? new Date(dispute.ruling.decidedAt) : null,
    })
    .onConflictDoUpdate({
      target: disputes.id,
      set: {
        status: dispute.status,
        evidenceIds: dispute.evidenceIds,
        ruling: dispute.ruling,
        ruledAt: dispute.ruling ? new Date(dispute.ruling.decidedAt) : null,
      },
    });
}

export async function saveEvidencePacket(db: Db, packet: EvidencePacket): Promise<void> {
  await db
    .insert(evidencePackets)
    .values({
      id: packet.id,
      disputeId: packet.disputeId,
      dealId: packet.dealId,
      packet,
      createdAt: new Date(packet.createdAt),
    })
    .onConflictDoNothing();
}

export async function getEvidencePacketRow(db: Db, disputeId: string) {
  const [row] = await db
    .select()
    .from(evidencePackets)
    .where(eq(evidencePackets.disputeId, disputeId))
    .orderBy(desc(evidencePackets.createdAt))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------

export async function appendTrustEvents(
  db: Db,
  agentId: string,
  events: readonly TrustEvent[],
  score: number,
  grade: string,
): Promise<void> {
  const [existing] = await db.select().from(trustScores).where(eq(trustScores.agentId, agentId)).limit(1);
  if (!existing) {
    await db
      .insert(trustScores)
      .values({ agentId, score, grade, events: [...events], updatedAt: new Date() })
      .onConflictDoNothing();
    return;
  }
  await db
    .update(trustScores)
    .set({ score, grade, events: [...existing.events, ...events], updatedAt: new Date() })
    .where(eq(trustScores.agentId, agentId));
}

export async function listTrustRows(db: Db) {
  return db.select().from(trustScores);
}
