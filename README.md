# Handshake

An open-source trust layer for agent-to-agent commerce, built for the PayPal AI Hackathon 2026.

A human gives a buyer agent a signed spending mandate. The buyer agent negotiates with a merchant
agent. Both prove legitimacy with a cryptographic handshake, pay through the PayPal Sandbox, and both
sign a tamper-evident deal receipt. A dispute arbiter later reads the evidence packet and rules on
liability. Trust scores update.

**Status:** crypto and evidence layer complete. `@handshake/shared/crypto` issues Ed25519 keypairs for
the human principal, buyer agent, merchant agent and trust anchor, and signs canonical JSON for
mandates, dual-signed deal receipts and ledger entries. The mandate schema (lifetime cap, per-item
cap, category allowlist, forbidden substitutions, optional merchant allowlist, expiry, nonce), the
deal receipt schema and the append-only evidence chain with `verifyChain()` are in place. Deal
orchestration, the handshake protocol and the PayPal adapter land in the next steps.

## Stack

- TypeScript everywhere, strict, zod at every boundary.
- pnpm monorepo: `apps/web` (React + Vite + Tailwind + AG Grid), `apps/api` (Fastify), `packages/shared`.
- Postgres + Drizzle. `DATABASE_URL` points at any Postgres; without it the API runs an embedded
  Postgres (PGlite) in `.data/pglite` so the demo needs no server.
- Vitest for unit/integration tests.
- Anthropic TypeScript SDK for agent dialogue, model from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

## Quickstart

Requirements: Node 22+ and pnpm 10 (`npm i -g pnpm@10`).

```bash
pnpm install
cp .env.example .env      # optional; defaults run fully simulated
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/health

`pnpm dev` starts both apps. The API falls back to embedded PGlite, so the demo runs with no database
server and no credentials.

To use a real Postgres instead:

```bash
docker compose up -d postgres
# in .env: DATABASE_URL=postgres://handshake:handshake@localhost:5432/handshake
pnpm dev
```

The API applies the Drizzle migrations in `apps/api/drizzle` on startup.

## Scripts

| Command                         | What it does                                          |
| ------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                      | Run API (:8787) and web (:5173) together              |
| `pnpm dev:api` / `pnpm dev:web` | Run one app                                           |
| `pnpm typecheck`                | `tsc --noEmit` across all packages                    |
| `pnpm lint`                     | ESLint flat config across the monorepo                |
| `pnpm format`                   | Prettier                                              |
| `pnpm test`                     | Vitest for shared domain logic and API routes         |
| `pnpm db:generate`              | Regenerate the Drizzle migration after schema changes |
| `pnpm build`                    | Production build of the web app                       |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every push and pull request.

## What is simulated

Simulations are labelled in code identifiers, API fields, UI badges and this file.

- **Identity attestations** — `provider: "SIMULATED"`. The protocol shape is real; the attestation is
  issued by a local demo registry key, not a regulated know-your-agent provider.
- **PayPal mock adapter** — used when no `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` is configured.
  It returns `provider: "PAYPAL_MOCK"` and `simulated: true`. No funds move. The sandbox adapter talks
  to the documented Orders v2 endpoints only.
- **Scripted negotiator** — used when no `ANTHROPIC_API_KEY` is set. Turns are marked
  `provenance: "SIMULATED"`.
- **Fulfilment records** — carrier scans invented by the demo merchant, labelled `SIMULATED`.

Mandate signatures, handshake proofs and receipt signatures are real Ed25519 signatures over canonical
JSON. The SHA-256 evidence chain is real and verified independently of the database: `verifyChain()`
returns the index of the first entry whose payload, sequence number, `prevHash` or signature no longer
lines up.

`@handshake/shared/crypto` is a subpath export, not part of the package barrel, because it uses
`node:crypto` — the browser bundle never imports it.

## Security model (non-negotiable rules)

1. **Mandate limits are enforced in deterministic code**, never in a prompt. `packages/shared/src/mandate.ts`
   evaluates every offer and returns the first failing rule id.
2. **Counterparty agent text is untrusted data.** It is zod-parsed into typed offers, never executed as
   instructions, never used for tool calls, and rendered in the UI as quoted data.
3. **No invented PayPal endpoints.** The adapter cites the official Orders v2 documentation and is
   implemented against the sandbox base URL.
4. **Everything simulated is labelled SIMULATED.**
5. **No secrets in the repo** — only `.env.example`.

## Layout

```
apps/api      Fastify API, Drizzle schema + migrations, protocol and payment adapters
apps/web      React app: overview, mandate, deal, dispute and ledger views
packages/shared  zod schemas, mandate/trust/liability rules, canonical JSON, hash chain
```

## References

- PayPal Orders v2: https://developer.paypal.com/docs/api/orders/v2/
- PayPal authentication: https://developer.paypal.com/api/rest/authentication/
- PayPal idempotency (`PayPal-Request-Id`): https://developer.paypal.com/api/rest/reference/idempotency

## License

MIT — see [LICENSE](LICENSE).
"# paypal" 
