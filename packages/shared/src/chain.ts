import { canonicalJson, sha256Hex } from "./canonical";
import type { Signature } from "./schemas";

export const GENESIS_HASH = "GENESIS";

/**
 * One entry in the append-only evidence ledger. `payloadHash` is the digest of
 * the entry itself, including its `prevHash`, so an edit anywhere in the chain
 * — including reordering or deleting entries — changes a hash that a verifier
 * recomputes. `signature` is optional at this layer: the API signs entries with
 * the acting party's Ed25519 key (see `@handshake/shared/crypto`).
 */
export interface EvidenceEntry {
  readonly seq: number;
  readonly prevHash: string;
  readonly payloadHash: string;
  readonly signer: string;
  readonly timestamp: string;
  readonly type: string;
  readonly payload: unknown;
  readonly signature: Signature | null;
}

export interface EvidenceInput {
  signer: string;
  timestamp: string;
  type: string;
  payload: unknown;
  signature?: Signature | null;
}

export type EvidenceFields = Pick<EvidenceEntry, "seq" | "prevHash" | "signer" | "timestamp" | "type" | "payload">;

export function entryDigest(input: EvidenceFields): string {
  const { seq, prevHash, signer, timestamp, type, payload } = input;
  return sha256Hex(canonicalJson({ seq, prevHash, signer, timestamp, type, payload }));
}

export function appendEvidence(chain: readonly EvidenceEntry[], input: EvidenceInput): EvidenceEntry {
  const prev = chain.at(-1);
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.payloadHash : GENESIS_HASH;
  const fields: EvidenceFields = {
    seq,
    prevHash,
    signer: input.signer,
    timestamp: input.timestamp,
    type: input.type,
    payload: input.payload,
  };
  return { ...fields, payloadHash: entryDigest(fields), signature: input.signature ?? null };
}

export function appendEvidenceBatch(
  chain: readonly EvidenceEntry[],
  inputs: readonly EvidenceInput[],
): EvidenceEntry[] {
  const appended: EvidenceEntry[] = [];
  for (const input of inputs) {
    const next = appendEvidence([...chain, ...appended], input);
    appended.push(next);
  }
  return appended;
}

export interface ChainVerification {
  readonly valid: boolean;
  /** Index of the first entry that failed, or null when the chain is intact. */
  readonly brokenAt: number | null;
  readonly reason: string | null;
  /** Digest of the final entry — the root committed to by the deal receipt. */
  readonly root: string;
}

export interface VerifyChainOptions {
  /** Optional signature check per entry; a false result breaks the chain at that index. */
  verifyEntry?: (entry: EvidenceEntry) => boolean;
}

export function verifyChain(chain: readonly EvidenceEntry[], options: VerifyChainOptions = {}): ChainVerification {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i]!;
    if (entry.seq !== i) {
      return { valid: false, brokenAt: i, reason: `sequence gap at index ${i}`, root: prevHash };
    }
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: i, reason: `prevHash mismatch at index ${i}`, root: prevHash };
    }
    if (entryDigest(entry) !== entry.payloadHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `payloadHash mismatch at index ${i} — content was modified`,
        root: prevHash,
      };
    }
    if (options.verifyEntry && !options.verifyEntry(entry)) {
      return { valid: false, brokenAt: i, reason: `signature invalid at index ${i}`, root: prevHash };
    }
    prevHash = entry.payloadHash;
  }
  return { valid: true, brokenAt: null, reason: null, root: prevHash };
}

export function chainRoot(chain: readonly EvidenceEntry[]): string {
  return chain.at(-1)?.payloadHash ?? GENESIS_HASH;
}
