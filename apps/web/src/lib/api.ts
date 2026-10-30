import {
  ApiErrorSchema,
  DealViewSchema,
  DisputeSchema,
  HealthSchema,
  LedgerListSchema,
  MandateListSchema,
  type DealView,
  type Dispute,
  type Health,
  type LedgerList,
  type MandateList,
} from "@handshake/shared";
import type { z } from "zod";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string | null = null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiClientError(0, "API_UNREACHABLE", `Cannot reach the Handshake API at ${API_BASE_URL}.`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    throw new ApiClientError(response.status, "REQUEST_FAILED", `Request failed with status ${response.status}.`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(response.status, "INVALID_RESPONSE", "The API returned a response this UI cannot read.");
  }
  return parsed.data;
}

export const api = {
  health: (): Promise<Health> => request("/health", HealthSchema),
  mandates: (): Promise<MandateList> => request("/api/mandates", MandateListSchema),
  ledger: (): Promise<LedgerList> => request("/api/ledger", LedgerListSchema),
  deal: (dealId: string): Promise<DealView> => request(`/api/deals/${encodeURIComponent(dealId)}`, DealViewSchema),
  dispute: (disputeId: string): Promise<Dispute> =>
    request(`/api/disputes/${encodeURIComponent(disputeId)}`, DisputeSchema),
};
