import { OfferSchema } from "./schemas";
import type { CatalogProduct, MerchantMove, MerchantPolicy, Offer } from "./schemas";

/**
 * Merchant policy is configuration, not a prompt. The model may choose which
 * lines to quote and how much of a discount to *ask* for; every number below is
 * then recomputed here, and a discount can never take a line under its margin
 * floor. That is what makes "the merchant never goes below min margin, even if
 * the buyer pleads" a property of the code rather than of the transcript.
 */

/** Lowest price a line may be sold at: cost * (1 + margin), rounded up to the cent. */
export function marginFloorMinor(unitCostMinor: number, minMarginBps: number): number {
  return Math.ceil((unitCostMinor * (10_000 + minMarginBps)) / 10_000);
}

/** Best bundle tier the total quantity qualifies for. Tiers are not cumulative. */
export function bundleDiscountBps(policy: MerchantPolicy, totalQuantity: number): number {
  let discount = 0;
  for (const tier of [...policy.bundleDiscountTiers].sort((a, b) => a.minQuantity - b.minQuantity)) {
    if (totalQuantity >= tier.minQuantity) discount = Math.max(discount, tier.discountBps);
  }
  return discount;
}

export interface MerchantQuoteAdjustment {
  code: string;
  detail: string;
}

export interface MerchantStockShortfall {
  sku: string;
  requested: number;
  available: number;
}

export interface MerchantQuoteResult {
  ok: boolean;
  ruleId: string;
  reason: string;
  offer: Offer | null;
  adjustments: MerchantQuoteAdjustment[];
  totalMinor: number;
  costTotalMinor: number;
  floorTotalMinor: number;
  marginBps: number;
  stockShort: MerchantStockShortfall[];
}

export const DEFAULT_DELIVERY_DAYS = 3;

const termsFor = (deliveryDays: number): string =>
  `Delivered in ${deliveryDays} business days. Prices include quantity tiering and are fixed for 24 hours.`;

/**
 * Turn a model-chosen move into a priced offer.
 *
 * The move's `discountBps` is a request. Effective discount = min(requested,
 * bundle tier, policy cap), and each unit price is floored at its margin floor
 * afterwards, so a hostile or hallucinating model cannot sell below cost.
 */
export function quoteFromMove(input: {
  policy: MerchantPolicy;
  catalog: readonly CatalogProduct[];
  move: MerchantMove;
  round: number;
  deliveryDays?: number;
}): MerchantQuoteResult {
  const { policy, catalog, move, round } = input;
  const rejected = (ruleId: string, reason: string): MerchantQuoteResult => ({
    ok: false,
    ruleId,
    reason,
    offer: null,
    adjustments: [],
    totalMinor: 0,
    costTotalMinor: 0,
    floorTotalMinor: 0,
    marginBps: 0,
    stockShort: [],
  });

  if (round > policy.maxRounds) {
    return rejected("S-ROUNDS-03", `round ${round} exceeds the ${policy.maxRounds}-round negotiation limit`);
  }

  if (move.action === "REJECT" || move.action === "INFO") {
    return {
      ok: true,
      ruleId: move.action === "REJECT" ? "S-REJECT-00" : "S-INFO-00",
      reason: move.action === "REJECT" ? "the merchant declined to quote" : "the merchant answered without a quote",
      offer: null,
      adjustments: [],
      totalMinor: 0,
      costTotalMinor: 0,
      floorTotalMinor: 0,
      marginBps: 0,
      stockShort: [],
    };
  }

  if (move.lines.length === 0) {
    return rejected("S-LINES-01", "a quote must contain at least one line item");
  }

  const adjustments: MerchantQuoteAdjustment[] = [];
  const stockShort: MerchantStockShortfall[] = [];
  const missing: string[] = [];
  const totalQuantity = move.lines.reduce((sum, line) => sum + line.quantity, 0);

  const requestedDiscount = move.discountBps;
  const tierDiscount = bundleDiscountBps(policy, totalQuantity);
  // Published bundle tiers apply on their own; a model may ask for more, never beyond the cap.
  const effectiveDiscountBps = Math.min(Math.max(requestedDiscount, tierDiscount), policy.maxDiscountFromListBps);
  if (effectiveDiscountBps < requestedDiscount) {
    adjustments.push({
      code: "S-DISCOUNT-05",
      detail: `requested ${requestedDiscount} bps, applied ${effectiveDiscountBps} bps (bundle tier ${tierDiscount} bps, cap ${policy.maxDiscountFromListBps} bps)`,
    });
  }

  const items: Array<{ sku: string; name: string; category: string; quantity: number; unitPriceMinor: number }> = [];
  let costTotalMinor = 0;
  let floorTotalMinor = 0;

  for (const line of move.lines) {
    const product = catalog.find((candidate) => candidate.sku === line.sku);
    if (!product) {
      missing.push(line.sku);
      continue;
    }
    if (line.quantity > product.stock) {
      stockShort.push({ sku: product.sku, requested: line.quantity, available: product.stock });
      continue;
    }

    const tieredUnit = Math.round((product.listPriceMinor * (10_000 - effectiveDiscountBps)) / 10_000);
    const floorUnit = marginFloorMinor(product.unitCostMinor, policy.minMarginBps);
    const unitPriceMinor = Math.max(tieredUnit, floorUnit);
    if (unitPriceMinor !== tieredUnit) {
      adjustments.push({
        code: "S-MARGIN-06",
        detail: `${product.sku} discount would have priced at ${tieredUnit}, floored at ${floorUnit} to hold the ${policy.minMarginBps} bps margin`,
      });
    }

    items.push({
      sku: product.sku,
      name: product.name,
      category: product.category,
      quantity: line.quantity,
      unitPriceMinor,
    });
    costTotalMinor += product.unitCostMinor * line.quantity;
    floorTotalMinor += floorUnit * line.quantity;
  }

  if (missing.length > 0) {
    return rejected("S-SKU-02", `unknown catalog sku(s): ${missing.join(", ")}`);
  }
  if (stockShort.length > 0) {
    const first = stockShort[0]!;
    return {
      ...rejected("S-STOCK-04", `${first.sku} requested ${first.requested} but only ${first.available} are in stock`),
      stockShort,
    };
  }

  const totalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  // minMarginBps is a markup over cost, matching `marginFloorMinor` above.
  const marginBps = costTotalMinor === 0 ? 0 : Math.round(((totalMinor - costTotalMinor) * 10_000) / costTotalMinor);

  // Defence in depth: the per-line floor already guarantees this, and we refuse
  // to emit a quote if arithmetic ever says otherwise.
  if (marginBps < policy.minMarginBps) {
    return rejected(
      "S-MARGIN-07",
      `quote margin ${marginBps} bps is below the ${policy.minMarginBps} bps floor; refusing to emit it`,
    );
  }

  const deliveryDays = input.deliveryDays ?? DEFAULT_DELIVERY_DAYS;
  const offer = OfferSchema.parse({
    currency: "USD",
    items,
    totalMinor,
    deliveryDays,
    terms: termsFor(deliveryDays),
  });

  return {
    ok: true,
    ruleId: "S-OK-00",
    reason: "quote respects stock, the discount cap and the margin floor",
    offer,
    adjustments,
    totalMinor,
    costTotalMinor,
    floorTotalMinor,
    marginBps,
    stockShort: [],
  };
}
