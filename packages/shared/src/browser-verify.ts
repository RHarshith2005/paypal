/**
 * Verification that runs in the browser.
 *
 * Only SHA-256 over canonical JSON is needed to re-derive the hash chain, and
 * `@noble/hashes` provides it without `node:crypto`. Signature verification still
 * needs Ed25519, so this module deliberately does not claim to check signatures:
 * it returns the expected signature message for display and says so in the UI.
 */
import { canonicalJson, sha256Hex } from "./canonical";
import { verifyChain, type ChainVerification, type EvidenceEntry } from "./chain";
import type { DealReceipt } from "./schemas";

export interface ReceiptAudit {
  chain: ChainVerification;
  digestMatches: boolean;
  buyerSignatureMessage: string;
  merchantSignatureMessage: string;
  /** Chain and digest agree; signatures are checked by the API, not here. */
  ok: boolean;
}

export function receiptBodyDigest(receipt: DealReceipt): string {
  const { digest: _digest, buyerSignature: _buyer, merchantSignature: _merchant, ...body } = receipt;
  return sha256Hex(canonicalJson(body));
}

/**
 * Recomputes every hash in the transcript and re-derives the receipt digest from
 * its body. A flipped byte is reported with the exact index that broke.
 */
export function auditDealEvidence(receipt: DealReceipt, transcript: readonly EvidenceEntry[]): ReceiptAudit {
  const chain = verifyChain(transcript);
  const digestMatches = receiptBodyDigest(receipt) === receipt.digest;
  return {
    chain,
    digestMatches,
    buyerSignatureMessage: canonicalJson({
      digest: receipt.digest,
      agentId: receipt.buyerSignature.agentId,
      purpose: "handshake.receipt.v1",
    }),
    merchantSignatureMessage: canonicalJson({
      digest: receipt.digest,
      agentId: receipt.merchantSignature.agentId,
      purpose: "handshake.receipt.v1",
    }),
    ok: chain.valid && digestMatches,
  };
}

/**
 * Flips one character of a payload, the way a curious auditor would, and reports
 * which entry no longer verifies. Used by the ledger's tamper control — it never
 * mutates stored evidence.
 */
export function tamperedTranscript(transcript: readonly EvidenceEntry[], index: number): EvidenceEntry[] {
  return transcript.map((entry, position) => {
    if (position !== index) return entry;
    const serialised = canonicalJson(entry.payload);
    const flipped = serialised.length > 0 ? `${serialised.slice(0, -1)}${serialised.endsWith("}") ? "x}" : "x"}` : '"x"';
    let payload: unknown = flipped;
    try {
      payload = JSON.parse(flipped);
    } catch {
      // A payload that is no longer valid JSON still breaks the hash — that is the point.
    }
    return { ...entry, payload };
  });
}
