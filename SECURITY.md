# Security model

Handshake is a hackathon build of a trust layer for agent-to-agent commerce. This
document states what it actually protects, what it does not, and what is simulated.
If a claim is not in this file, treat it as unproven.

## Threat model

| # | Threat | Trust boundary | Control | Where |
|---|--------|----------------|---------|-------|
| 1 | A buyer agent spends more than the human authorised | LLM output → money movement | `evaluateMandate()` runs on every priced offer in deterministic code and returns a rule id. A denial happens before any state change. Bypass exists only behind an explicit per-deal `misconfiguredAgent` flag, is written to the transcript as `DEMO-BYPASS-00`, and is badged in the UI. | `packages/shared/src/mandate.ts`, `apps/api/src/agents/buyer.ts`, `apps/api/src/deals/orchestrator.ts` |
| 2 | A merchant agent talks the buyer agent out of its mandate | Counterparty text → buyer prompt | Merchant text is zod-validated, wrapped in `<untrusted-agent-message>` delimiters that cannot be closed from the content, and scanned for injection patterns. The model's move is re-checked by the guard, so a successful injection still cannot spend. | `packages/shared/src/injection.ts`, `apps/api/src/agents/buyer.ts` |
| 3 | Injected text in the evidence packet steers the arbiter | Packet text → arbiter model | Liability is decided deterministically before any model call. The model only labels ambiguity, its JSON is schema-validated, and any answer citing an evidence id absent from the packet is rejected and shown as rejected. | `packages/shared/src/arbiter.ts`, `apps/api/src/arbiter/service.ts` |
| 4 | Evidence is edited after the fact | Stored transcript | Append-only hash chain (`prevHash`, `payloadHash`), Ed25519 signatures on handshake entries, and a receipt that commits to the transcript root. `verifyChain()` names the first broken index. The UI re-derives the chain in the browser with SHA-256 only. | `packages/shared/src/chain.ts`, `apps/web/src/pages/LedgerPage.tsx` |
| 5 | A signed mandate is replayed | Request → signing | Mandate nonces are stored once with a unique index; handshake nonces are single-use and checked against the consumed-nonce table. | `apps/api/src/db/schema.ts`, `apps/api/src/deals/orchestrator.ts` |
| 6 | A retry double-charges | Pipeline → PayPal | Every money movement carries an idempotency key derived from the deal id (`deal:<id>:create` / `deal:<id>:capture`). The ledger reservation is keyed by deal id and the receipt is unique per deal. | `apps/api/src/deals/orchestrator.ts`, `apps/api/src/paypal/sandbox.ts` |
| 7 | Secret leakage | Repo, logs, responses | No secrets in the repo; only `.env.example`. Pino redacts authorization/cookie headers. `PaypalError.toJSON()` never includes credentials or request bodies. Zod env loading fails closed on bad values. | `apps/api/src/app.ts`, `apps/api/src/paypal/errors.ts`, `apps/api/src/config/env.ts` |
| 8 | Unvalidated input reaching a boundary | HTTP → app | Every route parses params/body with zod (`parseOrThrow`) and every stored row is re-parsed on read. Response bodies are also schema-parsed, so a shape change fails at the boundary instead of in the UI. | `apps/api/src/routes/*.ts`, `apps/api/src/http/validate.ts` |
| 9 | Unbounded resource use | Public API | Global rate limit (default 300 req/min per address, `/health` exempt), 64 KB body limit, 30 s connection timeout. Model calls are single-shot with `max_tokens` and `tool_choice` pinned, capped by the merchant's 4-round policy; the arbiter calls the model at most once per dispute. | `apps/api/src/app.ts`, `apps/api/src/agents/llm.ts` |
| 10 | External call hangs | API → PayPal / Anthropic | PayPal: 15 s timeout, at most 2 retries, retries only on 5xx/network/timeout. Anthropic: 20 s timeout, 1 retry. Both fail closed with typed errors that the pipeline records. | `apps/api/src/paypal/http.ts`, `apps/api/src/agents/llm.ts` |
| 11 | Unauthorised writes to a deployed instance | Internet → API | Optional shared write token: when `API_WRITE_TOKEN` is set, every mutating `/api` call must send `x-handshake-write-token`, compared in constant time. CORS is pinned to `WEB_ORIGIN`. | `apps/api/src/app.ts` |
| 12 | SSRF through a configurable provider URL | Env → outbound request | `PAYPAL_API_BASE` and `CHANNEL3_API_BASE` must be `https:` URLs. The Channel3 adapter refuses to run without an operator-supplied base URL; it does not guess an endpoint. | `apps/api/src/config/env.ts`, `apps/api/src/catalog/channel3.ts` |

## Authorisation: what exists and what does not

There are **no user accounts**. This is a single-tenant demo: one principal
(`prn_dana`), one buyer agent, one merchant agent. Deal and dispute routes are
read-only and public to the configured origin, so the demo needs no login.

The deployment posture is therefore:

- Local: no token, bound to `127.0.0.1`.
- Public demo: set `API_WRITE_TOKEN` (and `VITE_WRITE_TOKEN` for the web build) so
  anonymous visitors cannot mutate demo data, keep `RATE_LIMIT_MAX` low, and treat
  all data as disposable.

What is **not** implemented: per-user accounts, per-deal ownership, OAuth, RBAC.
Anyone who can reach a tokenless instance can run demo cases and reset demo data.
Do not put real evidence or real money behind this build without those controls.

## Prompt injection

Two directions are handled, both tested:

- **Merchant → buyer.** Merchant messages are untrusted data. Delimiters, pattern
  scanning and — decisively — the fact that the guard re-checks every priced offer
  in code.
- **Buyer/merchant → arbiter.** The arbiter sees the packet as data. Deterministic
  liability is computed first; a model verdict that cites unknown evidence is
  discarded. The raw rejected output is retained for review.

Residual risk: a model can still choose different *words* for the same
policy-allowed move. That changes the transcript, never the price floor, the
mandate limits or the rulings.

## Simulated vs real

| Component | Status | Notes |
|-----------|--------|-------|
| Mandate, handshake, receipt signatures | **Real** | Ed25519 via Node `crypto`, over canonical JSON. Verified in tests. |
| Evidence hash chain | **Real** | SHA-256 chained entries, verified in tests and in the browser. |
| Trust anchor and attestations | **SIMULATED** | A local anchor issues attestations. It is not PayPal identity, not a KYC provider and not a CA. Labelled in code, UI and README. |
| Agent identity | **SIMULATED** | Agents are keypairs in the local database. No OIDC, no agentic token standard. |
| Merchant catalog | **SIMULATED** | 30 fixture products. Channel3 is not integrated. |
| Negotiation dialogue | **Real when `ANTHROPIC_API_KEY` is set, otherwise SIMULATED** | The scripted negotiator is labelled `provenance: SIMULATED`. Prices come from deterministic policy in both modes. |
| PayPal payments | **Real sandbox when credentials are set, otherwise SIMULATED mock** | The mock is labelled `PAYPAL_MOCK` / "no funds move". Sandbox capture is reported only if the API actually returned a capture id. |
| PayPal dispute listing | **Best effort** | Implemented against the documented disputes API; if sandbox refuses, the adapter surfaces the typed error and the product's own dispute court is used instead. |
| Delivery / fulfilment record | **SIMULATED** | A carrier and tracking number are generated and labelled `SIMULATED`. |
| Liability rulings | **Real deterministic rules** + optional model narration | The model never sets liability. |

## Reporting

This is a hackathon project with no bug bounty. Open an issue with a reproduction
and do not test against instances you do not own.
