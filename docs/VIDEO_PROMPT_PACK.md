# Video prompt pack — generated b-roll for the 3:00 cut

This file covers the half of the demo film that is **not** a screen recording: the
eight generated clips that open scenes, bridge between routes and close the film.

[`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) is the authoritative cut. It names the route, the
action and the narration for every beat. This pack only supplies the 2–6 second
inserts that go **around** those beats. No generated clip may stand in for the
product.

> **The rule that makes this work.** A text-to-video model cannot draw this app. It
> does not know what `M-OK-00` looks like, and it will invent a plausible dashboard
> that is not ours. Generated clips are used only where no real UI is on screen —
> abstract glass, light, a chain — and every frame that shows a number, a rule id or
> a signature is a real screen recording at 1440×900.

---

## Palette — grade the generated clips to the app, not the other way round

The app is near-black with emerald as its single signature accent. A lime / violet /
peach film will look like a different product the moment a real screenshot appears,
so the prompts below use the app's actual tokens (from
[`apps/web/src/index.css`](../apps/web/src/index.css) and the Tailwind accent set):

| Role                  | Value                                | Where it comes from                                     |
| :-------------------- | :----------------------------------- | :------------------------------------------------------ |
| Screen black          | `#05080e`                            | `--color-ink-950`, the page background                  |
| Panel                 | `#080d15` at 82% + blur              | `.panel` glass card                                     |
| Panel lifted          | `#0b111b`                            | `--color-ink-850`, steppers and inner surfaces          |
| Signature accent      | `#34d399` → `#5eead4`                | `emerald-400` → `teal-300`, the budget and trust meters |
| Informational         | `#38bdf8` → `#67e8f9`                | `sky-400` → `cyan-300`, runtime and model state         |
| Attention / SIMULATED | `#fbbf24` → `#fdba74`                | `amber-400` → `orange-300`, the mock-payment warning    |
| Failure / tamper      | `#fb7185`                            | `rose-400`, denied, failed and tampered entries         |
| Backdrop              | emerald + sky radials on a 56px grid | `.app-backdrop`                                         |

Two consequences:

1. **Emerald is the only "good" light.** Anything green in the film means "allowed".
   Violet and peach are not in this product; the pack's original art direction would
   read as a different brand.
2. **Amber is reserved for simulation.** A generated amber pulse next to a real
   capture is fine; an amber glow around a real, verified receipt would be a lie
   about the product. Use emerald for anything verified.

If you keep the original violet/teal/peach look for scene-interstitial art, apply the
same grade to every generated clip so the cuts hold, and never place that palette
inside a shot that also contains the real UI.

---

## Style prefix

Paste before every clip.

```
Premium product film, 16:9, 24fps, slow cinematic camera. A floating dark glass
dashboard with rounded corners (#05080e screen, translucent #080d15 cards with
hairline 1px light edges) hovering in a deep near-black void. A single emerald-to-teal
gradient light source (#34d399 to #5eead4) with a faint cool sky-blue rim (#38bdf8).
Soft bloom, subtle film grain, gentle depth of field, generous empty space. Ultra
clean, restrained, expensive. No readable text, no logos, no human faces, no UI
labels.
```

## Negative prompt

```
text, letters, numbers, captions, watermark, logos, brand marks, faces, hands, extra
fingers, glitch, flicker, harsh shadows, cluttered interface, dense dashboard
skeuomorphism, neon cyberpunk, purple haze, magenta, green screen, stock-photo look,
robots, circuit boards, bitcoin, floating coins
```

Adjustment for the one-paste storyboard and image-to-video variants at the end of
this file: swap in the short style line, keep the negative prompt verbatim.

---

## Scene-by-scene

Each scene lists the prompt, the length to generate, and — more importantly — the
**real footage it sits against**, so the clip is cut for a purpose rather than
generated and then decorated around.

### Scene 1 · Hook — 4s

```
Slow push-in on a dim studio desk at night, a closed laptop glowing softly at the
edge of frame, a small plain parcel resting beside it, faint emerald light spilling
from under the laptop lid. Shallow depth of field, dust in the light, no people. The
screen stays dark; the glow does the work.
```

- **Cut against:** 0:00–0:06, before the first screen capture. Overview route follows.
- **On-screen text (editor):** `Agents can already pay. They can't prove they were allowed to.`
- **Why it earns its place:** it says "a purchase happened" in one frame without a
  single number that could be wrong.
- **Do not generate the dashboard here.** The first real screenshot must be the
  first dashboard the viewer sees.

### Scene 2 · What it is — 4s

```
In a deep near-black void, two soft luminous orbs — one emerald, one cool sky blue —
drift toward each other and exchange a small point of light, while a chain of
translucent glass blocks assembles beneath them link by link, each link settling with
a faint emerald pulse. Calm, slow, premium bloom.
```

- **Cut against:** 0:06–0:14, as the bed under the cold-open line, resolving into the
  Overview screenshot.
- **This is the thesis shot:** two parties, one token, an ordered record. It is the
  only clip that should imply the whole product.

### Scene 3 · Mandate — 4s

```
Macro on a stack of translucent glass cards, the front card carrying a soft
emerald-to-teal gradient edge. A thin line of light draws a signature stroke across
it and resolves into a glowing circular seal that settles into the card's corner.
Slow, precise, elegant.
```

- **Cut against:** 0:15–0:20, then hard cut to `/mandate/new` and the real builder.
- **On-screen text (editor):** `Signed authority · limits enforced in code`
- **Honest detail:** the seal is a visual metaphor for a signature, not a depiction
  of Ed25519 output. Do not caption it "verified on-chain".

### Scene 4 · Handshake — 5s

```
Two translucent glass cards, one emerald and one cool sky blue, slide in from
opposite sides and meet edge to edge; a soft ring of light expands from the seam and
settles into a steady emerald glow. Deep near-black backdrop, faint bloom, slow
camera.
```

- **Cut against:** 0:40–0:50, then cut to the deal page's handshake panel and its
  fifteen recorded checks.
- **When the real check list appears,** the seam glow should have already faded to
  emerald. Never let the generated glow outlive the beat — it would look like the
  film is asserting a pass the UI has not shown yet.

### Scene 5 · Payment and receipt — 5s

```
A glass card with an emerald-to-teal gradient edge; a soft horizontal band of light
inside it contracts smoothly, then a row of glass blocks locks into a chain one link
at a time, each link sealing with a quiet emerald pulse. Camera tracks slowly along
the chain.
```

- **Cut against:** 1:30–1:45, before the payment panel and the receipt.
- **On-screen text (editor):** `PayPal Sandbox · idempotent · dual-signed`
- **Never put a number in this clip.** The amount, the order id and the capture id
  come from the real screen recording or from a text card, typed by you.

### Scene 6 · Dispute court — 5s

```
Two parallel glass panels side by side in a near-black void, each holding a
ring-shaped donut of light. The left ring settles into steady emerald; the right
pulses amber-coral and then calms. An abstract balance of light sits between them.
No figures, slow camera.
```

- **Cut against:** 2:25–2:35, then cut to `/disputes` with both verdicts visible.
- **Colour discipline:** emerald = the purchase that stood, amber-coral = the agent
  that acted out of mandate. Do not invert these for visual variety; the court's
  meters use the same language.

### Scene 7 · Tamper test — 4s

```
A long chain of glass blocks receding into darkness. One block flickers once and
turns rose-coral, its edge cracking with a thin cold light, while every other block
stays steady emerald-edged. Slow track along the chain toward the failing block,
then hold.
```

- **Cut against:** 2:50–2:56, then the real `/ledger` tamper control that names the
  broken entry.
- **This is a visual claim.** Keep it to one flicker and one failed block, because the
  product's tamper test also changes exactly one byte and names exactly one entry.

### Scene 8 · Close — 5s

```
Slow pull-back from a floating dark glass dashboard, unlabelled, over a deep
near-black gradient with a soft emerald glow at the lower edge. Gentle bloom, fine
grain, large clean empty space in the upper centre. The camera keeps moving as the
frame opens up.
```

- **Cut against:** the final 3 seconds. Title card and `handshake` wordmark are added
  in the editor inside the empty space.
- **Do not generate a logo.** Leave the space empty.

---

## One-paste multi-shot version

For tools that accept a single storyboard prompt. Keep the shots in this order so the
clip can be sliced into the cut at the markers above.

```
[Style: premium product film, floating dark glass (#05080e, panels #080d15) in a deep
near-black void, emerald-to-teal light (#34d399 to #5eead4) with a cool sky-blue rim
(#38bdf8), soft bloom, subtle grain, slow camera, 16:9, no text, no logos, no faces.]
Shot 1 (4s): night studio desk, closed laptop glowing softly, small parcel beside it.
Shot 2 (4s): emerald and sky-blue orbs exchange a point of light; a chain of glass
blocks assembles beneath them.
Shot 3 (4s): macro on stacked glass cards; a line of light draws a signature and
resolves into a circular seal.
Shot 4 (5s): two glass cards meet edge to edge; a ring of light expands from the seam
and settles to emerald.
Shot 5 (5s): a gradient-edged card; a band of light contracts, then glass blocks lock
into a chain, each with a quiet pulse.
Shot 6 (5s): two side-by-side glass panels with donut rings of light, left steady
emerald, right pulsing amber-coral.
Shot 7 (4s): one block in a long glass chain turns rose-coral while the rest stay
steady; slow track toward it.
Shot 8 (5s): slow pull-back from the floating dashboard over the dark gradient, empty
space in the upper centre.
```

---

## Image-to-video version

For the one case where a generated clip may start from the real product: a still of a
real screen used as the first frame, so the model animates **our** layout instead of
inventing one.

Capture the frame first, from the running app:

- 1440×900, browser zoom 100%, light-mode OS notifications off, no cursor over the
  content you want to keep.
- Prefer `/` (Overview) for the opener and `deals/:id` for the receipt moment. Both
  are the highest-information screens.
- Re-shoot after `pnpm demo:reset` so the numbers in the still match the recording.

Then:

```
Subtle parallax, the cards float a few pixels, a soft emerald glow pulse travels once
across the panel edges, very slow push-in. Keep the layout, the text and the numbers
exactly as they are — do not redesign, do not add elements, do not change any label.
```

- **Review the output frame by frame before using it.** Models routinely retype
  numbers and rule ids. If a single digit changed, discard the clip; a film about
  verifiable evidence cannot show a fabricated amount.
- Cap any image-to-video shot at 3 seconds. Long durations are where the drift
  happens.

---

## Text cards (added in the editor, never generated)

Every line below is burned in during editing, in the app's own type: Inter Variable
for copy, JetBrains Mono for ids and amounts.

| Time | Text                                                             |
| :--- | :--------------------------------------------------------------- |
| 0:00 | `Agents can already pay. They can't prove they were allowed to.` |
| 0:15 | `Signed authority · limits enforced in code`                     |
| 0:40 | `Mutual attestations · fresh nonces · binding checks`            |
| 1:05 | `The model proposes · the guard disposes`                        |
| 1:30 | `PayPal Sandbox · idempotent · dual-signed`                      |
| 1:55 | `Guard bypassed · recorded before the money moved`               |
| 2:25 | `Rules decide liability · the model only explains`               |
| 2:50 | `Verifiable evidence · recomputable trust · MIT`                 |

Two cards are mandatory and must not be omitted or softened, because they are the
difference between a demo and a misleading ad:

- **At 0:40, on first appearance of the handshake panel:** `Identity attestations and the trust anchor are SIMULATED. Signatures are real Ed25519.`
- **If the shell shows the mock fallback badge:** say it out loud, and hold a card
  reading `SIMULATED payments · no funds moved` for the whole payment beat.

The same rule as the app applies to the film: anything simulated is labelled on
screen, not only in the description.

---

## Production settings

- **Generate 2–3 takes per scene**, keep 4–6 seconds each, and take the cleanest. At
  this length the cost is low and the good take is rarely the first.
- **Reuse one seed or style reference** across all eight scenes. Consistent palette
  across inserts matters more than each insert's individual quality.
- **One accent per clip.** A clip with emerald, sky and amber all fighting reads as
  noise at 24fps on a laptop screen.
- **Keep the final cut under 3:00** and publish to YouTube as public or unlisted.
- **Audio:** no generated music with a hard drop. The narration carries the film; a
  quiet bed under the b-roll and silence under the verdicts is the stronger choice.
- **Sound off too.** Assume a judge watches muted first. Captions plus real UI text
  must tell the whole story.

## Assembly order

1. `pnpm demo:reset`, then record the eight beats from [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
   in one pass at 1440×900.
2. Lay the screen recordings on the timeline first, in the beat order, with no b-roll.
   If the film does not work yet, generated clips will not save it.
3. Insert scenes 1–8 at the markers above, keeping each under 5 seconds.
4. Add text cards, the two SIMULATED cards, and the end title in the editor.
5. Watch once with sound off, once at 2× speed, and once on a phone. Anything that
   only reads on a large screen gets a bigger caption or gets cut.
