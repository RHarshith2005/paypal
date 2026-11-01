import { describe, expect, it } from "vitest";
import { catalogHash, mandateHash } from "./attestation";
import { canonicalJson } from "./canonical";
import { generateSigningKey, signCanonical, verifyPayload } from "./crypto";
import { evaluateHandshake, randomNonce, type HandshakeInput } from "./handshake";
import {
  BuyerAttestationBodySchema,
  BuyerAttestationSchema,
  CatalogProductSchema,
  MandateSchema,
  MerchantAttestationBodySchema,
  MerchantAttestationSchema,
  type BuyerAttestation,
  type CatalogProduct,
  type Mandate,
  type MerchantAttestation,
} from "./schemas";

const NOW = new Date("2026-03-01T12:00:00.000Z");
const anchor = generateSigningKey("TRUST_ANCHOR", "key_anchor_demo");
const buyerKey = generateSigningKey("BUYER_AGENT", "key_agt_buyer_01");
const merchantKey = generateSigningKey("MERCHANT_AGENT", "key_agt_merchant_ridgeway");

const catalog: CatalogProduct[] = [
  CatalogProductSchema.parse({
    sku: "sku_gloves",
    name: "Nitrile gloves, box of 100",
    category: "PPE",
    description: "Powder-free nitrile examination gloves.",
    listPriceMinor: 10_000,
    unitCostMinor: 7_000,
    stock: 40,
    merchantAgentId: "agt_merchant_ridgeway",
    source: "FIXTURE",
    simulated: true,
  }),
];
const catalogDigest = catalogHash(catalog);

const mandate: Mandate = MandateSchema.parse({
  id: "mnd_test_0001",
  version: "handshake.mandate.v1",
  issuer: { id: "prn_dana", displayName: "Dana Ruiz", keyId: "key_prn_dana", identityLabel: "SIMULATED" },
  agentId: "agt_buyer_01",
  currency: "USD",
  maxTotal: 100_000,
  perItemMax: 25_000,
  allowedCategories: ["PPE"],
  forbiddenSubstitutions: ["latex"],
  merchantAllowlist: ["agt_merchant_ridgeway"],
  maxTransactions: 5,
  issuedAt: "2026-02-27T00:00:00.000Z",
  expiresAt: "2026-03-06T00:00:00.000Z",
  nonce: "nonce-mandate-0001",
  signature: { alg: "Ed25519", keyId: "key_prn_dana", value: "c2lnbmF0dXJl" },
});
const mandateDigest = mandateHash(mandate);

const buyerAttestation = (overrides: Record<string, unknown> = {}): BuyerAttestation => {
  const body = BuyerAttestationBodySchema.parse({
    version: "handshake.attestation.v1",
    provider: "SIMULATED_TRUST_ANCHOR",
    label: "SIMULATED",
    attestationId: "att_buyer_0001",
    kind: "BUYER",
    subjectAgentId: "agt_buyer_01",
    subjectKeyId: buyerKey.keyId,
    anchorKeyId: anchor.keyId,
    issuedAt: "2026-03-01T11:55:00.000Z",
    validUntil: "2026-03-01T12:05:00.000Z",
    principalVerified: true,
    fundingVerified: true,
    mandateId: mandate.id,
    mandateHash: mandateDigest,
    ...overrides,
  });
  return BuyerAttestationSchema.parse({
    ...body,
    signature: signCanonical(anchor.privateKeyPem, anchor.keyId, canonicalJson(body)),
  });
};

const merchantAttestation = (overrides: Record<string, unknown> = {}): MerchantAttestation => {
  const body = MerchantAttestationBodySchema.parse({
    version: "handshake.attestation.v1",
    provider: "SIMULATED_TRUST_ANCHOR",
    label: "SIMULATED",
    attestationId: "att_merchant_0001",
    kind: "MERCHANT",
    subjectAgentId: "agt_merchant_ridgeway",
    subjectKeyId: merchantKey.keyId,
    anchorKeyId: anchor.keyId,
    issuedAt: "2026-03-01T11:55:00.000Z",
    validUntil: "2026-03-01T12:05:00.000Z",
    merchantVerified: true,
    catalogId: "cat_ridgeway_v1",
    catalogHash: catalogDigest,
    inventoryCheckedAt: "2026-03-01T11:59:00.000Z",
    ...overrides,
  });
  return MerchantAttestationSchema.parse({
    ...body,
    signature: signCanonical(anchor.privateKeyPem, anchor.keyId, canonicalJson(body)),
  });
};

const input = (overrides: Partial<HandshakeInput> = {}): HandshakeInput => ({
  dealId: "deal_test_0001",
  mandate,
  buyer: {
    agentId: "agt_buyer_01",
    keyId: buyerKey.keyId,
    publicKey: buyerKey.publicKey,
    attestation: buyerAttestation(),
  },
  merchant: {
    agentId: "agt_merchant_ridgeway",
    keyId: merchantKey.keyId,
    publicKey: merchantKey.publicKey,
    attestation: merchantAttestation(),
  },
  anchorPublicKey: anchor.publicKey,
  challengeNonce: randomNonce(),
  responseNonce: randomNonce(),
  expectedCatalogHash: catalogDigest,
  now: NOW,
  maxInventoryAgeMs: 10 * 60 * 1000,
  revokedMerchantIds: [],
  usedNonces: [],
  ...overrides,
});

describe("evaluateHandshake", () => {
  it("accepts a handshake where both attestations bind to this mandate and catalog", () => {
    const result = evaluateHandshake(input(), verifyPayload);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.attestationsSimulated).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
    expect(result.checks).toHaveLength(15);
    expect(result.sessionId).toHaveLength(32);
    expect(result.mandateHash).toBe(mandateDigest);
    expect(result.catalogHash).toBe(catalogDigest);
  });

  it("rejects an expired attestation", () => {
    const result = evaluateHandshake(
      input({
        buyer: {
          agentId: "agt_buyer_01",
          keyId: buyerKey.keyId,
          publicKey: buyerKey.publicKey,
          attestation: buyerAttestation({ validUntil: "2026-03-01T11:59:00.000Z" }),
        },
      }),
      verifyPayload,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-BUYER-VALID-05");
  });

  it("rejects an attestation bound to a different mandate hash", () => {
    const result = evaluateHandshake(
      input({
        buyer: {
          agentId: "agt_buyer_01",
          keyId: buyerKey.keyId,
          publicKey: buyerKey.publicKey,
          attestation: buyerAttestation({ mandateHash: "b".repeat(64) }),
        },
      }),
      verifyPayload,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-MANDATE-HASH-07");
  });

  it("rejects a revoked merchant even with a valid attestation", () => {
    const result = evaluateHandshake(input({ revokedMerchantIds: ["agt_merchant_ridgeway"] }), verifyPayload);

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-REVOKED-09");
  });

  it("rejects a replayed challenge nonce", () => {
    const challengeNonce = randomNonce();
    const result = evaluateHandshake(input({ challengeNonce, usedNonces: [challengeNonce] }), verifyPayload);

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-NONCE-REPLAY-10");
  });

  it("rejects a stale inventory snapshot", () => {
    const result = evaluateHandshake(
      input({
        merchant: {
          agentId: "agt_merchant_ridgeway",
          keyId: merchantKey.keyId,
          publicKey: merchantKey.publicKey,
          attestation: merchantAttestation({ inventoryCheckedAt: "2026-03-01T08:00:00.000Z" }),
        },
      }),
      verifyPayload,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-INVENTORY-15");
  });

  it("rejects an attestation signed by an impostor anchor", () => {
    const impostor = generateSigningKey("TRUST_ANCHOR", "key_anchor_impostor");
    const forged = merchantAttestation({ anchorKeyId: impostor.keyId });
    const result = evaluateHandshake(
      input({
        merchant: {
          agentId: "agt_merchant_ridgeway",
          keyId: merchantKey.keyId,
          publicKey: merchantKey.publicKey,
          attestation: forged,
        },
      }),
      verifyPayload,
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("A-MERCHANT-SIG-02");
  });
});
