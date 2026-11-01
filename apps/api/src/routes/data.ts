import {
  DealViewSchema,
  DisputeListSchema,
  DisputeViewSchema,
  LedgerListSchema,
  MandateCreateRequestSchema,
  MandateListSchema,
  MandateViewSchema,
} from "@handshake/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../db/client";
import { listDisputeRows, listMandateViews } from "../db/queries";
import { getEvidencePacketRow, insertMandate } from "../db/writes";
import { HttpError } from "../http/errors";
import { parseOrThrow } from "../http/validate";
import { newId } from "../lib/ids";
import { ensureDemoKeys, signDemoMandate } from "../services/keys";

const IdParamsSchema = z.object({ id: z.string().min(3).max(80) });

export function registerDataRoutes(app: FastifyInstance, store: Store): void {
  app.get("/mandates", async () => {
    const mandates = await store.listMandateViews();
    return MandateListSchema.parse({ mandates });
  });

  /**
   * Mandate builder. The principal's key signs exactly the terms the form shows;
   * the response is read back from the database so the UI preview is the stored
   * mandate, not the request echoed.
   */
  app.post("/mandates", async (request, reply) => {
    const input = parseOrThrow(MandateCreateRequestSchema, request.body ?? {}, "request body");
    const keys = await ensureDemoKeys(store.db);
    const now = new Date();

    const mandate = signDemoMandate(
      {
        id: newId("mnd_"),
        maxTotal: input.maxTotal,
        perItemMax: input.perItemMax,
        maxTransactions: input.maxTransactions,
        allowedCategories: input.allowedCategories,
        forbiddenSubstitutions: input.forbiddenSubstitutions,
        merchantAllowlist: input.merchantAllowlist,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + input.expiresInMinutes * 60_000).toISOString(),
        nonce: `${newId("nonce_").slice("nonce_".length)}`,
      },
      keys.principal,
    );

    await insertMandate(store.db, mandate);
    const views = await listMandateViews(store.db, now);
    const created = views.find((view) => view.mandate.id === mandate.id);
    if (!created) throw new HttpError(500, "MANDATE_NOT_READABLE", "mandate was signed but could not be read back");
    reply.status(201);
    return MandateViewSchema.parse(created);
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

  app.get("/disputes", async () => {
    const rows = await listDisputeRows(store.db);
    const disputes = [];
    for (const row of rows) {
      const dispute = await store.getDispute(row.id);
      if (!dispute) continue;
      const packet = await getEvidencePacketRow(store.db, row.id);
      disputes.push({
        dispute,
        packet: packet?.packet ?? null,
        caseLabel: row.caseLabel,
      });
    }
    return DisputeListSchema.parse({ disputes });
  });

  app.get("/disputes/:id", async (request) => {
    const { id } = parseOrThrow(IdParamsSchema, request.params, "path parameters");
    const dispute = await store.getDispute(id);
    if (!dispute) throw new HttpError(404, "DISPUTE_NOT_FOUND", `No dispute exists with id ${id}`);
    const packet = await getEvidencePacketRow(store.db, id);
    return DisputeViewSchema.parse({ dispute, packet: packet?.packet ?? null });
  });
}
