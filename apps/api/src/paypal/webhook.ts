import { z } from "zod";
import { PaypalError } from "./errors";
import type { PaypalHttpClient } from "./http";

export const WebhookEventSchema = z
  .object({
    id: z.string().min(1),
    event_type: z.string().min(1),
    resource_type: z.string().optional(),
    resource: z.unknown().optional(),
    create_time: z.string().optional(),
  })
  .loose();
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export interface PaypalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

export type WebhookVerificationStatus = "SUCCESS" | "FAILURE" | "SKIPPED";

export interface WebhookVerification {
  verified: boolean;
  status: WebhookVerificationStatus;
  reason: string | null;
  event: { id: string; eventType: string } | null;
}

const VerificationResponseSchema = z.object({
  verification_status: z.string().min(1),
});

type HeaderBag = Record<string, string | string[] | undefined>;

const headerValue = (headers: HeaderBag, name: string): string | null => {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
};

/** Map PayPal's delivery headers onto the fields the verifier needs. */
export function webhookHeadersFrom(headers: HeaderBag): PaypalWebhookHeaders | null {
  const transmissionId = headerValue(headers, "paypal-transmission-id");
  const transmissionTime = headerValue(headers, "paypal-transmission-time");
  const certUrl = headerValue(headers, "paypal-cert-url");
  const authAlgo = headerValue(headers, "paypal-auth-algo");
  const transmissionSig = headerValue(headers, "paypal-transmission-sig");
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return null;
  return { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig };
}

/**
 * Payback verification against the documented endpoint:
 * POST /v1/notifications/verify-webhook-signature
 *
 * This is PayPal's own fallback verification method; it requires the webhook id
 * from the listener URL's subscription. When PAYPAL_WEBHOOK_ID is not configured
 * the result is SKIPPED, never a silent pass.
 */
export async function verifyWebhookSignature(
  client: Pick<PaypalHttpClient, "request">,
  input: { webhookId: string | undefined; headers: PaypalWebhookHeaders; event: WebhookEvent | unknown },
): Promise<WebhookVerification> {
  const parsedEvent = WebhookEventSchema.safeParse(input.event);
  const event = parsedEvent.success ? { id: parsedEvent.data.id, eventType: parsedEvent.data.event_type } : null;

  if (!input.webhookId) {
    return {
      verified: false,
      status: "SKIPPED",
      reason: "PAYPAL_WEBHOOK_ID is not configured, so signatures cannot be verified.",
      event,
    };
  }

  const response = await client.request<unknown>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      transmission_id: input.headers.transmissionId,
      transmission_time: input.headers.transmissionTime,
      cert_url: input.headers.certUrl,
      auth_algo: input.headers.authAlgo,
      transmission_sig: input.headers.transmissionSig,
      webhook_id: input.webhookId,
      webhook_event: input.event,
    },
  });

  const parsed = VerificationResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw new PaypalError("MALFORMED_RESPONSE", "PayPal returned an unexpected webhook verification response", {
      details: parsed.error.issues,
    });
  }

  const verified = parsed.data.verification_status === "SUCCESS";
  return {
    verified,
    status: verified ? "SUCCESS" : "FAILURE",
    reason: verified ? null : `PayPal verification_status=${parsed.data.verification_status}`,
    event,
  };
}
