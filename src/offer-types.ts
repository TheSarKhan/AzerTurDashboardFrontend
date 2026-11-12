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
};
export type OfferDraft = {
  version: number;
  sourceQuoteId: string;
  title: string;
  currency: string;
  itinerary: { city: string; description: string }[];
  returnRoute: string;
  services: OfferLine[];
  message: string;
  internalNote: string;
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
  itinerary: { city: string; description: string }[];
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
  }[];
  total: number;
  message: string;
  sentAt: string | null;
};
