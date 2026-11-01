import { DemoResetResponseSchema, DemoRunRequestSchema, DemoRunResponseSchema } from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import type { Db, listMandates } from "../db/queries";
import type { DisputeArbiter } from "../arbiter/service";
import type { DealOrchestrator } from "../deals/orchestrator";
import { HttpError } from "../http/errors";
import { parseOrThrow } from "../http/validate";
import { CASE_A_MANDATE_ID, CASE_B_MANDATE_ID, runDemoCase, type SeedDeps } from "../seed/demo";
import { resetDemoData } from "../seed/reset";

export interface DemoRouteDeps {
  db: Db;
  listMandates: () => ReturnType<typeof listMandates>;
  orchestrator: DealOrchestrator;
  arbiter: DisputeArbiter;
  now: () => Date;
}

/**
 * Demo data is generated, never fabricated: these endpoints run the real pipeline
 * (handshake, negotiation, PayPal adapter, dual-signed receipt, arbiter). The only
 * thing "seeded" is the signed mandate and which case to run.
 */
export function registerDemoRoutes(app: FastifyInstance, deps: DemoRouteDeps): void {
  const seedDeps: SeedDeps = {
    db: deps.db,
    orchestrator: deps.orchestrator,
    arbiter: deps.arbiter,
    now: deps.now,
  };

  app.post("/demo/run", async (request, reply) => {
    const { case: caseLabel } = parseOrThrow(DemoRunRequestSchema, request.body ?? {}, "request body");
    const mandates = await deps.listMandates();
    const required = caseLabel === "A" ? CASE_A_MANDATE_ID : CASE_B_MANDATE_ID;
    if (!mandates.some((mandate) => mandate.id === required)) {
      throw new HttpError(
        409,
        "DEMO_NOT_SEEDED",
        `This instance has no ${required} mandate. Reset the demo to rebuild the seeded cases.`,
      );
    }

    const run = await runDemoCase(seedDeps, caseLabel);
    reply.status(201);
    return DemoRunResponseSchema.parse({
      caseLabel: run.caseLabel,
      dealId: run.dealId,
      disputeId: run.disputeId,
      label: run.label,
    });
  });

  /**
   * Wipes generated deals, then reseeds the two cases. Agent keys are preserved so
   * attestations issued after the reset still verify against the same anchor.
   */
  app.post("/demo/reset", async (request) => {
    const result = await resetDemoData(seedDeps);
    request.log.info({ cleared: result.cleared }, "demo data reset");

    return DemoResetResponseSchema.parse({
      reset: true,
      cleared: result.cleared,
      seeded: result.seeded.map((run) => ({
        caseLabel: run.caseLabel,
        dealId: run.dealId,
        disputeId: run.disputeId,
        label: run.label,
      })),
    });
  });
}
