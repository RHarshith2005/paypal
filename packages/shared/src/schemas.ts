import { z } from "zod";
import type { EvidenceEntry } from "./chain";

export const CURRENCY = "USD" as const;
export const CurrencySchema = z.literal(CURRENCY);
export const IsoDateTime = z.iso.datetime({ offset: true });
export const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, "expected base64url");
export const IdSchema = (prefix: string) => z.string().startsWith(prefix).max(80);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const AgentKindSchema = z.enum(["BUYER_AGENT", "MERCHANT_AGENT", "ARBITER"]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const PublicKeySchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: Base64UrlSchema,
});
export type PublicKey = z.infer<typeof PublicKeySchema>;

export const SignatureSchema = z.object({
  alg: z.literal("Ed25519"),
  keyId: z.string().min(1).max(120),
  value: Base64UrlSchema,
});
export type Signature = z.infer<typeof SignatureSchema>;

/**
 * SIMULATED. A real know-your-agent attestation would be issued by a regulated
 * registry. This one is produced by the local demo registry key so the protocol
 * shape is complete; it proves nothing about the outside world and is labelled
 * as simulated everywhere it is surfaced.
 */
export const AttestationSchema = z.object({
  provider: z.literal("SIMULATED"),
  label: z.literal("SIMULATED"),
  level: z.literal("KNOW_YOUR_AGENT_SIMULATED"),
  agentId: z.string().min(1),
  subjectPublicKey: PublicKeySchema,
  issuedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  registryKeyId: z.string().min(1),
  signature: SignatureSchema,
});
export type Attestation = z.infer<typeof AttestationSchema>;

export const AgentIdentitySchema = z.object({
  agentId: z.string().min(1),
  kind: AgentKindSchema,
  displayName: z.string().min(1).max(80),
  publicKey: PublicKeySchema,
  attestation: AttestationSchema,
});
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

// ---------------------------------------------------------------------------
// Mandate — the human's signed spending authority
// ---------------------------------------------------------------------------

export const IssuerSchema = z.object({
  id: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80),
  /** Key id of the human principal's Ed25519 key. */
  keyId: z.string().min(1).max(120),
  /** SIMULATED: the principal's key lives in the demo keystore, not a human's wallet. */
  identityLabel: z.literal("SIMULATED"),
});
export type Issuer = z.infer<typeof IssuerSchema>;

export const MandateTermsSchema = z
  .object({
    version: z.literal("handshake.mandate.v1"),
    issuer: IssuerSchema,
    /** The single buyer agent this spending authority is bound to. */
    agentId: z.string().min(1).max(120),
    currency: CurrencySchema,
    /** Lifetime cap in integer minor units. */
    maxTotal: z.int().positive(),
    /** Cap for one cart line (quantity × unit price), in integer minor units. */
    perItemMax: z.int().positive(),
    allowedCategories: z.array(z.string().min(1).max(40)).min(1),
    /** Tokens that must not appear in a line item's SKU or name. */
    forbiddenSubstitutions: z.array(z.string().min(1).max(60)).max(20),
    /** null means the principal approves any merchant agent. */
    merchantAllowlist: z.array(z.string().min(1)).min(1).nullable(),
    maxTransactions: z.int().positive().max(1000),
    issuedAt: IsoDateTime,
    expiresAt: IsoDateTime,
    nonce: z.string().min(8).max(128),
  })
  .refine((terms) => terms.perItemMax <= terms.maxTotal, {
    message: "perItemMax must not exceed maxTotal",
    path: ["perItemMax"],
  })
  .refine((terms) => Date.parse(terms.expiresAt) > Date.parse(terms.issuedAt), {
    message: "expiresAt must be after issuedAt",
    path: ["expiresAt"],
  });
export type MandateTerms = z.infer<typeof MandateTermsSchema>;

export const MandateSchema = MandateTermsSchema.and(
  z.object({
    id: IdSchema("mnd_"),
    signature: SignatureSchema,
  }),
);
export type Mandate = z.infer<typeof MandateSchema>;

// ---------------------------------------------------------------------------
// Offers and negotiation
// ---------------------------------------------------------------------------

export const OfferItemSchema = z.object({
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  /** Category the mandate allowlist is checked against. */
  category: z.string().min(1).max(40),
  quantity: z.int().min(1).max(50),
  unitPriceMinor: z.int().min(1).max(100_000_000),
});
export type OfferItem = z.infer<typeof OfferItemSchema>;

export const OfferSchema = z
  .object({
    currency: CurrencySchema,
    items: z.array(OfferItemSchema).min(1).max(10),
    totalMinor: z.int().min(1).max(100_000_000),
    deliveryDays: z.int().min(0).max(90),
    terms: z.string().min(1).max(400),
  })
  .refine(
    (offer) => offer.items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0) === offer.totalMinor,
    {
      message: "totalMinor must equal the sum of line items",
      path: ["totalMinor"],
    },
  );
export type Offer = z.infer<typeof OfferSchema>;

export const offerLineTotal = (item: OfferItem): number => item.quantity * item.unitPriceMinor;

export const PolicyCheckSchema = z.object({
  allowed: z.boolean(),
  ruleId: z.string().min(1),
  summary: z.string().min(1),
  checks: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      passed: z.boolean(),
      detail: z.string(),
    }),
  ),
});
export type PolicyCheck = z.infer<typeof PolicyCheckSchema>;

export const NegotiationTurnSchema = z.object({
  seq: z.int().min(0),
  from: z.enum(["BUYER_AGENT", "MERCHANT_AGENT"]),
  kind: z.enum(["PROPOSE", "COUNTER", "ACCEPT", "REJECT"]),
  message: z.string().min(1).max(1200),
  offer: OfferSchema.nullable(),
  /** MODEL = Anthropic call produced this turn, SIMULATED = deterministic script. */
  provenance: z.enum(["MODEL", "SIMULATED"]),
  policy: PolicyCheckSchema.nullable(),
  at: IsoDateTime,
});
export type NegotiationTurn = z.infer<typeof NegotiationTurnSchema>;

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

export const HandshakeTypeSchema = z.enum(["CHALLENGE", "CHALLENGE_RESPONSE", "ACCEPT"]);
export type HandshakeType = z.infer<typeof HandshakeTypeSchema>;

export const HandshakeMessageSchema = z.object({
  seq: z.int().min(0).max(2),
  type: HandshakeTypeSchema,
  from: z.string().min(1),
  dealId: IdSchema("deal_"),
  nonce: z.string().min(16).max(128),
  peerNonce: z.string().min(16).max(128).nullable(),
  identity: AgentIdentitySchema,
  signature: SignatureSchema,
  at: IsoDateTime,
});
export type HandshakeMessage = z.infer<typeof HandshakeMessageSchema>;

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export const PaymentStatusSchema = z.enum(["CREATED", "APPROVED", "COMPLETED", "FAILED", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  provider: z.enum(["PAYPAL_SANDBOX", "PAYPAL_MOCK"]),
  /** True whenever funds did not move on PayPal. Mirror of provider === PAYPAL_MOCK. */
  simulated: z.boolean(),
  orderId: z.string().min(1),
  captureId: z.string().min(1).nullable(),
  status: PaymentStatusSchema,
  amountMinor: z.int().min(0),
  currency: CurrencySchema,
  payerActionUrl: z.string().min(1).nullable(),
  createdAt: IsoDateTime,
  capturedAt: IsoDateTime.nullable(),
  failureReason: z.string().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// ---------------------------------------------------------------------------
// Transcript + receipt
// ---------------------------------------------------------------------------

export const EvidenceEntrySchema: z.ZodType<EvidenceEntry> = z.object({
  seq: z.int().min(0),
  prevHash: z.string().min(1),
  payloadHash: z.string().min(1),
  signer: z.string().min(1),
  timestamp: IsoDateTime,
  type: z.string().min(1),
  payload: z.unknown(),
  signature: SignatureSchema.nullable(),
});

/** One cart line of the settled deal. Same shape as an offer item. */
export const CartLineSchema = OfferItemSchema;
export type CartLine = z.infer<typeof CartLineSchema>;

export const AgreedPriceSchema = z.object({
  amountMinor: z.int().min(1),
  currency: CurrencySchema,
});
export type AgreedPrice = z.infer<typeof AgreedPriceSchema>;

/** References to both agents' attestations (SIMULATED in this demo). */
export const AttestationRefsSchema = z.object({
  buyer: z.string().min(1).max(120),
  merchant: z.string().min(1).max(120),
});
export type AttestationRefs = z.infer<typeof AttestationRefsSchema>;

const DealReceiptBodyBase = z.object({
  version: z.literal("handshake.receipt.v1"),
  id: IdSchema("rcpt_"),
  dealId: IdSchema("deal_"),
  mandateId: IdSchema("mnd_"),
  cart: z.array(CartLineSchema).min(1).max(10),
  agreedPrice: AgreedPriceSchema,
  /** SHA-256 root of the negotiation transcript chain. */
  negotiationTranscriptHash: z.string().length(64),
  attestationRefs: AttestationRefsSchema,
  paypalOrderId: z.string().min(1).max(64),
  issuedAt: IsoDateTime,
});

const cartTotalsAgree = (body: { cart: CartLine[]; agreedPrice: AgreedPrice }): boolean =>
  body.cart.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0) === body.agreedPrice.amountMinor;

const CART_TOTAL_MESSAGE: { message: string; path: string[] } = {
  message: "agreedPrice.amountMinor must equal the cart total",
  path: ["agreedPrice"],
};

export const DealReceiptBodySchema = DealReceiptBodyBase.refine(cartTotalsAgree, CART_TOTAL_MESSAGE);
export type DealReceiptBody = z.infer<typeof DealReceiptBodySchema>;

export const DealReceiptSchema = DealReceiptBodyBase.extend({
  digest: z.string().length(64),
  buyerSignature: z.object({ agentId: z.string().min(1), signature: SignatureSchema }),
  merchantSignature: z.object({ agentId: z.string().min(1), signature: SignatureSchema }),
}).refine(cartTotalsAgree, CART_TOTAL_MESSAGE);
export type DealReceipt = z.infer<typeof DealReceiptSchema>;

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

export const DealStatusSchema = z.enum([
  "VALIDATED",
  "HANDSHAKING",
  "NEGOTIATING",
  "AGREED",
  "PAYING",
  "RECEIPTED",
  "COMPLETED",
  "FAILED",
]);
export type DealStatus = z.infer<typeof DealStatusSchema>;

export const InjectionSignalSchema = z.object({
  at: IsoDateTime,
  source: z.string().min(1),
  excerpt: z.string().min(1).max(400),
  pattern: z.string().min(1),
});
export type InjectionSignal = z.infer<typeof InjectionSignalSchema>;

export const FulfillmentSchema = z.object({
  carrier: z.string().min(1),
  trackingNumber: z.string().min(1),
  deliveredAt: IsoDateTime,
  itemMatchesDescription: z.boolean(),
  /** SIMULATED: carrier scan data is invented by the demo merchant. */
  label: z.literal("SIMULATED"),
});
export type Fulfillment = z.infer<typeof FulfillmentSchema>;

export const DealSchema = z.object({
  id: IdSchema("deal_"),
  mandateId: IdSchema("mnd_"),
  buyerAgentId: z.string().min(1),
  merchantAgentId: z.string().min(1),
  status: DealStatusSchema,
  sessionId: z.string().min(16).nullable(),
  handshake: z.array(HandshakeMessageSchema),
  turns: z.array(NegotiationTurnSchema),
  agreedOffer: OfferSchema.nullable(),
  policy: PolicyCheckSchema.nullable(),
  payment: PaymentSchema.nullable(),
  receipt: DealReceiptSchema.nullable(),
  transcript: z.array(EvidenceEntrySchema),
  injectionSignals: z.array(InjectionSignalSchema),
  fulfillment: FulfillmentSchema.nullable(),
  failure: z.object({ ruleId: z.string(), message: z.string() }).nullable(),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type Deal = z.infer<typeof DealSchema>;

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export const ClaimTypeSchema = z.enum([
  "GOODS_NOT_RECEIVED",
  "NOT_AS_DESCRIBED",
  "UNAUTHORIZED_CHARGE",
  "MANDATE_BREACH",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const LiabilitySchema = z.enum(["BUYER", "MERCHANT", "PLATFORM", "UNRESOLVED"]);
export type Liability = z.infer<typeof LiabilitySchema>;

export const RemedySchema = z.enum(["NO_ACTION", "REFUND_FULL", "REFUND_PARTIAL"]);
export type Remedy = z.infer<typeof RemedySchema>;

export const RulingSchema = z.object({
  id: IdSchema("rul_"),
  disputeId: IdSchema("dsp_"),
  dealId: IdSchema("deal_"),
  liability: LiabilitySchema,
  remedy: RemedySchema,
  refundMinor: z.int().min(0),
  ruleId: z.string().min(1),
  ruleSummary: z.string().min(1),
  citations: z.array(z.string().min(1)),
  narrative: z.string().min(1).max(4000),
  /** MODEL = Anthropic narrative, SIMULATED = deterministic fallback template. */
  narrativeSource: z.enum(["MODEL", "SIMULATED"]),
  decidedAt: IsoDateTime,
});
export type Ruling = z.infer<typeof RulingSchema>;

export const DisputeSchema = z.object({
  id: IdSchema("dsp_"),
  dealId: IdSchema("deal_"),
  claimType: ClaimTypeSchema,
  claim: z.string().min(10).max(2000),
  openedBy: z.enum(["BUYER", "MERCHANT"]),
  status: z.enum(["OPEN", "RULED"]),
  evidenceIds: z.array(z.string().min(1)),
  ruling: RulingSchema.nullable(),
  createdAt: IsoDateTime,
});
export type Dispute = z.infer<typeof DisputeSchema>;

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------

export const TrustEventTypeSchema = z.enum([
  "DEAL_SETTLED",
  "RECEIPT_SIGNED",
  "DISPUTE_LOST",
  "DISPUTE_WON",
  "INJECTION_BLOCKED",
  "INVALID_SIGNATURE",
  "PAYMENT_FAILED",
]);
export type TrustEventType = z.infer<typeof TrustEventTypeSchema>;

export const TrustEventSchema = z.object({
  agentId: z.string().min(1),
  type: TrustEventTypeSchema,
  dealId: z.string().nullable(),
  note: z.string().max(200),
  at: IsoDateTime,
});
export type TrustEvent = z.infer<typeof TrustEventSchema>;

// ---------------------------------------------------------------------------
// API view models
// ---------------------------------------------------------------------------

export const SpendLedgerSchema = z.object({
  settledMinor: z.int().min(0),
  reservedMinor: z.int().min(0),
  settledCount: z.int().min(0),
  reservedCount: z.int().min(0),
});
export type SpendLedger = z.infer<typeof SpendLedgerSchema>;

export const TrustViewSchema = z.object({
  score: z.int().min(0).max(100),
  grade: z.enum(["HIGH", "MEDIUM", "LOW"]),
  events: z.array(TrustEventSchema),
});
export type TrustView = z.infer<typeof TrustViewSchema>;

export const AgentViewSchema = z.object({
  agentId: z.string(),
  kind: AgentKindSchema,
  displayName: z.string(),
  publicKey: PublicKeySchema,
  attestation: AttestationSchema,
  trust: TrustViewSchema,
  stats: z.object({
    deals: z.int().min(0),
    settledMinor: z.int().min(0),
    disputesLost: z.int().min(0),
  }),
});
export type AgentView = z.infer<typeof AgentViewSchema>;

export const MandateViewSchema = z.object({
  mandate: MandateSchema,
  ledger: SpendLedgerSchema,
  remainingMinor: z.int().min(0),
  remainingTransactions: z.int().min(0),
  active: z.boolean(),
});
export type MandateView = z.infer<typeof MandateViewSchema>;

export const VerificationViewSchema = z.object({
  chain: z.object({
    valid: z.boolean(),
    brokenAt: z.int().nullable(),
    reason: z.string().nullable(),
    root: z.string(),
  }),
  receiptDigestMatches: z.boolean(),
  buyerSignatureValid: z.boolean(),
  merchantSignatureValid: z.boolean(),
  signatureMessages: z.array(z.string()),
  verifiedAt: IsoDateTime,
});
export type VerificationView = z.infer<typeof VerificationViewSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  dealId: z.string(),
  amountMinor: z.int().min(0),
  status: z.enum(["RESERVED", "SETTLED", "VOIDED"]),
  createdAt: IsoDateTime,
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const DealViewSchema = z.object({
  deal: DealSchema,
  verification: VerificationViewSchema.nullable(),
  disputes: z.array(DisputeSchema),
});
export type DealView = z.infer<typeof DealViewSchema>;

export const DealSummarySchema = z.object({
  id: z.string(),
  mandateId: z.string(),
  merchantAgentId: z.string(),
  merchantName: z.string(),
  buyerAgentId: z.string(),
  status: DealStatusSchema,
  amountMinor: z.int().min(0),
  currency: CurrencySchema,
  paymentProvider: z.enum(["PAYPAL_SANDBOX", "PAYPAL_MOCK"]).nullable(),
  simulatedPayment: z.boolean(),
  signatures: z.int().min(0).max(2),
  chainValid: z.boolean().nullable(),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type DealSummary = z.infer<typeof DealSummarySchema>;

export const OverviewSchema = z.object({
  agents: z.array(AgentViewSchema),
  mandates: z.array(MandateViewSchema),
  deals: z.array(DealSummarySchema),
  disputes: z.array(DisputeSchema),
  runtime: z.object({
    paypalMode: z.enum(["mock", "sandbox"]),
    paypalConfigured: z.boolean(),
    agentRuntime: z.enum(["MODEL", "SIMULATED"]),
    model: z.string(),
    database: z.enum(["postgres", "pglite"]),
  }),
  totals: z.object({
    settledMinor: z.int().min(0),
    dealsCompleted: z.int().min(0),
    disputesRuled: z.int().min(0),
    injectionsBlocked: z.int().min(0),
  }),
});
export type Overview = z.infer<typeof OverviewSchema>;

export const CatalogItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  merchantAgentId: z.string(),
  listPriceMinor: z.int().positive(),
  floorPriceMinor: z.int().positive(),
  description: z.string(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("handshake-api"),
  version: z.string().min(1),
  uptimeSeconds: z.int().min(0),
  now: IsoDateTime,
  database: z.object({
    driver: z.enum(["postgres", "pglite"]),
    ok: z.boolean(),
    latencyMs: z.int().min(0),
    error: z.string().nullable(),
  }),
  paypal: z.object({
    mode: z.enum(["mock", "sandbox"]),
    configured: z.boolean(),
    /** True whenever the mock adapter is in use: no funds move. */
    simulated: z.boolean(),
  }),
  agents: z.object({
    runtime: z.enum(["MODEL", "SIMULATED"]),
    model: z.string().min(1),
  }),
});
export type Health = z.infer<typeof HealthSchema>;

export const MandateListSchema = z.object({ mandates: z.array(MandateViewSchema) });
export type MandateList = z.infer<typeof MandateListSchema>;

export const LedgerListSchema = z.object({ entries: z.array(LedgerEntrySchema) });
export type LedgerList = z.infer<typeof LedgerListSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.string().nullable(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const RunDealRequestSchema = z.object({
  mandateId: IdSchema("mnd_"),
  merchantAgentId: z.string().min(1),
  /** Merchant persona that tries to talk the buyer agent out of its mandate. */
  hostileMerchant: z.boolean().default(false),
  fulfillment: z.enum(["DELIVERED", "NOT_DELIVERED", "NOT_AS_DESCRIBED"]).default("DELIVERED"),
});
export type RunDealRequest = z.infer<typeof RunDealRequestSchema>;

export const OpenDisputeRequestSchema = z.object({
  claimType: ClaimTypeSchema,
  claim: z.string().min(10).max(2000),
  openedBy: z.enum(["BUYER", "MERCHANT"]),
});
export type OpenDisputeRequest = z.infer<typeof OpenDisputeRequestSchema>;
