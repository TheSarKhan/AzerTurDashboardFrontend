export type OfferLine = {
  key: string;
  name: string;
  quantity: number;
  nights: number;
  unitPrice: number;
  unit: string;
  supplier: string;
  location: string;
  availability: "NOT_CHECKED" | "CONFIRMED" | "UNAVAILABLE";
  policy: string;
  internalNote: string;
  // Row of the route the service belongs to: 0 start, 1..days the days, days + 1 the end.
  row?: number | null;
  // What the office pays and the margin on top. Only the office sees these two.
  costPrice?: number | null;
  marginPercent?: number | null;
  // A customer price typed by hand; it wins over cost plus margin.
  fixedPrice?: number | null;
};
export type OfferDraft = {
  version: number;
  sourceQuoteId: string;
  title: string;
  currency: string;
  itinerary: { city: string; description: string; day?: number | null }[];
  returnRoute: string;
  services: OfferLine[];
  message: string;
  internalNote: string;
  startCity?: string | null;
  endCity?: string | null;
};
export type PublicOffer = {
  id: string | null;
  bookingId: string;
  revision: number;
  draftVersion: number;
  title: string;
  currency: string;
  date: string;
  travelers: number;
  itinerary: { city: string; description: string; day?: number | null }[];
  returnRoute: string;
  services: {
    key: string;
    name: string;
    quantity: number;
    nights: number;
    unitPrice: number;
    unit: string;
    total: number;
    policy: string;
    row?: number | null;
  }[];
  total: number;
  message: string;
  sentAt: string | null;
  startCity?: string | null;
  endCity?: string | null;
};
