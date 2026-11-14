// Unit rates have at most six decimal places. Integer micros avoid binary half-rounding errors.
export function lineAmount(line: {
  quantity: number;
  nights: number;
  unitPrice: number;
}) {
  const micros =
    Math.round(line.unitPrice * 1_000_000) * line.quantity * line.nights;
  return Math.floor((micros + 500_000) / 1_000_000);
}

export const DEFAULT_MARGIN = 15;
/** "guide-2" is a second guide line; its kind is "guide". */
export const baseOf = (key: string) => key.replace(/-\d+$/, "");
export const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
/** What the customer pays per unit for a cost and a margin in percent. */
export const withMargin = (cost: number, margin: number) =>
  round6(cost * (1 + margin / 100));
/** Older offers have no cost: the price they carry is the cost and there is no margin. */
export const lineCost = (l: { unitPrice: number; costPrice?: number | null }) =>
  l.costPrice ?? l.unitPrice;
export const lineMargin = (l: { costPrice?: number | null; marginPercent?: number | null }) =>
  l.marginPercent ?? (l.costPrice == null ? 0 : DEFAULT_MARGIN);
/** The cost of a whole line, in the same rounding the customer price uses. */
export function lineCostAmount(l: {
  quantity: number;
  nights: number;
  unitPrice: number;
  costPrice?: number | null;
}) {
  return lineAmount({ quantity: l.quantity, nights: l.nights, unitPrice: lineCost(l) });
}
