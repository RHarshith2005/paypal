import {
  DealListResponseSchema,
  DealViewSchema,
  DisputeViewSchema,
  verifyChain,
  type DealStatus,
  type DealView,
} from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config/env";
import { createStore, type Store } from "../src/db/client";
import { insertMandate } from "../src/db/writes";
import { PaypalError } from "../src/paypal/errors";
import type { PaymentProvider, PaymentOrder } from "../src/paypal/types";
import { ensureDemoKeys, signDemoMandate } from "../src/services/keys";
import { SimulatedTrustAnchor } from "../src/trust-anchor/anchor";

const FIXED_NOW = new Date("2026-03-01T12:00:00.000Z");
const MERCHANT = "agt_merchant_ridgeway";

const buildConfig = (overrides: Record<string, string> = {}) =>
  loadConfig(
    {
      NODE_ENV: "test",
      DATABASE_URL: "",
      SEED_DEMO_DATA: "false",
      PAYPAL_MODE: "mock",
      LOG_LEVEL: "error",
      WEB_ORIGIN: "http://localhost:5173",
      ...overrides,
    },
    { loadDotEnv: false },
  );

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

async function setup(
  options: {
    seed?: boolean;
    env?: Record<string, string>;
    payments?: PaymentProvider;
    anchor?: SimulatedTrustAnchor;
  } = {},
): Promise<{ app: FastifyInstance; store: Store }> {
  const config = buildConfig(options.env);
  const store = await createStore(config);
  const app = await buildApp({
    config,
    store,
    seed: options.seed ?? false,
    payments: options.payments,
    anchor: options.anchor,
    llm: null,
    now: () => FIXED_NOW,
  });
  await app.ready();
  cleanups.push(async () => {
    await app.close();
  });
  return { app, store };
}

async function issueMandate(
  store: Store,
  overrides: {
    id: string;
    maxTotal: number;
    perItemMax: number;
    merchantAllowlist?: string[] | null;
  },
): Promise<void> {
  const keys = await ensureDemoKeys(store.db);
  const mandate = signDemoMandate(
    {
      id: overrides.id,
      maxTotal: overrides.maxTotal,
      perItemMax: overrides.perItemMax,
      maxTransactions: 5,
      allowedCategories: ["PPE"],
      forbiddenSubstitutions: ["latex"],
      merchantAllowlist: overrides.merchantAllowlist === undefined ? [MERCHANT] : overrides.merchantAllowlist,
      issuedAt: new Date(FIXED_NOW.getTime() - 60_000).toISOString(),
      expiresAt: new Date(FIXED_NOW.getTime() + 30 * 60_000).toISOString(),
      nonce: `nonce-${overrides.id}`,
    },
    keys.principal,
  );
  await insertMandate(store.db, mandate);
}

async function startDeal(app: FastifyInstance, body: Record<string, unknown>): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/deals", payload: body });
  expect(response.statusCode).toBe(202);
  return (response.json() as { dealId: string }).dealId;
}

async function waitFor(
  app: FastifyInstance,
  dealId: string,
  predicate: (status: DealStatus) => boolean,
): Promise<DealView> {
  const deadline = Date.now() + 15_000;
  let last: DealView | null = null;
  while (Date.now() < deadline) {
    const response = await app.inject({ method: "GET", url: `/api/deals/${dealId}` });
    if (response.statusCode === 200) {
      last = DealViewSchema.parse(response.json());
      if (predicate(last.deal.status)) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const trail = (last?.deal.events ?? [])
    .slice(-8)
    .map((event) => `${event.seq}:${event.type}`)
    .join(" -> ");
  throw new Error(
    `deal ${dealId} did not reach the expected state; last was ${last?.deal.status ?? "unknown"}, ` +
      `failure=${last?.deal.failure?.ruleId ?? "none"}, events=${trail || "none"}`,
  );
}

class FailingPaymentProvider implements PaymentProvider {
  readonly name = "PAYPAL_MOCK" as const;
  readonly simulated = true;

  async createOrder(): Promise<PaymentOrder> {
    throw new PaypalError("SERVER", "sandbox unavailable (injected test failure)", { status: 503 });
  }

  async captureOrder(): Promise<PaymentOrder> {
    throw new PaypalError("SERVER", "sandbox unavailable (injected test failure)", { status: 503 });
  }

  async getOrder(): Promise<PaymentOrder> {
    throw new PaypalError("SERVER", "sandbox unavailable (injected test failure)", { status: 503 });
  }

  async refund(): Promise<never> {
    throw new PaypalError("SERVER", "sandbox unavailable (injected test failure)", { status: 503 });
  }

  capabilities() {
    return {
      provider: this.name,
      simulated: true,
      orders: false,
      refunds: false,
      disputes: false,
      webhooks: false,
      notes: ["injected failure provider for tests"],
    };
  }
}

describe("deal pipeline", () => {
  it("runs handshake, negotiation, payment and a dual-signed receipt", { timeout: 45_000 }, async () => {
    const { app, store } = await setup();
    await issueMandate(store, { id: "mnd_pipeline_happy", maxTotal: 60_000, perItemMax: 30_000 });

    const dealId = await startDeal(app, { mandateId: "mnd_pipeline_happy", merchantAgentId: MERCHANT });
    const view = await waitFor(app, dealId, (status) => status === "RECEIPT_SIGNED");
    const { deal } = view;

    expect(deal.handshakeResult?.ok).toBe(true);
    expect(deal.handshakeResult?.attestationsSimulated).toBe(true);
    expect(deal.guardDecisions.length).toBeGreaterThanOrEqual(2);
    expect(deal.guardDecisions.every((decision) => decision.allowed)).toBe(true);
    expect(deal.receipt).not.toBeNull();
    expect(deal.receipt?.buyerSignature.agentId).toBe("agt_buyer_demo");
    expect(deal.receipt?.merchantSignature.agentId).toBe(MERCHANT);
    expect(deal.payment?.status).toBe("COMPLETED");
    expect(deal.payment?.simulated).toBe(true);
    expect(verifyChain(deal.transcript).valid).toBe(true);
    expect(deal.transcript.length).toBeGreaterThan(5);

    const eventTypes = deal.events.map((event) => event.type);
    expect(eventTypes).toContain("HANDSHAKE_RESULT");
    expect(eventTypes).toContain("OFFER_AGREED");
    expect(eventTypes).toContain("PAYMENT_STATUS");
    expect(eventTypes).toContain("RECEIPT_SIGNED");

    const ledger = await app.inject({ method: "GET", url: "/api/ledger" });
    const entries = (
      ledger.json() as { entries: Array<{ dealId: string; status: string; amountMinor: number }> }
    ).entries.filter((entry) => entry.dealId === dealId);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("SETTLED");
    expect(entries[0]?.amountMinor).toBe(deal.receipt?.agreedPrice.amountMinor);
  });

  it("blocks a purchase when the merchant is not on the mandate allowlist", { timeout: 45_000 }, async () => {
    const { app, store } = await setup();
    await issueMandate(store, {
      id: "mnd_pipeline_guard",
      maxTotal: 60_000,
      perItemMax: 30_000,
      merchantAllowlist: ["agt_merchant_someone_else"],
    });

    const dealId = await startDeal(app, { mandateId: "mnd_pipeline_guard", merchantAgentId: MERCHANT });
    const view = await waitFor(app, dealId, (status) => status === "FAILED");

    expect(view.deal.failure?.ruleId).toBe("M-MERCHANT-02");
    expect(view.deal.payment).toBeNull();
    const denied = view.deal.guardDecisions.find((decision) => !decision.allowed);
    expect(denied?.reasonCodes).toContain("M-MERCHANT-02");

    const ledger = await app.inject({ method: "GET", url: "/api/ledger" });
    const entries = (ledger.json() as { entries: Array<{ dealId: string; status: string }> }).entries.filter(
      (entry) => entry.dealId === dealId,
    );
    expect(entries).toHaveLength(0);
  });

  it("fails the deal cleanly when the payment provider errors", { timeout: 45_000 }, async () => {
    const { app, store } = await setup({ payments: new FailingPaymentProvider() });
    await issueMandate(store, { id: "mnd_pipeline_payfail", maxTotal: 60_000, perItemMax: 30_000 });

    const dealId = await startDeal(app, { mandateId: "mnd_pipeline_payfail", merchantAgentId: MERCHANT });
    const view = await waitFor(app, dealId, (status) => status === "FAILED");

    expect(view.deal.failure?.ruleId).toBe("P-PAYMENT-FAILED");
    expect(view.deal.payment?.status).toBe("FAILED");
    expect(view.deal.payment?.failureReason).toMatch(/injected test failure/);
    expect(view.deal.receipt).toBeNull();

    const ledger = await app.inject({ method: "GET", url: "/api/ledger" });
    const entries = (ledger.json() as { entries: Array<{ dealId: string; status: string }> }).entries.filter(
      (entry) => entry.dealId === dealId,
    );
    expect(entries[0]?.status).toBe("VOIDED");
  });

  it("fails the handshake when the merchant has been revoked", { timeout: 45_000 }, async () => {
    const config = buildConfig();
    const store = await createStore(config);
    const anchor = await SimulatedTrustAnchor.load(store.db, () => FIXED_NOW);
    anchor.revoke(MERCHANT);

    const app = await buildApp({
      config,
      store,
      seed: false,
      anchor,
      llm: null,
      now: () => FIXED_NOW,
    });
    await app.ready();
    cleanups.push(async () => {
      await app.close();
    });

    await issueMandate(store, { id: "mnd_pipeline_revoked", maxTotal: 60_000, perItemMax: 30_000 });
    const dealId = await startDeal(app, { mandateId: "mnd_pipeline_revoked", merchantAgentId: MERCHANT });
    const view = await waitFor(app, dealId, (status) => status === "FAILED");

    expect(view.deal.failure?.ruleId).toBe("A-REVOKED-09");
    expect(view.deal.handshakeResult?.ok).toBe(false);
    expect(view.deal.payment).toBeNull();
  });

  it("seeds Case A and Case B and produces both verdicts", { timeout: 45_000 }, async () => {
    const { app } = await setup({ seed: true, env: { SEED_DEMO_DATA: "true" } });

    const response = await app.inject({ method: "GET", url: "/api/deals" });
    expect(response.statusCode).toBe(200);
    const listed = DealListResponseSchema.parse(response.json());
    expect(listed.deals).toHaveLength(2);

    const verdicts: Array<{ claim: string; verdict: string | null; liability: string | null; bypassed: boolean }> = [];
    for (const summary of listed.deals) {
      const dealResponse = await app.inject({ method: "GET", url: `/api/deals/${summary.id}` });
      const view = DealViewSchema.parse(dealResponse.json());
      expect(view.deal.status).toBe("RESOLVED");

      const dispute = view.disputes[0];
      expect(dispute).toBeDefined();
      const disputeResponse = await app.inject({ method: "GET", url: `/api/disputes/${dispute?.id}` });
      const disputeView = DisputeViewSchema.parse(disputeResponse.json());
      expect(disputeView.packet).not.toBeNull();
      verdicts.push({
        claim: disputeView.dispute.claimType,
        verdict: disputeView.dispute.ruling?.verdict ?? null,
        liability: disputeView.dispute.ruling?.liability ?? null,
        bypassed: view.deal.guardDecisions.some((decision) => decision.bypassed),
      });
    }

    const caseA = verdicts.find((entry) => entry.claim === "GOODS_NOT_RECEIVED");
    const caseB = verdicts.find((entry) => entry.claim === "MANDATE_BREACH");
    expect(caseA?.verdict).toBe("VALID_PURCHASE");
    expect(caseA?.bypassed).toBe(false);
    expect(caseB?.verdict).toBe("BUYER_AGENT_OUT_OF_MANDATE");
    expect(caseB?.liability).toBe("MERCHANT");
    expect(caseB?.bypassed).toBe(true);
  });
});
