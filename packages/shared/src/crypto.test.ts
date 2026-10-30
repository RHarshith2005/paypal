import { describe, expect, it } from "vitest";
import {
  generateRoleKeyring,
  generateSigningKey,
  keyFingerprint,
  signDealReceipt,
  signEvidenceEntry,
  signMandate,
  signPayload,
  verifyDealReceipt,
  verifyEvidenceEntry,
  verifyMandate,
  verifyPayload,
} from "./crypto";
import { appendEvidence, GENESIS_HASH } from "./chain";
import { DealReceiptBodySchema, MandateSchema, PublicKeySchema, type DealReceiptBody } from "./schemas";

const human = generateSigningKey("HUMAN", "key_prn_dana");
const buyer = generateSigningKey("BUYER_AGENT", "key_agt_buyer_01");
const merchant = generateSigningKey("MERCHANT_AGENT", "key_agt_merchant_ridgeway");

const unsignedMandate = (overrides: Record<string, unknown> = {}) => ({
  id: "mnd_crypto_0001",
  version: "handshake.mandate.v1",
  issuer: { id: "prn_dana", displayName: "Dana Ruiz", keyId: human.keyId, identityLabel: "SIMULATED" },
  agentId: buyer.keyId.replace("key_agt_", "agt_"),
  currency: "USD",
  maxTotal: 100_000,
  perItemMax: 40_000,
  allowedCategories: ["PPE", "LIGHTING"],
  forbiddenSubstitutions: ["latex"],
  merchantAllowlist: ["agt_merchant_ridgeway"],
  maxTransactions: 5,
  issuedAt: "2026-03-01T00:00:00.000Z",
  expiresAt: "2026-03-06T00:00:00.000Z",
  nonce: "nonce-mandate-0001",
  ...overrides,
});

const receiptBody = (): DealReceiptBody =>
  DealReceiptBodySchema.parse({
    version: "handshake.receipt.v1",
    id: "rcpt_0001",
    dealId: "deal_0001",
    mandateId: "mnd_crypto_0001",
    cart: [
      {
        sku: "sku_gloves",
        name: "Nitrile gloves, box of 100",
        category: "PPE",
        quantity: 2,
        unitPriceMinor: 6_000,
      },
      {
        sku: "sku_lamp",
        name: "LED work lamp",
        category: "LIGHTING",
        quantity: 1,
        unitPriceMinor: 3_000,
      },
    ],
    agreedPrice: { amountMinor: 15_000, currency: "USD" },
    negotiationTranscriptHash: "a".repeat(64),
    attestationRefs: { buyer: "att_buyer_simulated", merchant: "att_merchant_simulated" },
    paypalOrderId: "5O190127TN364715T",
    issuedAt: "2026-03-01T12:05:00.000Z",
  });

describe("keypairs", () => {
  it("generates one Ed25519 keypair per role with distinct key ids", () => {
    const keyring = generateRoleKeyring();
    expect(Object.keys(keyring).sort()).toEqual(["BUYER_AGENT", "HUMAN", "MERCHANT_AGENT", "TRUST_ANCHOR"]);
    expect(PublicKeySchema.safeParse(keyring.HUMAN.publicKey).success).toBe(true);
    expect(keyring.HUMAN.publicKey.kty).toBe("OKP");
    expect(keyring.HUMAN.publicKey.crv).toBe("Ed25519");
    const keyIds = Object.values(keyring).map((key) => key.keyId);
    expect(new Set(keyIds).size).toBe(4);
    expect(keyring.HUMAN.privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  it("exports a STABLE public fingerprint", () => {
    const regenerated = generateSigningKey("HUMAN");
    expect(keyFingerprint(human.publicKey)).toBe(keyFingerprint(human.publicKey));
    expect(keyFingerprint(regenerated.publicKey)).not.toBe(keyFingerprint(human.publicKey));
  });
});

describe("sign / verify", () => {
  it("round-trips a canonical payload", () => {
    const payload = { amountMinor: 15_000, currency: "USD", nested: { b: 2, a: 1 } };
    const signature = signPayload(buyer, payload);
    expect(signature.alg).toBe("Ed25519");
    expect(signature.keyId).toBe(buyer.keyId);
    expect(verifyPayload(buyer.publicKey, payload, signature)).toBe(true);
  });

  it("rejects a payload modified after signing", () => {
    const signature = signPayload(buyer, { amountMinor: 15_000 });
    expect(verifyPayload(buyer.publicKey, { amountMinor: 25_000 }, signature)).toBe(false);
  });

  it("rejects a signature checked under the wrong signer's key", () => {
    const signature = signPayload(buyer, { dealId: "deal_0001" });
    expect(verifyPayload(merchant.publicKey, { dealId: "deal_0001" }, signature)).toBe(false);
  });
});

describe("mandate signatures", () => {
  it("accepts a mandate signed by its issuer", () => {
    const mandate = MandateSchema.parse(signMandate(unsignedMandate() as never, human));
    const verification = verifyMandate(mandate, human.publicKey);
    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeNull();
  });

  it("rejects a mandate signed with the wrong signer's key", () => {
    const mandate = MandateSchema.parse(signMandate(unsignedMandate() as never, merchant));
    const verification = verifyMandate(mandate, human.publicKey);
    expect(verification.valid).toBe(false);
    expect(verification.signatureValid).toBe(false);
  });

  it("rejects a mandate whose terms changed after signing", () => {
    const mandate = MandateSchema.parse(signMandate(unsignedMandate() as never, human));
    const tampered = { ...mandate, maxTotal: 900_000 };
    expect(verifyMandate(tampered, human.publicKey).valid).toBe(false);
  });
});

describe("deal receipts", () => {
  it("dual-signs the same body and verifies both signatures", () => {
    const receipt = signDealReceipt(receiptBody(), {
      buyer: { agentId: "agt_buyer_01", key: buyer },
      merchant: { agentId: "agt_merchant_ridgeway", key: merchant },
    });

    expect(receipt.buyerSignature.agentId).toBe("agt_buyer_01");
    expect(receipt.merchantSignature.agentId).toBe("agt_merchant_ridgeway");
    expect(receipt.digest).toHaveLength(64);

    const verification = verifyDealReceipt(receipt, { buyer: buyer.publicKey, merchant: merchant.publicKey });
    expect(verification.valid).toBe(true);
    expect(verification.digestMatches).toBe(true);
    expect(verification.errors).toEqual([]);
  });

  it("detects a cart edited after signing", () => {
    const receipt = signDealReceipt(receiptBody(), {
      buyer: { agentId: "agt_buyer_01", key: buyer },
      merchant: { agentId: "agt_merchant_ridgeway", key: merchant },
    });
    const tampered = { ...receipt, paypalOrderId: "5O190127TN364700X" };

    const verification = verifyDealReceipt(tampered, { buyer: buyer.publicKey, merchant: merchant.publicKey });
    expect(verification.digestMatches).toBe(false);
    expect(verification.valid).toBe(false);
  });

  it("rejects a receipt verified against the wrong counterparty key", () => {
    const receipt = signDealReceipt(receiptBody(), {
      buyer: { agentId: "agt_buyer_01", key: buyer },
      merchant: { agentId: "agt_merchant_ridgeway", key: merchant },
    });
    const impostor = generateSigningKey("MERCHANT_AGENT");

    const verification = verifyDealReceipt(receipt, {
      buyer: buyer.publicKey,
      merchant: impostor.publicKey,
    });
    expect(verification.buyerSignatureValid).toBe(true);
    expect(verification.merchantSignatureValid).toBe(false);
    expect(verification.valid).toBe(false);
  });
});

describe("signed evidence entries", () => {
  it("signs an entry and detects a payload swap", () => {
    const entry = signEvidenceEntry(
      appendEvidence([], {
        signer: "agt_buyer_01",
        timestamp: "2026-03-01T00:00:00.000Z",
        type: "OFFER",
        payload: { totalMinor: 15_000 },
      }),
      buyer,
    );
    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(verifyEvidenceEntry(entry, buyer.publicKey)).toBe(true);

    const tampered = { ...entry, payload: { totalMinor: 9_000 } };
    expect(verifyEvidenceEntry(tampered, buyer.publicKey)).toBe(false);
  });
});
