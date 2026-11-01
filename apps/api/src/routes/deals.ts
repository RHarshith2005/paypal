import {
  AgentTrustListSchema,
  DealListResponseSchema,
  DealRunResponseSchema,
  DisputeViewSchema,
  OpenDisputeRequestSchema,
  RunDealRequestSchema,
  TRUST_BASE,
  TRUST_EVENT_DELTA,
  TRUST_NEGATIVE_CAP,
  TRUST_POSITIVE_CAP,
  computeTrust,
  type DealEvent,
} from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DisputeArbiter } from "../arbiter/service";
import type { AppConfig } from "../config/env";
import type { Store } from "../db/client";
import { listDealSummaries } from "../db/queries";
import { getEvidencePacketRow, listAgentRows, listTrustRows } from "../db/writes";
import type { DealEventBus } from "../deals/events";
import type { DealOrchestrator } from "../deals/orchestrator";
import { HttpError } from "../http/errors";
import { parseOrThrow } from "../http/validate";

const IdParamsSchema = z.object({ id: z.string().min(3).max(80) });

export interface DealRouteDeps {
  store: Store;
  config: AppConfig;
  orchestrator: DealOrchestrator;
  arbiter: DisputeArbiter;
  bus: DealEventBus;
}

export function registerDealRoutes(app: FastifyInstance, deps: DealRouteDeps): void {
  const { store, config, orchestrator, arbiter, bus } = deps;

  app.post("/deals", async (request, reply) => {
    const input = parseOrThrow(RunDealRequestSchema, request.body ?? {}, "request body");
    const dealId = await orchestrator.create(input);
    // The run continues in the background; the client follows it over SSE.
    void orchestrator.run(dealId);
    reply.status(202);
    return DealRunResponseSchema.parse({
      dealId,
      status: "CREATED",
      statusUrl: `/api/deals/${dealId}`,
      eventsUrl: `/api/deals/${dealId}/events`,
    });
  });

  app.get("/deals", async () => {
    return DealListResponseSchema.parse({ deals: await listDealSummaries(store.db, 25) });
  });

  app.post("/deals/:id/resume", async (request, reply) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const existing = await store.getDeal(id);
    if (!existing) throw new HttpError(404, "DEAL_NOT_FOUND", `No deal exists with id ${id}`);
    void orchestrator.run(id);
    reply.status(202);
    return DealRunResponseSchema.parse({
      dealId: id,
      status: existing.deal.status,
      statusUrl: `/api/deals/${id}`,
      eventsUrl: `/api/deals/${id}/events`,
    });
  });

  /**
   * Server-sent events. The persisted event log is replayed first, so a client
   * that connects after the deal finished still sees the whole story, and a
   * reconnect never depends on catching a live broadcast.
   */
  app.get("/deals/:id/events", async (request, reply) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const existing = await store.getDeal(id);
    if (!existing) throw new HttpError(404, "DEAL_NOT_FOUND", `No deal exists with id ${id}`);

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "access-control-allow-origin": config.env.webOrigin,
    });
    reply.hijack();

    const write = (event: DealEvent): void => {
      reply.raw.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of existing.deal.events) write(event);

    const unsubscribe = bus.subscribe(id, write);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post("/deals/:id/disputes", async (request) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const input = parseOrThrow(OpenDisputeRequestSchema, request.body ?? {}, "request body");
    const existing = await store.getDeal(id);
    if (!existing) throw new HttpError(404, "DEAL_NOT_FOUND", `No deal exists with id ${id}`);

    const dispute = await arbiter.open(id, input);
    const packet = await getEvidencePacketRow(store.db, dispute.id);
    return DisputeViewSchema.parse({ dispute, packet: packet?.packet ?? null });
  });

  app.get("/agents", async () => {
    const [agents, trustRows] = await Promise.all([listAgentRows(store.db), listTrustRows(store.db)]);
    const views = [];
    for (const agent of agents) {
      if (agent.kind === "ARBITER") continue;
      const trust = trustRows.find((row) => row.agentId === agent.id);
      const breakdown = computeTrust(trust?.events ?? []);
      views.push({
        agentId: agent.id,
        kind: agent.kind,
        displayName: agent.displayName,
        score: breakdown.score,
        grade: breakdown.grade,
        positive: breakdown.positive,
        negative: breakdown.negative,
        events: trust?.events ?? [],
        formula: {
          base: TRUST_BASE,
          positiveCap: TRUST_POSITIVE_CAP,
          negativeCap: TRUST_NEGATIVE_CAP,
          deltas: TRUST_EVENT_DELTA,
        },
      });
    }
    return AgentTrustListSchema.parse({ agents: views });
  });
}
