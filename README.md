<div align="center">

<img src="apps/web/public/favicon.svg" width="72" height="72" alt="" />

# Handshake

**A signed trust layer for agent-to-agent commerce.**

A human signs the spending mandate. Two agents prove who they are, negotiate inside
limits enforced in code, settle through the PayPal Sandbox, and both sign a receipt
either side can verify — without trusting the other.

<br />

<a href="https://github.com/RHarshith2005/paypal/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/RHarshith2005/paypal/actions/workflows/ci.yml/badge.svg" /></a>
<a href="https://github.com/RHarshith2005/paypal/actions/workflows/e2e.yml"><img alt="e2e" src="https://github.com/RHarshith2005/paypal/actions/workflows/e2e.yml/badge.svg" /></a>
<img alt="tests" src="https://img.shields.io/badge/tests-144%20passing-2ea043" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
<img alt="PayPal" src="https://img.shields.io/badge/PayPal-Orders%20v2%20Sandbox-00457C?logo=paypal&logoColor=white" />
<img alt="Anthropic" src="https://img.shields.io/badge/Anthropic-Claude-D97757?logo=anthropic&logoColor=white" />
<img alt="License" src="https://img.shields.io/badge/license-MIT-2ea043" />

<sub>Built for the <strong>PayPal AI Hackathon 2026</strong> · MIT · runs with no credentials</sub>

<br />
<br />

[Quick start](#quick-start) · [The two cases](#two-cases-one-rulebook) · [How a deal works](#how-a-deal-works) · [Architecture](#architecture) · [Testing](#testing) · [What is simulated](#what-is-simulated)

</div>

<div align="center">
<br />
<img src="pictures/19-deal-detail.png" width="100%" alt="Deal page: buyer and merchant negotiation with guard decisions inline, next to a handshake panel showing 15 of 15 checks passed" />
<sub><strong>Case B, on the record.</strong> 15/15 handshake checks, the guard's bypass rule id, and every merchant message marked <code>untrusted input</code>.</sub>
<br />
<br />
</div>

---

## The gap

Agents can already search a catalog, argue about a price and call a payment API.
What they cannot do is show a finance team that a human authorised the spend, prove
to a counterparty that they are legitimate, or hand over evidence that still means
something when the deal goes wrong.

> **If two agents made a deal and nobody was watching, what would you accept as proof?**

Handshake's answer: a mandate a human signed, a nonce-bound handshake, a real sandbox
capture, and a hash-chained receipt both sides signed. The dispute arbiter reads that
packet — not anybody's summary of it.

<div align="center">

### The model proposes. Deterministic code disposes.

</div>

Mandate limits, the merchant's margin floor, handshake validity and who bears the
loss are all decided by ordinary TypeScript functions. The model chooses words inside
what those functions allow; it never chooses the outcome.

---

## What a judge can verify in two minutes

|                                          | Proof                                                                                                                                                         | Where                                      |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------- |
| **A human authorised the spend**         | A signed envelope — lifetime cap, per-item cap, categories, forbidden substitutions, merchant allowlist, transaction count, expiry, single-use nonce          | `/mandate` · `/mandate/new`                |
| **Both agents prove legitimacy**         | 15 named checks: attestation signatures, expiry, agent/key binding, mandate and catalog hashes, revocation, nonce reuse, inventory freshness — all recorded   | any deal page, **Handshake** panel         |
| **The model cannot exceed the mandate**  | 9 ordered rules. The first failure blocks the purchase before any state change, and the rule id is written into the transcript                                | every buyer turn, under **Guard decision** |
| **The payment is idempotent and honest** | PayPal Orders v2 with `PayPal-Request-Id` derived from the deal id, a ledger reservation before the order exists, and a visible mock fallback                 | `/ledger`                                  |
| **The receipt survives a disagreement**  | Ed25519 signatures over canonical JSON, committing to the SHA-256 root of the whole transcript — recomputed in your browser, with no server call              | deal page → **Verify in browser**          |
| **Liability is not a model opinion**     | 12 ordered rules (`L-001 … L-012`) over recorded facts, decided before any model call. A model answer citing evidence outside the packet is rejected and kept | `/disputes`                                |

### Design decisions we would defend

- **The guard sits in front of every state change**, not in a prompt. `evaluateMandate()` has no knowledge of the model and cannot be argued with.
- **Counterparty text is data.** Merchant messages are delimited in a wrapper they cannot close, scanned for injection, zod-parsed, and — decisively — every priced offer is re-checked in code before it can spend.
- **Liability is computed before the model speaks.** The arbiter may narrate an ambiguity, but only within a schema and only citing evidence ids that exist in the packet. A rejected answer is shown as rejected.
- **Simulation is labelled where it happens.** Provider, simulation flags and model mode appear in the shell, on every deal row, in `/health`, in the README and in `SECURITY.md`. A failed sandbox capture is never relabelled a mock success.

---

## Two cases, one rulebook

Both cases run the full pipeline — handshake → negotiation → guard → PayPal →
dual-signed receipt → dispute → ruling. Nothing is staged in the UI.

<table>
<tr>
<th width="50%">Case A — a valid purchase</th>
<th width="50%">Case B — a misconfigured agent</th>
</tr>
<tr valign="top">
<td>

A **$600** PPE mandate with a **$300** per-item cap. A $37.35 PPE cart clears every
limit, the sandbox capture succeeds, and delivery is recorded.

The buyer then claims the goods never arrived. The signed delivery record defeats
the claim.

**`VALID_PURCHASE`** · liability `BUYER` · refund `$0.00`

</td>
<td>

A **$20** lifetime mandate — and the deal runs with the **MandateGuard deliberately
bypassed**. The bypass is written into the transcript as `DEMO-BYPASS-00` _before_
the capture, which lands at **$30.30**, above the signed cap.

The arbiter rules against the agent, not the merchant.

**`BUYER_AGENT_OUT_OF_MANDATE`** · full refund `$30.30`

</td>
</tr>
</table>

<div align="center">
<br />
<img src="pictures/22-disputes.png" width="100%" alt="Dispute court showing Case A ruled VALID_PURCHASE with no refund and Case B ruled BUYER_AGENT_OUT_OF_MANDATE with a full refund" />
<sub><strong>The court, side by side.</strong> Deterministic rule ids, evidence citations, liability share and the drafted merchant response.</sub>
<br />
<br />
</div>

Case B is the important one. It is not a mock-up of a failure — it is the failure mode
this layer exists to make visible. The guard reports the limits it skipped, `M-BUDGET-08`
among them, and the arbiter reads the bypass from the evidence rather than trusting
either agent's account of it.

---

## Screens

<table>
<tr>
<td width="50%">
<img src="pictures/34-deal-live-stream.png" width="100%" alt="A live deal streaming over SSE: two negotiation rounds, each buyer turn followed by an ALLOW M-OK-00 guard decision" />
<br />
<strong>Live evidence, streaming</strong><br />
Two rounds over SSE. Every buyer turn carries the guard's rule id; the offer is re-checked in code before the agent may accept it.
</td>
<td width="50%">
<img src="pictures/26-ledger-tampered.png" width="100%" alt="Ledger with evidence integrity panel naming entry #0 after one byte was flipped" />
<br />
<strong>Tamper, caught locally</strong><br />
One flipped byte in local memory and the page names entry <code>#0</code> and the payload-hash mismatch. Stored evidence is untouched; <em>Restore</em> puts it back.
</td>
</tr>
<tr>
<td width="100%" colspan="2"><br /></td>
</tr>
<tr>
<td width="50%">
<img src="pictures/29-mandate-builder.png" width="100%" alt="Mandate builder showing terms on the left and the canonical signing payload on the right" />
<br />
<strong>Authority as data</strong><br />
The builder shows the exact canonical JSON the principal's key signs, and the nine checks the agent will face on every priced offer.
</td>
<td width="50%">
<img src="pictures/31-trust.png" width="100%" alt="Trust scoreboard printing the scoring formula, per-event deltas and each agent's event log" />
<br />
<strong>Trust you can recompute</strong><br />
Fixed deltas, capped positive and negative contributions, clamped to 0–100. The formula is printed next to the score, not hidden behind a model.
</td>
</tr>
</table>

<sub>All captures are real, produced by <code>pnpm capture</code> (Playwright) from the running app at 1991×1415. See <a href="pictures/README.md">pictures/README.md</a> for all 35.</sub>

---

## Quick start

```bash
pnpm install
cp .env.example .env      # placeholders only; no real credentials needed
pnpm dev                  # API :8787 · web :5173
```

Open **<http://localhost:5173>**. On first boot the API creates the database, runs
the Drizzle migrations and seeds both cases (`SEED_DEMO_DATA=true`).

To rebuild the evidence at any time, run `pnpm demo:reset` in a second terminal — or
press **Reset demo data** in the app.

<details>
<summary><strong>What you need, and what you do not</strong></summary>

<br />

| You need                     | You do not need                                    |
| :--------------------------- | :------------------------------------------------- |
| **Node 22+** and **pnpm 10** | PayPal credentials — the labelled mock runs        |
| Nothing else                 | An Anthropic key — the labelled scripted agents    |
|                              | A database server — embedded PGlite under `.data/` |
|                              | Docker (optional, if you prefer local Postgres)    |

The shell reports the live mode (`PayPal mock`, `Scripted`, `db:pglite`) and
`/health` returns the same facts as JSON.

</details>

---

## How a deal works

```mermaid
flowchart LR
  A["Human principal<br/>signs a mandate"] --> B["Buyer + merchant<br/>handshake"]
  B --> C["Negotiation<br/>policy in code"]
  C --> D["MandateGuard<br/>allows or denies"]
  D -->|allowed| E["PayPal capture"]
  D -->|denied| X["Deal halted<br/>rule recorded"]
  E --> F["Dual-signed<br/>receipt"]
  F --> G{"Something<br/>went wrong?"}
  G -->|no| H["Settled · trust +"]
  G -->|yes| I["Evidence packet<br/>→ arbiter"]
  I --> J["Deterministic checks<br/>then optional model"]
  J --> K["Ruling · liability<br/>· drafted response"]
```

<details>
<summary><strong>1 · The mandate</strong> — authority as data, not prose</summary>

<br />

A signed envelope: lifetime cap, per-item cap, allowed categories, forbidden
substitutions, merchant allowlist, transaction count, expiry, single-use nonce.

`evaluateMandate()` runs nine checks in a fixed order and returns the rule that
decided the outcome. A denial happens **before** any state change, and the decision —
with its rule id — is written to the transcript.

</details>

<details>
<summary><strong>2 · The handshake</strong> — both sides prove legitimacy</summary>

<br />

A trust anchor (**SIMULATED**) issues short-lived attestations bound to the mandate
hash and the catalog hash. Both sides exchange a fresh nonce pair and verify
signature, expiry, agent/key binding, revocation, inventory freshness and nonce
reuse. Fifteen named checks, all recorded — passing or not.

</details>

<details>
<summary><strong>3 · Negotiation</strong> — the model talks, the policy prices</summary>

<br />

The merchant model phrases an offer; `quoteFromMove()` decides the minimum price,
clamps the requested discount, applies bundle tiers and checks stock. The buyer model
phrases a reply; the guard decides whether it may spend. Merchant text is wrapped in
delimiters it cannot close and scanned for injection — and even a successful
injection still cannot exceed the mandate.

</details>

<details>
<summary><strong>4 · Settlement</strong> — resumable, idempotent, honest</summary>

<br />

A ledger reservation is written before the PayPal order exists, so two deals cannot
overdraw one mandate. Both money movements carry `PayPal-Request-Id` values derived
from the deal id; the receipt is unique per deal. A crashed run resumes at the first
unfinished step instead of starting over.

If the sandbox is unreachable when an order is created, the labelled mock takes over
and the shell says **“PayPal mock fallback”**. A capture that fails after PayPal
already holds the order is reported as a failure — it is never relabelled a mock
success.

</details>

<details>
<summary><strong>5 · Dispute</strong> — rules first, model second</summary>

<br />

Deterministic checks run before any model: signatures, chain integrity, mandate
compliance, capture vs agreed price, receipt vs delivered items. Only a genuinely
ambiguous packet reaches the model, whose JSON must satisfy a schema **and** cite only
evidence ids that exist in the packet. Otherwise the deterministic ruling stands and
the rejected output is shown, not hidden.

</details>

### The handshake, in order

```mermaid
sequenceDiagram
  autonumber
  participant H as Human principal
  participant B as Buyer agent
  participant M as Merchant agent
  participant T as Trust anchor (SIMULATED)
  participant P as PayPal Sandbox

  H->>B: sign mandate (cap, per-item, categories, expiry, nonce)
  T-->>B: buyer attestation (mandateHash, validUntil)
  T-->>M: merchant attestation (catalogHash, inventoryCheckedAt)
  M->>B: CHALLENGE — fresh nonce + merchant identity
  B->>M: CHALLENGE_RESPONSE — own nonce + buyer identity
  M->>B: ACCEPT — both nonces bound
  Note over B,M: verify signature, expiry, binding,<br/>revocation, unseen nonces
  B->>M: request quote inside the mandate
  M->>B: OFFER — policy-clamped price, bundle tier, stock
  Note over B: MandateGuard re-checks the offer in code
  B->>P: create order (idempotent per deal)
  P-->>B: order id
  B->>P: capture (idempotent per deal)
  P-->>B: capture id
  B->>M: sign receipt body (cart, price, transcript root, order id)
  M->>B: counter-sign
  Note over B,M: the receipt commits to the whole hash-chained transcript
```

---

## Architecture

```mermaid
flowchart TB
  subgraph web["apps/web — React 19 · Vite · Tailwind v4 · AG Grid"]
    UI["Overview · Builder · Deal · Court<br/>Ledger · Trust · Demo script"]
  end

  subgraph api["apps/api — Fastify"]
    R["Routes<br/>zod at every boundary"]
    O["Deal orchestrator<br/>state machine · resumable"]
    G["MandateGuard"]
    AR["Dispute arbiter"]
    PP["PaymentProvider<br/>sandbox · mock · fallback"]
    LL["LlmClient<br/>record / replay"]
  end

  S["packages/shared<br/>zod schemas · canonical JSON<br/>chain · guard · policy · liability"]
  DB[("Postgres | PGlite<br/>Drizzle migrations")]
  PAY["PayPal Sandbox<br/>Orders v2"]
  ANT["Anthropic<br/>single-shot tool use"]

  UI -- "REST + SSE" --> R
  R --> O
  O --> G
  O --> PP
  O --> LL
  AR --> LL
  O --> S
  AR --> S
  G --> S
  O --> DB
  AR --> DB
  R --> DB
  PP --> PAY
  LL --> ANT
```

| Package           | Contains                                                                                                                                                                                                                                          |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared` | Every wire and storage shape as a zod schema · canonical JSON + SHA-256 · hash chain · `evaluateMandate` · `quoteFromMove` · `evaluateHandshake` · injection delimiters · `decideLiability` · trust maths · deal state machine · browser verifier |
| `apps/api`        | Fastify routes with zod-validated env, params and bodies · resumable deal orchestrator · buyer/merchant/arbiter services · PayPal adapter, mock and resilient fallback · record/replay LLM client                                                 |
| `apps/web`        | Overview, mandate, builder, deal, court, ledger, trust and demo-script pages · SSE subscription with throttled refetch · AG Grid tables · hand-built design system                                                                                |

Full module map, state machine and failure behaviour: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Verification you can perform

<table>
<tr><td width="32%"><strong>Verify in browser</strong></td><td>Recomputes the hash chain and the receipt digest from the bytes on screen, with <code>@noble/hashes</code>. No server call, so the result holds offline.</td></tr>
<tr><td><strong>Tamper control</strong></td><td>Flips one byte in local memory and names the exact entry and the mismatch. Stored evidence is untouched; <em>Restore</em> puts it back.</td></tr>
<tr><td><strong>Rule ids everywhere</strong></td><td>Every allow, denial, bypass, handshake check and ruling carries a stable id (<code>M-OK-00</code>, <code>M-BUDGET-08</code>, <code>DEMO-BYPASS-00</code>, <code>L-009-DELIVERY-PROVEN</code>) so a reviewer can trace the decision.</td></tr>
<tr><td><strong>Replayable agents</strong></td><td><code>LLM_MODE=replay</code> serves recorded model output and never touches the network; a cache miss fails visibly instead of quietly going live.</td></tr>
<tr><td><strong>Modes in the open</strong></td><td>Provider, simulation flags and model mode appear in the shell, in every deal row, in <code>/health</code> and in this file.</td></tr>
</table>

---

## Testing

```bash
pnpm typecheck     # strict TypeScript across shared, API and web
pnpm lint          # ESLint, zero warnings
pnpm test          # 144 unit and pipeline tests
pnpm test:e2e      # Playwright: Case A · Case B · ledger tamper
```

| Suite             | Files |   Tests | Covers                                                                                                                                                 |
| :---------------- | ----: | ------: | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` |    12 | **104** | chain tampering, reordering, nonce replay, expired mandates, wrong signer, margin-floor sweeps, injection, liability rules, state machine, trust maths |
| `apps/api`        |     4 |  **40** | the full pipeline, allowlist denial, payment failure, revoked merchant, both seeded verdicts, PayPal adapter contracts, env loading                    |
| `e2e`             |     1 |   **3** | Case A to a browser-verified receipt · Case B to `DEMO-BYPASS-00` and both court verdicts · ledger tamper names `#0`                                   |

The e2e suite runs against a dedicated PGlite directory, resets state first, and needs
no credentials: mock payments and the scripted negotiator throughout.

---

## PayPal Sandbox

Set these in `.env` — placeholders only, use your own sandbox app:

```dotenv
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=<your sandbox REST app client id>
PAYPAL_CLIENT_SECRET=<your sandbox REST app secret>
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=<webhook id, if you configured a listener>
```

Prove the credential before trusting the UI:

```bash
pnpm paypal:smoke
```

It creates and captures a sandbox order and prints the order id, capture id and amount
exactly as PayPal returned them.

> **Honest status.** The Orders v2 adapter (token caching, idempotency, decimal-string
> amounts, typed errors, retries only on 5xx/network/timeout, webhook verification) is
> written against the documented endpoints but **was not exercised in this sandbox** —
> no credentials were available here. [`docs/paypal-sandbox.md`](docs/paypal-sandbox.md)
> records precisely what was and was not verified. Dispute **listing** is implemented
> against the documented API; the product's own dispute court is the demo path.

---

## What is simulated

Labelled in code, in the UI, and here.

| Component                                      | Status                                                                   |
| :--------------------------------------------- | :----------------------------------------------------------------------- |
| Mandate, handshake and receipt signatures      | **Real** — Ed25519 over canonical JSON                                   |
| Evidence hash chain                            | **Real** — SHA-256 chained entries, verified in tests and the browser    |
| Principal identity, trust anchor, attestations | **SIMULATED** — a local anchor, not PayPal identity or KYC               |
| Agent identities                               | **SIMULATED** — keypairs in the local database                           |
| Merchant catalog (30 products)                 | **SIMULATED** fixture — Channel3 is not integrated                       |
| Negotiation dialogue                           | Anthropic when a key is set, otherwise **SIMULATED** scripted negotiator |
| Payments                                       | PayPal Sandbox with credentials, otherwise **SIMULATED** mock            |
| Fulfilment record                              | **SIMULATED** carrier and tracking number                                |
| Liability rulings                              | **Real** deterministic rules — the model only narrates ambiguity         |

Full threat model, including the 12 threats and the authorisation gaps:
[`SECURITY.md`](SECURITY.md).

---

## Stack

<table>
<tr><td width="18%"><strong>Language</strong></td><td>TypeScript, strict, on Node 22+</td></tr>
<tr><td><strong>Workspace</strong></td><td>pnpm monorepo — <code>apps/web</code> · <code>apps/api</code> · <code>packages/shared</code></td></tr>
<tr><td><strong>API</strong></td><td>Fastify · zod · pino · Drizzle ORM · Postgres or PGlite</td></tr>
<tr><td><strong>Web</strong></td><td>React 19 · Vite · Tailwind v4 · AG Grid Community · Fontsource (Plus Jakarta Sans + JetBrains Mono)</td></tr>
<tr><td><strong>Agents</strong></td><td>Anthropic TypeScript SDK · single-shot tool use · local schema validation</td></tr>
<tr><td><strong>Crypto</strong></td><td>Node Ed25519 · <code>@noble/hashes</code> for in-browser SHA-256 · canonical JSON</td></tr>
<tr><td><strong>Tests</strong></td><td>Vitest (shared + pipeline) · Playwright (Case A / Case B / tamper)</td></tr>
<tr><td><strong>CI</strong></td><td>GitHub Actions — lint, typecheck, tests and the e2e suite on every push</td></tr>
</table>

### Tools and where they are used

| Tool                         | Where                                             | Note                                                                  |
| :--------------------------- | :------------------------------------------------ | :-------------------------------------------------------------------- |
| **PayPal Orders v2 Sandbox** | `apps/api/src/paypal/sandbox.ts`                  | `PayPal-Request-Id` idempotency, retries only on 5xx/network/timeout  |
| **PayPal Disputes API**      | `apps/api/src/paypal/sandbox.ts`                  | Implemented, not exercised in sandbox                                 |
| **Anthropic Claude**         | `apps/api/src/agents/*`, `apps/api/src/arbiter/*` | Phrasing and narration, never authority                               |
| **AG Grid Community**        | `apps/web`                                        | Ledger, deal and trust tables with filtering                          |
| **Fontsource**               | `apps/web`                                        | Self-hosted Plus Jakarta Sans Variable + JetBrains Mono Variable      |
| **Channel3**                 | `apps/api/src/catalog/channel3.ts`                | **Not integrated** — no endpoint invented ([notes](docs/channel3.md)) |

### Design system

The dashboard is authored against a 2212×1659 reference canvas: a dark glass screen
inside a translucent bezel, on a lavender mesh backdrop. Geometry is expressed in
reference pixels (1 rem = 16 ref px), so `p-28` is exactly 28 ref px on the stage.

```bash
pnpm dev                    # http://localhost:5173
# http://localhost:5173/?frame=1   full 2212×1659 stage, 1:1
pnpm design:diff            # screenshot the stage, diff it block by block
pnpm capture                # regenerate every screenshot in pictures/
```

Press <kbd>O</kbd> in dev to overlay the reference with an opacity slider. The
reference image is not in this repository — see
[what could not be matched](#what-could-not-be-matched).

---

## Repository layout

```text
handshake/
├── apps/
│   ├── api/          Fastify: routes, orchestrator, agents, arbiter, PayPal adapters
│   └── web/          React: overview, builder, deal, court, ledger, trust, demo script
├── packages/
│   └── shared/       zod schemas, canonical JSON, chain, guard, policy, liability
├── e2e/              Playwright: Case A, Case B, ledger tamper
├── pictures/         35 captures from the running app (`pnpm capture`)
├── docs/             architecture · sandbox notes · submission assets
├── render.yaml       static web + API + Postgres blueprint
└── SECURITY.md       threat model and simulated-vs-real table
```

---

## Docs

|                                                |                                                               |
| :--------------------------------------------- | :------------------------------------------------------------ |
| [Architecture](docs/ARCHITECTURE.md)           | Modules, deal state machine, invariants, failure behaviour    |
| [Security](SECURITY.md)                        | 12 threats with controls, authorisation gaps, simulated table |
| [PayPal sandbox](docs/paypal-sandbox.md)       | What was exercised, what was not                              |
| [Channel3](docs/channel3.md)                   | Why the catalog adapter is not wired                          |
| [Devpost](docs/DEVPOST.md)                     | Submission description                                        |
| [Demo script](docs/DEMO_SCRIPT.md)             | Shot-by-shot 3:00 video with on-screen text                   |
| [Video prompt pack](docs/VIDEO_PROMPT_PACK.md) | Generated b-roll prompts, graded to the app's palette         |
| [Submission assets](docs/SUBMISSION.md)        | Titles, pitches, judge testing instructions                   |
| [Screenshots](pictures/README.md)              | Every capture, indexed                                        |

---

## Known limits

- **Single tenant.** No accounts, no per-deal authorisation. `API_WRITE_TOKEN` is the
  only write control; see [`SECURITY.md`](SECURITY.md).
- **The anchor is local.** Real deployment needs a verifiable identity provider behind
  the same interface.
- **Channel3 is not wired.** The fixture catalog stands in.
- **Bundle size.** AG Grid ships whole; the web chunk is ~1.8 MB (~523 KB gzipped),
  noted rather than optimised.
- **Sandbox capture unverified here** — run `pnpm paypal:smoke` with your credentials.

### What could not be matched

- **The reference image is not in this repository.** The overlay and pixel diff are
  wired but unrun; blocks and masks will need real values from the image.
- **Display type.** Plus Jakarta Sans is self-hosted at 400/500/600. A reference using
  a different optical size will not match glyph for glyph.
- **Key fingerprints.** The API does not expose agent public keys, so the agent card
  shows the real key id from the most recent signed receipt (or `—`), never a
  fingerprint of a key it did not receive.
- **Zero-state colour.** Verdict segments with no cases render at zero rather than
  being hidden, so the legend always shows every verdict honestly.

## What's next

Replace the simulated anchor with a real identity provider · anchor receipt roots in an
external append-only store · multi-tenant accounts with per-deal authorisation · a
policy DSL with property-based tests over price, margin and inventory.

---

<div align="center">
<br />

**MIT licensed** · see [LICENSE](LICENSE)

<sub>Handshake · a signed trust layer for agent commerce · mandate limits enforced in deterministic code</sub>

<br />
<br />

</div>
