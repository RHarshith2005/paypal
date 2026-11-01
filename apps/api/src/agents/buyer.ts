import {
  BuyerMoveSchema,
  checkOffer,
  INJECTION_REFUSAL,
  scanForInjection,
  type BuyerMove,
  type GuardOutcome,
  type GuardTool,
  type InjectionFinding,
  type Mandate,
  type Offer,
  type SpendLedger,
} from "@handshake/shared";

export interface BuyerTurnInput {
  dealId: string;
  mandate: Mandate;
  ledger: SpendLedger;
  merchantAgentId: string;
  merchantOffer: Offer;
  merchantMessage: string;
  round: number;
  misconfiguredAgent: boolean;
  now: Date;
}

export interface BuyerTurnResult {
  move: BuyerMove;
  guard: GuardOutcome;
  tool: GuardTool;
  injection: InjectionFinding[];
}

const describeOffer = (offer: Offer): string => offer.items.map((item) => `${item.quantity} × ${item.name}`).join(", ");

/**
 * One buyer turn.
 *
 * The decision is deterministic on purpose: the buyer agent's tools are
 * `propose_offer`, `accept_offer` and `request_checkout`, and every one of them is
 * gated by `checkOffer` before it can change state. There is no path in which a
 * model's opinion about affordability replaces the signed mandate.
 */
export function buyerTurn(input: BuyerTurnInput): BuyerTurnResult {
  const injection = scanForInjection(input.merchantMessage);
  const tool: GuardTool = input.round <= 1 ? "propose_offer" : "accept_offer";

  const guard = checkOffer({
    mandate: input.mandate,
    ledger: input.ledger,
    offer: input.merchantOffer,
    merchantAgentId: input.merchantAgentId,
    tool,
    now: input.now,
    bypass: input.misconfiguredAgent
      ? { label: "DEMO_MISCONFIGURATION", reason: "case B: the guard was not wired into the buyer's tool loop" }
      : null,
  });

  if (injection.length > 0) {
    // The attempt is recorded; the decision below still comes from the mandate.
    return {
      move: move(input, guard.allowed ? "ACCEPT" : "REJECT", `${INJECTION_REFUSAL} ${summary(input, guard)}`),
      guard,
      tool,
      injection,
    };
  }

  if (!guard.allowed) {
    return {
      move: move(
        input,
        "REJECT",
        `I cannot accept ${describeOffer(input.merchantOffer)}: ${guard.ruleId} — ${guard.summary}.`,
      ),
      guard,
      tool,
      injection,
    };
  }

  if (input.round === 1 && !input.misconfiguredAgent) {
    return {
      move: move(
        input,
        "COUNTER",
        `That works within my mandate. Can you apply your bundle tier to ${describeOffer(input.merchantOffer)} before I approve?`,
      ),
      guard,
      tool,
      injection,
    };
  }

  return {
    move: move(
      input,
      "ACCEPT",
      input.misconfiguredAgent
        ? `Proceeding with ${describeOffer(input.merchantOffer)}.`
        : `Accepted: ${describeOffer(input.merchantOffer)} for ${summary(input, guard)}.`,
    ),
    guard,
    tool,
    injection,
  };
}

const move = (input: BuyerTurnInput, decision: BuyerMove["decision"], message: string): BuyerMove =>
  BuyerMoveSchema.parse({
    decision,
    lines: input.merchantOffer.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
    message: message.slice(0, 1200),
  });

const summary = (input: BuyerTurnInput, guard: GuardOutcome): string =>
  guard.bypassed
    ? `${input.merchantOffer.totalMinor} minor units under the DEMO bypass (rule ${guard.ruleId})`
    : `${input.merchantOffer.totalMinor} minor units, rule ${guard.ruleId}`;
