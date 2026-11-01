import { matchesForbiddenSubstitution, type CatalogProduct, type Mandate } from "@handshake/shared";

export interface PlannedLine {
  sku: string;
  quantity: number;
}

/**
 * The buyer agent's opening intent: the two cheapest eligible items in an allowed
 * category, with a quantity that stays inside the per-item cap.
 *
 * This is deliberately budget-agnostic. The plan is what the agent *wants*; the
 * mandate guard is what decides whether it may have it. Planning inside the
 * budget would hide the enforcement the demo is meant to show.
 */
export function planCart(mandate: Mandate, catalog: readonly CatalogProduct[]): PlannedLine[] {
  const eligible = catalog
    .filter((product) => mandate.allowedCategories.includes(product.category))
    .filter((product) => product.stock >= 1)
    .filter(
      (product) =>
        matchesForbiddenSubstitution(
          {
            sku: product.sku,
            name: product.name,
            category: product.category,
            quantity: 1,
            unitPriceMinor: product.listPriceMinor,
          },
          mandate.forbiddenSubstitutions,
        ) === null,
    )
    .filter((product) => product.listPriceMinor <= mandate.perItemMax)
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const lines: PlannedLine[] = [];
  const first = eligible[0];
  if (first) {
    const affordableQuantity = Math.max(1, Math.floor(mandate.perItemMax / first.listPriceMinor));
    lines.push({ sku: first.sku, quantity: Math.min(2, first.stock, affordableQuantity) });
  }
  const second = eligible[1];
  if (second) lines.push({ sku: second.sku, quantity: 1 });
  return lines;
}
