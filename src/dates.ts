/** Every date in the panel is written dd.mm.yyyy (and dd.mm.yyyy HH:mm), whatever the language. */
const BAKU = "Asia/Baku";

function bakuParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BAKU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** "2026-11-17" or a timestamp → "17.11.2026" (timestamps use Baku time). */
export function formatDay(value?: string | null, _locale?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const p = bakuParts(date);
  return `${p.day}.${p.month}.${p.year}`;
}

/** A timestamp → "17.11.2026 14:30" in Baku time. */
export function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const p = bakuParts(date);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
