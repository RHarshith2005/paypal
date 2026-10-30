import { parseUsdToMinor, toPayPalAmount } from "@handshake/shared";
import { PaypalError } from "./errors";

/** PayPal expects decimal strings such as "12.34"; the domain uses integer cents. */
export function toWireAmount(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new PaypalError("VALIDATION", `amountMinor must be a non-negative integer, received ${amountMinor}`);
  }
  return toPayPalAmount(amountMinor);
}

export function parseWireAmount(value: string): number {
  try {
    return parseUsdToMinor(value);
  } catch (error) {
    throw new PaypalError("MALFORMED_RESPONSE", `PayPal returned an unexpected amount: ${value}`, { cause: error });
  }
}

/** The protocol is USD-only; anything else is a hard configuration error. */
export function assertUsd(currencyCode: string): "USD" {
  if (currencyCode !== "USD") {
    throw new PaypalError("UNSUPPORTED", `Handshake only supports USD; PayPal returned ${currencyCode}`);
  }
  return "USD";
}
