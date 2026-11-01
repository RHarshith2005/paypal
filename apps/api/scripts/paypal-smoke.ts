/**
 * PayPal sandbox smoke test.
 *
 *   pnpm paypal:smoke
 *
 * It creates and captures a real sandbox order with the credentials in the
 * environment and prints what actually worked. It never reports a pass for a
 * capability it could not exercise, and it exits non-zero when the core payment
 * path fails.
 *
 * Exit codes:
 *   0  core path verified (create, get, capture, get-after-capture)
 *   1  at least one core capability failed
 *   2  could not run: no sandbox credentials or mock mode
 */
import { loadConfig } from "../src/config/env";
import { createPaymentProvider } from "../src/paypal";
import { PaypalError } from "../src/paypal/errors";
import type { PaymentProvider } from "../src/paypal";

type Status = "PASS" | "FAIL" | "SKIPPED";

interface Outcome {
  capability: string;
  status: Status;
  detail: string;
}

const outcomes: Outcome[] = [];

async function step(name: string, run: () => Promise<string>): Promise<boolean> {
  const startedAt = performance.now();
  try {
    const detail = await run();
    const ms = Math.round(performance.now() - startedAt);
    outcomes.push({ capability: name, status: "PASS", detail: `${detail} (${ms} ms)` });
    return true;
  } catch (error) {
    outcomes.push({ capability: name, status: "FAIL", detail: describeError(error) });
    return false;
  }
}

function describeError(error: unknown): string {
  if (error instanceof PaypalError) {
    const parts: string[] = [error.kind];
    if (error.status !== null) parts.push(`HTTP ${error.status}`);
    parts.push(error.message);
    if (error.issue) parts.push(`issue=${error.issue}`);
    if (error.debugId) parts.push(`debug_id=${error.debugId}`);
    return parts.join(" · ");
  }
  return error instanceof Error ? error.message : String(error);
}

function printTable(): void {
  const width = Math.max(...outcomes.map((outcome) => outcome.capability.length), 10);
  console.log("");
  console.log(`${"CAPABILITY".padEnd(width)}  RESULT   DETAIL`);
  console.log(`${"-".repeat(width)}  ------   ${"-".repeat(60)}`);
  for (const outcome of outcomes) {
    console.log(`${outcome.capability.padEnd(width)}  ${outcome.status.padEnd(7)}  ${outcome.detail}`);
  }
  console.log("");
}

async function runSandboxSmoke(provider: PaymentProvider): Promise<number> {
  const referenceId = `smoke_${Date.now()}`;
  let orderId: string | null = null;
  let captureId: string | null = null;

  const created = await step("createOrder", async () => {
    const order = await provider.createOrder({
      amountMinor: 100,
      currency: "USD",
      referenceId,
      description: "Handshake sandbox smoke test",
      idempotencyKey: `hs-smoke-create-${referenceId}`,
    });
    orderId = order.orderId;
    return `order ${order.orderId} status=${order.status} amount=${order.amountDecimal} ${order.currency}`;
  });

  await step("createOrder idempotent replay", async () => {
    if (!orderId) throw new Error("skipped: no order to replay");
    const replay = await provider.createOrder({
      amountMinor: 100,
      currency: "USD",
      referenceId,
      description: "Handshake sandbox smoke test",
      idempotencyKey: `hs-smoke-create-${referenceId}`,
    });
    if (replay.orderId !== orderId) {
      throw new Error(`PayPal returned a different order id on replay: ${replay.orderId}`);
    }
    return `same order id on replay (${replay.orderId})`;
  });

  await step("getOrder (before capture)", async () => {
    if (!orderId) throw new Error("skipped: no order created");
    const order = await provider.getOrder(orderId);
    return `status=${order.status} captureId=${order.captureId ?? "none"}`;
  });

  const captured = await step("captureOrder", async () => {
    if (!orderId) throw new Error("skipped: no order created");
    const order = await provider.captureOrder({
      orderId,
      idempotencyKey: `hs-smoke-capture-${referenceId}`,
    });
    captureId = order.captureId;
    return `status=${order.status} capture=${order.captureId ?? "none"} amount=${order.amountDecimal}`;
  });

  await step("getOrder (after capture)", async () => {
    if (!orderId) throw new Error("skipped: no order created");
    const order = await provider.getOrder(orderId);
    return `status=${order.status} capture=${order.captureId ?? "none"}`;
  });

  await step("refund (full)", async () => {
    if (!captureId) throw new Error("skipped: nothing was captured");
    const refund = await provider.refund({
      captureId,
      note: "Handshake sandbox smoke test refund",
      idempotencyKey: `hs-smoke-refund-${referenceId}`,
    });
    return `refund ${refund.refundId} status=${refund.status} amount=${refund.amountDecimal} ${refund.currency}`;
  });

  await step("listDisputes", async () => {
    if (!provider.listDisputes) return "provider does not expose disputes";
    const disputes = await provider.listDisputes({ pageSize: 5 });
    return `${disputes.length} dispute(s) visible to this sandbox app`;
  });

  await step("verifyWebhookSignature", async () => {
    throw new PaypalError(
      "UNSUPPORTED",
      "not exercised: verification needs a real webhook delivery (or a mock event) and PAYPAL_WEBHOOK_ID",
    );
  });

  printTable();

  const core = outcomes.filter(
    (outcome) =>
      outcome.capability.startsWith("createOrder") ||
      outcome.capability.startsWith("getOrder") ||
      outcome.capability.startsWith("captureOrder"),
  );
  const coreFailed = core.some((outcome) => outcome.status === "FAIL");
  const secondary = outcomes.filter((outcome) => !core.includes(outcome));

  if (!created || !captured) {
    console.log("Core payment path FAILED. Treat PayPal as unverified until this passes.");
    return 1;
  }

  console.log("Core payment path verified against the PayPal sandbox (create, get, capture, get).");
  const secondaryFailures = secondary.filter((outcome) => outcome.status === "FAIL");
  if (secondaryFailures.length > 0) {
    console.log(
      `Secondary capabilities that did NOT verify: ${secondaryFailures.map((outcome) => outcome.capability).join(", ")}`,
    );
  }
  if (coreFailed) return 1;
  return 0;
}

async function main(): Promise<number> {
  const config = loadConfig();
  const provider = createPaymentProvider(config.paypal);

  console.log("Handshake · PayPal sandbox smoke");
  console.log(`requested mode : ${config.paypal.requestedMode}`);
  console.log(`effective mode : ${config.paypal.mode}`);
  console.log(`api base       : ${config.paypal.apiBase}`);
  console.log(`credentials    : ${config.paypal.clientId && config.paypal.clientSecret ? "present" : "absent"}`);

  if (config.paypal.mode !== "sandbox") {
    outcomes.push({
      capability: "all",
      status: "SKIPPED",
      detail:
        "PayPal sandbox credentials are not configured. Set PAYPAL_MODE=sandbox, PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    });
    printTable();
    console.log("Nothing was verified against PayPal. This is not a pass: no credentials are present.");
    return 2;
  }

  console.log("Running against the PayPal sandbox. No live money moves.");
  return runSandboxSmoke(provider);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("smoke failed unexpectedly:", error);
    process.exitCode = 1;
  });
