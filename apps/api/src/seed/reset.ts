import { sql } from "drizzle-orm";
import { deals, disputes, ledgerEntries } from "../db/schema";
import { seedDemo, type DemoCaseRun, type SeedDeps } from "./demo";

export interface ResetResult {
  cleared: { deals: number; disputes: number; ledgerEntries: number };
  seeded: DemoCaseRun[];
}

/**
 * Wipes generated deals and reseeds both demo cases.
 *
 * Agent keys, the trust anchor key and the principal key are preserved, so the
 * attestations issued after a reset still verify against the anchor that signs
 * them. Only generated evidence is removed.
 */
export async function resetDemoData(deps: SeedDeps): Promise<ResetResult> {
  const [dealCount] = await deps.db.select({ count: sql<number>`count(*)::int` }).from(deals);
  const [disputeCount] = await deps.db.select({ count: sql<number>`count(*)::int` }).from(disputes);
  const [ledgerCount] = await deps.db.select({ count: sql<number>`count(*)::int` }).from(ledgerEntries);

  await deps.db.execute(
    sql.raw(
      "truncate table deals, messages, receipts, ledger_entries, disputes, deal_events, evidence_packets, attestations, consumed_nonces, trust_scores, mandates restart identity cascade",
    ),
  );

  const seeded = await seedDemo(deps);

  return {
    cleared: {
      deals: Number(dealCount?.count ?? 0),
      disputes: Number(disputeCount?.count ?? 0),
      ledgerEntries: Number(ledgerCount?.count ?? 0),
    },
    seeded: seeded.cases,
  };
}
