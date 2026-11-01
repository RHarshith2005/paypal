import {
  attestationExpired,
  attestationNotYetValid,
  mandateHash as computeMandateHash,
  verifyAttestation,
  type PayloadVerifier,
} from "./attestation";
import { canonicalJson, sha256Hex } from "./canonical";
import { HandshakeResultSchema } from "./schemas";
import type {
  BuyerAttestation,
  HandshakeCheck,
  HandshakeResult,
  Mandate,
  MerchantAttestation,
  PublicKey,
} from "./schemas";

/** A party on one side of the handshake: who it claims to be, and what the anchor said about it. */
export interface HandshakeParty<A> {
  agentId: string;
  keyId: string;
  publicKey: PublicKey;
  attestation: A;
}

export interface HandshakeInput {
  dealId: string;
  mandate: Mandate;
  buyer: HandshakeParty<BuyerAttestation>;
  merchant: HandshakeParty<MerchantAttestation>;
  anchorPublicKey: PublicKey;
  /** Fresh nonce the merchant issued for this deal. */
  challengeNonce: string;
  /** The buyer's echo of the merchant challenge, plus its own freshness. */
  responseNonce: string;
  /** Hash the merchant's catalog must still match. */
  expectedCatalogHash: string;
  now: Date;
  /** An inventory attestation older than this is stale and fails the handshake. */
  maxInventoryAgeMs: number;
  revokedMerchantIds: readonly string[];
  /** Nonces this deployment has already seen; a repeat is a replay attempt. */
  usedNonces: readonly string[];
}

/** Fresh 128-bit nonce, hex encoded. Browser- and Node-safe. */
export function randomNonce(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const MIN_NONCE_LENGTH = 16;

/**
 * Deterministic handshake evaluation. Every check is recorded, passing or not, so
 * the evidence packet can show what was verified rather than asserting success.
 *
 * Signature checks are delegated to `verify` (Ed25519 over canonical JSON) so
 * this module has no node:crypto dependency and can run in the browser or in a
 * worker. The result is the same object the ledger stores.
 */
export function evaluateHandshake(input: HandshakeInput, verify: PayloadVerifier): HandshakeResult {
  const { mandate, buyer, merchant, now } = input;
  const checks: HandshakeCheck[] = [];
  const add = (code: string, name: string, passed: boolean, detail: string): void => {
    checks.push({ code, name, passed, detail });
  };

  const buyerSignature = verifyAttestation(buyer.attestation, input.anchorPublicKey, verify);
  add(
    "A-BUYER-SIG-01",
    "Buyer attestation signature verifies under the trust anchor key",
    buyerSignature,
    buyerSignature ? `signed by ${buyer.attestation.anchorKeyId}` : "signature does not verify",
  );

  const merchantSignature = verifyAttestation(merchant.attestation, input.anchorPublicKey, verify);
  add(
    "A-MERCHANT-SIG-02",
    "Merchant attestation signature verifies under the trust anchor key",
    merchantSignature,
    merchantSignature ? `signed by ${merchant.attestation.anchorKeyId}` : "signature does not verify",
  );

  const buyerBound =
    buyer.attestation.subjectAgentId === buyer.agentId && buyer.attestation.subjectKeyId === buyer.keyId;
  add(
    "A-BUYER-BINDING-03",
    "Buyer attestation names this agent and this key",
    buyerBound,
    buyerBound
      ? `${buyer.agentId} / ${buyer.keyId}`
      : `attested ${buyer.attestation.subjectAgentId} / ${buyer.attestation.subjectKeyId}`,
  );

  const merchantBound =
    merchant.attestation.subjectAgentId === merchant.agentId && merchant.attestation.subjectKeyId === merchant.keyId;
  add(
    "A-MERCHANT-BINDING-04",
    "Merchant attestation names this agent and this key",
    merchantBound,
    merchantBound
      ? `${merchant.agentId} / ${merchant.keyId}`
      : `attested ${merchant.attestation.subjectAgentId} / ${merchant.attestation.subjectKeyId}`,
  );

  const buyerCurrent = !attestationExpired(buyer.attestation, now) && !attestationNotYetValid(buyer.attestation, now);
  add(
    "A-BUYER-VALID-05",
    "Buyer attestation is inside its validity window",
    buyerCurrent,
    `valid until ${buyer.attestation.validUntil}`,
  );

  const merchantCurrent =
    !attestationExpired(merchant.attestation, now) && !attestationNotYetValid(merchant.attestation, now);
  add(
    "A-MERCHANT-VALID-06",
    "Merchant attestation is inside its validity window",
    merchantCurrent,
    `valid until ${merchant.attestation.validUntil}`,
  );

  const computedMandateHash = computeMandateHash(mandate);
  const mandateBound =
    buyer.attestation.mandateHash === computedMandateHash &&
    buyer.attestation.mandateId === mandate.id &&
    mandate.agentId === buyer.agentId;
  add(
    "A-MANDATE-HASH-07",
    "Buyer attestation is bound to this exact mandate",
    mandateBound,
    mandateBound
      ? `${mandate.id} @ ${computedMandateHash.slice(0, 16)}`
      : `attested ${buyer.attestation.mandateId} @ ${buyer.attestation.mandateHash.slice(0, 16)}, expected ${mandate.id} @ ${computedMandateHash.slice(0, 16)}`,
  );

  const catalogBound = merchant.attestation.catalogHash === input.expectedCatalogHash;
  add(
    "A-CATALOG-HASH-08",
    "Merchant attestation is bound to the current catalog",
    catalogBound,
    catalogBound
      ? input.expectedCatalogHash.slice(0, 16)
      : `attested ${merchant.attestation.catalogHash.slice(0, 16)}, catalogue now ${input.expectedCatalogHash.slice(0, 16)}`,
  );

  const revoked = input.revokedMerchantIds.includes(merchant.agentId);
  add(
    "A-REVOKED-09",
    "Merchant is not on the trust anchor revocation list",
    !revoked,
    revoked ? `${merchant.agentId} was revoked` : "not revoked",
  );

  const challengeFresh =
    input.challengeNonce.length >= MIN_NONCE_LENGTH && input.responseNonce.length >= MIN_NONCE_LENGTH;
  const replayed = [input.challengeNonce, input.responseNonce].filter((nonce) => input.usedNonces.includes(nonce));
  add(
    "A-NONCE-REPLAY-10",
    "Neither handshake nonce has been used before",
    replayed.length === 0,
    replayed.length === 0 ? "both nonces are fresh" : `replayed: ${replayed.join(", ")}`,
  );

  const echoes = input.responseNonce !== input.challengeNonce;
  add(
    "A-CHALLENGE-11",
    "Response echoes a separate challenge nonce",
    echoes && challengeFresh,
    echoes
      ? `challenge ${input.challengeNonce.slice(0, 12)} answered by ${input.responseNonce.slice(0, 12)}`
      : "response reuses the challenge value",
  );

  const principal = buyer.attestation.principalVerified;
  add(
    "A-PRINCIPAL-12",
    "A human principal is verified behind this buyer agent",
    principal,
    principal ? "principal verified (SIMULATED)" : "principal not verified",
  );

  const funding = buyer.attestation.fundingVerified;
  add(
    "A-FUNDING-13",
    "Buyer funding source is verified",
    funding,
    funding ? "funding verified (SIMULATED)" : "funding not verified",
  );

  add(
    "A-MERCHANT-VERIFIED-14",
    "Merchant identity is verified",
    merchant.attestation.merchantVerified,
    merchant.attestation.merchantVerified ? "merchant verified (SIMULATED)" : "merchant not verified",
  );

  const inventoryAgeMs = now.getTime() - Date.parse(merchant.attestation.inventoryCheckedAt);
  const inventoryFresh = inventoryAgeMs >= 0 && inventoryAgeMs <= input.maxInventoryAgeMs;
  add(
    "A-INVENTORY-15",
    "Attested inventory snapshot is fresh",
    inventoryFresh,
    `checked ${inventoryAgeMs} ms ago, limit ${input.maxInventoryAgeMs} ms`,
  );

  const reasons = checks.filter((check) => !check.passed).map((check) => check.code);
  const sessionId = sha256Hex(
    canonicalJson({
      dealId: input.dealId,
      challengeNonce: input.challengeNonce,
      responseNonce: input.responseNonce,
      mandateHash: computedMandateHash,
      catalogHash: input.expectedCatalogHash,
    }),
  ).slice(0, 32);

  return HandshakeResultSchema.parse({
    ok: reasons.length === 0,
    sessionId,
    challengeNonce: input.challengeNonce,
    responseNonce: input.responseNonce,
    buyerAttestationId: buyer.attestation.attestationId,
    merchantAttestationId: merchant.attestation.attestationId,
    mandateHash: computedMandateHash,
    catalogHash: input.expectedCatalogHash,
    checks,
    reasons,
    attestationsSimulated: true,
    at: now.toISOString(),
  });
}

/** Human-readable report used in logs and in the evidence packet. */
export function describeHandshake(result: HandshakeResult): string[] {
  return result.checks.filter((check) => !check.passed).map((check) => `${check.code}: ${check.detail}`);
}
