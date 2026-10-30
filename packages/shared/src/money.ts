/** Money helpers. All amounts are integer USD cents until the last moment. */
export function formatUsd(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}

/** PayPal expects a decimal string such as "42.50". */
export function toPayPalAmount(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function parseUsdToMinor(input: string): number {
  const match = /^\$?(\d{1,9})(?:\.(\d{2}))?$/.exec(input.trim());
  if (!match) throw new Error(`invalid USD amount: ${input}`);
  const dollars = Number(match[1]);
  const cents = Number(match[2] ?? "0");
  return dollars * 100 + cents;
}

export function percentOf(minor: number, percent: number): number {
  return Math.round((minor * percent) / 100);
}
