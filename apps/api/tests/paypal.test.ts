import { describe, expect, it } from "vitest";
import { PaypalError } from "../src/paypal/errors";
import { PaypalHttpClient } from "../src/paypal/http";
import { MockPaymentProvider } from "../src/paypal/mock";
import { parseWireAmount, toWireAmount } from "../src/paypal/money";
import { PayPalSandboxProvider } from "../src/paypal/sandbox";
import { verifyWebhookSignature, webhookHeadersFrom } from "../src/paypal/webhook";

const TOKEN = { access_token: "token-1", expires_in: 3600 };

interface Step {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

function scriptedFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const step = steps.shift();
    if (!step) throw new TypeError(`unexpected fetch: ${url}`);
    const body = step.text ?? JSON.stringify(step.body ?? {});
    return new Response(body, {
      status: step.status ?? 200,
      headers: { "content-type": "application/json", ...(step.headers ?? {}) },
    });
  };
  return { fetchImpl, calls };
}

const headerOf = (call: { init: RequestInit }, name: string): string | undefined =>
  (call.init.headers as Record<string, string> | undefined)?.[name];

const bodyOf = (call: { init: RequestInit }): Record<string, unknown> =>
  JSON.parse(String(call.init.body ?? "{}")) as Record<string, unknown>;

function sandbox(steps: Step[]) {
  const { fetchImpl, calls } = scriptedFetch(steps);
  const sleeps: number[] = [];
  const provider = new PayPalSandboxProvider({
    apiBase: "https://api-m.sandbox.paypal.com",
    clientId: "client-id",
    clientSecret: "client-secret",
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { provider, calls, sleeps };
}

const ORDER_CREATED = {
  id: "5O190127TN364715T",
  status: "CREATED",
  links: [
    { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", method: "GET" },
  ],
};

const ORDER_CAPTURED = {
  id: "5O190127TN364715T",
  status: "COMPLETED",
  purchase_units: [
    {
      payments: {
        captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { currency_code: "USD", value: "12.34" } }],
      },
    },
  ],
};

const createInput = {
  amountMinor: 1234,
  currency: "USD" as const,
  referenceId: "deal_0001",
  description: "2 x Nitrile gloves, box of 100",
  idempotencyKey: "hs-create-deal_0001",
};

describe("sandbox provider — amounts and idempotency", () => {
  it("sends a decimal string amount and PayPal-Request-Id", async () => {
    const { provider, calls } = sandbox([{ body: TOKEN }, { body: ORDER_CREATED }]);
    const order = await provider.createOrder(createInput);

    expect(order.orderId).toBe("5O190127TN364715T");
    expect(order.status).toBe("CREATED");
    expect(order.amountDecimal).toBe("12.34");
    expect(order.amountMinor).toBe(1234);
    expect(order.payerActionUrl).toContain("checkoutnow");

    const createCall = calls[1]!;
    expect(createCall.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(headerOf(createCall, "PayPal-Request-Id")).toBe("hs-create-deal_0001");
    const body = bodyOf(createCall) as { purchase_units: { amount: { value: string; currency_code: string } }[] };
    expect(body.purchase_units[0]!.amount).toEqual({ currency_code: "USD", value: "12.34" });
  });

  it("caches the OAuth token across calls", async () => {
    const { provider, calls } = sandbox([{ body: TOKEN }, { body: ORDER_CREATED }, { body: ORDER_CREATED }]);
    await provider.createOrder(createInput);
    await provider.getOrder("5O190127TN364715T");

    const tokenCalls = calls.filter((call) => call.url.endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.init.body).toBe("grant_type=client_credentials");
  });

  it("refreshes the token once on a 401 and replays the request", async () => {
    const { provider, calls } = sandbox([
      { body: TOKEN },
      { status: 401, body: { name: "AUTHENTICATION_FAILURE" } },
      { body: { ...TOKEN, access_token: "token-2" } },
      { body: ORDER_CREATED },
    ]);

    const order = await provider.createOrder(createInput);
    expect(order.orderId).toBe(ORDER_CREATED.id);
    expect(calls.filter((call) => call.url.endsWith("/v1/oauth2/token"))).toHaveLength(2);
  });
});

describe("sandbox provider — retries", () => {
  it("retries a 5xx with backoff and then succeeds", async () => {
    const { provider, calls, sleeps } = sandbox([
      { body: TOKEN },
      { status: 503, body: { name: "SERVICE_UNAVAILABLE" } },
      { body: ORDER_CREATED },
    ]);

    const order = await provider.createOrder(createInput);
    expect(order.orderId).toBe(ORDER_CREATED.id);
    expect(calls.filter((call) => call.url.includes("/v2/checkout/orders"))).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(250);
  });

  it("gives up after the retry budget and reports a typed SERVER error", async () => {
    const { provider, calls } = sandbox([
      { body: TOKEN },
      { status: 500, body: { name: "INTERNAL_SERVER_ERROR" } },
      { status: 500, body: { name: "INTERNAL_SERVER_ERROR" } },
      { status: 500, body: { name: "INTERNAL_SERVER_ERROR" } },
    ]);

    const error = await provider.createOrder(createInput).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaypalError);
    expect((error as PaypalError).kind).toBe("SERVER");
    expect((error as PaypalError).retryable).toBe(true);
    expect(calls.filter((call) => call.url.includes("/v2/checkout/orders"))).toHaveLength(3);
  });

  it("never retries a 4xx and surfaces PayPal's issue and debug id", async () => {
    const { provider, calls } = sandbox([
      { body: TOKEN },
      {
        status: 422,
        body: { name: "UNPROCESSABLE_ENTITY", issue: "ORDER_ALREADY_CAPTURED", debug_id: "debug-123" },
      },
    ]);

    const error = await provider.createOrder(createInput).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaypalError);
    const typed = error as PaypalError;
    expect(typed.kind).toBe("VALIDATION");
    expect(typed.status).toBe(422);
    expect(typed.issue).toBe("ORDER_ALREADY_CAPTURED");
    expect(typed.debugId).toBe("debug-123");
    expect(typed.retryable).toBe(false);
    expect(calls.filter((call) => call.url.includes("/v2/checkout/orders"))).toHaveLength(1);
  });
});

describe("sandbox provider — capture, refund, disputes", () => {
  it("captures an order and reads the capture id and amount", async () => {
    const { provider, calls } = sandbox([{ body: TOKEN }, { body: ORDER_CAPTURED }]);
    const order = await provider.captureOrder({ orderId: "5O190127TN364715T", idempotencyKey: "hs-capture-deal_0001" });

    expect(order.status).toBe("COMPLETED");
    expect(order.captureId).toBe("3C679366HH908993F");
    expect(order.amountMinor).toBe(1234);
    expect(headerOf(calls[1]!, "PayPal-Request-Id")).toBe("hs-capture-deal_0001");
  });

  it("refunds a capture with a decimal amount", async () => {
    const { provider, calls } = sandbox([
      { body: TOKEN },
      { body: { id: "1JU08902781691411", status: "COMPLETED", amount: { currency_code: "USD", value: "5.00" } } },
    ]);

    const refund = await provider.refund({
      captureId: "3C679366HH908993F",
      amountMinor: 500,
      note: "Dispute ruled in favour of the buyer",
      idempotencyKey: "hs-refund-deal_0001",
    });

    expect(refund.refundId).toBe("1JU08902781691411");
    expect(refund.status).toBe("COMPLETED");
    expect(refund.amountMinor).toBe(500);
    expect(calls[1]!.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/3C679366HH908993F/refund");
    expect(bodyOf(calls[1]!)).toMatchObject({
      amount: { value: "5.00", currency_code: "USD" },
      note_to_payer: "Dispute ruled in favour of the buyer",
    });
  });

  it("lists and maps merchant disputes", async () => {
    const { provider, calls } = sandbox([
      { body: TOKEN },
      {
        body: {
          items: [
            {
              dispute_id: "PP-D-27803",
              reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
              status: "OPEN",
              dispute_state: "OPEN_INQUIRIES",
              dispute_life_cycle_stage: "INQUIRY",
              dispute_channel: "INTERNAL",
              dispute_amount: { currency_code: "USD", value: "12.34" },
              create_time: "2026-03-01T00:00:00.000Z",
              update_time: "2026-03-02T00:00:00.000Z",
            },
          ],
        },
      },
    ]);

    const disputes = await provider.listDisputes({ disputeState: "OPEN_INQUIRIES", pageSize: 25 });
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({
      disputeId: "PP-D-27803",
      status: "OPEN",
      state: "OPEN_INQUIRIES",
      amountMinor: 1234,
      currency: "USD",
    });
    expect(calls[1]!.url).toContain("dispute_state=OPEN_INQUIRIES");
    expect(calls[1]!.url).toContain("page_size=25");
  });

  it("rejects a non-USD amount rather than silently converting", async () => {
    const { provider } = sandbox([
      { body: TOKEN },
      {
        body: {
          id: "RF-1",
          status: "COMPLETED",
          amount: { currency_code: "EUR", value: "5.00" },
        },
      },
    ]);

    await expect(
      provider.refund({ captureId: "CAP-1", amountMinor: 500, idempotencyKey: "hs-refund-eur" }),
    ).rejects.toMatchObject({ kind: "UNSUPPORTED" });
  });

  it("reports NOT_CONFIGURED without touching the network", async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const provider = new PayPalSandboxProvider({
      apiBase: "https://api-m.sandbox.paypal.com",
      clientId: undefined,
      clientSecret: undefined,
      fetchImpl,
    });

    await expect(provider.createOrder(createInput)).rejects.toMatchObject({ kind: "NOT_CONFIGURED" });
    expect(calls).toHaveLength(0);
  });
});

describe("money conversion", () => {
  it("round-trips integer cents through the PayPal decimal format", () => {
    expect(toWireAmount(1234)).toBe("12.34");
    expect(toWireAmount(5)).toBe("0.05");
    expect(toWireAmount(0)).toBe("0.00");
    expect(parseWireAmount("12.34")).toBe(1234);
    expect(parseWireAmount("0.05")).toBe(5);
  });

  it("refuses a negative or fractional minor amount", () => {
    expect(() => toWireAmount(-1)).toThrow(PaypalError);
    expect(() => toWireAmount(1.5)).toThrow(PaypalError);
  });
});

describe("webhook verification", () => {
  const headers = {
    "paypal-transmission-id": "db49fb10-1343-11ef-ac58-e32457403f67",
    "paypal-transmission-time": "2026-03-01T00:00:00Z",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42",
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-transmission-sig": "c2lnbmF0dXJl",
  };
  const event = { id: "WH-3F562076HD293871E", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1" } };

  const clientWith = (steps: Step[]) => {
    const { fetchImpl, calls } = scriptedFetch(steps);
    return {
      client: new PaypalHttpClient({
        apiBase: "https://api-m.sandbox.paypal.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        fetchImpl,
      }),
      calls,
    };
  };

  it("accepts a delivery PayPal confirms as SUCCESS", async () => {
    const mapped = webhookHeadersFrom(headers);
    expect(mapped).not.toBeNull();

    const { client, calls } = clientWith([{ body: TOKEN }, { body: { verification_status: "SUCCESS" } }]);
    const result = await verifyWebhookSignature(client, { webhookId: "0NH55953DH663215D", headers: mapped!, event });

    expect(result.verified).toBe(true);
    expect(result.status).toBe("SUCCESS");
    expect(result.event).toEqual({ id: event.id, eventType: event.event_type });
    expect(calls[1]!.url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(bodyOf(calls[1]!)).toMatchObject({ webhook_id: "0NH55953DH663215D" });
  });

  it("rejects a delivery PayPal confirms as FAILURE", async () => {
    const { client } = clientWith([{ body: TOKEN }, { body: { verification_status: "FAILURE" } }]);
    const result = await verifyWebhookSignature(client, {
      webhookId: "0NH55953DH663215D",
      headers: webhookHeadersFrom(headers)!,
      event,
    });

    expect(result.verified).toBe(false);
    expect(result.status).toBe("FAILURE");
  });

  it("SKIPS instead of assuming a pass when no webhook id is configured", async () => {
    const { client, calls } = clientWith([]);
    const result = await verifyWebhookSignature(client, {
      webhookId: undefined,
      headers: webhookHeadersFrom(headers)!,
      event,
    });

    expect(result.verified).toBe(false);
    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toMatch(/PAYPAL_WEBHOOK_ID/);
    expect(calls).toHaveLength(0);
  });

  it("returns null headers when the delivery is missing a signature field", () => {
    expect(webhookHeadersFrom({ "paypal-transmission-id": "x" })).toBeNull();
  });
});

describe("mock provider — behavioural parity", () => {
  const now = () => Date.parse("2026-03-01T00:00:00.000Z");
  const input = { ...createInput, idempotencyKey: "mock-create-1", referenceId: "deal_0001" };

  it("runs create, capture and refund with the same interface", async () => {
    const provider = new MockPaymentProvider({ now });
    const created = await provider.createOrder(input);
    expect(created.provider).toBe("PAYPAL_MOCK");
    expect(created.simulated).toBe(true);
    expect(created.status).toBe("CREATED");
    expect(created.orderId.startsWith("MOCK-ORDER-")).toBe(true);

    const captured = await provider.captureOrder({ orderId: created.orderId, idempotencyKey: "mock-capture-1" });
    expect(captured.status).toBe("COMPLETED");
    expect(captured.captureId?.startsWith("MOCK-CAPTURE-")).toBe(true);

    const refund = await provider.refund({
      captureId: captured.captureId!,
      amountMinor: 500,
      idempotencyKey: "mock-refund-1",
    });
    expect(refund.status).toBe("COMPLETED");
    expect(refund.amountMinor).toBe(500);
    expect(refund.simulated).toBe(true);
  });

  it("replays the same idempotency key instead of creating a second order", async () => {
    const provider = new MockPaymentProvider({ now });
    const first = await provider.createOrder(input);
    const second = await provider.createOrder(input);
    expect(second.orderId).toBe(first.orderId);
  });

  it("rejects a reused idempotency key with a different request", async () => {
    const provider = new MockPaymentProvider({ now });
    await provider.createOrder(input);
    await expect(provider.createOrder({ ...input, amountMinor: 999 })).rejects.toMatchObject({ kind: "CONFLICT" });
  });

  it("reports NOT_FOUND for an unknown order", async () => {
    const provider = new MockPaymentProvider({ now });
    await expect(provider.getOrder("MOCK-ORDER-UNKNOWN")).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("cannot refund more than was captured", async () => {
    const provider = new MockPaymentProvider({ now });
    const created = await provider.createOrder(input);
    const captured = await provider.captureOrder({ orderId: created.orderId, idempotencyKey: "cap-1" });

    await provider.refund({ captureId: captured.captureId!, amountMinor: 1000, idempotencyKey: "rf-1" });
    await expect(
      provider.refund({ captureId: captured.captureId!, amountMinor: 1000, idempotencyKey: "rf-2" }),
    ).rejects.toMatchObject({ kind: "VALIDATION", issue: "REFUND_EXCEEDS_CAPTURE" });
  });

  it("returns no disputes and says so in its capabilities", async () => {
    const provider = new MockPaymentProvider({ now });
    expect(await provider.listDisputes?.()).toEqual([]);

    const capabilities = provider.capabilities();
    expect(capabilities.simulated).toBe(true);
    expect(capabilities.disputes).toBe(false);
    expect(capabilities.notes.join(" ")).toMatch(/SIMULATED/);
  });
});
