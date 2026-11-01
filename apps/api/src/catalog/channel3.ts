import type { CatalogProduct } from "@handshake/shared";
import { CatalogUnavailableError, type CatalogProvider } from "./types";

export interface Channel3Config {
  apiKey: string | undefined;
  /** Base URL of the Channel3 API, as documented by Channel3. */
  apiBase: string | undefined;
  merchantAgentId: string;
}

/**
 * Channel3 adapter.
 *
 * Rule 3 of this project is that endpoints and fields are never invented. The
 * Channel3 documentation site is client-rendered and its `/docs` path returns
 * 404 to a plain fetch, so this build could not verify a single endpoint path or
 * response shape against the official spec. Rather than guess a URL — which would
 * send a real API key to an unverified host — this provider refuses to run and
 * explains why. `docs/channel3.md` records exactly what is missing and what to
 * implement once the documented contract is available.
 *
 * The demo therefore always uses `FixtureProvider`, which is labelled SIMULATED.
 */
export class Channel3Provider implements CatalogProvider {
  readonly source = "CHANNEL3" as const;
  /** Not simulated: this provider would read real listings, if it were enabled. */
  readonly simulated = false;
  readonly merchantAgentId: string;
  readonly catalogId = "cat_channel3";

  constructor(private readonly config: Channel3Config) {
    this.merchantAgentId = config.merchantAgentId;
  }

  private refuse(): never {
    throw new CatalogUnavailableError(
      [
        "Channel3 is not wired in this build.",
        this.config.apiKey
          ? "CHANNEL3_API_KEY is set, but no documented Channel3 request/response contract was available to implement against,"
          : "CHANNEL3_API_KEY is not set, and no documented Channel3 request/response contract was available to implement against,",
        "so no endpoint was invented. See docs/channel3.md. The fixture catalog is used instead and is labelled SIMULATED.",
      ].join(" "),
    );
  }

  async list(): Promise<CatalogProduct[]> {
    return this.refuse();
  }

  async search(): Promise<CatalogProduct[]> {
    return this.refuse();
  }

  async get(): Promise<CatalogProduct | null> {
    return this.refuse();
  }

  async categories(): Promise<string[]> {
    return this.refuse();
  }

  async hash(): Promise<string> {
    return this.refuse();
  }

  inventoryCheckedAt(): string {
    return this.refuse();
  }
}
