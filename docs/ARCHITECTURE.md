# Architecture

Handshake is three packages in one pnpm workspace. The rule that shapes the whole
design: **the model proposes, deterministic code disposes.**

```
apps/web ──REST + SSE──► apps/api ──SQL──► Postgres | PGlite
                            │
                            ├── PayPal Orders v2 (sandbox | labelled mock)
                            └── Anthropic (live | record/replay | scripted)
packages/shared  ← both sides parse the same zod schemas
```

## Packages

### `packages/shared`

Pure TypeScript, no Node-only imports in the barrel (signing lives in
`@handshake/shared/crypto`, which the web app never imports).

| Module | Responsibility |
|--------|----------------|
| `schemas.ts` | Every wire and storage shape as a zod schema. Nothing crosses a boundary without one. |
| `canonical.ts` | Deterministic JSON (sorted keys) and SHA-256, so a signature covers reproducible bytes. |
| `chain.ts` | `appendEvidence`, `entryDigest`, `verifyChain` — returns the first broken index, not just a boolean. |
| `mandate.ts` | `evaluateMandate` — the nine checks that decide whether a purchase is inside the signed envelope. |
| `merchant-policy.ts` | `quoteFromMove` — margin floor, max discount, bundle tiers, stock. The merchant's model only chooses among policy-legal moves. |
| `handshake.ts` | `evaluateHandshake` — 15 named checks (signature, expiry, binding, revocation, nonce reuse, inventory freshness). |
| `injection.ts` | Delimiters that cannot be closed from inside, plus pattern detection. |
| `liability.ts` | `decideLiability` — ordered rules `L-001 … L-011` mapping facts to liability and remedy. |
| `arbiter.ts` | Deterministic findings, verdict mapping, model-output validation, merchant response draft. |
| `deal-machine.ts` | Legal status transitions; illegal transitions throw. |
| `trust.ts` | Event deltas, caps, `computeTrust` — the same function the API and UI display. |
| `browser-verify.ts` | Chain + receipt-digest verification that runs in the browser. |

### `apps/api`

Fastify with zod-validated env, pino logging, CORS pinned to `WEB_ORIGIN`, a global
rate limit, an optional shared write token and a 64 KB body limit.

| Path | Responsibility |
|------|----------------|
| `routes/health.ts` | `/health`: DB ping, PayPal mode/fallback, agent dialogue mode (LIVE/REPLAY/SCRIPTED). |
| `routes/data.ts` | Mandates (list + builder POST), ledger, deal read, dispute list/read. |
| `routes/deals.ts` | `POST /deals`, `POST /deals/:id/resume`, SSE `/deals/:id/events`, open dispute, agent trust. |
| `routes/demo.ts` | `POST /demo/run`, `POST /demo/reset` — real pipeline, generated data. |
| `deals/orchestrator.ts` | The pipeline and its resumability. |
| `agents/merchant.ts` | Queries the catalog, asks the model to phrase a legal move, clamps the result through policy. |
| `agents/buyer.ts` | Builds the manifest, wraps merchant text as untrusted, runs the guard before returning a decision. |
| `agents/llm.ts` | Single-shot tool-use wrapper with record/replay caching. |
| `arbiter/service.ts` | Deterministic checks → optional model narration → validation → trust events. |
| `paypal/` | `PaymentProvider` interface, Orders v2 adapter, mock, resilient wrapper, typed errors, webhook verification. |

### `apps/web`

React 19 + Vite + Tailwind v4. No global store: `useResource` gives explicit
loading/success/not-found/error states, and `useDealEvents` owns the SSE
subscription and a throttled revision counter that triggers a refetch of persisted
state.

## Deal pipeline

```
CREATED ─► HANDSHAKE ─► NEGOTIATING ─► AGREED ─► PAID ─► RECEIPT_SIGNED ─► RESOLVED
                                                        └─► DISPUTED ─────┘
   any step ─► FAILED
```

`run(dealId)` re-reads the persisted status before each step, so a crash mid-deal
resumes at the first unfinished step rather than at the beginning. Illegal
transitions throw inside `transitionDeal`; the pipeline records the failure instead
of skipping ahead.

**Idempotency.** PayPal calls carry `deal:<id>:create` and `deal:<id>:capture` as
`PayPal-Request-Id`. The ledger reservation is keyed by deal id, and the receipt
table has a unique index on `dealId`. A resumed run cannot double-charge or mint a
second receipt.

**Ordering.** The ledger reservation is written *before* the order is created, so
two concurrent deals cannot overdraw one mandate. If payment fails, the reservation
moves to `VOIDED` instead of disappearing.

## Deterministic vs model

| Decision | Made by | Why |
|----------|---------|-----|
| Is this purchase inside the mandate? | `evaluateMandate` | A model can be argued with; code cannot. |
| What price may the merchant quote? | `quoteFromMove` | The margin floor must hold even if the model asks for a 90% discount. |
| Do both agents verify? | `evaluateHandshake` | Signature, expiry, binding, nonce reuse are checks, not opinions. |
| Who bears the loss? | `decideLiability` | Ordered rules over recorded facts. |
| What words does the merchant use? | Model | Style, not authority. |
| How is an ambiguity narrated? | Model | Constrained to a JSON schema and to evidence ids in the packet. |

The arbiter validates model output twice: against `ArbiterVerdictSchema`, then
against the set of evidence ids in the packet. A verdict that cites anything else,
or contradicts the deterministic liability, is rejected and the rejected output is
kept for the record.

## Record / replay

`LlmClient` hashes each request (model, tool, system, user, JSON Schema) and stores
the validated tool input under `.data/llm-replay/<hash>.json` in live mode. In
`LLM_MODE=replay` it only reads, so a recorded demo runs with no network. A miss is
reported as a failure and falls back to the labelled scripted negotiator — never a
silent live call.

## Persistence

Drizzle with a single migration baseline. Tables: `agents`, `mandates`, `deals`,
`messages`, `receipts`, `ledger_entries`, `disputes`, `trust_scores`,
`attestations`, `consumed_nonces`, `deal_events`, `evidence_packets`,
`principal_keys`, `trust_anchor_keys`.

`DATABASE_URL` set → Postgres; unset → embedded PGlite under `.data/pglite`. Both
drivers share one Drizzle query-builder shape, so repositories do not branch.
Migrations run on boot, before routes are registered.

**Demo-only storage.** Private keys for the principal, agents and anchor live in
the database. A production build keeps them in a KMS or user wallet. This is
documented in `SECURITY.md` and labelled `SIMULATED` in the UI.

## Live updates

`POST /deals` and `POST /demo/run` return immediately; the pipeline continues in the
background. `GET /deals/:id/events` replays every persisted event before streaming
live ones, so a reconnecting tab sees the whole story. The web app uses one
`EventSource` per deal and refetches its authoritative view at most every 400 ms.

## Failure behaviour

| Failure | Behaviour |
|---------|-----------|
| Handshake check fails | Deal `FAILED` with the failing check code as `ruleId`. |
| Guard denies | Deal `FAILED` with the mandate rule id; the decision stays in evidence. |
| PayPal capture fails | Ledger `VOIDED`, deal `FAILED`, `PAYMENT_FAILED` trust event. |
| Sandbox unreachable at order creation | Labelled mock takes over; shell shows the fallback. |
| Sandbox unreachable during capture | Reported as a failure. Never re-labelled a mock success. |
| Model call fails or returns invalid JSON | Deterministic path continues; the transcript records the scripted or fallback provenance. |
| Replay cache miss | Reported; scripted negotiator takes over. |

## Verification surfaces

1. **Tests** — chain tampering, replay, expired mandates, policy floor sweeps, both
   seeded verdicts, the full pipeline.
2. **Browser** — receipt *Verify in browser* recomputes SHA-256 over the transcript
   and the receipt body. Signatures themselves are verified by the API at issue.
3. **Ledger** — the tamper control flips one byte in local memory and reports the
   first broken index and reason.
4. **API** — `/health` and every deal view expose provider, simulation and mode.

## Known limitations

- Single tenant, no user accounts; `API_WRITE_TOKEN` is the only write control.
- The trust anchor is local. Real deployment needs a verifiable identity provider
  (or PayPal/agentic tokens) behind the same interface.
- Channel3 is not integrated; the fixture catalog stands in.
- Bundle size: AG Grid ships whole (noted, not optimised).
- The mock adapter must never be confused with a sandbox capture; the UI and the
  typed provider name (`PAYPAL_MOCK` vs `PAYPAL_SANDBOX`) are the guard against it.
