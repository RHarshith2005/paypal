import {
  AgentTrustListSchema,
  ApiErrorSchema,
  DealListResponseSchema,
  DealRunResponseSchema,
  DealViewSchema,
  DemoResetResponseSchema,
  DemoRunResponseSchema,
  DisputeListSchema,
  DisputeViewSchema,
  HealthSchema,
  LedgerListSchema,
  MandateCreateRequestSchema,
  MandateListSchema,
  MandateViewSchema,
  type AgentTrustList,
  type DealListResponse,
  type DealRunResponse,
  type DealView,
  type DemoCase,
  type DemoResetResponse,
  type DemoRunResponse,
  type DisputeList,
  type DisputeView,
  type Health,
  type LedgerList,
  type MandateCreateRequest,
  type MandateList,
  type MandateView,
} from "@handshake/shared";
import type { z } from "zod";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** Only needed when the API sets API_WRITE_TOKEN. Unset by default for the local demo. */
const WRITE_TOKEN = import.meta.env.VITE_WRITE_TOKEN as string | undefined;

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

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(WRITE_TOKEN ? { "x-handshake-write-token": WRITE_TOKEN } : {}),
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
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

const post = <T>(path: string, schema: z.ZodType<T>, payload: unknown): Promise<T> =>
  request(path, schema, { method: "POST", body: JSON.stringify(payload ?? {}) });

export interface RunDealInput {
  mandateId: string;
  merchantAgentId: string;
  hostileMerchant?: boolean;
  fulfillment?: "DELIVERED" | "NOT_DELIVERED" | "NOT_AS_DESCRIBED";
  misconfiguredAgent?: boolean;
}

export interface OpenDisputeInput {
  claimType: "GOODS_NOT_RECEIVED" | "NOT_AS_DESCRIBED" | "UNAUTHORIZED_CHARGE" | "MANDATE_BREACH";
  claim: string;
  openedBy: "BUYER" | "MERCHANT";
}

export const api = {
  health: (): Promise<Health> => request("/health", HealthSchema),
  mandates: (): Promise<MandateList> => request("/api/mandates", MandateListSchema),
  ledger: (): Promise<LedgerList> => request("/api/ledger", LedgerListSchema),
  deals: (): Promise<DealListResponse> => request("/api/deals", DealListResponseSchema),
  agents: (): Promise<AgentTrustList> => request("/api/agents", AgentTrustListSchema),
  deal: (dealId: string): Promise<DealView> => request(`/api/deals/${encodeURIComponent(dealId)}`, DealViewSchema),
  runDeal: (input: RunDealInput): Promise<DealRunResponse> => post("/api/deals", DealRunResponseSchema, input),
  resumeDeal: (dealId: string): Promise<DealRunResponse> =>
    post(`/api/deals/${encodeURIComponent(dealId)}/resume`, DealRunResponseSchema, {}),
  dispute: (disputeId: string): Promise<DisputeView> =>
    request(`/api/disputes/${encodeURIComponent(disputeId)}`, DisputeViewSchema),
  disputes: (): Promise<DisputeList> => request("/api/disputes", DisputeListSchema),
  openDispute: (dealId: string, input: OpenDisputeInput): Promise<DisputeView> =>
    post(`/api/deals/${encodeURIComponent(dealId)}/disputes`, DisputeViewSchema, input),
  createMandate: (input: MandateCreateRequest): Promise<MandateView> =>
    post("/api/mandates", MandateViewSchema, MandateCreateRequestSchema.parse(input)),
  runDemo: (caseLabel: DemoCase): Promise<DemoRunResponse> =>
    post("/api/demo/run", DemoRunResponseSchema, { case: caseLabel }),
  resetDemo: (): Promise<DemoResetResponse> => post("/api/demo/reset", DemoResetResponseSchema, {}),
  /** Full URL for the SSE stream; EventSource needs an absolute URL. */
  eventsUrl: (dealId: string): string => `${API_BASE_URL}/api/deals/${encodeURIComponent(dealId)}/events`,
};
