import { canonicalJson, sha256Hex } from "./canonical";
import type { AgentAttestation, CatalogProduct, Mandate, PublicKey, Signature } from "./schemas";

/**
 * SIMULATED trust anchor. These constants travel inside every attestation so a
 * verifier can see, without trusting the UI, that the identity claim came from
 * the local demo anchor and not from PayPal identity or an agentic-token issuer.
 */
export const ATTESTATION_PROVIDER = "SIMULATED_TRUST_ANCHOR" as const;
export const ATTESTATION_LABEL = "SIMULATED" as const;
/** How long an issued attestation stays valid in the demo. */
export const ATTESTATION_TTL_MS = 10 * 60 * 1000;

/** SHA-256 of the canonical mandate body (signature excluded; it already commits to the body). */
export function mandateHash(mandate: Mandate): string {
  const { signature: _signature, ...body } = mandate;
  return sha256Hex(canonicalJson(body));
}

/**
 * SHA-256 of the merchant's catalog, price and stock included. Stock changes the
 * hash, which is the point: the merchant attested to *this* inventory snapshot,
 * and the handshake refuses an attestation for a different one.
 */
export function catalogHash(products: readonly CatalogProduct[]): string {
  const entries = products
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      listPriceMinor: product.listPriceMinor,
      unitCostMinor: product.unitCostMinor,
      stock: product.stock,
      merchantAgentId: product.merchantAgentId,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  return sha256Hex(canonicalJson(entries));
}

export function unsignedAttestation<T extends { signature: Signature }>(attestation: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = attestation;
  return body;
}

export function attestationSigningMessage(attestation: AgentAttestation): string {
  return canonicalJson(unsignedAttestation(attestation));
}

/**
 * Injected rather than imported so this module stays browser-safe. The API
 * passes `verifyPayload` from `@handshake/shared/crypto`, which owns the only
 * code path allowed to touch Ed25519 private or public keys.
 */
export type PayloadVerifier = (publicKey: PublicKey, payload: unknown, signature: Signature) => boolean;

export function verifyAttestation(
  attestation: AgentAttestation,
  anchorPublicKey: PublicKey,
  verify: PayloadVerifier,
): boolean {
  // The signature must claim the key the attestation names as its issuer.
  if (attestation.signature.keyId !== attestation.anchorKeyId) return false;
  return verify(anchorPublicKey, unsignedAttestation(attestation), attestation.signature);
}

export function attestationExpired(attestation: AgentAttestation, now: Date): boolean {
  return now.getTime() >= Date.parse(attestation.validUntil);
}

export function attestationNotYetValid(attestation: AgentAttestation, now: Date): boolean {
  return now.getTime() < Date.parse(attestation.issuedAt);
}

export function attestationValidityMs(attestation: AgentAttestation): number {
  return Date.parse(attestation.validUntil) - Date.parse(attestation.issuedAt);
}

export const isSimulatedAttestation = (attestation: AgentAttestation): boolean =>
  attestation.provider === ATTESTATION_PROVIDER && attestation.label === ATTESTATION_LABEL;
