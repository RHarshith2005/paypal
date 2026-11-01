import type { AppConfig } from "../config/env";
import { Channel3Provider } from "./channel3";
import { FixtureProvider } from "./fixture";
import type { CatalogProvider } from "./types";

export { FixtureProvider, FIXTURE_CATALOG_ID, FIXTURE_MERCHANT_AGENT_ID } from "./fixture";
export { Channel3Provider } from "./channel3";
export { CatalogUnavailableError } from "./types";
export type { CatalogProvider } from "./types";

/**
 * Channel3 is selected only when the operator explicitly asks for it *and*
 * provides both a key and a base URL. Even then the provider refuses to issue
 * requests until the documented contract is implemented, so a misconfiguration
 * can never silently turn into calls against an invented endpoint.
 */
export function createCatalogProvider(config: AppConfig, now: () => Date = () => new Date()): CatalogProvider {
  const merchantAgentId = "agt_merchant_ridgeway";
  if (config.catalog.channel3.enabled) {
    return new Channel3Provider({
      apiKey: config.catalog.channel3.apiKey,
      apiBase: config.catalog.channel3.apiBase,
      merchantAgentId,
    });
  }
  return new FixtureProvider({ merchantAgentId, now });
}
