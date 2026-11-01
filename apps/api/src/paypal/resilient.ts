import { isPaypalError } from "./errors";
import type {
  CaptureOrderInput,
  CreateOrderInput,
  DisputeSummary,
  ListDisputesInput,
  PaymentCapabilities,
  PaymentOrder,
  PaymentProvider,
  ProviderName,
  RefundInput,
  RefundReceipt,
} from "./types";

export interface FallbackStatus {
  fallback: boolean;
  reason: string | null;
}

/**
 * Runs the real sandbox adapter and falls back to the labelled mock only when the
 * sandbox cannot be reached at order-creation time.
 *
 * The limit is deliberate: once PayPal has an order id, a network failure during
 * capture is reported as a failure. Silently switching adapters at that point
 * would produce a receipt claiming a mock capture for an order PayPal may still
 * hold, which is exactly the kind of unverifiable claim this project refuses to
 * make. The fallback is therefore visible in `/health`, on every deal page, and
 * in the payment row of the receipt.
 */
export class ResilientPaymentProvider implements PaymentProvider {
  private useMock = false;
  private reason: string | null = null;
  private readonly orderProviders = new Map<string, ProviderName>();

  constructor(
    private readonly primary: PaymentProvider,
    private readonly backup: PaymentProvider,
  ) {}

  get name(): ProviderName {
    return this.useMock ? this.backup.name : this.primary.name;
  }

  get simulated(): boolean {
    return this.useMock ? this.backup.simulated : this.primary.simulated;
  }

  runtimeStatus(): FallbackStatus {
    return { fallback: this.useMock, reason: this.reason };
  }

  private isUnreachable(error: unknown): boolean {
    return isPaypalError(error) && (error.kind === "NETWORK" || error.kind === "TIMEOUT");
  }

  async createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
    if (this.useMock) {
      const order = await this.backup.createOrder(input);
      this.orderProviders.set(order.orderId, this.backup.name);
      return order;
    }

    try {
      const order = await this.primary.createOrder(input);
      this.orderProviders.set(order.orderId, this.primary.name);
      return order;
    } catch (error) {
      if (!this.isUnreachable(error)) throw error;
      this.useMock = true;
      this.reason = `${isPaypalError(error) ? error.kind : "NETWORK"}: ${error instanceof Error ? error.message : "sandbox unreachable"}`;
      const order = await this.backup.createOrder(input);
      this.orderProviders.set(order.orderId, this.backup.name);
      return order;
    }
  }

  private providerFor(orderId: string): PaymentProvider {
    return this.orderProviders.get(orderId) === this.backup.name ? this.backup : this.useMock ? this.backup : this.primary;
  }

  captureOrder(input: CaptureOrderInput): Promise<PaymentOrder> {
    return this.providerFor(input.orderId).captureOrder(input);
  }

  getOrder(orderId: string): Promise<PaymentOrder> {
    return this.providerFor(orderId).getOrder(orderId);
  }

  refund(input: RefundInput): Promise<RefundReceipt> {
    return this.useMock ? this.backup.refund(input) : this.primary.refund(input);
  }

  listDisputes(input?: ListDisputesInput): Promise<DisputeSummary[]> {
    const provider = this.useMock ? this.backup : this.primary;
    if (!provider.listDisputes) return Promise.reject(new Error(`${provider.name} has no dispute listing`));
    return provider.listDisputes(input);
  }

  capabilities(): PaymentCapabilities {
    const active = this.useMock ? this.backup : this.primary;
    const capabilities = active.capabilities();
    return {
      ...capabilities,
      notes: this.useMock
        ? [...capabilities.notes, `Fell back from the PayPal sandbox: ${this.reason ?? "unreachable"}`]
        : capabilities.notes,
    };
  }
}
