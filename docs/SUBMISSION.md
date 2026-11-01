# Submission assets

## YouTube

**Title**

> Handshake — a signed trust layer for agent-to-agent commerce (PayPal AI Hackathon 2026)

**Description**

> Agents can already negotiate and pay. They cannot prove a human authorised the
> spend, or what exactly both sides agreed to.
>
> Handshake adds that layer: a human signs a spending mandate, two agents verify each
> other's attestations in a nonce-bound handshake, negotiate inside merchant policy
> enforced in code, settle through the PayPal Sandbox, and both sign a receipt that
> commits to a hash-chained transcript. When a deal goes wrong, an arbiter reads that
> packet and decides liability with deterministic rules — a model may only explain an
> ambiguity, and its answer is rejected if it cites evidence outside the packet.
>
> In this demo:
> 00:00 the problem
> 00:15 a signed mandate
> 00:40 Case A — handshake, negotiation, guard, PayPal capture, dual-signed receipt
> 01:30 verify the receipt in the browser
> 01:55 Case B — a misconfigured agent that bypasses its own guard, recorded as evidence
> 02:25 the dispute court ruling both cases
> 02:50 tamper with one byte and watch the ledger name the broken entry
>
> What is simulated is labelled everywhere: the trust anchor, agent identities, the
> merchant catalog, the fulfilment record and — without credentials — the payments.
> Mandate, handshake and receipt signatures are real Ed25519 over canonical JSON, and
> the hash chain is verified in tests and in the browser.
>
> Code (MIT): <repository url>
> Built for the PayPal AI Hackathon 2026.

**Tags:** `paypal`, `ai agents`, `agentic commerce`, `typescript`, `ed25519`,
`paypal sandbox`, `trust`, `hackathon`

## Pitches

**One line**

> Handshake is a signed trust layer for agent commerce: a human-signed spending
> mandate, a cryptographic handshake, a real PayPal sandbox payment and a receipt
> either side can verify.

**Three sentences**

> Agents can already negotiate and pay, but nothing proves that a human authorised
> the spend or records what the two sides actually agreed to. Handshake signs a
> spending mandate, makes both agents prove their attestations in a nonce-bound
> handshake, settles the agreed cart through the PayPal Sandbox and has both sides
> sign a receipt bound to a hash-chained transcript. When a dispute arrives, an
> arbiter rules from that evidence with deterministic rules — the model may only
> explain an ambiguity, never decide liability.

## Elevator variants

- **For a judge, 15 seconds:** “Two agents negotiate, but only within a mandate a
  human signed; the guard is code, the payment is PayPal sandbox, and the receipt is
  dual-signed so a dispute is settled from evidence instead of screenshots.”
- **For an engineer:** “Deterministic policy owns every decision that matters —
  mandate limits, merchant margin floor, handshake checks, liability — and the model
  only phrases things inside those constraints.”

## Testing instructions for judges

No credentials required. The whole thing runs locally against embedded Postgres.

```bash
git clone <repository url> handshake && cd handshake
cp .env.example .env
pnpm install
pnpm dev            # API on :8787, web on :5173
```

Open <http://localhost:5173>. The shell shows the runtime mode: `Scripted` agents and
`PayPal mock` with no credentials, or `Live model` / `PayPal sandbox` when you add
keys. Nothing is hidden.

**Two minutes, two cases**

1. Press **Run Case A — valid purchase**. Watch the handshake land, then the
   negotiation, then the payment. When the receipt appears, press **Verify in
   browser**: it recomputes the whole hash chain locally and reports the root and the
   first break (none).
2. Back to the overview, press **Run Case B — misconfigured agent**. The amber banner
   and `BYPASSED · DEMO-BYPASS-00` appear before the capture, which is above the
   signed cap.
3. Open **Dispute court**: Case A is `VALID_PURCHASE` with no refund; Case B is
   `BUYER_AGENT_OUT_OF_MANDATE` with a full refund. Both show the deterministic checks
   and the drafted merchant response.
4. Open **Ledger**, press **Flip one byte in #0**: the page names entry `#0` and the
   payload-hash mismatch. Press **Restore**.
5. Open **Trust**: every score prints the formula and the events that produced it.

**Automated proof**

```bash
pnpm -r typecheck && pnpm lint && pnpm test   # 139 tests
pnpm test:e2e                                 # Playwright: Case A and Case B
```

`pnpm demo:reset` rebuilds both cases at any time. `pnpm demo:seed` creates them if
the database is empty.

**If you want a real sandbox capture**, add `PAYPAL_MODE=sandbox`,
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` to `.env` and run `pnpm paypal:smoke`.
Without them the mock adapter is used and labelled `PAYPAL_MOCK` on every payment
row; no funds move.

## Honesty notes for the submission form

- The trust anchor, agent identities, merchant catalog, fulfilment records and the
  mock payment adapter are **simulated**, and labelled in the UI.
- Channel3 is **not integrated**: the documented contract could not be verified, so
  no endpoint was invented (`docs/channel3.md`).
- PayPal dispute *creation* is not wired; the product ships its own dispute court.
  Dispute *listing* is implemented against the documented API but was not exercised
  in sandbox (`docs/paypal-sandbox.md`).
- There are no user accounts. `API_WRITE_TOKEN` is the only write control; see
  `SECURITY.md`.
