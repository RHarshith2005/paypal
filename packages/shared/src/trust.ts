import type { TrustEvent, TrustEventType } from "./schemas";

export const TRUST_BASE = 50;
export const TRUST_POSITIVE_CAP = 25;
export const TRUST_NEGATIVE_CAP = 40;

/** Deterministic, auditable contribution of each event type. */
export const TRUST_EVENT_DELTA: Record<TrustEventType, number> = {
  DEAL_SETTLED: 3,
  RECEIPT_SIGNED: 1,
  DISPUTE_LOST: -8,
  DISPUTE_WON: 2,
  INJECTION_BLOCKED: -4,
  INVALID_SIGNATURE: -15,
  PAYMENT_FAILED: -6,
};

export interface TrustBreakdown {
  score: number;
  grade: "HIGH" | "MEDIUM" | "LOW";
  positive: number;
  negative: number;
  counts: Array<{ type: TrustEventType; count: number; delta: number }>;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function computeTrust(events: readonly Pick<TrustEvent, "type">[]): TrustBreakdown {
  const counts = new Map<TrustEventType, number>();
  let positive = 0;
  let negative = 0;

  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    const delta = TRUST_EVENT_DELTA[event.type];
    if (delta > 0) positive += delta;
    else negative += delta;
  }

  const positiveCapped = Math.min(positive, TRUST_POSITIVE_CAP);
  const negativeCapped = Math.max(negative, -TRUST_NEGATIVE_CAP);
  const score = clamp(Math.round(TRUST_BASE + positiveCapped + negativeCapped), 0, 100);

  return {
    score,
    grade: score >= 70 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW",
    positive: positiveCapped,
    negative: negativeCapped,
    counts: [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => ({ type, count, delta: TRUST_EVENT_DELTA[type] * count })),
  };
}
