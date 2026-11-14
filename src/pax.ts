/**
 * The site stores a group size as one number: 1-4 exact, the top of the band for larger
 * groups (10, 20, 50, 100) and 101 for 100+. This turns it back into what the customer chose.
 */
export function paxRange(pax: number) {
  if (!Number.isFinite(pax) || pax < 1) return "—";
  if (pax <= 4) return String(Math.trunc(pax));
  if (pax <= 10) return "5–10";
  if (pax <= 20) return "10–20";
  if (pax <= 50) return "20–50";
  if (pax <= 100) return "50–100";
  return "100+";
}
