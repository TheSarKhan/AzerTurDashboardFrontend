export type Locale = "en" | "ru" | "az";
const base = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");
export interface Tour {
  slug: string;
  titleEn: string;
  titleRu: string;
  titleAz: string;
  region: string;
  days: number;
  fromPriceEur: number;
  image: string;
}
export interface QuoteSummary {
  id: string;
  tourSlug: string;
  currency: string;
  total: number;
  deposit: number;
  departure: string;
  createdAt: string;
  expiresAt: string;
}
export interface Overview {
  tourCount: number;
  quoteCount: number;
  recentQuotes: QuoteSummary[];
  mode: string;
}
export interface Booking {
  id: string;
  customerId: string;
  quoteId: string;
  status: string;
  currency: string;
  total: number;
  deposit: number;
  paid: number;
  departure: string;
  title: string;
  quotePayload: string;
  customerNote: string;
  operatorNote: string;
  createdAt: string;
}
export interface BookingRequest {
  id: string;
  bookingId: string;
  kind: string;
  message: string;
  status: string;
  response: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  booking_id: string;
  channel: string;
  event: string;
  status: string;
  attempts: number;
  created_at: string;
}
export interface Audit {
  actor: string;
  action: string;
  note: string;
  created_at: string;
}
export async function api<T>(
  path: string,
  authorization?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "" }));
    throw Error(
      response.status === 401 || response.status === 403
        ? "ACCESS_DENIED"
        : data.error || "REQUEST_FAILED",
    );
  }
  if (response.status === 204 || response.headers.get("content-length") === "0")
    return undefined as T;
  return response.json();
}
export const overview = (auth: string) =>
  api<Overview>("/api/v1/operations/overview", auth);
export const tours = () => api<Tour[]>("/api/v1/tours");
export const bookings = (auth: string) =>
  api<Booking[]>("/api/v1/operations/bookings", auth);
export const requests = (auth: string) =>
  api<BookingRequest[]>("/api/v1/operations/requests", auth);
export const notifications = (auth: string) =>
  api<{items:Notification[]}>("/api/v1/operations/notifications", auth).then(x=>x.items);
