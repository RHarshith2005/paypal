import { canonicalJson, sha256Hex } from "@handshake/shared";
import { PaypalError } from "./errors";
import { toWireAmount } from "./money";
import type {
  CaptureOrderInput,
  CreateOrderInput,
  DisputeSummary,
  ListDisputesInput,
  PaymentCapabilities,
  PaymentOrder,
  PaymentProvider,
  RefundInput,
  RefundReceipt,
} from "./types";

interface MockOrder {
  orderId: string;
  amountMinor: number;
  currency: "USD";
  status: "CREATED" | "COMPLETED";
  captureId: string | null;
  refundedMinor: number;
  referenceId: string;
}

interface IdempotencyRecord {
  fingerprint: string;
  resultId: string;
}

export interface MockProviderOptions {
  now?: () => number;
}

/**
 * SIMULATED payment provider. It implements exactly the same interface,
 * idempotency rules and error kinds as the sandbox adapter, but no PayPal
 * account is contacted and no funds move. Every identifier is prefixed MOCK- so
 * a mock order can never be mistaken for a real one in the ledger or the UI.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "PAYPAL_MOCK" as const;
  readonly simulated = true;
  private readonly orders = new Map<string, MockOrder>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly now: () => number;

  constructor(options: MockProviderOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new PaypalError("VALIDATION", "amountMinor must be a positive integer");
    }
    if (input.currency !== "USD") {
      throw new PaypalError("UNSUPPORTED", `Handshake only supports USD, received ${input.currency}`);
    }

    const existing = this.replay(input.idempotencyKey, {
      op: "createOrder",
      amountMinor: input.amountMinor,
      referenceId: input.referenceId,
    });
    if (existing) return this.orderView(this.orders.get(existing.resultId)!);

    const orderId = `MOCK-ORDER-${this.digest(input.idempotencyKey, 17)}`;
    const order: MockOrder = {
      orderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "CREATED",
      captureId: null,
      refundedMinor: 0,
      referenceId: input.referenceId,
    };
    this.orders.set(orderId, order);
    this.remember(input.idempotencyKey, { op: "createOrder", amountMinor: input.amountMinor, referenceId: input.referenceId }, orderId);
    return this.orderView(order);
  }

  async captureOrder(input: CaptureOrderInput): Promise<PaymentOrder> {
    const existing = this.replay(input.idempotencyKey, { op: "captureOrder", orderId: input.orderId });
    if (existing) return this.orderView(this.orders.get(existing.resultId)!);

    const order = this.orders.get(input.orderId);
    if (!order) throw notFound(input.orderId);
    if (order.status === "COMPLETED") return this.orderView(order);

    order.status = "COMPLETED";
    order.captureId = `MOCK-CAPTURE-${this.digest(input.orderId, 17)}`;
    this.remember(input.idempotencyKey, { op: "captureOrder", orderId: input.orderId }, order.orderId);
    return this.orderView(order);
  }

  async getOrder(orderId: string): Promise<PaymentOrder> {
    const order = this.orders.get(orderId);
    if (!order) throw notFound(orderId);
    return this.orderView(order);
  }

  async refund(input: RefundInput): Promise<RefundReceipt> {
    const existing = this.replay(input.idempotencyKey, { op: "refund", captureId: input.captureId, amountMinor: input.amountMinor ?? null });
    if (existing) {
      const order = [...this.orders.values()].find((candidate) => candidate.captureId === input.captureId);
      return {
        provider: this.name,
        simulated: true,
        refundId: existing.resultId,
        captureId: input.captureId,
        status: "COMPLETED",
        amountMinor: input.amountMinor ?? order?.amountMinor ?? 0,
        amountDecimal: toWireAmount(input.amountMinor ?? order?.amountMinor ?? 0),
        currency: "USD",
      };
    }

    const order = [...this.orders.values()].find((candidate) => candidate.captureId === input.captureId);
    if (!order) throw notFound(input.captureId);
    if (order.status !== "COMPLETED") {
      throw new PaypalError("VALIDATION", `Order ${order.orderId} has not been captured yet`, {
        issue: "ORDER_NOT_CAPTURED",
      });
    }

    const amountMinor = input.amountMinor ?? order.amountMinor - order.refundedMinor;
    if (amountMinor <= 0) {
      throw new PaypalError("VALIDATION", "Refund amount must be positive", { issue: "REFUND_AMOUNT_INVALID" });
    }
    if (order.refundedMinor + amountMinor > order.amountMinor) {
      throw new PaypalError("VALIDATION", "Refund exceeds the captured amount", {
        issue: "REFUND_EXCEEDS_CAPTURE",
      });
    }

    order.refundedMinor += amountMinor;
    const refundId = `MOCK-REFUND-${this.digest(input.idempotencyKey, 17)}`;
    this.remember(input.idempotencyKey, { op: "refund", captureId: input.captureId, amountMinor }, refundId);

    return {
      provider: this.name,
      simulated: true,
      refundId,
      captureId: input.captureId,
      status: "COMPLETED",
      amountMinor,
      amountDecimal: toWireAmount(amountMinor),
      currency: "USD",
    };
  }

  async listDisputes(_input: ListDisputesInput = {}): Promise<DisputeSummary[]> {
    // SIMULATED: the mock merchant has no PayPal case history.
    return [];
  }

  capabilities(): PaymentCapabilities {
    return {
      provider: this.name,
      simulated: true,
      orders: true,
      refunds: true,
      disputes: false,
      webhooks: false,
      notes: [
        "SIMULATED: no PayPal account is contacted and no funds move.",
        "Same interface, idempotency behaviour and error kinds as the sandbox provider.",
        "Dispute listing returns an empty list: there is no PayPal case history in mock mode.",
      ],
    };
  }

  private orderView(order: MockOrder): PaymentOrder {
    return {
      provider: this.name,
      simulated: true,
      orderId: order.orderId,
      status: order.status,
      amountMinor: order.amountMinor,
      amountDecimal: toWireAmount(order.amountMinor),
      currency: order.currency,
      payerActionUrl: order.status === "CREATED" ? `mock://paypal/approve/${order.orderId}` : null,
      captureId: order.captureId,
    };
  }

  private replay(key: string, request: unknown): IdempotencyRecord | null {
    const existing = this.idempotency.get(key);
    if (!existing) return null;
    if (existing.fingerprint !== sha256Hex(canonicalJson(request))) {
      throw new PaypalError("CONFLICT", `PayPal-Request-Id ${key} was already used for a different request`, {
        issue: "IDEMPOTENCY_KEY_REUSED",
      });
    }
    return existing;
  }

  private remember(key: string, request: unknown, resultId: string): void {
    this.idempotency.set(key, { fingerprint: sha256Hex(canonicalJson(request)), resultId });
  }

  private digest(value: string, length: number): string {
    return sha256Hex(`${value}:${this.now()}`).slice(0, length).toUpperCase();
  }
}

function notFound(id: string): PaypalError {
  return new PaypalError("NOT_FOUND", `No PayPal resource exists with id ${id}`, { status: 404 });
}
