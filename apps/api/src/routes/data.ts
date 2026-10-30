import { DealViewSchema, DisputeSchema, LedgerListSchema, MandateListSchema } from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../db/client";
import { HttpError } from "../http/errors";
import { parseOrThrow } from "../http/validate";

const IdParamsSchema = z.object({ id: z.string().min(3).max(80) });

export function registerDataRoutes(app: FastifyInstance, store: Store): void {
  app.get("/mandates", async () => {
    const mandates = await store.listMandateViews();
    return MandateListSchema.parse({ mandates });
  });

  app.get("/ledger", async () => {
    const entries = await store.listLedgerEntries();
    return LedgerListSchema.parse({ entries });
  });

  app.get("/deals/:id", async (request) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const deal = await store.getDeal(id);
    if (!deal) throw new HttpError(404, "DEAL_NOT_FOUND", `No deal exists with id ${id}`);
    return DealViewSchema.parse(deal);
  });

  app.get("/disputes/:id", async (request) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const dispute = await store.getDispute(id);
    if (!dispute) throw new HttpError(404, "DISPUTE_NOT_FOUND", `No dispute exists with id ${id}`);
    return DisputeSchema.parse(dispute);
  });
}
