import type { CatalogProduct, CatalogSource } from "@handshake/shared";

/**
 * A merchant's product source. Two implementations exist:
 *
 * - `FixtureProvider`: 30 realistic products in four categories with real stock
 *   levels. Labelled SIMULATED, because they are not real listings.
 * - `Channel3Provider`: the adapter for Channel3's commerce API. It is present so
 *   the interface and the wiring are real, but it deliberately refuses to call an
 *   endpoint this build could not verify against official documentation (see
 *   `docs/channel3.md`). It never falls back to invented URLs.
 */
export interface CatalogProvider {
  readonly source: CatalogSource;
  readonly simulated: boolean;
  readonly catalogId: string;
  readonly merchantAgentId: string;
  list(): Promise<CatalogProduct[]>;
  search(query: string, options?: { category?: string; limit?: number }): Promise<CatalogProduct[]>;
  get(sku: string): Promise<CatalogProduct | null>;
  categories(): Promise<string[]>;
  /** SHA-256 of the canonical catalog, used as the attestation binding. */
  hash(): Promise<string>;
  /** When the merchant last checked this inventory snapshot. */
  inventoryCheckedAt(): string;
}

export class CatalogUnavailableError extends Error {
  readonly code = "CATALOG_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}
