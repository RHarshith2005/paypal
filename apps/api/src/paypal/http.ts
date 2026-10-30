import { z } from "zod";
import { PaypalError } from "./errors";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface PaypalHttpOptions {
  apiBase: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  timeoutMs?: number;
  /** Retries after the first attempt. Applies to 5xx, network and timeout failures only. */
  maxRetries?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface PaypalRequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Sent as PayPal-Request-Id. Omitted for reads. */
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
}

export interface PaypalResponse<T> {
  status: number;
  body: T;
  headers: Headers;
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
  token_type: z.string().optional(),
});

const PaypalErrorBodySchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  issue: z.string().optional(),
  debug_id: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  details: z
    .array(
      z.object({
        issue: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

const TOKEN_SAFETY_WINDOW_MS = 60_000;
const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 4_000;
const RETRY_AFTER_CAP_MS = 5_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Minimal PayPal REST client.
 *
 * - OAuth client-credentials token with a cache (refreshed 60s before expiry,
 *   concurrent callers share one in-flight request).
 * - `PayPal-Request-Id` on every write.
 * - Retry with exponential backoff and jitter for 5xx, network and timeout
 *   failures only. A 4xx is never retried: it is a caller error.
 * - One transparent token refresh on 401.
 *
 * Reference: https://developer.paypal.com/api/rest/authentication/
 */
export class PaypalHttpClient {
  private token: CachedToken | null = null;
  private tokenPromise: Promise<string> | null = null;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: PaypalHttpOptions) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private get base(): string {
    return this.options.apiBase.replace(/\/+$/, "");
  }

  async request<T>(options: PaypalRequestOptions): Promise<PaypalResponse<T>> {
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new PaypalError(
        "NOT_CONFIGURED",
        "PayPal sandbox credentials are missing: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
      );
    }

    const url = new URL(`${this.base}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let attempt = 0;
    let refreshedToken = false;
    let retryAfterMs: number | null = null;

    for (;;) {
      const token = await this.accessToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.idempotencyKey) headers["PayPal-Request-Id"] = options.idempotencyKey;

      try {
        const response = await this.fetchImpl(url.toString(), {
          method: options.method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const text = await response.text();

        if (response.status === 401 && !refreshedToken) {
          // Expired or revoked token: drop it and retry once with a fresh one.
          this.token = null;
          refreshedToken = true;
          continue;
        }

        if (response.status >= 500) {
          const error = this.httpError(response.status, text);
          if (attempt < this.maxRetries) {
            retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
            await this.backoff(attempt, retryAfterMs);
            attempt += 1;
            continue;
          }
          throw error;
        }

        if (!response.ok) throw this.httpError(response.status, text);

        return { status: response.status, body: this.parseBody<T>(text), headers: response.headers };
      } catch (error) {
        if (error instanceof PaypalError) throw error;
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        if (attempt < this.maxRetries) {
          await this.backoff(attempt, null);
          attempt += 1;
          continue;
        }
        throw new PaypalError(
          timedOut ? "TIMEOUT" : "NETWORK",
          timedOut
            ? `PayPal did not respond within ${this.timeoutMs}ms`
            : `PayPal request failed: ${error instanceof Error ? error.message : "unknown network error"}`,
          { cause: error },
        );
      }
    }
  }

  /** Force the next call to mint a new token. Used by the smoke script between phases. */
  invalidateToken(): void {
    this.token = null;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.token;
    if (!this.tokenPromise) {
      this.tokenPromise = this.fetchToken().finally(() => {
        this.tokenPromise = null;
      });
    }
    return this.tokenPromise;
  }

  private async fetchToken(): Promise<string> {
    const clientId = this.options.clientId;
    const clientSecret = this.options.clientSecret;
    if (!clientId || !clientSecret) {
      throw new PaypalError("NOT_CONFIGURED", "PayPal credentials are missing.");
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PaypalError("NETWORK", "Could not reach PayPal to request an OAuth token", { cause: error });
    }

    const text = await response.text();
    if (!response.ok) {
      const parsed = PaypalErrorBodySchema.safeParse(this.tryJson(text));
      throw new PaypalError(response.status === 401 ? "AUTH" : "SERVER", "PayPal OAuth token request failed", {
        status: response.status,
        issue: parsed.success ? (parsed.data.error ?? parsed.data.issue ?? null) : null,
        details: parsed.success ? parsed.data : text.slice(0, 400),
      });
    }

    const parsed = TokenResponseSchema.safeParse(this.tryJson(text));
    if (!parsed.success) {
      throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned an unexpected OAuth token response", {
        details: parsed.error.issues,
      });
    }

    const ttlMs = Math.max(30_000, parsed.data.expires_in * 1000 - TOKEN_SAFETY_WINDOW_MS);
    this.token = { token: parsed.data.access_token, expiresAt: this.now() + ttlMs };
    return this.token.token;
  }

  private async backoff(attempt: number, retryAfterMs: number | null): Promise<void> {
    if (retryAfterMs !== null) {
      await this.sleep(Math.min(retryAfterMs, RETRY_AFTER_CAP_MS));
      return;
    }
    const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
    await this.sleep(exponential + Math.floor(this.random() * 100));
  }

  private httpError(status: number, text: string): PaypalError {
    const parsed = PaypalErrorBodySchema.safeParse(this.tryJson(text));
    const data = parsed.success ? parsed.data : null;
    const issue = data?.details?.[0]?.issue ?? data?.issue ?? null;
    const message = data?.message ?? data?.error_description ?? data?.error ?? `PayPal returned HTTP ${status}`;
    const kind: PaypalErrorKindLocal =
      status === 401 || status === 403
        ? "AUTH"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : status >= 500
              ? "SERVER"
              : "VALIDATION";

    return new PaypalError(kind, message, {
      status,
      issue,
      debugId: data?.debug_id ?? null,
      paypalErrorName: data?.name ?? null,
      details: data?.details ?? null,
    });
  }

  private parseBody<T>(text: string): T {
    if (text.trim().length === 0) return {} as T;
    const parsed = this.tryJson(text);
    if (parsed === null) {
      throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned a body that is not JSON", {
        details: text.slice(0, 200),
      });
    }
    return parsed as T;
  }

  private tryJson(text: string): unknown {
    if (text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

type PaypalErrorKindLocal = "AUTH" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "SERVER";

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
