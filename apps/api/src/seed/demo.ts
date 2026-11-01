import { getDeal, listMandates, type Db } from "../db/queries";
import { insertMandate } from "../db/writes";
import type { DisputeArbiter } from "../arbiter/service";
import type { DealOrchestrator } from "../deals/orchestrator";
import type { DemoCase } from "@handshake/shared";
import { HttpError } from "../http/errors";
import { DEMO_MERCHANT_AGENT_ID, ensureDemoKeys, signDemoMandate } from "../services/keys";

export const CASE_A_MANDATE_ID = "mnd_case_a";
export const CASE_B_MANDATE_ID = "mnd_case_b";

export interface DemoCaseRun {
  caseLabel: DemoCase;
  dealId: string;
  disputeId: string;
  label: string;
}

export interface SeedDeps {
  db: Db;
  orchestrator: DealOrchestrator;
  arbiter: DisputeArbiter;
  now: () => Date;
}

const CASES: Record<
  DemoCase,
  {
    label: string;
    mandateId: string;
    misconfiguredAgent: boolean;
    hostileMerchant: boolean;
    claimType: "GOODS_NOT_RECEIVED" | "MANDATE_BREACH";
    claim: string;
  }
> = {
  A: {
    label: "Case A — valid purchase, goods-not-received claim defeated by delivery proof",
    mandateId: CASE_A_MANDATE_ID,
    misconfiguredAgent: false,
    hostileMerchant: false,
    claimType: "GOODS_NOT_RECEIVED",
    claim:
      "The nitrile gloves and the N95 masks never arrived at our loading dock, and the tracking page shows no scan.",
  },
  B: {
    label: "Case B — misconfigured agent exceeded its signed mandate",
    mandateId: CASE_B_MANDATE_ID,
    misconfiguredAgent: true,
    hostileMerchant: true,
    claimType: "MANDATE_BREACH",
    claim:
      "My agent approved a cart above the 20.00 USD lifetime cap in the mandate I signed. The guard was bypassed by a misconfiguration.",
  },
};

/**
 * Runs one demo case end to end: deal pipeline, then the dispute that exposes it.
 * Both the boot seed and the one-click demo buttons call this, so the recorded
 * demo and the seeded data cannot drift apart.
 */
export async function runDemoCase(deps: SeedDeps, caseLabel: DemoCase): Promise<DemoCaseRun> {
  const config = CASES[caseLabel];

  const dealId = await deps.orchestrator.create({
    mandateId: config.mandateId,
    merchantAgentId: DEMO_MERCHANT_AGENT_ID,
    hostileMerchant: config.hostileMerchant,
    fulfillment: "DELIVERED",
    misconfiguredAgent: config.misconfiguredAgent,
  });
  await deps.orchestrator.run(dealId);

  const view = await getDeal(deps.db, dealId);
  if (!view) throw new HttpError(500, "DEAL_MISSING", `deal ${dealId} vanished mid-run`);
  if (view.deal.status !== "RECEIPT_SIGNED") {
    throw new HttpError(
      409,
      "DEMO_DEAL_INCOMPLETE",
      `Case ${caseLabel} stopped at ${view.deal.status}: ${view.deal.failure?.ruleId ?? "no rule"} — ${
        view.deal.failure?.message ?? "no detail"
      }`,
    );
  }

  const dispute = await deps.arbiter.open(dealId, {
    claimType: config.claimType,
    claim: config.claim,
    openedBy: "BUYER",
  });

  return { caseLabel, dealId, disputeId: dispute.id, label: config.label };
}

/**
 * Seeds the two demo cases described in the README.
 *
 * Case A — a valid purchase, correctly delivered, then a goods-not-received claim
 * that the delivery record defeats: verdict VALID_PURCHASE.
 *
 * Case B — a deliberately misconfigured buyer agent whose MandateGuard is
 * bypassed. It captures more than the signed cap, the bypass is recorded in the
 * ledger, and a mandate-breach claim produces verdict BUYER_AGENT_OUT_OF_MANDATE
 * with a full merchant refund.
 */
export async function seedDemo(deps: SeedDeps): Promise<{ seeded: boolean; cases: DemoCaseRun[] }> {
  const existing = await listMandates(deps.db);
  if (existing.length > 0) return { seeded: false, cases: [] };

  const keys = await ensureDemoKeys(deps.db);
  const now = deps.now();
  const issuedAt = new Date(now.getTime() - 60_000).toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();

  const caseA = signDemoMandate(
    {
      id: CASE_A_MANDATE_ID,
      maxTotal: 60_000,
      perItemMax: 30_000,
      maxTransactions: 5,
      allowedCategories: ["PPE"],
      forbiddenSubstitutions: ["latex"],
      merchantAllowlist: [DEMO_MERCHANT_AGENT_ID],
      issuedAt,
      expiresAt,
      nonce: "nonce-case-a-0001",
    },
    keys.principal,
  );

  // Only 20.00 USD of lifetime authority: the demo cart in Case B exceeds it.
  const caseB = signDemoMandate(
    {
      id: CASE_B_MANDATE_ID,
      maxTotal: 2_000,
      perItemMax: 2_000,
      maxTransactions: 1,
      allowedCategories: ["PPE"],
      forbiddenSubstitutions: ["latex"],
      merchantAllowlist: [DEMO_MERCHANT_AGENT_ID],
      issuedAt,
      expiresAt,
      nonce: "nonce-case-b-0001",
    },
    keys.principal,
  );

  await insertMandate(deps.db, caseA);
  await insertMandate(deps.db, caseB);

  const cases = [await runDemoCase(deps, "A"), await runDemoCase(deps, "B")];
  return { seeded: true, cases };
}
