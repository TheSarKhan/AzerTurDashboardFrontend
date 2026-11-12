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
