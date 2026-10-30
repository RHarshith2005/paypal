import { z } from "zod";
import { PaypalError } from "./errors";
import { PaypalHttpClient, type FetchLike, type PaypalHttpOptions } from "./http";
import { assertUsd, parseWireAmount, toWireAmount } from "./money";
import type {
  CaptureOrderInput,
  CreateOrderInput,
  DisputeSummary,
  ListDisputesInput,
  OrderStatus,
  PaymentCapabilities,
  PaymentOrder,
  PaymentProvider,
  RefundInput,
  RefundReceipt,
  RefundStatus,
} from "./types";

const LinkSchema = z.object({
  href: z.string().min(1),
  rel: z.string().min(1),
  method: z.string().optional(),
});

const CaptureSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.object({ currency_code: z.string().min(1), value: z.string().min(1) }).optional(),
});

const OrderSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  links: z.array(LinkSchema).optional(),
  purchase_units: z
    .array(
      z.object({
        payments: z.object({ captures: z.array(CaptureSchema).optional() }).optional(),
      }),
    )
    .optional(),
});

const RefundSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.object({ currency_code: z.string().min(1), value: z.string().min(1) }).optional(),
});

const DisputeSchema = z.object({
  dispute_id: z.string().min(1),
  reason: z.string().optional(),
  status: z.string().optional(),
  dispute_state: z.string().optional(),
  dispute_life_cycle_stage: z.string().optional(),
  dispute_channel: z.string().optional(),
  dispute_amount: z.object({ currency_code: z.string().min(1), value: z.string().min(1) }).optional(),
  create_time: z.string().optional(),
  update_time: z.string().optional(),
});

const DisputesSchema = z.object({
  items: z.array(DisputeSchema).optional(),
});

const ORDER_STATUS: Record<string, OrderStatus> = {
  CREATED: "CREATED",
  SAVED: "CREATED",
  PAYER_ACTION_REQUIRED: "PAYER_ACTION_REQUIRED",
  APPROVED: "APPROVED",
  COMPLETED: "COMPLETED",
  VOIDED: "FAILED",
  PAYMENT_DENIED: "FAILED",
  PAYMENT_FAILED: "FAILED",
};

const REFUND_STATUS: Record<string, RefundStatus> = {
  COMPLETED: "COMPLETED",
  PENDING: "PENDING",
  FAILED: "FAILED",
  CANCELLED: "FAILED",
};

export interface PayPalSandboxOptions extends Omit<PaypalHttpOptions, "clientId" | "clientSecret"> {
  clientId: string | undefined;
  clientSecret: string | undefined;
  defaultReturnUrl?: string;
  defaultCancelUrl?: string;
  /** Injection point for tests that want to reuse a client. */
  http?: PaypalHttpClient;
}

/**
 * PayPal Sandbox adapter, implemented against the documented REST APIs only:
 *
 * - Orders v2 create/capture/get: https://developer.paypal.com/docs/api/orders/v2/
 * - Payments v2 refund: https://developer.paypal.com/docs/api/payments/v2/
 * - Disputes v1 list: https://developer.paypal.com/docs/api/customer-disputes/v1/
 *
 * PayPal's Agent Toolkit (`@paypal/agent-toolkit`) is an LLM tool wrapper: it
 * exposes PayPal tools such as create_order, pay_order, create_refund and
 * list_disputes to a model. Money movement in Handshake must be deterministic
 * and callable without an LLM, so the toolkit is not in this execution path;
 * this provider mirrors the same capability names from the agent tools
 * reference instead.
 */
export class PayPalSandboxProvider implements PaymentProvider {
  readonly name = "PAYPAL_SANDBOX" as const;
  readonly simulated = false;
  private readonly client: PaypalHttpClient;

  constructor(private readonly options: PayPalSandboxOptions) {
    this.client =
      options.http ??
      new PaypalHttpClient({
        apiBase: options.apiBase,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries,
        fetchImpl: options.fetchImpl as FetchLike | undefined,
        sleep: options.sleep,
        now: options.now,
        random: options.random,
      });
  }

  async createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
    const amountDecimal = toWireAmount(input.amountMinor);
    const returnUrl = input.returnUrl ?? this.options.defaultReturnUrl;
    const cancelUrl = input.cancelUrl ?? this.options.defaultCancelUrl;

    const response = await this.client.request<unknown>({
      method: "POST",
      path: "/v2/checkout/orders",
      idempotencyKey: input.idempotencyKey,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.referenceId.slice(0, 255),
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: amountDecimal },
          },
        ],
        ...(returnUrl && cancelUrl
          ? {
              application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
              },
            }
          : {}),
      },
    });

    const order = this.parseOrder(response.body);
    return {
      provider: this.name,
      simulated: false,
      orderId: order.id,
      status: ORDER_STATUS[order.status] ?? "UNKNOWN",
      amountMinor: input.amountMinor,
      amountDecimal,
      currency: input.currency,
      payerActionUrl: approveLink(order) ?? null,
      captureId: captureIdOf(order),
    };
  }

  async captureOrder(input: CaptureOrderInput): Promise<PaymentOrder> {
    const response = await this.client.request<unknown>({
      method: "POST",
      path: `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
      idempotencyKey: input.idempotencyKey,
      body: {},
    });

    const order = this.parseOrder(response.body);
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      provider: this.name,
      simulated: false,
      orderId: order.id,
      status: ORDER_STATUS[order.status] ?? "UNKNOWN",
      amountMinor: capture?.amount ? parseWireAmount(capture.amount.value) : 0,
      amountDecimal: capture?.amount?.value ?? toWireAmount(0),
      currency: assertUsd(capture?.amount?.currency_code ?? "USD"),
      payerActionUrl: approveLink(order) ?? null,
      captureId: capture?.id ?? null,
    };
  }

  async getOrder(orderId: string): Promise<PaymentOrder> {
    const response = await this.client.request<unknown>({
      method: "GET",
      path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    });

    const order = this.parseOrder(response.body);
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    return {
      provider: this.name,
      simulated: false,
      orderId: order.id,
      status: ORDER_STATUS[order.status] ?? "UNKNOWN",
      amountMinor: capture?.amount ? parseWireAmount(capture.amount.value) : 0,
      amountDecimal: capture?.amount?.value ?? toWireAmount(0),
      currency: assertUsd(capture?.amount?.currency_code ?? "USD"),
      payerActionUrl: approveLink(order) ?? null,
      captureId: capture?.id ?? null,
    };
  }

  async refund(input: RefundInput): Promise<RefundReceipt> {
    const amount = input.amountMinor === undefined ? undefined : toWireAmount(input.amountMinor);
    const response = await this.client.request<unknown>({
      method: "POST",
      path: `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
      idempotencyKey: input.idempotencyKey,
      body: {
        ...(amount ? { amount: { value: amount, currency_code: "USD" } } : {}),
        ...(input.note ? { note_to_payer: input.note.slice(0, 255) } : {}),
      },
    });

    const refund = this.parseRefund(response.body);
    return {
      provider: this.name,
      simulated: false,
      refundId: refund.id,
      captureId: input.captureId,
      status: REFUND_STATUS[refund.status] ?? "FAILED",
      amountMinor: refund.amount ? parseWireAmount(refund.amount.value) : (input.amountMinor ?? 0),
      amountDecimal: refund.amount?.value ?? toWireAmount(input.amountMinor ?? 0),
      currency: assertUsd(refund.amount?.currency_code ?? "USD"),
    };
  }

  async listDisputes(input: ListDisputesInput = {}): Promise<DisputeSummary[]> {
    const response = await this.client.request<unknown>({
      method: "GET",
      path: "/v1/customer/disputes",
      query: {
        page: input.page ?? 1,
        page_size: input.pageSize ?? 10,
        dispute_state: input.disputeState,
      },
    });

    const parsed = DisputesSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned an unexpected disputes response", {
        details: parsed.error.issues,
      });
    }

    return (parsed.data.items ?? []).map((item) => ({
      disputeId: item.dispute_id,
      reason: item.reason ?? "UNKNOWN",
      status: item.status ?? "UNKNOWN",
      state: item.dispute_state ?? "UNKNOWN",
      stage: item.dispute_life_cycle_stage ?? null,
      channel: item.dispute_channel ?? null,
      amountMinor: item.dispute_amount ? parseWireAmount(item.dispute_amount.value) : 0,
      currency: assertUsd(item.dispute_amount?.currency_code ?? "USD"),
      createdAt: item.create_time ?? "",
      updatedAt: item.update_time ?? "",
    }));
  }

  capabilities(): PaymentCapabilities {
    return {
      provider: this.name,
      simulated: false,
      orders: true,
      refunds: true,
      disputes: true,
      webhooks: true,
      notes: [
        "Orders v2 create, capture and get are implemented against the documented endpoints.",
        "Refunds use Payments v2 POST /v2/payments/captures/{capture_id}/refund.",
        "Disputes are read through Disputes v1; merchants cannot create disputes in the live environment.",
        "Webhook verification is available through the documented verify-webhook-signature endpoint when PAYPAL_WEBHOOK_ID is set.",
      ],
    };
  }

  private parseOrder(body: unknown): z.infer<typeof OrderSchema> {
    const parsed = OrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned an unexpected order response", {
        details: parsed.error.issues,
      });
    }
    return parsed.data;
  }

  private parseRefund(body: unknown): z.infer<typeof RefundSchema> {
    const parsed = RefundSchema.safeParse(body);
    if (!parsed.success) {
      throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned an unexpected refund response", {
        details: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}

function approveLink(order: z.infer<typeof OrderSchema>): string | undefined {
  return order.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
}

function captureIdOf(order: z.infer<typeof OrderSchema>): string | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
}
