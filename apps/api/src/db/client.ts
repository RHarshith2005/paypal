import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { DealView, Dispute, LedgerEntry, Mandate, MandateView } from "@handshake/shared";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { projectRoot, type AppConfig, type DatabaseDriver } from "../config/env";
import { getDeal, getDispute, listLedgerEntries, listMandateViews, listMandates } from "./queries";
import { schema } from "./schema";

export interface DatabasePing {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export interface Store {
  readonly driver: DatabaseDriver;
  ping(): Promise<DatabasePing>;
  close(): Promise<void>;
  listMandates(): Promise<Mandate[]>;
  listMandateViews(now?: Date): Promise<MandateView[]>;
  listLedgerEntries(limit?: number): Promise<LedgerEntry[]>;
  getDeal(dealId: string): Promise<DealView | null>;
  getDispute(disputeId: string): Promise<Dispute | null>;
}

export async function createStore(config: AppConfig): Promise<Store> {
  if (config.database.url) {
    const pool = new Pool({ connectionString: config.database.url, max: 10 });
    const db = drizzleNodePg(pool, { schema });
    await migrateNodePg(db, { migrationsFolder: config.paths.migrations });
    return makeStore("postgres", db, async () => {
      await pool.end();
    });
  }

  const pglitePath =
    config.env.nodeEnv === "test"
      ? undefined
      : resolve(projectRoot, isAbsolute(config.database.pgliteDir) ? "" : config.database.pgliteDir);
  if (pglitePath) await mkdir(pglitePath, { recursive: true });
  const client = pglitePath ? new PGlite(pglitePath) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: config.paths.migrations });
  return makeStore("pglite", db, async () => {
    await client.close();
  });
}

/**
 * Both drivers are Drizzle Postgres databases with identical query builders, so
 * the store closes over the concrete instance and the rest of the app only sees
 * the Store interface. That keeps driver unions out of every repository call.
 */
function makeStore(driver: DatabaseDriver, db: Parameters<typeof listMandates>[0], close: () => Promise<void>): Store {
  return {
    driver,
    async ping(): Promise<DatabasePing> {
      const startedAt = performance.now();
      try {
        await db.execute(sql`select 1`);
        return { ok: true, latencyMs: Math.round(performance.now() - startedAt), error: null };
      } catch (error) {
        return {
          ok: false,
          latencyMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : "unknown database error",
        };
      }
    },
    close,
    listMandates: () => listMandates(db),
    listMandateViews: (now?: Date) => listMandateViews(db, now),
    listLedgerEntries: (limit?: number) => listLedgerEntries(db, limit),
    getDeal: (dealId: string) => getDeal(db, dealId),
    getDispute: (disputeId: string) => getDispute(db, disputeId),
  };
}
