import type { AppConfig } from "../config/env";
import { MockPaymentProvider } from "./mock";
import { ResilientPaymentProvider } from "./resilient";
import { PayPalSandboxProvider } from "./sandbox";
import type { FetchLike } from "./http";
import type { PaymentProvider } from "./types";

export { MockPaymentProvider } from "./mock";
export { PayPalSandboxProvider } from "./sandbox";
export { ResilientPaymentProvider } from "./resilient";
export { PaypalHttpClient } from "./http";
export { PaypalError, isPaypalError, toPaypalError, PAYPAL_ERROR_KINDS } from "./errors";
export { parseWireAmount, toWireAmount } from "./money";
export { verifyWebhookSignature, webhookHeadersFrom, WebhookEventSchema } from "./webhook";
export type {
  CaptureOrderInput,
  CreateOrderInput,
  DisputeSummary,
  ListDisputesInput,
  OrderStatus,
  PaymentCapabilities,
  PaymentOrder,
  PaymentProvider,
  ProviderName,
  RefundInput,
  RefundReceipt,
  RefundStatus,
} from "./types";

export interface PaymentProviderDeps {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * PAYPAL_MODE=sandbox with credentials yields the real sandbox adapter.
 * Everything else yields the labelled mock, so a missing credential can never
 * silently turn into a live payment path.
 */
export function createPaymentProvider(paypal: AppConfig["paypal"], deps: PaymentProviderDeps = {}): PaymentProvider {
  const configured = Boolean(paypal.clientId && paypal.clientSecret);
  if (paypal.mode === "sandbox" && configured) {
    return new ResilientPaymentProvider(
      new PayPalSandboxProvider({
        apiBase: paypal.apiBase,
        clientId: paypal.clientId,
        clientSecret: paypal.clientSecret,
        defaultReturnUrl: paypal.returnUrl,
        defaultCancelUrl: paypal.cancelUrl,
        timeoutMs: paypal.timeoutMs,
        maxRetries: paypal.maxRetries,
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep,
        now: deps.now,
      }),
      new MockPaymentProvider({ now: deps.now }),
    );
  }
  return new MockPaymentProvider({ now: deps.now });
}
