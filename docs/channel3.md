# Channel3 catalog adapter — status

**Status: interface implemented, network calls deliberately not implemented.**

Handshake needs a `CatalogProvider` so a merchant agent can search a real product
feed. The adapter is `apps/api/src/catalog/channel3.ts`; the fixture catalog used
by the demo is `apps/api/src/catalog/fixture.ts` (30 products, 4 categories,
labelled `SIMULATED` in the API, the UI and the ledger).

## What was checked

Before writing any code, the official Channel3 documentation was requested:

- `https://trychannel3.com/docs` → **404**
- `https://trychannel3.com/developers` → 200, but the page is client-rendered and
  returned no API reference text (product counts only).

No endpoint path, authentication header name, request body or response shape
could be confirmed from an authoritative source.

## What that means

Project rule 3 says: *never invent PayPal or Channel3 endpoints or fields*.
Guessing a URL here would also mean sending a real API key to a host that has not
been verified, so `Channel3Provider` throws `CATALOG_UNAVAILABLE` with a message
that explains exactly this. It does not fall back to invented requests, and it
does not silently return fixture data as if it came from Channel3.

`createCatalogProvider` selects Channel3 only when `CHANNEL3_ENABLED=true`, and
requires `CHANNEL3_API_KEY` and `CHANNEL3_API_BASE`.

## To finish the integration

1. Read the official Channel3 API reference (search/products endpoints) and the
   auth scheme.
2. Implement `list`, `search`, `get`, `categories` in `channel3.ts` against those
   documented shapes only, mapping each product to `CatalogProductSchema`
   (`sku`, `name`, `category`, `description`, `listPriceMinor`, `unitCostMinor`,
   `stock`, `merchantAgentId`, `source: "CHANNEL3"`, `simulated: false`).
3. Map Channel3 prices to integer minor units — never floats — and fail closed on
   a malformed amount rather than rounding silently.
4. Keep `hash()` deterministic and sorted by SKU so the merchant attestation binds
   to a stable catalog digest.
5. Add a recorded-response test (like `apps/api/tests/paypal.test.ts`) before
   turning it on, and update the README capability table.

Until then, every capability row for Channel3 should read **NOT IMPLEMENTED**, and
the demo catalog is `FixtureProvider` / `SIMULATED`.
