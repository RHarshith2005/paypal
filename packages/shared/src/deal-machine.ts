import type { DealStatus } from "./schemas";

/**
 * Deal state machine.
 *
 * The nine states are the ones the protocol names, plus FAILED: a deal that
 * fails its handshake, its mandate check or its payment has to become terminal
 * somewhere, and a terminal failure state is more honest than parking a broken
 * deal in NEGOTIATING forever. `RESOLVED` and `FAILED` are terminal.
 */
export const DEAL_STATES = [
  "CREATED",
  "HANDSHAKE",
  "NEGOTIATING",
  "AGREED",
  "PAID",
  "RECEIPT_SIGNED",
  "DISPUTED",
  "RESOLVED",
  "FAILED",
] as const satisfies readonly DealStatus[];

export const DEAL_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  CREATED: ["HANDSHAKE", "FAILED"],
  HANDSHAKE: ["NEGOTIATING", "FAILED"],
  NEGOTIATING: ["AGREED", "FAILED"],
  AGREED: ["PAID", "FAILED"],
  PAID: ["RECEIPT_SIGNED", "FAILED"],
  RECEIPT_SIGNED: ["DISPUTED", "RESOLVED", "FAILED"],
  DISPUTED: ["RESOLVED", "FAILED"],
  RESOLVED: [],
  FAILED: [],
};

export class IllegalDealTransitionError extends Error {
  readonly code = "ILLEGAL_DEAL_TRANSITION";

  constructor(
    readonly from: DealStatus,
    readonly to: DealStatus,
  ) {
    super(`illegal deal transition: ${from} -> ${to}`);
    this.name = "IllegalDealTransitionError";
  }
}

export function canTransition(from: DealStatus, to: DealStatus): boolean {
  return DEAL_TRANSITIONS[from].includes(to);
}

/** Idempotent form used by the orchestrator: repeating the current state is a no-op. */
export function transitionDeal(from: DealStatus, to: DealStatus): DealStatus {
  if (from === to) return to;
  return assertTransition(from, to);
}

export function assertTransition(from: DealStatus, to: DealStatus): DealStatus {
  if (!canTransition(from, to)) throw new IllegalDealTransitionError(from, to);
  return to;
}

export function isTerminal(status: DealStatus): boolean {
  return DEAL_TRANSITIONS[status].length === 0;
}

/** Position in the happy path; used to skip completed work when resuming. */
export function progressRank(status: DealStatus): number {
  const order: readonly DealStatus[] = [
    "CREATED",
    "HANDSHAKE",
    "NEGOTIATING",
    "AGREED",
    "PAID",
    "RECEIPT_SIGNED",
    "DISPUTED",
    "RESOLVED",
  ];
  const index = order.indexOf(status);
  return index === -1 ? -1 : index;
}
