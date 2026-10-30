import type { PaypalErrorKind } from "./errors";

export type ProviderName = "PAYPAL_SANDBOX" | "PAYPAL_MOCK";

/** PayPal order states we act on. Anything else maps to UNKNOWN, never guessed. */
export type OrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "PAYER_ACTION_REQUIRED" | "FAILED" | "UNKNOWN";

export type RefundStatus = "COMPLETED" | "PENDING" | "FAILED";

export interface CreateOrderInput {
  /** Integer minor units. Converted to a decimal string at the adapter edge. */
  amountMinor: number;
  currency: "USD";
  /** Deal id this order belongs to; sent as purchase_units[].reference_id. */
  referenceId: string;
  description: string;
  /** PayPal-Request-Id. Mandatory: every money movement is idempotent. */
  idempotencyKey: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentOrder {
  provider: ProviderName;
  /** True whenever funds did not move on PayPal. Mirrors provider === PAYPAL_MOCK. */
  simulated: boolean;
  orderId: string;
  status: OrderStatus;
  amountMinor: number;
  /** Decimal string exactly as PayPal received or returned it. */
  amountDecimal: string;
  currency: "USD";
  /** PayPal `approve` link; null once the order is captured. */
  payerActionUrl: string | null;
  captureId: string | null;
}

export interface CaptureOrderInput {
  orderId: string;
  idempotencyKey: string;
}

export interface RefundInput {
  captureId: string;
  /** Omit for a full refund. */
  amountMinor?: number;
  note?: string;
  idempotencyKey: string;
}

export interface RefundReceipt {
  provider: ProviderName;
  simulated: boolean;
  refundId: string;
  captureId: string;
  status: RefundStatus;
  amountMinor: number;
  amountDecimal: string;
  currency: "USD";
}

export interface ListDisputesInput {
  page?: number;
  pageSize?: number;
  /** PayPal dispute_state, for example OPEN_INQUIRIES or REQUIRED_ACTION. */
  disputeState?: string;
}

export interface DisputeSummary {
  disputeId: string;
  reason: string;
  status: string;
  state: string;
  stage: string | null;
  channel: string | null;
  amountMinor: number;
  currency: "USD";
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCapabilities {
  provider: ProviderName;
  simulated: boolean;
  orders: boolean;
  refunds: boolean;
  disputes: boolean;
  webhooks: boolean;
  notes: string[];
}

export interface PaymentProvider {
  readonly name: ProviderName;
  readonly simulated: boolean;
  createOrder(input: CreateOrderInput): Promise<PaymentOrder>;
  captureOrder(input: CaptureOrderInput): Promise<PaymentOrder>;
  getOrder(orderId: string): Promise<PaymentOrder>;
  refund(input: RefundInput): Promise<RefundReceipt>;
  /** Optional because not every provider exposes dispute search. */
  listDisputes?(input?: ListDisputesInput): Promise<DisputeSummary[]>;
  capabilities(): PaymentCapabilities;
}

export type { PaypalErrorKind };
