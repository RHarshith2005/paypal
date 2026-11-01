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
 * SIMULATED trust-anchor attestations.
 *
 * A real version of this would be issued by PayPal identity or an agentic-token
 * issuer. This one is signed by the local demo trust anchor so the protocol
 * shape is complete, and it proves nothing about the outside world. Every
 * attestation says so itself (`provider`, `label`), and the handshake result
 * carries `attestationsSimulated: true` so no caller can mistake it for a real
 * identity check.
 */
const AttestationBase = {
  version: z.literal("handshake.attestation.v1"),
  provider: z.literal("SIMULATED_TRUST_ANCHOR"),
  label: z.literal("SIMULATED"),
  attestationId: IdSchema("att_"),
  subjectAgentId: z.string().min(1).max(120),
  subjectKeyId: z.string().min(1).max(120),
  /** Key id of the trust anchor that issued this attestation. */
  anchorKeyId: z.string().min(1).max(120),
  issuedAt: IsoDateTime,
  validUntil: IsoDateTime,
} as const;

export const BuyerAttestationBodySchema = z.object({
  ...AttestationBase,
  kind: z.literal("BUYER"),
  principalVerified: z.boolean(),
  fundingVerified: z.boolean(),
  mandateId: IdSchema("mnd_"),
  /** SHA-256 of canonical {mandate minus signature}: binds the attestation to one mandate. */
  mandateHash: z.string().length(64),
});
export type BuyerAttestationBody = z.infer<typeof BuyerAttestationBodySchema>;

export const BuyerAttestationSchema = BuyerAttestationBodySchema.extend({ signature: SignatureSchema });
export type BuyerAttestation = z.infer<typeof BuyerAttestationSchema>;

export const MerchantAttestationBodySchema = z.object({
  ...AttestationBase,
  kind: z.literal("MERCHANT"),
  merchantVerified: z.boolean(),
  catalogId: z.string().min(1).max(120),
  /** SHA-256 of the canonical catalog the merchant attested to. */
  catalogHash: z.string().length(64),
  inventoryCheckedAt: IsoDateTime,
});
export type MerchantAttestationBody = z.infer<typeof MerchantAttestationBodySchema>;

export const MerchantAttestationSchema = MerchantAttestationBodySchema.extend({ signature: SignatureSchema });
export type MerchantAttestation = z.infer<typeof MerchantAttestationSchema>;

export const AttestationSchema = z.discriminatedUnion("kind", [BuyerAttestationSchema, MerchantAttestationSchema]);
export type Attestation = z.infer<typeof AttestationSchema>;
/** Alias used by the attestation helpers, which care about both kinds. */
export type AgentAttestation = Attestation;

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
// Handshake result (Step 4)
// ---------------------------------------------------------------------------

export const HandshakeCheckSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string(),
});
export type HandshakeCheck = z.infer<typeof HandshakeCheckSchema>;

export const HandshakeResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string().min(16).max(120),
  challengeNonce: z.string().min(16).max(128),
  responseNonce: z.string().min(16).max(128),
  buyerAttestationId: z.string().min(1),
  merchantAttestationId: z.string().min(1),
  mandateHash: z.string().length(64),
  catalogHash: z.string().length(64),
  checks: z.array(HandshakeCheckSchema),
  /** Failed check codes in order. Empty when `ok` is true. */
  reasons: z.array(z.string()),
  /** Always true in this build: the anchor is a local stand-in for a real issuer. */
  attestationsSimulated: z.literal(true),
  at: IsoDateTime,
});
export type HandshakeResult = z.infer<typeof HandshakeResultSchema>;

// ---------------------------------------------------------------------------
// MandateGuard decisions (Step 6)
// ---------------------------------------------------------------------------

export const GuardToolSchema = z.enum([
  "search_products",
  "propose_offer",
  "accept_offer",
  "request_checkout",
  "ask_human",
]);
export type GuardTool = z.infer<typeof GuardToolSchema>;

export const GuardDecisionSchema = z.object({
  id: IdSchema("gd_"),
  dealId: IdSchema("deal_"),
  mandateId: IdSchema("mnd_"),
  tool: GuardToolSchema,
  allowed: z.boolean(),
  ruleId: z.string().min(1),
  reasonCodes: z.array(z.string()),
  summary: z.string().min(1),
  checks: z.array(
    z.object({ id: z.string().min(1), name: z.string().min(1), passed: z.boolean(), detail: z.string() }),
  ),
  offerTotalMinor: z.int().min(0),
  /** True only in the DEMO misconfigured-agent mode: the guard was bypassed on purpose. */
  bypassed: z.boolean(),
  bypassLabel: z.literal("DEMO_MISCONFIGURATION").nullable(),
  at: IsoDateTime,
});
export type GuardDecision = z.infer<typeof GuardDecisionSchema>;

// ---------------------------------------------------------------------------
// Deal event stream (Step 7)
// ---------------------------------------------------------------------------

export const DealEventTypeSchema = z.enum([
  "DEAL_CREATED",
  "STATE_CHANGED",
  "ATTESTATION_ISSUED",
  "HANDSHAKE_RESULT",
  "AGENT_MESSAGE",
  "GUARD_DECISION",
  "GUARD_BYPASSED",
  "OFFER_AGREED",
  "PAYMENT_STATUS",
  "RECEIPT_SIGNED",
  "INJECTION_BLOCKED",
  "DEAL_FAILED",
  "DISPUTE_OPENED",
  "DEAL_RESOLVED",
]);
export type DealEventType = z.infer<typeof DealEventTypeSchema>;

export const DealEventSchema = z.object({
  id: z.string().min(1),
  seq: z.int().min(0),
  dealId: IdSchema("deal_"),
  type: DealEventTypeSchema,
  summary: z.string().min(1).max(400),
  data: z.unknown(),
  at: IsoDateTime,
});
export type DealEvent = z.infer<typeof DealEventSchema>;

// ---------------------------------------------------------------------------
// Catalog and merchant policy (Step 5)
// ---------------------------------------------------------------------------

export const CatalogSourceSchema = z.enum(["FIXTURE", "CHANNEL3"]);
export type CatalogSource = z.infer<typeof CatalogSourceSchema>;

export const CatalogProductSchema = z.object({
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(40),
  description: z.string().min(1).max(400),
  /** What the merchant asks by default, in minor units. */
  listPriceMinor: z.int().positive(),
  /** What the merchant paid, in minor units. Never exposed to the buyer agent. */
  unitCostMinor: z.int().positive(),
  stock: z.int().min(0),
  merchantAgentId: z.string().min(1).max(120),
  source: CatalogSourceSchema,
  /** True for fixture data: these are not real products at real prices. */
  simulated: z.boolean(),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

export const BundleDiscountTierSchema = z.object({
  minQuantity: z.int().min(1).max(200),
  discountBps: z.int().min(0).max(5000),
});

export const MerchantPolicySchema = z.object({
  merchantAgentId: z.string().min(1),
  /** Floor price = unit cost * (1 + minMargin). Enforced in code before any quote leaves. */
  minMarginBps: z.int().min(0).max(10_000),
  /** Absolute cap on any discount from list price. */
  maxDiscountFromListBps: z.int().min(0).max(10_000),
  bundleDiscountTiers: z.array(BundleDiscountTierSchema).min(1).max(6),
  maxRounds: z.int().min(1).max(12),
  /** How old the attested inventory snapshot may be at handshake time. */
  inventoryFreshnessMs: z.int().positive(),
});
export type MerchantPolicy = z.infer<typeof MerchantPolicySchema>;

export const MerchantMoveActionSchema = z.enum(["OFFER", "COUNTER", "ACCEPT", "REJECT", "INFO"]);
export type MerchantMoveAction = z.infer<typeof MerchantMoveActionSchema>;

/**
 * The only shape a merchant agent may emit. The model picks the action, the
 * line items and the discount it would like; pricing is then computed by policy
 * code that clamps the discount and refuses to cross the margin floor.
 */
export const MerchantMoveSchema = z.object({
  action: MerchantMoveActionSchema,
  lines: z
    .array(z.object({ sku: z.string().min(1).max(40), quantity: z.int().min(1).max(50) }))
    .max(10)
    .default([]),
  discountBps: z.int().min(0).max(10_000).default(0),
  message: z.string().min(1).max(1200),
});
export type MerchantMove = z.infer<typeof MerchantMoveSchema>;

export const BuyerDecisionSchema = z.enum(["PROPOSE", "ACCEPT", "COUNTER", "REJECT", "ASK_HUMAN"]);
export type BuyerDecision = z.infer<typeof BuyerDecisionSchema>;

export const BuyerMoveSchema = z.object({
  decision: BuyerDecisionSchema,
  lines: z
    .array(z.object({ sku: z.string().min(1).max(40), quantity: z.int().min(1).max(50) }))
    .max(10)
    .default([]),
  message: z.string().min(1).max(1200),
});
export type BuyerMove = z.infer<typeof BuyerMoveSchema>;

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
  handshakeResult: HandshakeResultSchema.nullable(),
  guardDecisions: z.array(GuardDecisionSchema),
  events: z.array(DealEventSchema),
  /** DEMO: true when this deal ran with the guard deliberately bypassed (Case B). */
  misconfiguredAgent: z.boolean(),
  transcript: z.array(EvidenceEntrySchema),
  injectionSignals: z.array(InjectionSignalSchema),
  fulfillment: FulfillmentSchema.nullable(),
  failure: z.object({ ruleId: z.string(), message: z.string() }).nullable(),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type Deal = z.infer<typeof DealSchema>;

// ---------------------------------------------------------------------------
// Claim vocabulary shared by disputes and evidence packets
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

// ---------------------------------------------------------------------------
// Evidence packet (Step 8)
// ---------------------------------------------------------------------------

export const ArbiterVerdictEnumSchema = z.enum([
  "MERCHANT_FAULT",
  "BUYER_AGENT_OUT_OF_MANDATE",
  "AMBIGUOUS_INTENT",
  "VALID_PURCHASE",
]);
export type ArbiterVerdict = z.infer<typeof ArbiterVerdictEnumSchema>;

/** Strict JSON shape the arbiter model must return. Nothing else is accepted. */
export const ArbiterVerdictSchema = z.object({
  verdict: ArbiterVerdictEnumSchema,
  liability: z.object({ party: LiabilitySchema, percent: z.int().min(0).max(100) }),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(20),
  reasoning: z.string().min(20).max(2000),
  confidence: z.number().min(0).max(1),
});
export type ArbiterVerdictPayload = z.infer<typeof ArbiterVerdictSchema>;

export const EvidencePacketSchema = z.object({
  id: IdSchema("pkt_"),
  disputeId: IdSchema("dsp_"),
  dealId: IdSchema("deal_"),
  mandateId: IdSchema("mnd_"),
  createdAt: IsoDateTime,
  claim: z.object({ type: ClaimTypeSchema, text: z.string(), openedBy: z.enum(["BUYER", "MERCHANT"]) }),
  mandate: MandateSchema,
  handshake: HandshakeResultSchema.nullable(),
  attestations: z.object({
    buyer: BuyerAttestationSchema.nullable(),
    merchant: MerchantAttestationSchema.nullable(),
  }),
  transcript: z.array(EvidenceEntrySchema),
  guardDecisions: z.array(GuardDecisionSchema),
  receipt: DealReceiptSchema.nullable(),
  payment: z.object({
    provider: z.enum(["PAYPAL_SANDBOX", "PAYPAL_MOCK"]),
    orderId: z.string(),
    captureId: z.string().nullable(),
    status: PaymentStatusSchema,
    amountMinor: z.int().min(0),
    currency: CurrencySchema,
    capturedAt: IsoDateTime.nullable(),
    simulated: z.boolean(),
  }),
  fulfillment: FulfillmentSchema.nullable(),
  /** Deterministic checks run before any model is consulted. */
  checks: z.array(
    z.object({ id: z.string().min(1), name: z.string().min(1), passed: z.boolean(), detail: z.string() }),
  ),
  /** The only evidence ids the arbiter may cite. */
  evidenceIds: z.array(z.string().min(1)),
});
export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

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
  verdict: ArbiterVerdictEnumSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  /** DETERMINISTIC = no model was consulted; MODEL_ASSISTED = model output was used and validated. */
  decidedBy: z.enum(["DETERMINISTIC", "MODEL_ASSISTED"]),
  /** Ready-to-send response for the merchant's PayPal dispute thread. */
  draftResponse: z.string().min(1).max(4000),
  /** Populated when a model answer was rejected for citing evidence outside the packet. */
  rejectedModelOutput: z.string().max(2000).nullable(),
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

export const DisputeViewSchema = z.object({
  dispute: DisputeSchema,
  packet: EvidencePacketSchema.nullable(),
});
export type DisputeView = z.infer<typeof DisputeViewSchema>;

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
  evidencePackets: z.array(EvidencePacketSchema),
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
    /** True when the sandbox adapter was unreachable and the labelled mock took over. */
    fallback: z.boolean().default(false),
  }),
  agents: z.object({
    runtime: z.enum(["MODEL", "SIMULATED"]),
    model: z.string().min(1),
    /** Model calls are live, served from the record/replay cache, or scripted. */
    dialogue: z.enum(["LIVE", "REPLAY", "SCRIPTED"]).default("SCRIPTED"),
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
  /**
   * DEMO ONLY. Bypasses MandateGuard so Case B can be reproduced end to end.
   * Every bypass is written to the ledger and surfaced in the UI as evidence.
   */
  misconfiguredAgent: z.boolean().default(false),
});
export type RunDealRequest = z.infer<typeof RunDealRequestSchema>;

export const OpenDisputeRequestSchema = z.object({
  claimType: ClaimTypeSchema,
  claim: z.string().min(10).max(2000),
  openedBy: z.enum(["BUYER", "MERCHANT"]),
});
export type OpenDisputeRequest = z.infer<typeof OpenDisputeRequestSchema>;

export const DealRunResponseSchema = z.object({
  dealId: IdSchema("deal_"),
  status: DealStatusSchema,
  statusUrl: z.string().min(1),
  eventsUrl: z.string().min(1),
});
export type DealRunResponse = z.infer<typeof DealRunResponseSchema>;

export const DealListResponseSchema = z.object({ deals: z.array(DealSummarySchema) });
export type DealListResponse = z.infer<typeof DealListResponseSchema>;

/** Trust score with the exact inputs that produced it, so the UI can show the formula. */
export const AgentTrustSchema = z.object({
  agentId: z.string().min(1),
  kind: AgentKindSchema,
  displayName: z.string().min(1),
  score: z.int().min(0).max(100),
  grade: z.enum(["HIGH", "MEDIUM", "LOW"]),
  positive: z.int(),
  negative: z.int(),
  events: z.array(TrustEventSchema),
  formula: z.object({
    base: z.int(),
    positiveCap: z.int(),
    negativeCap: z.int(),
    deltas: z.record(TrustEventTypeSchema, z.int()),
  }),
});
export type AgentTrust = z.infer<typeof AgentTrustSchema>;

export const AgentTrustListSchema = z.object({ agents: z.array(AgentTrustSchema) });
export type AgentTrustList = z.infer<typeof AgentTrustListSchema>;

export const DisputeListItemSchema = z.object({
  dispute: DisputeSchema,
  packet: EvidencePacketSchema.nullable(),
  /** "A" / "B" for the two seeded demo cases, null for anything else. */
  caseLabel: z.enum(["A", "B"]).nullable(),
});
export type DisputeListItem = z.infer<typeof DisputeListItemSchema>;

export const DisputeListSchema = z.object({ disputes: z.array(DisputeListItemSchema) });
export type DisputeList = z.infer<typeof DisputeListSchema>;

/** Input for the mandate builder. The issuer identity is fixed to the demo principal. */
export const MandateCreateRequestSchema = z
  .object({
    agentId: z.string().min(3).max(80).default("agt_buyer_demo"),
    maxTotal: z.int().positive().max(10_000_000),
    perItemMax: z.int().positive().max(10_000_000),
    maxTransactions: z.int().min(1).max(100),
    allowedCategories: z.array(z.string().min(1).max(40)).min(1).max(12),
    forbiddenSubstitutions: z.array(z.string().min(1).max(40)).max(12).default([]),
    merchantAllowlist: z.array(z.string().min(1).max(80)).max(20).nullable().default(null),
    expiresInMinutes: z.int().min(5).max(1440).default(60),
  })
  .refine((value) => value.perItemMax <= value.maxTotal, {
    message: "perItemMax cannot exceed maxTotal",
    path: ["perItemMax"],
  });
export type MandateCreateRequest = z.infer<typeof MandateCreateRequestSchema>;

export const DemoCaseSchema = z.enum(["A", "B"]);
export type DemoCase = z.infer<typeof DemoCaseSchema>;

export const DemoRunRequestSchema = z.object({ case: DemoCaseSchema });
export type DemoRunRequest = z.infer<typeof DemoRunRequestSchema>;

export const DemoRunResponseSchema = z.object({
  caseLabel: DemoCaseSchema,
  dealId: IdSchema("deal_"),
  disputeId: z.string().min(3).max(80),
  label: z.string().min(1),
});
export type DemoRunResponse = z.infer<typeof DemoRunResponseSchema>;

export const DemoResetResponseSchema = z.object({
  reset: z.literal(true),
  cleared: z.object({
    deals: z.int().min(0),
    disputes: z.int().min(0),
    ledgerEntries: z.int().min(0),
  }),
  seeded: DemoRunResponseSchema.array(),
});
export type DemoResetResponse = z.infer<typeof DemoResetResponseSchema>;
