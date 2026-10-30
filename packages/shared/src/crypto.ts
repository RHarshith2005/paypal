/**
 * Ed25519 signing for Handshake.
 *
 * Node-only on purpose: this module is published as `@handshake/shared/crypto`
 * and kept out of the package barrel so the browser bundle never imports
 * `node:crypto`. The web app only ever displays verification results that the
 * API produced.
 *
 * Every signature covers `canonicalJson(payload)` — the same byte string an
 * independent verifier reproduces from the JSON alone.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalJson, sha256Hex } from "./canonical";
import { entryDigest, type EvidenceEntry } from "./chain";
import {
  PublicKeySchema,
  type DealReceipt,
  type DealReceiptBody,
  type Mandate,
  type PublicKey,
  type Signature,
} from "./schemas";

/** The four parties that hold keys in the protocol. */
export const KEY_ROLES = ["HUMAN", "BUYER_AGENT", "MERCHANT_AGENT", "TRUST_ANCHOR"] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

const KEY_ID_PREFIX: Record<KeyRole, string> = {
  HUMAN: "key_prn",
  BUYER_AGENT: "key_agt_buyer",
  MERCHANT_AGENT: "key_agt_merchant",
  TRUST_ANCHOR: "key_anchor",
};

export interface SigningKey {
  role: KeyRole;
  keyId: string;
  publicKey: PublicKey;
  /** PKCS#8 PEM. DEMO ONLY — production keeps agent keys in a KMS or HSM. */
  privateKeyPem: string;
}

export function keyFingerprint(publicKey: PublicKey): string {
  return sha256Hex(canonicalJson(publicKey));
}

export function generateSigningKey(role: KeyRole, keyId?: string): SigningKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = PublicKeySchema.parse(publicKey.export({ format: "jwk" }));
  return {
    role,
    keyId: keyId ?? `${KEY_ID_PREFIX[role]}_${keyFingerprint(jwk).slice(0, 12)}`,
    publicKey: jwk,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/** One fresh keypair per role: human principal, buyer agent, merchant agent, trust anchor. */
export function generateRoleKeyring(): Record<KeyRole, SigningKey> {
  return {
    HUMAN: generateSigningKey("HUMAN"),
    BUYER_AGENT: generateSigningKey("BUYER_AGENT"),
    MERCHANT_AGENT: generateSigningKey("MERCHANT_AGENT"),
    TRUST_ANCHOR: generateSigningKey("TRUST_ANCHOR"),
  };
}

// ---------------------------------------------------------------------------
// Raw signature helpers
// ---------------------------------------------------------------------------

export function signCanonical(privateKeyPem: string, keyId: string, message: string): Signature {
  const raw = sign(null, Buffer.from(message, "utf8"), createPrivateKey(privateKeyPem));
  return { alg: "Ed25519", keyId, value: raw.toString("base64url") };
}

export function verifyCanonical(publicKey: PublicKey, message: string, signature: Signature): boolean {
  if (signature.alg !== "Ed25519") return false;
  try {
    const key = createPublicKey({ key: publicKey, format: "jwk" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature.value, "base64url"));
  } catch {
    // A malformed key or signature is a failed verification, never a crash.
    return false;
  }
}

export function signPayload(key: SigningKey, payload: unknown): Signature {
  return signCanonical(key.privateKeyPem, key.keyId, canonicalJson(payload));
}

export function verifyPayload(publicKey: PublicKey, payload: unknown, signature: Signature): boolean {
  return verifyCanonical(publicKey, canonicalJson(payload), signature);
}

// ---------------------------------------------------------------------------
// Mandates
// ---------------------------------------------------------------------------

export type UnsignedMandate = Omit<Mandate, "signature">;

export function mandateSigningMessage(mandate: UnsignedMandate): string {
  return canonicalJson(mandate);
}

export function signMandate(mandate: UnsignedMandate, issuerKey: SigningKey): Mandate {
  return {
    ...mandate,
    signature: signCanonical(issuerKey.privateKeyPem, issuerKey.keyId, mandateSigningMessage(mandate)),
  };
}

export interface MandateVerification {
  valid: boolean;
  signatureValid: boolean;
  /** The signature must be produced by the key the mandate names as its issuer key. */
  keyIdMatches: boolean;
  reason: string | null;
}

export function verifyMandate(mandate: Mandate, issuerPublicKey: PublicKey): MandateVerification {
  const keyIdMatches = mandate.signature.keyId === mandate.issuer.keyId;
  const { signature, ...body } = mandate;
  const signatureValid = verifyCanonical(issuerPublicKey, mandateSigningMessage(body), signature);
  const valid = keyIdMatches && signatureValid;
  return {
    valid,
    signatureValid,
    keyIdMatches,
    reason: valid
      ? null
      : keyIdMatches
        ? "signature does not verify under the issuer public key"
        : `signature keyId ${signature.keyId} is not the issuer keyId ${mandate.issuer.keyId}`,
  };
}

// ---------------------------------------------------------------------------
// Deal receipts
// ---------------------------------------------------------------------------

export const RECEIPT_PURPOSE = "handshake.receipt.v1";

const receiptSignatureMessage = (digest: string, agentId: string): string =>
  canonicalJson({ digest, agentId, purpose: RECEIPT_PURPOSE });

export function receiptDigest(body: DealReceiptBody): string {
  return sha256Hex(canonicalJson(body));
}

export interface ReceiptSigner {
  agentId: string;
  key: SigningKey;
}

export function signDealReceipt(
  body: DealReceiptBody,
  signers: { buyer: ReceiptSigner; merchant: ReceiptSigner },
): DealReceipt {
  const digest = receiptDigest(body);
  return {
    ...body,
    digest,
    buyerSignature: {
      agentId: signers.buyer.agentId,
      signature: signCanonical(
        signers.buyer.key.privateKeyPem,
        signers.buyer.key.keyId,
        receiptSignatureMessage(digest, signers.buyer.agentId),
      ),
    },
    merchantSignature: {
      agentId: signers.merchant.agentId,
      signature: signCanonical(
        signers.merchant.key.privateKeyPem,
        signers.merchant.key.keyId,
        receiptSignatureMessage(digest, signers.merchant.agentId),
      ),
    },
  };
}

export interface ReceiptVerification {
  valid: boolean;
  digestMatches: boolean;
  buyerSignatureValid: boolean;
  merchantSignatureValid: boolean;
  errors: string[];
}

export function verifyDealReceipt(
  receipt: DealReceipt,
  keys: { buyer: PublicKey; merchant: PublicKey },
): ReceiptVerification {
  const { digest, buyerSignature, merchantSignature, ...body } = receipt;
  const errors: string[] = [];

  const digestMatches = receiptDigest(body) === digest;
  if (!digestMatches) errors.push("receipt body no longer matches its digest");

  const buyerSignatureValid = verifyCanonical(
    keys.buyer,
    receiptSignatureMessage(digest, buyerSignature.agentId),
    buyerSignature.signature,
  );
  if (!buyerSignatureValid) errors.push("buyer signature does not verify under the buyer agent key");

  const merchantSignatureValid = verifyCanonical(
    keys.merchant,
    receiptSignatureMessage(digest, merchantSignature.agentId),
    merchantSignature.signature,
  );
  if (!merchantSignatureValid) errors.push("merchant signature does not verify under the merchant agent key");

  return {
    valid: digestMatches && buyerSignatureValid && merchantSignatureValid,
    digestMatches,
    buyerSignatureValid,
    merchantSignatureValid,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Evidence chain entries
// ---------------------------------------------------------------------------

export function evidenceSigningMessage(
  entry: Pick<EvidenceEntry, "seq" | "prevHash" | "payloadHash" | "signer" | "timestamp" | "type">,
): string {
  const { seq, prevHash, payloadHash, signer, timestamp, type } = entry;
  return canonicalJson({ seq, prevHash, payloadHash, signer, timestamp, type });
}

export function signEvidenceEntry(entry: EvidenceEntry, key: SigningKey): EvidenceEntry {
  return {
    ...entry,
    signature: signCanonical(key.privateKeyPem, key.keyId, evidenceSigningMessage(entry)),
  };
}

/**
 * An entry verifies only when its stored digest still matches its content AND the
 * signature over that digest checks out under the expected key. A signature on a
 * digest that no longer describes the entry proves nothing.
 */
export function verifyEvidenceEntry(entry: EvidenceEntry, publicKey: PublicKey): boolean {
  if (!entry.signature) return false;
  if (entryDigest(entry) !== entry.payloadHash) return false;
  return verifyCanonical(publicKey, evidenceSigningMessage(entry), entry.signature);
}
