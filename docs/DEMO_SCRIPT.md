# Demo video — shot by shot (3:00)

Record at 1440×900, browser zoom 100%, no notifications. Reset the demo first
(`pnpm demo:reset` or the Reset button) so both cases are fresh. Every beat below
matches `/demo/script`, which also keeps a progress marker while you record.

Keep the cursor calm: move, pause, click. Let the guard and the verdict text land
before you talk over them.

This is the cut. The generated b-roll that opens scenes, bridges routes and closes the
film — with prompts graded to the app's palette — is in
[`VIDEO_PROMPT_PACK.md`](VIDEO_PROMPT_PACK.md). Lay the screen recordings first; add
the clips only where no real UI is on screen.

---

### 0:00 – 0:15 · Cold open

**Screen:** overview, deals table visible, no modal.

**On-screen text:** `Agents can already pay. They can't prove they were allowed to.`

**Say:** “Agents can already negotiate and pay. What they can't do is prove a human
authorised it — or what exactly both sides agreed to. Handshake is a trust layer for
that gap.”

**Action:** hover the three pipeline cards, then click **Mandate**.

---

### 0:15 – 0:40 · The mandate

**Screen:** `/mandate` then `/mandate/new`.

**On-screen text:** `Signed authority · limits enforced in code`

**Say:** “A human signs the envelope. Lifetime cap, per-item cap, categories,
forbidden substitutions, an allowlist, a transaction count, an expiry, and a
single-use nonce. This is the exact canonical JSON the key signs.”

**Action:** change per-item cap to `120.00`, so the builder shows the validation
warning; change it back to `85.00`; press **Sign mandate**; show the signature key id
on the stored mandate.

---

### 0:40 – 1:05 · Run Case A, handshake

**Screen:** overview → `Run Case A`.

**On-screen text:** `Mutual attestations · fresh nonces · binding checks`

**Say:** “Case A: a valid purchase. Before a price is mentioned, both sides hand each
other attestations bound to the mandate hash and the catalog hash, and exchange a
fresh nonce pair. Fifteen checks, recorded — signature, expiry, binding, revocation,
nonce reuse.”

**Action:** on the deal page scroll the handshake panel; point at
`SIMULATED attestations`; let the SSE stream tick.

---

### 1:05 – 1:30 · Negotiation and the guard

**Screen:** deal page, negotiation split chat.

**On-screen text:** `The model proposes · the guard disposes`

**Say:** “The merchant model phrases the offer; the merchant's policy decides the
floor price. The buyer model phrases the reply; the guard decides whether it is
allowed to spend. Every offer is re-checked in code, and the decision is written
beside the turn.”

**Action:** point at `ALLOW · M-OK-00` under a buyer turn, then at the guard's
amount. Do not scroll past the injection panel if it is visible.

---

### 1:30 – 1:55 · Payment and the receipt

**Screen:** payment panel, then the receipt panel.

**On-screen text:** `PayPal Sandbox · idempotent · dual-signed`

**Say:** “The cart settles through the PayPal adapter with idempotency keys derived
from the deal id, after a ledger reservation so two deals can't overdraw one budget.
Then both agents sign the receipt — cart, price, PayPal order and the transcript
root.”

**Action:** press **Verify in browser**. Hold on the result: chain and receipt digest
agree, N entries verified, first break none.

---

### 1:55 – 2:25 · Case B: the failure mode is evidence

**Screen:** back to overview → `Run Case B` → deal page → `/disputes`.

**On-screen text:** `Guard bypassed · recorded before the money moved`

**Say:** “Same pipeline, but this agent was misconfigured, so the guard is bypassed.
Watch the bypass land in the transcript before the capture — `DEMO-BYPASS-00` — and
the capture land above the signed cap. Nothing here is hidden to make the demo look
better.”

**Action:** show the amber banner and the `BYPASSED · DEMO-BYPASS-00` badge, then the
capture amount.

---

### 2:25 – 2:50 · Dispute court

**Screen:** `/disputes`, Case A and Case B side by side.

**On-screen text:** `Rules decide liability · the model only explains`

**Say:** “The arbiter runs deterministic checks first: signatures, chain, mandate
compliance, capture versus agreed price, receipt versus delivered items. Case A: the
delivery record defeats the claim. Case B: the buyer agent acted outside its mandate,
so the merchant is refunded in full. The model is only allowed to narrate an
ambiguity, and any answer citing evidence outside the packet is thrown away.”

**Action:** point at the two verdicts and the liability meters, then expand **Drafted
merchant response**.

---

### 2:50 – 3:00 · Close

**Screen:** `/ledger`, press **Flip one byte in #0**, then `/trust`.

**On-screen text:** `Verifiable evidence · recomputable trust · MIT`

**Say:** “One flipped byte and the ledger names the exact broken entry. That's the
whole idea: agents can move money, but they leave a receipt you can verify without
trusting them. Open source, MIT, on the PayPal Sandbox.”

---

## Recording checklist

- [ ] `pnpm demo:reset` completed; both cases show `RULED`.
- [ ] Shell shows `PayPal sandbox` (or the fallback badge, which you must mention).
- [ ] Shell shows `Live model` or `Scripted` — say which, do not imply a model is
      running when it is not.
- [ ] Browser zoom 100%, one tab per screen, no console visible.
- [ ] Cursor visible; no mouse jitter over the verdict text.
- [ ] Captions burned in for the on-screen text lines above.
