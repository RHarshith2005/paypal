/**
 * Nonce replay defence. A mandate nonce, a handshake nonce and a PayPal request
 * id may each be used exactly once; deterministic code enforces that, never a
 * prompt. The API persists the same rule with a unique index on
 * `mandates.nonce`.
 */

export class NonceReplayError extends Error {
  readonly code = "NONCE_REPLAY";

  constructor(
    readonly nonce: string,
    readonly firstSeenAt: string,
    readonly scope: string,
  ) {
    super(`nonce ${nonce} was already used for ${scope} at ${firstSeenAt}`);
    this.name = "NonceReplayError";
  }
}

export interface NonceClaim {
  nonce: string;
  scope: string;
  usedAt: string;
}

export type NonceClaimResult =
  { ok: true; claim: NonceClaim } | { ok: false; reason: "NONCE_REPLAY"; firstSeenAt: string; scope: string };

export class NonceRegistry {
  private readonly seen = new Map<string, NonceClaim>();

  claim(nonce: string, options: { scope?: string; at?: Date } = {}): NonceClaimResult {
    const scope = options.scope ?? "mandate";
    const usedAt = (options.at ?? new Date()).toISOString();
    const existing = this.seen.get(nonce);
    if (existing) {
      return { ok: false, reason: "NONCE_REPLAY", firstSeenAt: existing.usedAt, scope: existing.scope };
    }
    const claim: NonceClaim = { nonce, scope, usedAt };
    this.seen.set(nonce, claim);
    return { ok: true, claim };
  }

  /** Claim or throw — the form used inside the deal pipeline. */
  use(nonce: string, options: { scope?: string; at?: Date } = {}): NonceClaim {
    const result = this.claim(nonce, options);
    if (!result.ok) throw new NonceReplayError(nonce, result.firstSeenAt, result.scope);
    return result.claim;
  }

  has(nonce: string): boolean {
    return this.seen.has(nonce);
  }

  get size(): number {
    return this.seen.size;
  }

  snapshot(): NonceClaim[] {
    return [...this.seen.values()].sort((a, b) => a.nonce.localeCompare(b.nonce));
  }
}

export function assertNonceUnused(nonce: string, used: Iterable<string>): void {
  for (const candidate of used) {
    if (candidate === nonce) throw new NonceReplayError(nonce, "unknown", "mandate");
  }
}
