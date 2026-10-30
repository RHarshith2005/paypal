import {
  DealSchema,
  DisputeSchema,
  HandshakeMessageSchema,
  LedgerEntrySchema,
  MandateSchema,
  NegotiationTurnSchema,
  DealReceiptSchema,
  type DealView,
  type Dispute,
  type LedgerEntry,
  type Mandate,
  type MandateView,
  type SpendLedger,
  remainingBudgetMinor,
  remainingTransactions,
} from "@handshake/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { schema as DatabaseSchema } from "./schema";
import { deals, disputes, ledgerEntries, mandates, messages, receipts } from "./schema";

/** Drizzle's query builder is driver-agnostic; both node-postgres and PGlite share this shape. */
export type Db = PgDatabase<PgQueryResultHKT, typeof DatabaseSchema>;

const toIso = (value: Date): string => value.toISOString();
const emptyLedger = (): SpendLedger => ({
  settledMinor: 0,
  reservedMinor: 0,
  settledCount: 0,
  reservedCount: 0,
});

export async function listMandates(db: Db): Promise<Mandate[]> {
  const rows = await db.select().from(mandates).orderBy(desc(mandates.createdAt));
  return rows.map((row) =>
    MandateSchema.parse({
      id: row.id,
      version: "handshake.mandate.v1",
      issuer: row.issuer,
      agentId: row.agentId,
      currency: row.currency,
      maxTotal: row.maxTotal,
      perItemMax: row.perItemMax,
      allowedCategories: row.allowedCategories,
      forbiddenSubstitutions: row.forbiddenSubstitutions,
      merchantAllowlist: row.merchantAllowlist ?? null,
      maxTransactions: row.maxTransactions,
      issuedAt: toIso(row.issuedAt),
      expiresAt: toIso(row.expiresAt),
      nonce: row.nonce,
      signature: row.signature,
    }),
  );
}

export async function listMandateViews(db: Db, now: Date = new Date()): Promise<MandateView[]> {
  const mandateRows = await listMandates(db);
  const sums = await db
    .select({
      mandateId: ledgerEntries.mandateId,
      status: ledgerEntries.status,
      total: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.mandateId, ledgerEntries.status);

  const ledgers = new Map<string, SpendLedger>();
  for (const sum of sums) {
    const current = ledgers.get(sum.mandateId) ?? emptyLedger();
    if (sum.status === "SETTLED") {
      current.settledMinor += Number(sum.total);
      current.settledCount += Number(sum.count);
    } else if (sum.status === "RESERVED") {
      current.reservedMinor += Number(sum.total);
      current.reservedCount += Number(sum.count);
    }
    ledgers.set(sum.mandateId, current);
  }

  return mandateRows.map((mandate) => {
    const ledger = ledgers.get(mandate.id) ?? emptyLedger();
    return {
      mandate,
      ledger,
      remainingMinor: remainingBudgetMinor(mandate, ledger),
      remainingTransactions: remainingTransactions(mandate, ledger),
      active: now.getTime() < Date.parse(mandate.expiresAt),
    };
  });
}

export async function listLedgerEntries(db: Db, limit = 200): Promise<LedgerEntry[]> {
  const rows = await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(limit);
  return rows.map((row) =>
    LedgerEntrySchema.parse({
      id: row.id,
      mandateId: row.mandateId,
      dealId: row.dealId,
      amountMinor: row.amountMinor,
      status: row.status,
      createdAt: toIso(row.createdAt),
    }),
  );
}

async function disputesForDeal(db: Db, dealId: string): Promise<Dispute[]> {
  const rows = await db.select().from(disputes).where(eq(disputes.dealId, dealId)).orderBy(desc(disputes.createdAt));
  return rows.map((row) =>
    DisputeSchema.parse({
      id: row.id,
      dealId: row.dealId,
      claimType: row.claimType,
      claim: row.claim,
      openedBy: row.openedBy,
      status: row.status,
      evidenceIds: row.evidenceIds,
      ruling: row.ruling ?? null,
      createdAt: toIso(row.createdAt),
    }),
  );
}

export async function getDispute(db: Db, disputeId: string): Promise<Dispute | null> {
  const [row] = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  if (!row) return null;
  return DisputeSchema.parse({
    id: row.id,
    dealId: row.dealId,
    claimType: row.claimType,
    claim: row.claim,
    openedBy: row.openedBy,
    status: row.status,
    evidenceIds: row.evidenceIds,
    ruling: row.ruling ?? null,
    createdAt: toIso(row.createdAt),
  });
}

export async function getDeal(db: Db, dealId: string): Promise<DealView | null> {
  const [row] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!row) return null;

  const [messageRows, receiptRows, disputeRows] = await Promise.all([
    db.select().from(messages).where(eq(messages.dealId, dealId)).orderBy(messages.seq),
    db.select().from(receipts).where(eq(receipts.dealId, dealId)).limit(1),
    disputesForDeal(db, dealId),
  ]);

  const handshake = messageRows
    .filter((message) => message.kind === "HANDSHAKE")
    .sort((a, b) => a.seq - b.seq)
    .map((message) => HandshakeMessageSchema.parse(message.payload));
  const turns = messageRows
    .filter((message) => message.kind === "NEGOTIATION")
    .sort((a, b) => a.seq - b.seq)
    .map((message) => NegotiationTurnSchema.parse(message.payload));
  const transcript = messageRows
    .filter((message) => message.kind === "TRANSCRIPT")
    .sort((a, b) => a.seq - b.seq)
    .map((message) => ({
      seq: message.seq,
      prevHash: message.prevHash,
      payloadHash: message.payloadHash,
      signer: message.signer,
      timestamp: toIso(message.timestamp),
      type: message.type,
      payload: message.payload,
      signature: null,
    }));

  const receiptRow = receiptRows[0];
  const receipt = receiptRow
    ? DealReceiptSchema.parse({
        ...receiptRow.body,
        id: receiptRow.id,
        digest: receiptRow.digest,
        buyerSignature: receiptRow.buyerSignature,
        merchantSignature: receiptRow.merchantSignature,
      })
    : null;

  const deal = DealSchema.parse({
    id: row.id,
    mandateId: row.mandateId,
    buyerAgentId: row.buyerAgentId,
    merchantAgentId: row.merchantAgentId,
    status: row.status,
    sessionId: row.sessionId ?? null,
    handshake,
    turns,
    agreedOffer: row.agreedOffer ?? null,
    policy: row.policy ?? null,
    payment: row.payment ?? null,
    receipt,
    transcript,
    injectionSignals: row.injectionSignals,
    fulfillment: row.fulfillment ?? null,
    failure: row.failure ?? null,
    createdAt: toIso(row.createdAt),
    completedAt: row.completedAt ? toIso(row.completedAt) : null,
  });

  return { deal, verification: null, disputes: disputeRows };
}
