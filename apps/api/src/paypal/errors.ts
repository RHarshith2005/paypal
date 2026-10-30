/**
 * Typed PayPal failures. Every adapter call fails with a PaypalError so callers
 * never have to inspect `fetch` responses or PayPal's error shape, and so the
 * deal pipeline can decide deterministically whether a failure is retryable.
 */
export const PAYPAL_ERROR_KINDS = [
  "NOT_CONFIGURED",
  "AUTH",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "SERVER",
  "NETWORK",
  "TIMEOUT",
  "MALFORMED_RESPONSE",
  "UNSUPPORTED",
] as const;

export type PaypalErrorKind = (typeof PAYPAL_ERROR_KINDS)[number];

export interface PaypalErrorOptions {
  status?: number;
  /** PayPal's `issue` code, for example ORDER_ALREADY_CAPTURED. */
  issue?: string;
  debugId?: string;
  paypalErrorName?: string;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

const RETRYABLE: ReadonlySet<PaypalErrorKind> = new Set(["SERVER", "NETWORK", "TIMEOUT"]);

export class PaypalError extends Error {
  override readonly name = "PaypalError";
  readonly kind: PaypalErrorKind;
  readonly status: number | null;
  readonly issue: string | null;
  readonly debugId: string | null;
  readonly paypalErrorName: string | null;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(kind: PaypalErrorKind, message: string, options: PaypalErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.kind = kind;
    this.status = options.status ?? null;
    this.issue = options.issue ?? null;
    this.debugId = options.debugId ?? null;
    this.paypalErrorName = options.paypalErrorName ?? null;
    this.retryable = options.retryable ?? RETRYABLE.has(kind);
    this.details = options.details ?? null;
  }

  /** Stable, log-safe summary: no credentials, no request bodies. */
  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      message: this.message,
      status: this.status,
      issue: this.issue,
      debugId: this.debugId,
      paypalErrorName: this.paypalErrorName,
      retryable: this.retryable,
    };
  }
}

export function isPaypalError(error: unknown): error is PaypalError {
  return error instanceof PaypalError;
}

export function toPaypalError(error: unknown): PaypalError {
  if (isPaypalError(error)) return error;
  if (error instanceof Error) {
    return new PaypalError("NETWORK", error.message, { cause: error });
  }
  return new PaypalError("NETWORK", "unknown PayPal failure", { cause: error });
}
