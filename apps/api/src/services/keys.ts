import { generateSigningKey, signMandate, type SigningKey } from "@handshake/shared/crypto";
import type { Mandate } from "@handshake/shared";
import type { Db } from "../db/queries";
import { getAgentRow, loadPrincipalKeyRow, savePrincipalKeyRow, upsertAgent } from "../db/writes";

/** Demo identities. Keys are generated once and persisted so restart verifies old signatures. */
export const DEMO_PRINCIPAL_ID = "prn_dana";
export const DEMO_BUYER_AGENT_ID = "agt_buyer_demo";
export const DEMO_MERCHANT_AGENT_ID = "agt_merchant_ridgeway";

export interface DemoKeys {
  principal: SigningKey;
  buyer: SigningKey;
  merchant: SigningKey;
}

async function ensureAgentKey(
  db: Db,
  input: {
    agentId: string;
    kind: "BUYER_AGENT" | "MERCHANT_AGENT" | "ARBITER";
    displayName: string;
    role: SigningKey["role"];
    keyId: string;
  },
): Promise<SigningKey> {
  const existing = await getAgentRow(db, input.agentId);
  if (existing) {
    return {
      role: input.role,
      keyId: existing.keyId,
      publicKey: existing.publicKey,
      privateKeyPem: existing.privateKeyPkcs8,
    };
  }
  const generated = generateSigningKey(input.role, input.keyId);
  await upsertAgent(db, {
    agentId: input.agentId,
    kind: input.kind,
    displayName: input.displayName,
    keyId: generated.keyId,
    publicKey: generated.publicKey,
    privateKeyPem: generated.privateKeyPem,
  });
  return generated;
}

/** Loads or creates the three demo signing keys. */
export async function ensureDemoKeys(db: Db): Promise<DemoKeys> {
  const buyer = await ensureAgentKey(db, {
    agentId: DEMO_BUYER_AGENT_ID,
    kind: "BUYER_AGENT",
    displayName: "Procurement agent · Dana Ruiz",
    role: "BUYER_AGENT",
    keyId: "key_agt_buyer_demo",
  });
  const merchant = await ensureAgentKey(db, {
    agentId: DEMO_MERCHANT_AGENT_ID,
    kind: "MERCHANT_AGENT",
    displayName: "Ridgeway Industrial Supply",
    role: "MERCHANT_AGENT",
    keyId: "key_agt_merchant_ridgeway",
  });

  const existingPrincipal = await loadPrincipalKeyRow(db);
  let principal: SigningKey;
  if (existingPrincipal) {
    principal = {
      role: "HUMAN",
      keyId: existingPrincipal.keyId,
      publicKey: existingPrincipal.publicKey,
      privateKeyPem: existingPrincipal.privateKeyPkcs8,
    };
  } else {
    principal = generateSigningKey("HUMAN", "key_prn_dana");
    await savePrincipalKeyRow(db, {
      keyId: principal.keyId,
      principalId: DEMO_PRINCIPAL_ID,
      publicKey: principal.publicKey,
      privateKeyPem: principal.privateKeyPem,
    });
  }

  return { principal, buyer, merchant };
}

export interface MandateDraft {
  id: string;
  maxTotal: number;
  perItemMax: number;
  maxTransactions: number;
  allowedCategories: string[];
  forbiddenSubstitutions: string[];
  merchantAllowlist: string[] | null;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

/** Signs a mandate with the demo human principal's key. */
export function signDemoMandate(draft: MandateDraft, principal: SigningKey): Mandate {
  return signMandate(
    {
      id: draft.id,
      version: "handshake.mandate.v1",
      issuer: {
        id: DEMO_PRINCIPAL_ID,
        displayName: "Dana Ruiz",
        keyId: principal.keyId,
        identityLabel: "SIMULATED",
      },
      agentId: DEMO_BUYER_AGENT_ID,
      currency: "USD",
      maxTotal: draft.maxTotal,
      perItemMax: draft.perItemMax,
      allowedCategories: draft.allowedCategories,
      forbiddenSubstitutions: draft.forbiddenSubstitutions,
      merchantAllowlist: draft.merchantAllowlist,
      maxTransactions: draft.maxTransactions,
      issuedAt: draft.issuedAt,
      expiresAt: draft.expiresAt,
      nonce: draft.nonce,
    },
    principal,
  );
}
