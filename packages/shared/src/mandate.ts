import { offerLineTotal, type Mandate, type Offer, type OfferItem, type SpendLedger } from "./schemas";

export interface MandateCheckResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface MandateDecision {
  allowed: boolean;
  /** Rule that decided the outcome. M-OK-00 when every check passed. */
  ruleId: string;
  summary: string;
  checks: MandateCheckResult[];
  offerTotalMinor: number;
  remainingBeforeMinor: number;
  remainingAfterMinor: number;
}

export const emptyLedger = (): SpendLedger => ({
  settledMinor: 0,
  reservedMinor: 0,
  settledCount: 0,
  reservedCount: 0,
});

export const remainingBudgetMinor = (mandate: Mandate, ledger: SpendLedger): number =>
  Math.max(0, mandate.maxTotal - ledger.settledMinor - ledger.reservedMinor);

export const remainingTransactions = (mandate: Mandate, ledger: SpendLedger): number =>
  Math.max(0, mandate.maxTransactions - ledger.settledCount - ledger.reservedCount);

export function mandateActive(mandate: Mandate, now: Date): boolean {
  const issued = Date.parse(mandate.issuedAt);
  const expires = Date.parse(mandate.expiresAt);
  const t = now.getTime();
  return t >= issued && t < expires;
}

/** A merchant allowlist of null means the principal allowed any counterparty. */
export function merchantAllowed(mandate: Mandate, merchantAgentId: string): boolean {
  if (mandate.merchantAllowlist === null) return true;
  return mandate.merchantAllowlist.includes(merchantAgentId);
}

/**
 * Forbidden substitutions are plain tokens (for example "latex" or
 * "refurbished"). A line item matches when its SKU or product name contains one,
 * case-insensitively. Deterministic string matching, no model in the loop.
 */
export function matchesForbiddenSubstitution(item: OfferItem, tokens: readonly string[]): string | null {
  const sku = item.sku.toLowerCase();
  const name = item.name.toLowerCase();
  for (const token of tokens) {
    const needle = token.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (sku.includes(needle) || name.includes(needle)) return token;
  }
  return null;
}

/**
 * Rule 1 of this project: spending authority is checked here, in deterministic
 * code that a model cannot talk around. Every branch returns a rule id so the UI
 * and the evidence packet can show exactly why a purchase was allowed or blocked.
 */
export function evaluateMandate(input: {
  mandate: Mandate;
  ledger: SpendLedger;
  offer: Offer;
  merchantAgentId: string;
  now: Date;
}): MandateDecision {
  const { mandate, ledger, offer, merchantAgentId, now } = input;
  const offerTotalMinor = offer.totalMinor;
  const remainingBeforeMinor = remainingBudgetMinor(mandate, ledger);
  const active = mandateActive(mandate, now);
  const allowedMerchant = merchantAllowed(mandate, merchantAgentId);
  const badCategory = offer.items.find((item) => !mandate.allowedCategories.includes(item.category));
  const forbidden = offer.items
    .map((item) => ({ item, token: matchesForbiddenSubstitution(item, mandate.forbiddenSubstitutions) }))
    .find((entry) => entry.token !== null);
  const overItemCap = offer.items.find((item) => offerLineTotal(item) > mandate.perItemMax);
  const summedMinor = offer.items.reduce((sum, item) => sum + offerLineTotal(item), 0);

  const checks: MandateCheckResult[] = [
    {
      id: "M-EXPIRED-01",
      name: "Mandate is inside its validity window",
      passed: active,
      detail: active
        ? `valid until ${mandate.expiresAt}`
        : `outside validity window ${mandate.issuedAt} – ${mandate.expiresAt}`,
    },
    {
      id: "M-MERCHANT-02",
      name: "Merchant is approved by the principal",
      passed: allowedMerchant,
      detail:
        mandate.merchantAllowlist === null
          ? "the principal allowed any merchant"
          : allowedMerchant
            ? `${merchantAgentId} is on the allowlist`
            : `${merchantAgentId} is not in [${mandate.merchantAllowlist.join(", ")}]`,
    },
    {
      id: "M-CATEGORY-03",
      name: "Every line item is in an allowed category",
      passed: badCategory === undefined,
      detail: badCategory
        ? `${badCategory.sku} is ${badCategory.category}, allowed: [${mandate.allowedCategories.join(", ")}]`
        : `categories: [${[...new Set(offer.items.map((item) => item.category))].join(", ")}]`,
    },
    {
      id: "M-SUBSTITUTION-04",
      name: "No forbidden substitution",
      passed: forbidden === undefined,
      detail: forbidden
        ? `${forbidden.item.sku} matches forbidden token "${forbidden.token}"`
        : mandate.forbiddenSubstitutions.length === 0
          ? "the principal listed no forbidden substitutions"
          : `forbidden: [${mandate.forbiddenSubstitutions.join(", ")}]`,
    },
    {
      id: "M-CURRENCY-05",
      name: "Currency matches the mandate",
      passed: offer.currency === mandate.currency,
      detail: `offer ${offer.currency} vs mandate ${mandate.currency}`,
    },
    {
      id: "M-MATH-06",
      name: "Line-item arithmetic is consistent",
      passed: summedMinor === offerTotalMinor,
      detail: `stated total ${offerTotalMinor} vs summed ${summedMinor}`,
    },
    {
      id: "M-PER-ITEM-07",
      name: "Every line total is within the per-item cap",
      passed: overItemCap === undefined,
      detail: overItemCap
        ? `${overItemCap.sku} totals ${offerLineTotal(overItemCap)} against a cap of ${mandate.perItemMax}`
        : `cap ${mandate.perItemMax} per line`,
    },
    {
      id: "M-BUDGET-08",
      name: "Total fits the remaining lifetime budget",
      passed: offerTotalMinor <= remainingBeforeMinor,
      detail: `${offerTotalMinor} requested, ${remainingBeforeMinor} remaining of ${mandate.maxTotal}`,
    },
    {
      id: "M-COUNT-09",
      name: "Transaction count is within the mandate",
      passed: ledger.settledCount + ledger.reservedCount + 1 <= mandate.maxTransactions,
      detail: `${ledger.settledCount + ledger.reservedCount + 1} used of ${mandate.maxTransactions}`,
    },
  ];

  const failed = checks.find((check) => !check.passed);
  return {
    allowed: failed === undefined,
    ruleId: failed?.id ?? "M-OK-00",
    summary: failed ? failed.name : "Offer is inside the signed mandate",
    checks,
    offerTotalMinor,
    remainingBeforeMinor,
    remainingAfterMinor: Math.max(0, remainingBeforeMinor - offerTotalMinor),
  };
}
