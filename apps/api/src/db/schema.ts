import type {
  Attestation,
  DealReceiptBody,
  Dispute,
  EvidencePacket,
  Fulfillment,
  GuardDecision,
  HandshakeResult,
  InjectionSignal,
  Mandate,
  Offer,
  Payment,
  PolicyCheck,
  PublicKey,
  Signature,
  TrustEvent,
} from "@handshake/shared";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const agentKindEnum = pgEnum("agent_kind", ["BUYER_AGENT", "MERCHANT_AGENT", "ARBITER"]);

export const dealStatusEnum = pgEnum("deal_status", [
  "CREATED",
  "HANDSHAKE",
  "NEGOTIATING",
  "AGREED",
  "PAID",
  "RECEIPT_SIGNED",
  "DISPUTED",
  "RESOLVED",
  "FAILED",
]);

export const messageKindEnum = pgEnum("message_kind", ["HANDSHAKE", "NEGOTIATION", "TRANSCRIPT"]);

export const ledgerStatusEnum = pgEnum("ledger_entry_status", ["RESERVED", "SETTLED", "VOIDED"]);

export const disputeStatusEnum = pgEnum("dispute_status", ["OPEN", "RULED"]);

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    kind: agentKindEnum("kind").notNull(),
    displayName: text("display_name").notNull(),
    publicKey: jsonb("public_key").$type<PublicKey>().notNull(),
    /** Key id the agent signs with; attestations reference it. */
    keyId: text("key_id").notNull(),
    /** Latest attestation issued to this agent (SIMULATED). History lives in `attestations`. */
    attestation: jsonb("attestation").$type<Attestation>(),
    /** DEMO ONLY: Ed25519 private key. Production keeps this in a KMS/HSM. */
    privateKeyPkcs8: text("private_key_pkcs8").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("agents_kind_idx").on(table.kind)],
);

export const mandates = pgTable(
  "mandates",
  {
    id: text("id").primaryKey(),
    issuer: jsonb("issuer").$type<Mandate["issuer"]>().notNull(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    maxTotal: integer("max_total").notNull(),
    perItemMax: integer("per_item_max").notNull(),
    allowedCategories: jsonb("allowed_categories").$type<string[]>().notNull(),
    forbiddenSubstitutions: jsonb("forbidden_substitutions").$type<string[]>().notNull(),
    merchantAllowlist: jsonb("merchant_allowlist").$type<string[] | null>(),
    maxTransactions: integer("max_transactions").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    nonce: text("nonce").notNull(),
    signature: jsonb("signature").$type<Signature>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("mandates_agent_idx").on(table.agentId),
    // Nonce replay defence at the storage layer: a mandate nonce is used once.
    uniqueIndex("mandates_nonce_idx").on(table.nonce),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict" }),
    buyerAgentId: text("buyer_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    merchantAgentId: text("merchant_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    status: dealStatusEnum("status").notNull(),
    sessionId: text("session_id"),
    agreedOffer: jsonb("agreed_offer").$type<Offer>(),
    policy: jsonb("policy").$type<PolicyCheck>(),
    payment: jsonb("payment").$type<Payment>(),
    handshakeResult: jsonb("handshake_result").$type<HandshakeResult>(),
    guardDecisions: jsonb("guard_decisions").$type<GuardDecision[]>().notNull().default([]),
    /** DEMO: this deal ran with the MandateGuard deliberately bypassed. */
    misconfiguredAgent: boolean("misconfigured_agent").notNull().default(false),
    /** Persisted so a resumed run keeps the same merchant persona. */
    hostileMerchant: boolean("hostile_merchant").notNull().default(false),
    /** DELIVERED | NOT_DELIVERED | NOT_AS_DESCRIBED, consumed when the receipt is signed. */
    fulfillmentIntent: text("fulfillment_intent").notNull().default("DELIVERED"),
    fulfillment: jsonb("fulfillment").$type<Fulfillment>(),
    injectionSignals: jsonb("injection_signals").$type<InjectionSignal[]>().notNull().default([]),
    failure: jsonb("failure").$type<{ ruleId: string; message: string }>(),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("deals_mandate_idx").on(table.mandateId), index("deals_merchant_idx").on(table.merchantAgentId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    kind: messageKindEnum("kind").notNull(),
    seq: integer("seq").notNull(),
    signer: text("signer").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    prevHash: text("prev_hash").notNull(),
    payloadHash: text("payload_hash").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [uniqueIndex("messages_deal_kind_seq_idx").on(table.dealId, table.kind, table.seq)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    body: jsonb("body").$type<DealReceiptBody>().notNull(),
    digest: text("digest").notNull(),
    buyerSignature: jsonb("buyer_signature").$type<{ agentId: string; signature: Signature }>().notNull(),
    merchantSignature: jsonb("merchant_signature").$type<{ agentId: string; signature: Signature }>().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [uniqueIndex("receipts_deal_idx").on(table.dealId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id, { onDelete: "restrict" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    status: ledgerStatusEnum("status").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("ledger_mandate_idx").on(table.mandateId), index("ledger_deal_idx").on(table.dealId)],
);

export const disputes = pgTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    claimType: text("claim_type").notNull(),
    claim: text("claim").notNull(),
    openedBy: text("opened_by").notNull(),
    status: disputeStatusEnum("status").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    ruling: jsonb("ruling").$type<Dispute["ruling"]>(),
    createdAt: createdAt(),
    ruledAt: timestamp("ruled_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("disputes_deal_idx").on(table.dealId), index("disputes_status_idx").on(table.status)],
);

/**
 * DEMO ONLY keystore for the human principal's signing key. A production build
 * keeps this in a wallet, an HSM or the user's device, never in the app database.
 */
export const principalKeys = pgTable("principal_keys", {
  keyId: text("key_id").primaryKey(),
  principalId: text("principal_id").notNull(),
  publicKey: jsonb("public_key").$type<PublicKey>().notNull(),
  privateKeyPkcs8: text("private_key_pkcs8").notNull(),
  createdAt: createdAt(),
});

export const trustAnchorKeys = pgTable("trust_anchor_keys", {
  keyId: text("key_id").primaryKey(),
  publicKey: jsonb("public_key").$type<PublicKey>().notNull(),
  /** DEMO ONLY: the anchor key is persisted so restarts can still verify issued attestations. */
  privateKeyPkcs8: text("private_key_pkcs8").notNull(),
  createdAt: createdAt(),
});

export const attestations = pgTable(
  "attestations",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subjectAgentId: text("subject_agent_id").notNull(),
    body: jsonb("body").$type<Attestation>().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("attestations_subject_idx").on(table.subjectAgentId)],
);

/** Handshake and mandate nonces are single-use; this table is the replay defence. */
export const consumedNonces = pgTable("consumed_nonces", {
  nonce: text("nonce").primaryKey(),
  scope: text("scope").notNull(),
  dealId: text("deal_id"),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const dealEvents = pgTable(
  "deal_events",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    at: timestamp("at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [uniqueIndex("deal_events_deal_seq_idx").on(table.dealId, table.seq)],
);

export const evidencePackets = pgTable(
  "evidence_packets",
  {
    id: text("id").primaryKey(),
    disputeId: text("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    packet: jsonb("packet").$type<EvidencePacket>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("evidence_packets_deal_idx").on(table.dealId)],
);

export const trustScores = pgTable("trust_scores", {
  agentId: text("agent_id")
    .primaryKey()
    .references(() => agents.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  grade: text("grade").notNull(),
  /** Full append-only event history: the score is always recomputable from this. */
  events: jsonb("events").$type<TrustEvent[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const schema = {
  agents,
  mandates,
  deals,
  messages,
  receipts,
  ledgerEntries,
  disputes,
  trustScores,
  trustAnchorKeys,
  principalKeys,
  attestations,
  consumedNonces,
  dealEvents,
  evidencePackets,
};

export type DealEventRow = typeof dealEvents.$inferSelect;
export type DealEventInsert = typeof dealEvents.$inferInsert;
