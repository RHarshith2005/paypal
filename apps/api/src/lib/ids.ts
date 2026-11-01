import { randomBytes } from "node:crypto";

/** Prefixed opaque id, for example `deal_9f2c...`. Matches the shared schema prefixes. */
export function newId(prefix: string, bytes = 12): string {
  return `${prefix}${randomBytes(bytes).toString("hex")}`;
}
