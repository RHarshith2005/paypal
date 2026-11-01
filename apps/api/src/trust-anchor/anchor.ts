import {
  ATTESTATION_TTL_MS,
  randomNonce,
  type AgentAttestation,
  type BuyerAttestation,
  type BuyerAttestationBody,
  type Mandate,
  type MerchantAttestation,
  type MerchantAttestationBody,
} from "@handshake/shared";
import { mandateHash } from "@handshake/shared";
import { canonicalJson } from "@handshake/shared";
import { generateSigningKey, signCanonical, verifyPayload, type SigningKey } from "@handshake/shared/crypto";
import { BuyerAttestationBodySchema } from "@handshake/shared";
import { BuyerAttestationSchema, MerchantAttestationBodySchema, MerchantAttestationSchema } from "@handshake/shared";
import type { Db } from "../db/queries";
import { loadAnchorKeyRow, saveAnchorKeyRow } from "../db/writes";
import { newId } from "../lib/ids";

/**
 * SIMULATED trust anchor.
 *
 * It stands in for PayPal identity or an agentic-token issuer: it holds one
 * Ed25519 key, issues short-lived attestations bound to a mandate or a catalog,
 * and keeps a revocation list. Nothing here verifies anything about the real
 * world, and every attestation it produces says `provider: SIMULATED_TRUST_ANCHOR`
 * and `label: SIMULATED`.
 */
export class SimulatedTrustAnchor {
  readonly simulated = true;
  private readonly revoked = new Set<string>();

  constructor(
    private readonly key: SigningKey,
    private readonly now: () => Date,
  ) {}

  /** Reuses the persisted anchor key so attestations survive a restart. */
  static async load(db: Db, now: () => Date): Promise<SimulatedTrustAnchor> {
    const existing = await loadAnchorKeyRow(db);
    if (existing) {
      return new SimulatedTrustAnchor(
        {
          role: "TRUST_ANCHOR",
          keyId: existing.keyId,
          publicKey: existing.publicKey,
          privateKeyPem: existing.privateKeyPkcs8,
        },
        now,
      );
    }
    const generated = generateSigningKey("TRUST_ANCHOR", `key_anchor_${randomNonce(6)}`);
    await saveAnchorKeyRow(db, {
      keyId: generated.keyId,
      publicKey: generated.publicKey,
      privateKeyPem: generated.privateKeyPem,
    });
    return new SimulatedTrustAnchor(generated, now);
  }

  get keyId(): string {
    return this.key.keyId;
  }

  get publicKey() {
    return this.key.publicKey;
  }

  issueBuyerAttestation(input: {
    agentId: string;
    keyId: string;
    mandate: Mandate;
    principalVerified?: boolean;
    fundingVerified?: boolean;
    ttlMs?: number;
  }): BuyerAttestation {
    const issuedAt = this.now();
    const body: BuyerAttestationBody = BuyerAttestationBodySchema.parse({
      version: "handshake.attestation.v1",
      provider: "SIMULATED_TRUST_ANCHOR",
      label: "SIMULATED",
      attestationId: newId("att_"),
      kind: "BUYER",
      subjectAgentId: input.agentId,
      subjectKeyId: input.keyId,
      anchorKeyId: this.key.keyId,
      issuedAt: issuedAt.toISOString(),
      validUntil: new Date(issuedAt.getTime() + (input.ttlMs ?? ATTESTATION_TTL_MS)).toISOString(),
      principalVerified: input.principalVerified ?? true,
      fundingVerified: input.fundingVerified ?? true,
      mandateId: input.mandate.id,
      mandateHash: mandateHash(input.mandate),
    });
    return BuyerAttestationSchema.parse({
      ...body,
      signature: signCanonical(this.key.privateKeyPem, this.key.keyId, canonicalJson(body)),
    });
  }

  issueMerchantAttestation(input: {
    agentId: string;
    keyId: string;
    catalogId: string;
    catalogHash: string;
    inventoryCheckedAt: string;
    merchantVerified?: boolean;
    ttlMs?: number;
  }): MerchantAttestation {
    const issuedAt = this.now();
    const body: MerchantAttestationBody = MerchantAttestationBodySchema.parse({
      version: "handshake.attestation.v1",
      provider: "SIMULATED_TRUST_ANCHOR",
      label: "SIMULATED",
      attestationId: newId("att_"),
      kind: "MERCHANT",
      subjectAgentId: input.agentId,
      subjectKeyId: input.keyId,
      anchorKeyId: this.key.keyId,
      issuedAt: issuedAt.toISOString(),
      validUntil: new Date(issuedAt.getTime() + (input.ttlMs ?? ATTESTATION_TTL_MS)).toISOString(),
      merchantVerified: input.merchantVerified ?? true,
      catalogId: input.catalogId,
      catalogHash: input.catalogHash,
      inventoryCheckedAt: input.inventoryCheckedAt,
    });
    return MerchantAttestationSchema.parse({
      ...body,
      signature: signCanonical(this.key.privateKeyPem, this.key.keyId, canonicalJson(body)),
    });
  }

  verify(attestation: AgentAttestation): boolean {
    return verifyPayload(this.key.publicKey, unsigned(attestation), attestation.signature);
  }

  revoke(agentId: string): void {
    this.revoked.add(agentId);
  }

  isRevoked(agentId: string): boolean {
    return this.revoked.has(agentId);
  }

  revocationList(): string[] {
    return [...this.revoked].sort();
  }
}

function unsigned<T extends { signature: unknown }>(attestation: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = attestation;
  return body;
}
