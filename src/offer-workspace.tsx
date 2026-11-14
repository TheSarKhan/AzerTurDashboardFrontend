import { paxRange } from "./pax";
import { RouteMap } from "./route-map";
import TravelDocuments from './travel-documents';
import PartnerPicker from "./partner-picker";
import type { PartnerService } from "./office-management";
import { FinanceWorkspace } from "./finance-workspace";
import RequestWorkspace from "./request-workspace";
import PaymentWorkspace from "./payment-workspace";
import ContractWorkspace, { type ContractState } from "./contract-workspace";
import { Fragment, useEffect, useRef, useState } from "react";
import { navigate, useRoute } from "./route";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Check,
  Car,
  BedDouble,
  Users,
  Plane,
  Bus,
  Flower2,
  Mail,
  Phone,
  X,
  Eye,
  FileText,
  AlertTriangle,
  Utensils,
  Tickets,
  Camera,
  CalendarDays,
  CircleCheck,
  CreditCard,
  Landmark,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  api,
  type Booking,
  type BookingRequest,
  type Locale,
  type Tour,
} from "./api/client";
import type { OfferDraft, OfferLine, PublicOffer } from "./offer-types";
import "./offers.css";
import {
  DEFAULT_MARGIN,
  baseOf,
  lineAmount,
  lineCost,
  lineCostAmount,
  lineMargin,
  withMargin,
} from "./offer-pricing";
import { formatDay, formatDateTime } from "./dates";
const names: Record<string, string[]> = {
  transport: [
    "Private car & driver",
    "Автомобиль с водителем",
    "Şəxsi avtomobil və sürücü",
  ],
  hotel: ["Comfort stay", "Проживание", "Qalma yeri"],
  guide: ["Local guide", "Местный гид", "Yerli bələdçi"],
  transfer: ["Airport transfer", "Трансфер", "Hava limanı transferi"],
  intercity: ["Transfer to the next region", "Трансфер в следующий регион", "Növbəti rayona transfer"],
  activity: ["Local craft experience", "Мастер-класс", "Sənətkarlıq təcrübəsi"],
  event: ["Event", "Мероприятие", "Tədbir"],
  meals: ["Local meals", "Местная кухня", "Yerli yeməklər"],
  tickets: ["Entrance tickets", "Входные билеты", "Giriş biletləri"],
  photographer: ["Photographer", "Фотограф", "Fotoqraf"],
};
const KINDS = [
  "transport",
  "hotel",
  "guide",
  "transfer",
  "intercity",
  "activity",
  "event",
  "meals",
  "tickets",
  "photographer",
] as const;
const UNITS: Record<string, string> = {
  transport: "day",
  hotel: "room",
  guide: "day",
  transfer: "transfer",
  intercity: "transfer",
  activity: "person",
  event: "person",
  meals: "person",
  tickets: "person",
  photographer: "day",
};
const CITIES = ["Baku", "Quba", "Khinalug", "Gabala", "Sheki"];
const CITY_NAMES: Record<string, [string, string, string]> = {
  Baku: ["Baku", "Баку", "Bakı"],
  Quba: ["Quba", "Куба", "Quba"],
  Khinalug: ["Khinalug", "Хыналыг", "Xınalıq"],
  Gabala: ["Gabala", "Габала", "Qəbələ"],
  Sheki: ["Sheki", "Шеки", "Şəki"],
};
const icons: Record<string, typeof Car> = {
  transport: Car,
  hotel: BedDouble,
  guide: Users,
  transfer: Plane,
  intercity: Bus,
  activity: Flower2,
  event: CalendarDays,
  meals: Utensils,
  tickets: Tickets,
  photographer: Camera,
};
const routes: Record<string, string[]> = {
  "quba-khinalug": ["Quba", "Khinalug"],
  "baku-discovery": ["Baku"],
  "sheki-gabala": ["Baku", "Gabala", "Sheki"],
};
function initial(b: Booking): OfferDraft {
  const q = JSON.parse(b.quotePayload),
    input = q.input,
    route: string[] = input.cities || routes[input.slug] || ["Baku"],
    days = route.length,
    pax = Number(input.pax) || 2;
  // The customer's estimate is split over the route: a car and a guide for every day, a room for every
  // night, the airport transfer at the start and the experience on the first day. The office then adjusts
  // each row. The customer price starts at the customer's estimate (cost plus the default margin).
  const plan: { places: { city: string; services: string[] }[] }[] | null = Array.isArray(input.plan)
    ? input.plan
    : null;
  const lines: OfferLine[] = [];
  const add = (
    kind: string,
    row: number,
    quantity: number,
    nights: number,
    amount: number,
    city?: string,
  ) => {
    const cost = Math.max(
      0.01,
      Math.round((amount / (quantity * nights) / (1 + DEFAULT_MARGIN / 100)) * 100) / 100,
    );
    const same = lines.filter((l) => baseOf(l.key) === kind).length;
    lines.push({
      key: same ? kind + "-" + (same + 1) : kind,
      name: names[kind][0] + (city ? ", " + city : ""),
      quantity,
      nights,
      unitPrice: withMargin(cost, DEFAULT_MARGIN),
      unit: UNITS[kind],
      supplier: "",
      location: "",
      availability: "CONFIRMED",
      policy: "",
      internalNote: "",
      row,
      costPrice: cost,
      marginPercent: DEFAULT_MARGIN,
    });
  };
  if (plan) {
    // Day by day: the customer picked the services for every place. A car, a room and a guide are one
    // line per day (on the first place that has it); a transfer or an experience is one line per place.
    const entries = plan.flatMap((d, di) => d.places.map((p) => ({ ...p, day: di + 1 })));
    const where: Record<string, { row: number; city: string }[]> = {};
    entries.forEach((e, i) => {
      for (const kind of e.services) {
        const perDay = kind === "transport" || kind === "hotel" || kind === "guide";
        if (perDay && entries.slice(0, i).some((x) => x.day === e.day && x.services.includes(kind))) continue;
        (where[kind] ||= []).push({ row: i + 1, city: e.city });
      }
    });
    for (const line of q.lines as { label: string; amount: number }[]) {
      // The transfer line of the estimate holds airport transfers and transfers to the next region.
      const spots: { row: number; city: string; kind: string }[] =
        line.label === "transfer"
          ? [
              ...(where.transfer || []).map((x) => ({ ...x, kind: "transfer" })),
              ...(where.intercity || []).map((x) => ({ ...x, kind: "intercity" })),
            ]
          : (where[line.label] || []).map((x) => ({ ...x, kind: line.label }));
      const rooms = Math.ceil(pax / 2);
      for (const spot of spots) {
        const share = line.amount / spots.length;
        if (spot.kind === "hotel") add("hotel", spot.row, rooms, 1, share, spot.city);
        else if (spot.kind === "activity") add("activity", spot.row, pax, 1, share, spot.city);
        else add(spot.kind, spot.row, 1, 1, share, spot.city);
      }
    }
    // Events, meals, tickets and a photographer are not in the estimate: they start without a price.
    for (const kind of ["event", "meals", "tickets", "photographer"])
      for (const spot of where[kind] || []) {
        const same = lines.filter((l) => baseOf(l.key) === kind).length;
        lines.push({
          key: same ? kind + "-" + (same + 1) : kind,
          name: names[kind][0] + ", " + spot.city,
          quantity: UNITS[kind] === "person" ? pax : 1,
          nights: 1,
          unitPrice: 0,
          unit: UNITS[kind],
          supplier: "",
          location: "",
          availability: "CONFIRMED",
          policy: "",
          internalNote: "",
          row: spot.row,
          costPrice: 0,
          marginPercent: DEFAULT_MARGIN,
        });
      }
    return {
      version: 0,
      sourceQuoteId: b.quoteId,
      title: "Your custom journey",
      currency: b.currency,
      itinerary: entries.map((e) => ({ city: e.city, description: e.city, day: e.day })),
      returnRoute: "",
      services: lines,
      message: "",
      internalNote: "",
      startCity: input.startCity ?? "Baku",
      endCity: input.endCity ?? "Baku",
    };
  }
  for (const line of q.lines as { label: string; amount: number }[]) {
    const kind = line.label;
    if (kind === "transport" || kind === "guide")
      route.forEach((city, i) => add(kind, i + 1, 1, 1, line.amount / days, city));
    else if (kind === "hotel") {
      const rooms = Math.ceil(pax / 2),
        nights = Math.max(1, days - 1);
      for (let i = 0; i < nights; i++)
        add(kind, i + 1, rooms, 1, line.amount / nights, route[i]);
    } else if (kind === "transfer") add(kind, 0, 1, 1, line.amount);
    else if (kind === "activity") add(kind, 1, pax, 1, line.amount, route[0]);
  }
  return {
    version: 0,
    sourceQuoteId: b.quoteId,
    title: "Your custom journey",
    currency: b.currency,
    itinerary: route.map((city: string, i: number) => ({ city, description: city, day: i + 1 })),
    returnRoute: "",
    services: lines,
    message: "",
    internalNote: "",
    startCity: input.startCity ?? "Baku",
    endCity: input.endCity ?? "Baku",
  };
}
/** A number box that keeps what is being typed ("1." on the way to "1.5") and reports valid values. */
function NumField({
  value,
  onCommit,
  min,
  max,
  step,
  disabled,
  label,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onCommit(n);
      }}
    />
  );
}
export default function OfferWorkspace({
  auth,
  locale: l,
  bookings,
  requests,
  catalog,
  onDirtyChange,
  onOpenRequests,
}: {
  auth: string;
  locale: Locale;
  bookings: Booking[];
  requests: BookingRequest[];
  catalog: Tour[];
  onDirtyChange: (value: boolean) => void;
  onOpenRequests: () => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  function bookingName(item: Booking) {
    try {
      const input = JSON.parse(item.quotePayload).input;
      if (input.customDays)
        return t("Custom journey", "Индивидуальный маршрут", "Fərdi səfər");
      const tour = catalog.find((x) => x.slug === input.slug);
      return tour
        ? l === "az"
          ? tour.titleAz
          : l === "ru"
            ? tour.titleRu
            : tour.titleEn
        : item.title;
    } catch {
      return item.title;
    }
  }
  const [receivedMinor, setReceivedMinor] = useState(0);
  // The customer's contract for the latest offer: once they accept it, the work moves to managing the booking.
  const [contract, setContract] = useState<ContractState | null>(null);
  const [financeDirty, setFinanceDirty] = useState(false);
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [reject, setReject] = useState(false);
  const [freshBooking, setFreshBooking] = useState<Booking | null>(null);
  // Which request is open and which wizard step it is on both live in the address.
  const route = useRoute();
  const selected = route.view === "Bookings" ? (route.id ?? null) : null;
  const setSelected = (id: string | null) =>
    navigate({ view: "Bookings", id: id ?? undefined });
  const [draft, setDraft] = useState<OfferDraft | null>(null),
    [customer, setCustomer] = useState<{
      name: string;
      email: string;
      phone?: string | null;
      locale: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [previewVersion, setPreviewVersion] = useState(0),
    [sentVersion, setSentVersion] = useState(0),
    [editor, setEditor] = useState<OfferLine | null>(null),
    [preview, setPreview] = useState<PublicOffer | null>(null),
    [audit, setAudit] = useState<
      { action: string; actor: string; created_at: string }[]
    >([]),
    [search, setSearch] = useState("");
  const modalRef = useRef<HTMLDialogElement>(null),
    focusRef = useRef<HTMLElement | null>(null);
  const b =
    freshBooking?.id === selected
      ? freshBooking
      : bookings.find((x) => x.id === selected);
  const canEdit =
    b?.status === "PENDING_REVIEW" && b.paid === 0 && receivedMinor === 0;
  const count = draft?.services.length || 0,
    total = draft?.services.reduce((s, line) => s + lineAmount(line), 0) || 0,
    pending = requests.some(
      (x) => x.bookingId === selected && x.status === "PENDING",
    );
  const fmt = (n: number) =>
    new Intl.NumberFormat(l === "az" ? "en" : l, {
      style: "currency",
      currency: draft?.currency || b?.currency || "EUR",
      maximumFractionDigits: 6,
      minimumFractionDigits: 0,
    }).format(n);
  const label = (key: string) =>
    names[baseOf(key)]?.[l === "az" ? 2 : l === "ru" ? 1 : 0] || key;
  const cityLabel = (city: string) =>
    CITY_NAMES[city] ? t(...CITY_NAMES[city]) : city;
  function problem(e: unknown) {
    const code = e instanceof Error ? e.message : "";
    return (
      {
        STALE_OFFER: t(
          "Another employee saved changes. Reload the saved draft before editing.",
          "Другой сотрудник сохранил изменения. Загрузите черновик.",
          "Başqa əməkdaş dəyişiklik edib. Qaralamanı yenidən yükləyin.",
        ),
        SOURCE_CHANGED: t(
          "The original request changed. Reload the request and rebuild the draft.",
          "Исходная заявка изменилась. Загрузите её и создайте черновик заново.",
          "İlkin sorğu dəyişib. Sorğunu yeniləyib qaralamanı yenidən qurun.",
        ),
        REQUEST_PENDING: t(
          "Resolve the pending customer request before sending.",
          "Сначала обработайте запрос клиента.",
          "Əvvəl müştərinin gözləyən sorğusunu həll edin.",
        ),
        PREVIEW_REQUIRED: t(
          "Preview the saved version before sending.",
          "Просмотрите сохранённую версию перед отправкой.",
          "Göndərməzdən əvvəl saxlanmış versiyaya baxın.",
        ),
        SERVICE_CHECKS_REQUIRED: t(
          "Complete the supplier and availability for every service.",
          "Заполните поставщика и доступность каждой услуги.",
          "Hər xidmətin təchizatçısını və mövcudluğunu tamamlayın.",
        ),
      }[code] ||
      t(
        "Could not complete this action. Your edits are kept. Please retry or reload.",
        "Не удалось выполнить действие. Изменения сохранены в форме. Повторите.",
        "Əməliyyat alınmadı. Düzəlişlər formadadır. Yenidən yoxlayın.",
      )
    );
  }
  async function load(id: string) {
    setLoading(true);
    setError("");
    setNotice("");
    setCustomer(null);
    setDraft(null);
    setFreshBooking(null);
    setDirty(false);
    setPreviewVersion(0);
    setSentVersion(0);
    setReceivedMinor(0);
    setContract(null);
    setAudit([]);
    try {
      const [state, c, booking, payments, contractNow] = await Promise.all([
        api<{
          draft: OfferDraft;
          previewVersion: number;
          sentVersion: number;
        } | null>("/api/v1/operations/bookings/" + id + "/offer", auth),
        api<{ name: string; email: string; locale: string }>(
          "/api/v1/operations/bookings/" + id + "/customer",
          auth,
        ),
        api<Booking>("/api/v1/operations/bookings/" + id, auth),
        api<{ receivedMinor?: number; paidMinor: number }>(
          "/api/v1/operations/bookings/" + id + "/payment-context",
          auth,
        ),
        api<ContractState | null>("/api/v1/operations/bookings/" + id + "/contract", auth).catch(() => null),
      ]);
      setContract(contractNow);
      setFreshBooking(booking);
      setReceivedMinor(payments.receivedMinor ?? payments.paidMinor);
      setDraft(state?.draft || initial(booking));
      setCustomer(c);
      setPreviewVersion(state?.previewVersion || 0);
      setSentVersion(state?.sentVersion || 0);
    } catch (e) {
      setError(problem(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(
    () => onDirtyChange(dirty || paymentDirty || financeDirty),
    [dirty, paymentDirty, financeDirty, onDirtyChange],
  );
  useEffect(() => {
    if (selected) void load(selected);
    else {
      // Back to the list (also through the browser's back button): drop what belonged to the request.
      setDirty(false);
      setDraft(null);
      setError("");
      setNotice("");
    }
  }, [selected]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if ((editor || reject) && !modalRef.current?.open)
      modalRef.current?.showModal();
  }, [editor, reject]);
  function edit(next: OfferDraft) {
    setDraft(next);
    setDirty(true);
    setPreviewVersion(0);
    setPreview(null);
    setNotice("");
  }
  // The route as rows: the start, every day, the end. Every service belongs to one row.
  const [defaultMargin, setDefaultMargin] = useState(DEFAULT_MARGIN);
  // The partner catalogue: who can do each service, where and at what price.
  const [partnerServices, setPartnerServices] = useState<PartnerService[]>([]);
  useEffect(() => {
    api<{ services: PartnerService[] }>("/api/v1/operations/partners", auth)
      .then((x) => setPartnerServices(x.services))
      .catch(() => setPartnerServices([]));
  }, [auth]);
  /** Partners that can provide this service for this offer: same kind and currency, active, free on the date. */
  const partnersFor = (line: OfferLine, row: number) => {
    const date = b?.departure ? String(b.departure).slice(0, 10) : "";
    const fits = partnerServices.filter(
      (x) =>
        x.service_key === baseOf(line.key) &&
        x.currency === draft?.currency &&
        x.active &&
        x.partner_active &&
        x.capacity > 0 &&
        (!date || (String(x.available_from).slice(0, 10) <= date && String(x.available_to).slice(0, 10) >= date)),
    );
    const here = rowCity(row).toLowerCase();
    return {
      here: fits.filter((x) => x.location.toLowerCase().includes(here)),
      other: fits.filter((x) => !x.location.toLowerCase().includes(here)),
    };
  };
  /** Choosing a partner fills in who does it, where, the cost and the cancellation terms of the line. */
  function choosePartner(line: OfferLine, service: PartnerService) {
    patchLine(line.key, {
      name: service.name,
      supplier: service.partner_name,
      location: service.location.slice(0, 100),
      policy: service.policy,
      ...priceLine(line, service.price_minor / 100, lineMargin(line)),
    });
  }
  const dayCount = draft?.itinerary.length ?? 0;
  const rowOf = (line: OfferLine) =>
    Math.min(
      Math.max(line.row ?? (baseOf(line.key).startsWith("transfer") ? 0 : 1), 0),
      dayCount + 1,
    );
  const rowCity = (row: number) =>
    !draft
      ? ""
      : row === 0
        ? draft.startCity || "Baku"
        : row === dayCount + 1
          ? draft.endCity || "Baku"
          : draft.itinerary[row - 1].city;
  const dayOfRow = (row: number) => draft?.itinerary[row - 1]?.day ?? row;
  const rowTitle = (row: number) => {
    if (row === 0) return t("Start", "Старт", "Başlanğıc");
    if (row === dayCount + 1) return t("End", "Конец", "Qayıdış");
    const day = dayOfRow(row);
    const nth = (draft?.itinerary.slice(0, row).filter((_, i) => dayOfRow(i + 1) === day).length ?? 1);
    return t("Day", "День", "Gün") + " " + day + (nth > 1 ? t(`, place ${nth}`, `, место ${nth}`, `, ${nth}-ci yer`) : "");
  };
  /** Entries without a day number (older offers) get one each, so days can be added and removed. */
  const withDays = (list: OfferDraft["itinerary"]) => list.map((e, i) => ({ ...e, day: e.day ?? i + 1 }));
  function patchLine(key: string, patch: Partial<OfferLine>) {
    if (!draft) return;
    edit({
      ...draft,
      services: draft.services.map((x) => (x.key === key ? { ...x, ...patch } : x)),
    });
  }
  /** A new cost (or margin) also moves the customer price, the same way the server works it out. */
  function priceLine(line: OfferLine, cost: number, margin: number): Partial<OfferLine> {
    // A price typed by hand stays; only the margin it implies moves with the cost.
    if (line.fixedPrice != null)
      return {
        costPrice: cost,
        fixedPrice: line.fixedPrice,
        unitPrice: line.fixedPrice,
        marginPercent: cost > 0 ? Math.round((line.fixedPrice / cost - 1) * 10000) / 100 : lineMargin(line),
      };
    return { costPrice: cost, marginPercent: margin, unitPrice: withMargin(cost, margin) };
  }
  /** The customer price per unit typed by the office (or cleared to go back to cost plus margin). */
  function setCustomerPrice(line: OfferLine, price: number | null) {
    const cost = lineCost(line);
    if (price == null)
      return patchLine(line.key, {
        fixedPrice: null,
        ...priceLine({ ...line, fixedPrice: null }, cost, defaultMargin),
      });
    patchLine(line.key, {
      fixedPrice: price,
      unitPrice: price,
      marginPercent: cost > 0 ? Math.round((price / cost - 1) * 10000) / 100 : lineMargin(line),
    });
  }
  function addLine(row: number, kind: string) {
    if (!draft) return;
    const same = draft.services.filter((x) => baseOf(x.key) === kind).length;
    const pax = Number(JSON.parse(b?.quotePayload || "{}").input?.pax) || 2;
    const inRow = draft.services.find((x) => rowOf(x) === row);
    const margin = inRow ? lineMargin(inRow) : defaultMargin;
    const city = row === 0 || row === dayCount + 1 ? "" : ", " + rowCity(row);
    edit({
      ...draft,
      services: [
        ...draft.services,
        {
          key: same ? kind + "-" + (same + 1) : kind,
          name: (names[kind]?.[0] || kind) + city,
          quantity: kind === "hotel" ? Math.ceil(pax / 2) : UNITS[kind] === "person" ? pax : 1,
          nights: 1,
          unitPrice: 0,
          unit: UNITS[kind],
          supplier: "",
          location: "",
          availability: "CONFIRMED",
          policy: "",
          internalNote: "",
          row,
          costPrice: 0,
          marginPercent: margin,
        },
      ],
    });
  }
  function removeLine(key: string) {
    if (!draft) return;
    edit({ ...draft, services: draft.services.filter((x) => x.key !== key) });
  }
  const MAX_DAYS = 14;
  const MAX_PLACES_PER_DAY = 4;
  const MAX_ENTRIES = 30;
  /** A new day with one place at the end of the trip; the services of the end row move down with it. */
  function addDay(city: string) {
    if (!draft || draft.itinerary.length >= MAX_ENTRIES) return;
    const list = withDays(draft.itinerary);
    const lastDay = list.length ? (list[list.length - 1].day as number) : 0;
    if (lastDay >= MAX_DAYS) return;
    const end = dayCount + 1;
    edit({
      ...draft,
      itinerary: [...list, { city, description: city, day: lastDay + 1 }],
      services: draft.services.map((x) => {
        const r = rowOf(x);
        return { ...x, row: r === end ? end + 1 : r };
      }),
    });
  }
  /** Another place in the same day, right after the given row. */
  function addPlace(afterRow: number, city: string) {
    if (!draft || draft.itinerary.length >= MAX_ENTRIES) return;
    const list = withDays(draft.itinerary);
    const day = list[afterRow - 1].day as number;
    if (list.filter((e) => e.day === day).length >= MAX_PLACES_PER_DAY) return;
    edit({
      ...draft,
      itinerary: [...list.slice(0, afterRow), { city, description: city, day }, ...list.slice(afterRow)],
      services: draft.services.map((x) => {
        const r = rowOf(x);
        return { ...x, row: r >= afterRow + 1 ? r + 1 : r };
      }),
    });
  }
  /** Removing a place also removes its services. If it was the only place of its day, the day goes too. */
  function removeStop(row: number) {
    if (!draft || dayCount < 1) return;
    const lines = draft.services.filter((x) => rowOf(x) === row);
    if (
      lines.length &&
      !window.confirm(
        t(
          `Remove this place and its ${lines.length} service(s)?`,
          `Убрать это место и его услуги (${lines.length})?`,
          `Bu yer və onun ${lines.length} xidməti silinsin?`,
        ),
      )
    )
      return;
    const list = withDays(draft.itinerary);
    const day = list[row - 1].day as number;
    const dayGone = list.filter((e) => e.day === day).length === 1;
    edit({
      ...draft,
      itinerary: list
        .filter((_, i) => i !== row - 1)
        .map((e) => ((e.day as number) > day && dayGone ? { ...e, day: (e.day as number) - 1 } : e)),
      services: draft.services
        .filter((x) => rowOf(x) !== row)
        .map((x) => {
          const r = rowOf(x);
          return { ...x, row: r > row ? r - 1 : r };
        }),
    });
  }
  function setRowMargin(row: number, margin: number) {
    if (!draft) return;
    edit({
      ...draft,
      services: draft.services.map((x) =>
        rowOf(x) === row ? { ...x, ...priceLine(x, lineCost(x), margin) } : x,
      ),
    });
  }
  function setAllMargins(margin: number) {
    setDefaultMargin(margin);
    if (!draft) return;
    edit({
      ...draft,
      services: draft.services.map((x) => ({ ...x, ...priceLine(x, lineCost(x), margin) })),
    });
  }
  const rowSums = (row: number) => {
    const lines = draft?.services.filter((x) => rowOf(x) === row) ?? [];
    return {
      lines,
      cost: lines.reduce((n, x) => n + lineCostAmount(x), 0),
      price: lines.reduce((n, x) => n + lineAmount(x), 0),
    };
  };
  function close() {
    if (busy) return;
    modalRef.current?.close();
    setEditor(null);
    setPreview(null);
    setReject(false);
    focusRef.current?.focus();
  }
  function openLine(line: OfferLine) {
    focusRef.current = document.activeElement as HTMLElement;
    setEditor({ ...line });
  }
  type Step = "info" | "offer" | "preview" | "status" | "manage" | "pay" | "finance" | "docs";
  const STEP_ORDER: Step[] = ["info", "offer", "preview", "status", "manage", "pay", "finance", "docs"];
  const sent = sentVersion > 0;
  const accepted = !!contract && contract.state === "ACCEPTED" && contract.current_offer;
  const step: Step =
    route.view === "Bookings" && STEP_ORDER.includes(route.sub as Step)
      ? (route.sub as Step)
      : accepted
        ? "manage"
        : sent
          ? "status"
          : "info";
  // The pages opened from the Booking hub still belong to the last step of the wizard.
  const stepKey: Step = step === "pay" || step === "finance" || step === "docs" ? "manage" : step;
  /** Reads the received amount again, for example after a payment was recorded on the page. */
  async function refreshReceived() {
    if (!selected) return;
    try {
      const p = await api<{ receivedMinor?: number; paidMinor: number }>(
        "/api/v1/operations/bookings/" + selected + "/payment-context",
        auth,
      );
      setReceivedMinor(p.receivedMinor ?? p.paidMinor);
    } catch {
      /* the page still shows the last known amount */
    }
  }
  const [historyOpen, setHistoryOpen] = useState(false);
  function goTo(next: Step) {
    if (!selected) return;
    navigate({ view: "Bookings", id: selected, sub: next });
  }
  // What still has to be filled in before the offer can go out.
  const issues: string[] = draft
    ? [
        ...(count === 0
          ? [t("Add at least one service", "Добавьте хотя бы одну услугу", "Ən azı bir xidmət əlavə edin")]
          : []),
        ...(!draft.message.trim()
          ? [t("Write a short message for the customer", "Напишите сообщение клиенту", "Müştəriyə qısa mesaj yazın")]
          : []),
        ...(draft.itinerary.length === 0
          ? [t("Add at least one day", "Добавьте хотя бы один день", "Ən azı bir gün əlavə edin")]
          : []),
        ...(draft.services.some((x) => lineAmount(x) < 1)
          ? [t("Enter a price for every service", "Укажите цену каждой услуги", "Hər xidmətə qiymət yazın")]
          : []),
        ...(pending
          ? [
              t(
                "Resolve the customer's pending change request first",
                "Сначала обработайте запрос клиента",
                "Əvvəlcə müştərinin gözləyən sorğusunu həll edin",
              ),
            ]
          : []),
      ]
    : [];
  async function toPreview() {
    if (!draft || issues.length || busy) return;
    if (dirty || !draft.version) {
      const saved = await save();
      if (!saved) return;
    }
    goTo("preview");
  }
  async function loadPreview() {
    if (!draft || !b) return;
    setBusy(true);
    setError("");
    try {
      const p = await api<PublicOffer>(
        "/api/v1/operations/bookings/" + b.id + "/offer/preview",
        auth,
        { version: draft.version },
      );
      setPreview(p);
      setPreviewVersion(draft.version);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  // Steps can only be reached in order: a deep link to a step that is not ready falls back.
  useEffect(() => {
    if (!selected || loading || !draft || !b) return;
    if ((step === "offer" || step === "preview") && !canEdit && !sent) goTo("info");
    else if (step === "status" && !sent) goTo("info");
    else if (stepKey === "manage" && !accepted) goTo(sent ? "status" : "info");
    else if (step === "preview") {
      if (!canEdit) goTo("status");
      else if (dirty || !draft.version) goTo("offer");
      else if (!preview || preview.draftVersion !== draft.version)
        void loadPreview();
    }
  }, [step, loading, draft?.version, dirty, sentVersion, canEdit, accepted]); // eslint-disable-line react-hooks/exhaustive-deps
  async function openHistory() {
    if (!b) return;
    setHistoryOpen((open) => !open);
    if (historyOpen) return;
    try {
      setAudit(
        await api("/api/v1/operations/bookings/" + b.id + "/audit", auth),
      );
    } catch (e) {
      setError(problem(e));
    }
  }
  async function save() {
    if (!draft || !b) return null;
    if (draft.itinerary.length === 0) {
      setError(t("Add at least one day before saving.", "Добавьте хотя бы один день.", "Saxlamazdan əvvəl ən azı bir gün əlavə edin."));
      return null;
    }
    if (draft.services.some((x) => lineAmount(x) < 1)) {
      setError(
        t(
          "Enter a price for every service before saving.",
          "Укажите цену каждой услуги перед сохранением.",
          "Saxlamazdan əvvəl hər xidmətə qiymət yazın.",
        ),
      );
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<OfferDraft>(
        "/api/v1/operations/bookings/" + b.id + "/offer",
        auth,
        draft,
      );
      setDraft(next);
      setDirty(false);
      setPreviewVersion(0);
      setNotice(
        t("Draft saved.", "Черновик сохранён.", "Qaralama saxlanıldı."),
      );
      return next;
    } catch (e) {
      setError(problem(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  const ready =
    !!draft &&
    count > 0 &&
    !!draft.message.trim() &&
    !pending &&
    !dirty &&
    previewVersion === draft.version &&
    draft.version > 0 &&
    sentVersion !== draft.version;
  async function send() {
    if (!ready || !draft || !b) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<PublicOffer>(
        "/api/v1/operations/bookings/" + b.id + "/offer/send",
        auth,
        { version: draft.version },
      );
      setSentVersion(draft.version);
      navigate({ view: "Bookings", id: b.id, sub: "status" });
      setNotice(
        t(
          "Offer revision " +
            result.revision +
            " sent to the customer. They also get an email. No payment opened.",
          "Версия " +
            result.revision +
            " отправлена клиенту, ему придёт письмо. Оплата не открыта.",
          "Təklifin " +
            result.revision +
            " versiyası müştəriyə göndərildi, ona mail də gedəcək. Ödəniş açılmadı.",
        ),
      );
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  function back() {
    if (
      (dirty || paymentDirty || financeDirty) &&
      !window.confirm(
        t(
          "Discard unsaved edits?",
          "Отменить несохранённые изменения?",
          "Saxlanmamış düzəlişlər silinsin?",
        ),
      )
    )
      return;
    setSelected(null);
    setDirty(false);
    setDraft(null);
    setError("");
    setNotice("");
  }
  if (!selected)
    return (
      <RequestWorkspace
        auth={auth}
        refreshKey={bookings}
        locale={l}
        onOpen={(id) => setSelected(id)}
      />
    );
  if (!b)
    return (
      <div className="ow">
        <p role="alert" className="ow-error">
          {t(
            "This request was not found.",
            "Заявка не найдена.",
            "Bu sorğu tapılmadı.",
          )}
        </p>
        <button className="ow-link" onClick={() => setSelected(null)}>
          <ArrowLeft size={15} />
          {t("Back to requests", "К заявкам", "Sorğulara qayıt")}
        </button>
      </div>
    );
  const input = (() => {
    try {
      return JSON.parse(b.quotePayload).input as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const quoted = (() => {
    try {
      return JSON.parse(b.quotePayload) as {
        total: number;
        lines: { label: string; amount: number }[];
      };
    } catch {
      return { total: 0, lines: [] };
    }
  })();
  const hotelNames: Record<string, string> = {
    standard: t("Standard", "Стандарт", "Standart"),
    comfort: t("Comfort", "Комфорт", "Komfort"),
    premium: t("Premium", "Премиум", "Premium"),
  };
  const langNames: Record<string, string> = {
    en: "English",
    ru: "Русский",
    az: "Azərbaycanca",
  };
  // Extras the customer asked for; they are not in the customer's estimate, so add them to the offer.
  const extraNames: Record<string, string> = {
    event: t("Event", "Мероприятие", "Tədbir"),
    meals: t("Local meals", "Местная кухня", "Yerli yeməklər"),
    tickets: t("Entrance tickets", "Входные билеты", "Giriş biletləri"),
    photographer: t("Photographer", "Фотограф", "Fotoqraf"),
  };
  const extraKeys = Array.isArray(input.extras) ? (input.extras as string[]) : [];
  const stepsList: { key: Step; label: string; enabled: boolean }[] = [
    { key: "info", label: t("Request", "Заявка", "Sorğu"), enabled: true },
    { key: "offer", label: t("Offer", "Предложение", "Təklif"), enabled: canEdit },
    {
      key: "preview",
      label: t("Preview & send", "Просмотр и отправка", "Önbaxış və göndərmə"),
      enabled: canEdit && count > 0,
    },
    { key: "status", label: t("Status", "Статус", "Status"), enabled: sent },
    {
      key: "manage",
      label: t("Booking", "Бронирование", "Rezervasiya"),
      enabled: accepted,
    },
  ];
  const stepIndex = STEP_ORDER.indexOf(stepKey);
  const pricedTotal = draft ? total : 0;
  const money = (n: number) => fmt(n);
  const costSummary = draft && (
    <aside className="ow-summary">
      <div>
        <h2>{t("Customer sees", "Клиент увидит", "Müştəri görür")}</h2>
        <p>
          {draft.title}
          <br />
          {[rowCity(0), ...draft.itinerary.map((d) => d.city), rowCity(dayCount + 1)]
            .filter((c, i, all) => c !== all[i - 1])
            .map(cityLabel)
            .join(" → ")}
        </p>
        {draft.services.map((line) => (
          <div className="ow-summary-line" key={line.key}>
            <span>{line.name}</span>
            <strong>{money(lineAmount(line))}</strong>
          </div>
        ))}
        <div className="ow-summary-line ow-total">
          <strong>{t("Total", "Итого", "Cəmi")}</strong>
          <strong>{money(pricedTotal)}</strong>
        </div>
        {receivedMinor > 0 && (
          <div className="ow-summary-line">
            <span>{t("Paid", "Оплачено", "Ödənilib")}</span>
            <strong>{money(receivedMinor / 100)}</strong>
          </div>
        )}
      </div>
    </aside>
  );

  /** The places of the trip grouped by day: each day is a folder holding its places. */
  const dayGroups = (draft?.itinerary ?? []).reduce<{ day: number; rows: number[] }[]>((all, e, i) => {
    const day = e.day ?? i + 1;
    const last = all[all.length - 1];
    if (last && last.day === day) last.rows.push(i + 1);
    else all.push({ day, rows: [i + 1] });
    return all;
  }, []);
  const renderCard = (row: number) => {
    if (!draft) return null;
    const sums = rowSums(row);
                        const isDay = row > 0 && row <= dayCount;
                        const margin = sums.lines.length ? lineMargin(sums.lines[0]) : defaultMargin;
    return (
                          <li className="ow-rowcard" key={row}>
<details open>
<summary>
<b className="ow-num" aria-hidden="true">{row + 1}</b>
<strong>{rowTitle(row)}</strong>
<span>{cityLabel(rowCity(row))}</span>
<small>{fmt(sums.price)}</small>
</summary>
<div className="ow-rowbody">
                            <header>
                              <div className="ow-rowhead">
                                <small>{rowTitle(row)}</small>
                                <select
                                  aria-label={rowTitle(row)}
                                  disabled={!canEdit || busy}
                                  value={rowCity(row)}
                                  onChange={(e) =>
                                    edit(
                                      row === 0
                                        ? { ...draft, startCity: e.target.value }
                                        : row === dayCount + 1
                                          ? { ...draft, endCity: e.target.value }
                                          : {
                                              ...draft,
                                              itinerary: draft.itinerary.map((d, n) =>
                                                n === row - 1 ? { ...d, city: e.target.value } : d,
                                              ),
                                            },
                                    )
                                  }
                                >
                                  {CITIES.map((c) => (
                                    <option key={c} value={c}>
                                      {cityLabel(c)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="ow-rowmargin">
                                {t("Margin, %", "Маржа, %", "Marja, %")}
                                <NumField
                                  label={t("Margin of ", "Маржа: ", "Marja: ") + rowTitle(row)}
                                  value={margin}
                                  min={0}
                                  max={300}
                                  step={0.5}
                                  disabled={!canEdit || busy || !sums.lines.length}
                                  onCommit={(m) => setRowMargin(row, m)}
                                />
                              </label>
                              <div className="ow-rowsum">
                                <small>{t("Cost", "Себестоимость", "Maliyyət")}</small>
                                <strong>{fmt(sums.cost)}</strong>
                                <small>{t("Customer", "Клиент", "Müştəri")}</small>
                                <strong>{fmt(sums.price)}</strong>
                              </div>
                              {isDay && (
                                <button
                                  type="button"
                                  className="ow-icon"
                                  aria-label={t("Remove this place: ", "Убрать место: ", "Bu yeri sil: ") + rowTitle(row)}
                                  title={t("Remove this place", "Убрать место", "Bu yeri sil")}
                                  disabled={!canEdit || busy}
                                  onClick={() => removeStop(row)}
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </header>
                            {isDay && (
                              <label className="ow-daylabel">
                                <span>
                                  {t("Description for the customer", "Описание для клиента", "Müştəri üçün təsvir")}
                                  <small>
                                    {t(
                                      "Shown in the offer: what happens in this place.",
                                      "Показывается в предложении: что будет в этом месте.",
                                      "Təklifdə göstərilir: bu yerdə nə olacaq.",
                                    )}
                                  </small>
                                </span>
                                <textarea
                                  className="ow-daytext"
                                  aria-label={t("Description of ", "Описание: ", "Təsvir: ") + rowTitle(row)}
                                  maxLength={1500}
                                  rows={2}
                                  placeholder={t(
                                    "For example: walk through the old town, lunch at a family home…",
                                    "Например: прогулка по старому городу, обед в семейном доме…",
                                    "Məsələn: köhnə şəhərdə gəzinti, ailə evində nahar…",
                                  )}
                                  disabled={!canEdit || busy}
                                  value={draft.itinerary[row - 1].description}
                                  onChange={(e) =>
                                    edit({
                                      ...draft,
                                      itinerary: draft.itinerary.map((d, n) =>
                                        n === row - 1 ? { ...d, description: e.target.value } : d,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            )}
                            <ul className="ow-lines">
                              {sums.lines.map((line) => {
                                const Icon = icons[baseOf(line.key)] || FileText;
                                return (
                                  <li className="ow-line" key={line.key}>
                                    <div className="ow-line-name">
                                      <Icon size={18} aria-hidden="true" />
                                      <div>
                                        <strong>{line.name || label(line.key)}</strong>
                                        {line.supplier && <small>{line.supplier}</small>}
                                      </div>
                                    </div>
                                    <label>
                                      {t("Qty", "Кол-во", "Say")}
                                      <NumField
                                        label={t("Quantity of ", "Количество: ", "Say: ") + line.name}
                                        value={line.quantity}
                                        min={1}
                                        max={168}
                                        step={1}
                                        disabled={!canEdit || busy}
                                        onCommit={(n) =>
                                          patchLine(line.key, {
                                            quantity: Math.max(1, Math.round(n)),
                                            availability: "CONFIRMED",
                                          })
                                        }
                                      />
                                    </label>
                                    {baseOf(line.key) === "hotel" && (
                                      <label>
                                        {t("Nights", "Ночей", "Gecə")}
                                        <NumField
                                          label={t("Nights of ", "Ночей: ", "Gecə: ") + line.name}
                                          value={line.nights}
                                          min={1}
                                          max={14}
                                          step={1}
                                          disabled={!canEdit || busy}
                                          onCommit={(n) =>
                                            patchLine(line.key, {
                                              nights: Math.max(1, Math.round(n)),
                                              availability: "CONFIRMED",
                                            })
                                          }
                                        />
                                      </label>
                                    )}
                                    <label>
                                      {t("Cost per unit", "Себестоимость за ед.", "Vahid maliyyəti")}
                                      <NumField
                                        label={t("Cost of ", "Себестоимость: ", "Maliyyət: ") + line.name}
                                        value={lineCost(line)}
                                        min={0}
                                        max={100000}
                                        step={0.01}
                                        disabled={!canEdit || busy}
                                        onCommit={(n) =>
                                          patchLine(line.key, priceLine(line, n, lineMargin(line)))
                                        }
                                      />
                                      {(() => {
                                        const { here, other } = partnersFor(line, row);
                                        const chosen = [...here, ...other].find(
                                          (x) => x.partner_name === line.supplier && x.name === line.name,
                                        );
                                        if (!chosen) return null;
                                        const listed = chosen.price_minor / 100;
                                        return (
                                          <small className="ow-listed">
                                            {t("Partner price", "Цена партнёра", "Partnyor qiyməti")}: {listed.toFixed(2)}
                                            {Math.abs(listed - lineCost(line)) > 0.004
                                              ? ", " + t("changed", "изменена", "dəyişdirilib")
                                              : ""}
                                          </small>
                                        );
                                      })()}
                                    </label>
                                    <label className="ow-line-custprice">
                                      {t("Customer price per unit", "Цена клиенту за ед.", "Müştəri qiyməti (vahid)")}
                                      <span>
                                        <NumField
                                          label={t("Customer price of ", "Цена клиенту: ", "Müştəri qiyməti: ") + line.name}
                                          value={line.unitPrice}
                                          min={0}
                                          max={100000}
                                          step={0.01}
                                          disabled={!canEdit || busy}
                                          onCommit={(n) => setCustomerPrice(line, n)}
                                        />
                                        {line.fixedPrice != null && (
                                          <button
                                            type="button"
                                            className="ow-icon"
                                            title={t("Back to cost plus margin", "Вернуть себестоимость плюс маржа", "Maliyyət və marja ilə hesablanmağa qayıt")}
                                            aria-label={t("Reset the price of ", "Сбросить цену: ", "Qiyməti sıfırla: ") + line.name}
                                            disabled={!canEdit || busy}
                                            onClick={() => setCustomerPrice(line, null)}
                                          >
                                            <RotateCcw size={14} />
                                          </button>
                                        )}
                                      </span>
                                    </label>
                                    <div className="ow-line-price">
                                      <small>{t("Customer pays", "Клиент платит", "Müştəri ödəyir")}</small>
                                      <strong>{fmt(lineAmount(line))}</strong>
                                    </div>
                                    <button
                                      type="button"
                                      className="ow-icon"
                                      aria-label={t("Details of ", "Детали: ", "Detallar: ") + line.name}
                                      disabled={!canEdit || busy}
                                      onClick={() => openLine(line)}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      className="ow-icon"
                                      aria-label={t("Remove ", "Убрать ", "Sil ") + line.name}
                                      disabled={!canEdit || busy}
                                      onClick={() => removeLine(line.key)}
                                    >
                                      <X size={16} />
                                    </button>
                                    {(() => {
                                      const { here, other } = partnersFor(line, row);
                                      const chosen = [...here, ...other].find(
                                        (x) => x.partner_name === line.supplier && x.name === line.name,
                                      );
                                      const option = (x: PartnerService) => (
                                        <option key={x.id} value={x.id}>
                                          {x.partner_name}, {x.name}, {(x.price_minor / 100).toFixed(2)} {x.currency}
                                        </option>
                                      );
                                      return (
                                        <label className="ow-line-partner">
                                          {t("Partner who provides it", "Партнёр-исполнитель", "Xidməti edəcək partnyor")}
                                          <select
                                            aria-label={t("Partner for ", "Партнёр: ", "Partnyor: ") + line.name}
                                            disabled={!canEdit || busy}
                                            value={chosen?.id ?? ""}
                                            onChange={(e) => {
                                              const x = [...here, ...other].find((y) => y.id === e.target.value);
                                              if (x) choosePartner(line, x);
                                            }}
                                          >
                                            <option value="">
                                              {line.supplier && !chosen
                                                ? line.supplier + t(" (typed by hand)", " (вручную)", " (əl ilə yazılıb)")
                                                : here.length + other.length
                                                  ? t("Choose a partner…", "Выберите партнёра…", "Partnyor seçin…")
                                                  : t("No partner in the catalogue for this service", "В каталоге нет партнёра для этой услуги", "Bu xidmət üçün kataloqda partnyor yoxdur")}
                                            </option>
                                            {here.length > 0 && (
                                              <optgroup label={t("In ", "В: ", "Bu yerdə: ") + cityLabel(rowCity(row))}>
                                                {here.map(option)}
                                              </optgroup>
                                            )}
                                            {other.length > 0 && (
                                              <optgroup label={t("Other places", "Другие места", "Digər yerlər")}>
                                                {other.map(option)}
                                              </optgroup>
                                            )}
                                          </select>
                                        </label>
                                      );
                                    })()}
                                  </li>
                                );
                              })}
                            </ul>
                            <select
                              className="ow-add"
                              aria-label={t("Add a service to ", "Добавить услугу: ", "Xidmət əlavə et: ") + rowTitle(row)}
                              disabled={!canEdit || busy}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) addLine(row, e.target.value);
                              }}
                            >
                              <option value="">
                                {"+ " + t("Add a service", "Добавить услугу", "Xidmət əlavə et")}
                              </option>
                              {KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {label(k)}
                                </option>
                              ))}
                            </select>
                          </div>
</details>
</li>
    );
  };

  // What only the office sees: the cost of every row, the margin and the customer price.
  const internalSummary = draft && (
    <aside className="ow-summary ow-internal">
      <div>
        <h2>
          <Lock size={14} aria-hidden="true" />
          {t("Office only", "Только для офиса", "Yalnız ofis")}
        </h2>
        <p className="ow-sub">
          {t(
            "The customer never sees costs or margin.",
            "Клиент не видит себестоимость и маржу.",
            "Müştəri maliyyəti və marjanı görmür.",
          )}
        </p>
        {Array.from({ length: dayCount + 2 }, (_, row) => {
          const sums = rowSums(row);
          if (!sums.lines.length) return null;
          return (
            <div className="ow-internal-row" key={row}>
              <span>
                {rowTitle(row)}, {cityLabel(rowCity(row))}
              </span>
              <small>
                {fmt(sums.cost)} → {fmt(sums.price)}
              </small>
            </div>
          );
        })}
        {(() => {
          const cost = draft.services.reduce((n, x) => n + lineCostAmount(x), 0);
          const margin = total - cost;
          return (
            <>
              <div className="ow-summary-line">
                <span>{t("Total cost", "Себестоимость", "Ümumi maliyyət")}</span>
                <strong>{fmt(cost)}</strong>
              </div>
              <div className="ow-summary-line">
                <span>
                  {t("Margin", "Маржа", "Marja")}
                  {cost > 0 ? `, ${Math.round((margin / cost) * 1000) / 10}%` : ""}
                </span>
                <strong>{fmt(margin)}</strong>
              </div>
              <div className="ow-summary-line ow-total">
                <strong>{t("Customer total", "Итого клиенту", "Müştəri üçün cəm")}</strong>
                <strong>{fmt(total)}</strong>
              </div>
            </>
          );
        })()}
      </div>
    </aside>
  );

  return (
    <div className="ow ow-wizard">
      <div className="ow-topbar">
        <button className="ow-link" disabled={busy} onClick={back}>
          <ArrowLeft size={15} />
          {t("Back to requests", "К заявкам", "Sorğulara qayıt")}
        </button>
        <button className="ow-link" onClick={() => void openHistory()}>
          <Clock size={15} />
          {t("History", "История", "Tarixçə")}
        </button>
      </div>
      {historyOpen && (
        <aside className="ow-history" aria-label={t("History", "История", "Tarixçə")}>
          <div className="ow-history-head">
            <strong>{t("History", "История", "Tarixçə")}</strong>
            <button
              className="ow-link"
              aria-label={t("Close", "Закрыть", "Bağla")}
              onClick={() => setHistoryOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {audit.length === 0 && (
            <p>{t("No activity yet.", "Действий пока нет.", "Hələ fəaliyyət yoxdur.")}</p>
          )}
          {audit.map((x, i) => (
            <p key={i}>
              <small>{formatDateTime(x.created_at)}</small>
              <br />
              {x.action}, {x.actor}
            </p>
          ))}
        </aside>
      )}
      {error && (
        <p role="alert" className="ow-error">
          {error}
          <button
            className="ow-link"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  t(
                    "Discard unsaved edits and reload?",
                    "Отменить изменения и обновить?",
                    "Düzəlişləri silib yenilənsin?",
                  ),
                )
              )
                void load(selected);
            }}
          >
            {t("Reload draft", "Загрузить черновик", "Qaralamanı yenilə")}
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="ow-notice">
          {notice}
        </p>
      )}
      {loading && (
        <p role="status">
          {t("Loading request…", "Загрузка…", "Sorğu yüklənir…")}
        </p>
      )}
      {draft && (
        <>
          {draft.sourceQuoteId !== b.quoteId && (
            <div className="ow-error">
              <p>
                {t(
                  "The original request changed. Rebuild the draft before saving or sending.",
                  "Исходная заявка изменилась. Создайте черновик заново.",
                  "İlkin sorğu dəyişib. Saxlamazdan və ya göndərməzdən əvvəl qaralamanı yenidən qurun.",
                )}
              </p>
              <button
                className="ow-outline"
                disabled={busy || !canEdit}
                onClick={() => edit({ ...initial(b), version: draft.version })}
              >
                {t(
                  "Rebuild from current request",
                  "Создать из текущей заявки",
                  "Cari sorğudan yenidən qur",
                )}
              </button>
            </div>
          )}
          <div className="ow-heading">
            <div>
              <h1>
                {customer?.name ||
                  t("Custom journey", "Индивидуальный маршрут", "Fərdi səfər")}
              </h1>
              <p className="ow-meta">
                <span>#{b.id.slice(0, 8)}</span>
                <span>{formatDay(b.departure)}</span>
                {customer?.email && (
                  <span>
                    <Mail size={15} aria-hidden="true" />
                    {customer.email}
                  </span>
                )}
                {customer?.phone && (
                  <span>
                    <Phone size={15} aria-hidden="true" />
                    {customer.phone}
                  </span>
                )}
              </p>
            </div>
          </div>
          <ol className="ow-steps" aria-label={t("Steps", "Шаги", "Mərhələlər")}>
            {stepsList.map((x, i) => (
              <li
                key={x.key}
                className={
                  (stepKey === x.key ? "current " : "") +
                  (i < stepIndex ? "done " : "") +
                  (x.enabled ? "" : "off")
                }
              >
                <button
                  disabled={!x.enabled || busy}
                  aria-current={stepKey === x.key ? "step" : undefined}
                  onClick={() =>
                    x.key === "preview" && step !== "preview"
                      ? void toPreview()
                      : goTo(x.key)
                  }
                >
                  <b>{i < stepIndex ? <Check size={14} /> : i + 1}</b>
                  {x.label}
                </button>
              </li>
            ))}
          </ol>

          {step === "info" && (
            <div className="ow-step-body">
              {!canEdit && (
                <p className="ow-notice">
                  {t(
                    "This request can no longer be edited here. Changes go through Customer requests.",
                    "Эту заявку здесь больше нельзя менять. Изменения — в запросах клиентов.",
                    "Bu sorğu burada artıq dəyişdirilə bilməz. Dəyişikliklər Müştəri sorğuları vasitəsilə aparılır.",
                  )}{" "}
                  <button className="ow-link" onClick={onOpenRequests}>
                    {t("Open Customer requests", "Открыть запросы клиентов", "Müştəri sorğularını aç")}
                  </button>
                </p>
              )}
              {pending && (
                <p className="ow-error">
                  {t(
                    "A customer change or cancellation request is waiting. Resolve it before sending an offer.",
                    "Есть запрос клиента. Обработайте его перед отправкой.",
                    "Müştərinin dəyişiklik və ya ləğv sorğusu gözləyir. Təklif göndərməzdən əvvəl həll edin.",
                  )}
                </p>
              )}
              <div className="ow-facts">
                <div>
                  <small>{t("Customer", "Клиент", "Müştəri")}</small>
                  <strong>{customer?.name || "—"}</strong>
                  <div className="ow-contact">
                    <span>
                      <Mail size={14} aria-hidden="true" />
                      {customer?.email || "—"}
                    </span>
                    <span>
                      <Phone size={14} aria-hidden="true" />
                      {customer?.phone ? (
                        <a href={"tel:" + customer.phone}>{customer.phone}</a>
                      ) : (
                        t("No phone number", "Телефон не указан", "Telefon göstərilməyib")
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <small>{t("Travel dates", "Даты", "Səfər tarixi")}</small>
                  <strong>{formatDay(b.departure)}</strong>
                </div>
                <div>
                  <small>{t("Travelers", "Участники", "Səyahətçilər")}</small>
                  <strong>{paxRange(Number(input.pax))}</strong>
                </div>
                <div>
                  <small>{t("Language", "Язык", "Dil")}</small>
                  <strong>{customer?.locale.toUpperCase() || "—"}</strong>
                </div>
              </div>
              <div className="ow-info-grid">
                <section>
                  <h2>{t("Requested route", "Запрошенный маршрут", "İstənilən marşrut")}</h2>
                  {(() => {
                    const names: Record<string, [string, string, string]> = {
                      Baku: ["Baku", "Баку", "Bakı"],
                      Quba: ["Quba", "Куба", "Quba"],
                      Khinalug: ["Khinalug", "Хыналыг", "Xınalıq"],
                      Gabala: ["Gabala", "Габала", "Qəbələ"],
                      Sheki: ["Sheki", "Шеки", "Şəki"],
                    };
                    const name = (city: string) =>
                      names[city] ? t(...names[city]) : city;
                    // Day by day when the customer built the trip that way (places and what they want in each);
                    // older requests have one city per day.
                    const plan = Array.isArray(input.plan)
                      ? (input.plan as { places: { city: string; services: string[] }[] }[])
                      : null;
                    const entries = plan
                      ? plan.flatMap((d, di) =>
                          d.places.map((p, pi) => ({ city: p.city, day: di + 1, nth: pi + 1, services: p.services })),
                        )
                      : (() => {
                          const cities = initial(b).itinerary.map((day) => day.city);
                          const groups = cities.reduce<{ city: string; from: number; to: number }[]>(
                            (all, city, i) => {
                              const last = all[all.length - 1];
                              if (last && last.city === city) last.to = i + 1;
                              else all.push({ city, from: i + 1, to: i + 1 });
                              return all;
                            },
                            [],
                          );
                          return groups.map((g) => ({
                            city: g.city,
                            day: g.from,
                            to: g.to,
                            nth: 1,
                            services: [] as string[],
                          }));
                        })();
                    // Start and end come from the request; older requests have none and left from Baku.
                    const startCity = String(input.startCity ?? "Baku"),
                      endCity = String(input.endCity ?? "Baku");
                    const showStart = entries.length > 0,
                      showReturn = entries.length > 0;
                    const full = [
                      ...(showStart ? [{ city: startCity, days: 0 }] : []),
                      ...entries.map((e) => ({ city: e.city, days: 1 })),
                      ...(showReturn ? [{ city: endCity, days: 0 }] : []),
                    ];
                    return (
                      <div className="ow-route-card">
                        <ol className="ow-stop-list">
                          {showStart && (
                            <li className="ow-fixed">
                              <b aria-hidden="true">1</b>
                              <div>
                                <strong>{name(startCity)}</strong>
                                <small>{t("Start", "Старт", "Başlanğıc")}</small>
                              </div>
                            </li>
                          )}
                          {entries.map((e, i) => (
                            <li key={i}>
                              <b aria-hidden="true">{i + 1 + (showStart ? 1 : 0)}</b>
                              <div>
                                <strong>{name(e.city)}</strong>
                                <small>
                                  {"to" in e && e.to !== e.day
                                    ? `${t("Days", "Дни", "Günlər")} ${e.day}–${e.to}`
                                    : `${t("Day", "День", "Gün")} ${e.day}` +
                                      (e.nth > 1 ? t(`, place ${e.nth}`, `, место ${e.nth}`, `, ${e.nth}-ci yer`) : "")}
                                </small>
                                {e.services.length > 0 && (
                                  <small className="ow-stop-services">
                                    {e.services.map((k) => label(k)).join(", ")}
                                  </small>
                                )}
                              </div>
                            </li>
                          ))}
                          {showReturn && (
                            <li className="ow-fixed">
                              <b aria-hidden="true">{entries.length + 1 + (showStart ? 1 : 0)}</b>
                              <div>
                                <strong>{name(endCity)}</strong>
                                <small>{t("Return", "Возвращение", "Qayıdış")}</small>
                              </div>
                            </li>
                          )}
                        </ol>
                        <RouteMap
                          stops={full}
                          name={name}
                          label={
                            t("Route: ", "Маршрут: ", "Marşrut: ") +
                            full.map((s) => name(s.city)).join(" → ")
                          }
                        />
                      </div>
                    );
                  })()}
                </section>
                <section>
                  <h2>{t("Customer's choices", "Выбор клиента", "Müştərinin seçimləri")}</h2>
                  <ul className="ow-choices">
                    {[
                      ...["transport", "hotel", "guide", "transfer", "intercity", "activity"].map(
                        (code) => ({
                          key: code,
                          name: label(code),
                          on:
                            code === "intercity"
                              ? Array.isArray(input.plan) &&
                                (input.plan as { places: { services: string[] }[] }[]).some((d) =>
                                  d.places.some((pl) => pl.services.includes("intercity")),
                                )
                              : quoted.lines.some((line) => line.label === code),
                          note:
                            code === "hotel" && input.hotel
                              ? (hotelNames[String(input.hotel)] ?? String(input.hotel))
                              : code === "guide" && input.guideLanguage
                                ? (langNames[String(input.guideLanguage)] ??
                                  String(input.guideLanguage))
                                : "",
                        }),
                      ),
                      ...Object.keys(extraNames).map((code) => ({
                        key: code,
                        name: extraNames[code],
                        on: extraKeys.includes(code),
                        note: extraKeys.includes(code)
                          ? t(
                              "Not in the estimate",
                              "Не в расчёте",
                              "Təxmini hesabda yoxdur",
                            )
                          : "",
                      })),
                    ]
                      // Chosen services first, then the ones not chosen; each group keeps its order.
                      .sort((x, y) => Number(y.on) - Number(x.on))
                      .map((row) => (
                      <li key={row.key} className={row.on ? "ow-choice on" : "ow-choice off"}>
                        <span
                          className="ow-mark"
                          role="img"
                          aria-label={row.on ? t("Chosen", "Выбрано", "Seçilib") : t("Not chosen", "Не выбрано", "Seçilməyib")}
                        >
                          {row.on ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                        </span>
                        <span className="ow-choice-name">{row.name}</span>
                        {row.note && <small>{row.note}</small>}
                      </li>
                    ))}
                  </ul>
                  <p className="ow-sub">
                    {t(
                      "The customer's own estimate (a guide for your prices):",
                      "Расчёт клиента (ориентир для ваших цен):",
                      "Müştərinin öz təxmini hesabı (qiymətlər üçün istiqamət):",
                    )}{" "}
                    <strong>{fmt(quoted.total)}</strong>
                  </p>
                </section>
                <section className="ow-wide">
                  <h2>{t("Customer notes", "Пожелания клиента", "Müştəri qeydləri")}</h2>
                  <p className="ow-read-note">{b.customerNote || t("No notes.", "Пожеланий нет.", "Qeyd yoxdur.")}</p>
                </section>
              </div>
              <footer className="ow-footer">
                <span>
                  {b.status === "REJECTED"
                    ? t("Request rejected", "Заявка отклонена", "Sorğu rədd edilib")
                    : sent
                      ? t("Offer sent", "Предложение отправлено", "Təklif göndərilib")
                      : t("Not offered yet", "Предложение не отправлено", "Hələ təklif verilməyib")}
                </span>
                <div className="ow-actions">
                  <button
                    className="ow-outline"
                    disabled={!canEdit || busy || pending}
                    onClick={() => {
                      focusRef.current = document.activeElement as HTMLElement;
                      setReject(true);
                    }}
                  >
                    {t("Reject request", "Отклонить заявку", "Sorğunu rədd et")}
                  </button>
                  {canEdit && (
                    <button className="ow-primary" disabled={busy} onClick={() => goTo("offer")}>
                      {t("Continue to offer", "К предложению", "Təklifə keç")}
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {!canEdit && sent && (
                    <button className="ow-primary" onClick={() => goTo("status")}>
                      {t("Open status", "Открыть статус", "Statusa bax")}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </footer>
            </div>
          )}

          {step === "offer" && (
            <div className="ow-step-body">
              <div className="ow-grid">
                <div>
                  <section className="ow-routeplan">
                    <h2>{t("Final itinerary and services", "Итоговый маршрут и услуги", "Yekun marşrut və xidmətlər")}</h2>
                    <div className="ow-toolbar">
                      <label className="ow-grow">
                        {t("Offer title", "Название", "Təklif başlığı")}
                        <input
                          maxLength={160}
                          disabled={!canEdit || busy}
                          value={draft.title}
                          onChange={(e) => edit({ ...draft, title: e.target.value })}
                        />
                      </label>
                      <label>
                        {t("Currency", "Валюта", "Valyuta")}
                        <span className="ow-chip">{draft.currency}</span>
                      </label>
                      <label>
                        {t("Default margin, %", "Маржа по умолчанию, %", "Standart marja, %")}
                        <NumField
                          label={t("Default margin", "Маржа по умолчанию", "Standart marja")}
                          value={defaultMargin}
                          min={0}
                          max={300}
                          step={0.5}
                          disabled={!canEdit || busy}
                          onCommit={setAllMargins}
                        />
                      </label>
                    </div>
                    {(() => {
                      const extras = Array.isArray(input.extras) ? (input.extras as string[]) : [];
                      return extras.length ? (
                        <p className="ow-sub">
                          {t("The customer also asked for:", "Клиент также просит:", "Müştəri bunları da istəyib:")}{" "}
                          {extras.map((k) => label(k)).join(", ")}
                        </p>
                      ) : null;
                    })()}
                    <ol className="ow-rows">
                      {renderCard(0)}
                      {dayGroups.map((g) => (
                        <li className="ow-daygroup" key={g.day}>
                          <details open>
                            <summary>
                              <strong>{t("Day", "День", "Gün")} {g.day}</strong>
                              <span>{g.rows.map((r) => cityLabel(rowCity(r))).join(", ")}</span>
                              <small>{fmt(g.rows.reduce((n, r) => n + rowSums(r).price, 0))}</small>
                            </summary>
                            <ol className="ow-rows ow-nested">
                              {g.rows.map((r) => renderCard(r))}
                              <li className="ow-addstop ow-addplace">
                                <select
                                  aria-label={t("Add a place to day ", "Добавить место в день ", "Günə yer əlavə et: ") + g.day}
                                  disabled={
                                    !canEdit ||
                                    busy ||
                                    draft.itinerary.length >= MAX_ENTRIES ||
                                    g.rows.length >= MAX_PLACES_PER_DAY
                                  }
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) addPlace(g.rows[g.rows.length - 1], e.target.value);
                                  }}
                                >
                                  <option value="">
                                    {"+ " + t("Another place this day", "Ещё место в этот день", "Bu günə başqa yer")}
                                  </option>
                                  {CITIES.map((c) => (
                                    <option key={c} value={c}>
                                      {cityLabel(c)}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            </ol>
                          </details>
                        </li>
                      ))}
                      <li className="ow-addstop">
                        <select
                          aria-label={t("Add a day", "Добавить день", "Gün əlavə et")}
                          disabled={
                            !canEdit ||
                            busy ||
                            draft.itinerary.length >= MAX_ENTRIES ||
                            (dayCount > 0 && dayOfRow(dayCount) >= MAX_DAYS)
                          }
                          value=""
                          onChange={(e) => {
                            if (e.target.value) addDay(e.target.value);
                          }}
                        >
                          <option value="">{"+ " + t("Add a day", "Добавить день", "Gün əlavə et")}</option>
                          {CITIES.map((c) => (
                            <option key={c} value={c}>
                              {cityLabel(c)}
                            </option>
                          ))}
                        </select>
                      </li>
                      {renderCard(dayCount + 1)}
                    </ol>
                    <p className="ow-sub">
                      {t(
                        "Group total",
                        "Итого для группы",
                        "Qrup üçün cəm",
                      )}
                      : <strong>{fmt(total)}</strong>
                    </p>
                  </section>
                  <section>
                    <h2>{t("Message to customer", "Сообщение клиенту", "Müştəriyə mesaj")}</h2>
                    <textarea
                      aria-label={t("Message to customer", "Сообщение клиенту", "Müştəriyə mesaj")}
                      maxLength={2000}
                      disabled={!canEdit || busy}
                      rows={3}
                      value={draft.message}
                      onChange={(e) => edit({ ...draft, message: e.target.value })}
                    />
                  </section>
                  <details className="ow-secondary">
                    <summary>{t("Internal office note", "Внутренняя заметка", "Daxili ofis qeydi")}</summary>
                    <textarea
                      aria-label={t("Internal office note", "Внутренняя заметка", "Daxili ofis qeydi")}
                      rows={3}
                      maxLength={4000}
                      disabled={!canEdit || busy}
                      value={draft.internalNote}
                      onChange={(e) => edit({ ...draft, internalNote: e.target.value })}
                    />
                  </details>
                </div>
                <div className="ow-side">
                  {costSummary}
                  {internalSummary}
                </div>
              </div>
              <footer className="ow-footer">
                <span>
                  {dirty
                    ? t("Unsaved changes", "Есть изменения", "Saxlanmamış dəyişikliklər")
                    : draft.version > 0
                      ? t("Draft saved", "Черновик сохранён", "Qaralama saxlanılıb")
                      : t("Draft not saved", "Черновик не сохранён", "Qaralama saxlanılmayıb")}
                </span>
                <div className="ow-actions">
                  <button className="ow-outline" disabled={busy} onClick={() => goTo("info")}>
                    <ArrowLeft size={16} />
                    {t("Back", "Назад", "Geri")}
                  </button>
                  <button className="ow-outline" disabled={busy || !canEdit || !dirty} onClick={() => void save()}>
                    {t("Save draft", "Сохранить", "Qaralamanı saxla")}
                  </button>
                  <button
                    className="ow-primary"
                    disabled={busy || !canEdit || issues.length > 0}
                    onClick={() => void toPreview()}
                  >
                    {t("Continue to preview", "К просмотру", "Önbaxışa keç")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </footer>
              {issues.length > 0 && (
                <ul className="ow-issues" aria-label={t("Still to do", "Осталось", "Tamamlanmalıdır")}>
                  {issues.map((x) => (
                    <li key={x}>
                      <AlertTriangle size={14} /> {x}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="ow-step-body">
              {!preview && <p role="status">{t("Preparing the preview…", "Готовим просмотр…", "Önbaxış hazırlanır…")}</p>}
              {preview && (
                <div className="ow-grid">
                  <div className="ow-preview">
                    <p className="ow-sub">
                      {t(
                        "This is exactly what the customer will see.",
                        "Именно это увидит клиент.",
                        "Müştəri məhz bunu görəcək.",
                      )}
                    </p>
                    <h2>{preview.title}</h2>
                    <p>
                      {customer?.name}, {formatDay(preview.date)}, {paxRange(preview.travelers)} {t("travelers", "чел.", "nəfər")}
                    </p>
                    {(() => {
                      // What the customer sees: the start, every day with its places, the end, and under each
                      // place the services (with their price) that belong to it.
                      const count = preview.itinerary.length;
                      const rowOfLine = (line: PublicOffer["services"][number]) =>
                        Math.min(
                          Math.max(line.row ?? (baseOf(line.key).startsWith("transfer") ? 0 : 1), 0),
                          count + 1,
                        );
                      const linesAt = (row: number) =>
                        preview.services.filter((line) => rowOfLine(line) === row);
                      const days: { day: number; rows: number[] }[] = [];
                      preview.itinerary.forEach((d, i) => {
                        const day = d.day ?? i + 1;
                        const last = days[days.length - 1];
                        if (last && last.day === day) last.rows.push(i + 1);
                        else days.push({ day, rows: [i + 1] });
                      });
                      const services = (row: number) =>
                        linesAt(row).map((line) => (
                          <div className="ow-preview-line" key={line.key}>
                            <div className="ow-summary-line">
                              <span>{line.name}</span>
                              <strong>{fmt(line.total)}</strong>
                            </div>
                            {line.policy && <small>{line.policy}</small>}
                          </div>
                        ));
                      return (
                        <ol className="ow-timeline">
                          <li className="ow-timeline-end">
                            <strong>
                              {t("Start", "Старт", "Başlanğıc")}, {cityLabel(preview.startCity || "Baku")}
                            </strong>
                            {services(0)}
                          </li>
                          {days.map((g) => (
                            <li className="ow-timeline-day" key={g.day}>
                              <strong>
                                {t("Day", "День", "Gün")} {g.day}
                              </strong>
                              {g.rows.map((row) => {
                                const d = preview.itinerary[row - 1];
                                return (
                                  <div className="ow-timeline-place" key={row}>
                                    <b>{cityLabel(d.city)}</b>
                                    {d.description.trim() && d.description.trim().toLowerCase() !== d.city.toLowerCase() && (
                                      <p>{d.description}</p>
                                    )}
                                    {services(row)}
                                  </div>
                                );
                              })}
                            </li>
                          ))}
                          <li className="ow-timeline-end">
                            <strong>
                              {t("End", "Конец", "Qayıdış")}, {cityLabel(preview.endCity || "Baku")}
                            </strong>
                            {services(count + 1)}
                          </li>
                        </ol>
                      );
                    })()}
                    <div className="ow-summary-line ow-total">
                      <strong>{t("Group total", "Сумма для группы", "Qrup üçün cəm")}</strong>
                      <strong>{fmt(preview.total)}</strong>
                    </div>
                    <p className="ow-read-note">{preview.message}</p>
                    <p>
                      {t(
                        "No payment is requested at this stage.",
                        "На этом этапе оплата не запрашивается.",
                        "Bu mərhələdə ödəniş tələb olunmur.",
                      )}
                    </p>
                  </div>
                  <aside className="ow-summary">
                    <div>
                      <h2>{t("Ready to send", "Готово к отправке", "Göndərməyə hazırdır")}</h2>
                      <p className="ow-good">
                        <Check size={15} /> {t("Every service has a price", "У каждой услуги есть цена", "Hər xidmətin qiyməti var")}
                      </p>
                      <p className="ow-good">
                        <Check size={15} /> {t("Message written", "Сообщение написано", "Mesaj yazılıb")}
                      </p>
                      <div className="ow-sage">
                        {t(
                          "The customer sees the offer in their account and gets an email with a link to it.",
                          "Клиент увидит предложение в кабинете и получит письмо со ссылкой.",
                          "Müştəri təklifi hesabında görəcək və ona keçidi olan mail gələcək.",
                        )}
                        <br />
                        <strong>{customer?.email}</strong>
                      </div>
                    </div>
                  </aside>
                </div>
              )}
              <footer className="ow-footer">
                <span>
                  {sentVersion === draft.version && sent
                    ? t("This version is already sent", "Эта версия уже отправлена", "Bu versiya artıq göndərilib")
                    : t("Not sent yet", "Ещё не отправлено", "Hələ göndərilməyib")}
                </span>
                <div className="ow-actions">
                  <button className="ow-outline" disabled={busy} onClick={() => goTo("offer")}>
                    <ArrowLeft size={16} />
                    {t("Back to edit", "Вернуться к правке", "Düzəlişə qayıt")}
                  </button>
                  <button
                    className="ow-primary"
                    disabled={busy || !canEdit || !ready || !preview}
                    onClick={() => void send()}
                  >
                    {t("Send offer to customer", "Отправить предложение клиенту", "Təklifi müştəriyə göndər")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </footer>
            </div>
          )}

          {step === "status" && sent && (
            <div className="ow-step-body">
              <ContractWorkspace
                key={b.id}
                bookingId={b.id}
                auth={auth}
                locale={l}
                onChange={setContract}
                onManage={() => goTo("manage")}
              >
                <section className="cw-offer">
                  <header>
                    <span className="cw-icon">
                      <FileText size={24} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{t("Offer", "Предложение", "Təklif")}</h3>
                      <p>{draft?.title}</p>
                    </div>
                    {canEdit && (
                      <button className="ow-outline" onClick={() => goTo("offer")}>
                        <Pencil size={15} aria-hidden="true" />
                        {t("Edit and send a new version", "Изменить и отправить новую версию", "Dəyişib yeni versiya göndər")}
                      </button>
                    )}
                  </header>
                  <dl className="cw-offer-facts">
                    <div>
                      <dt>{t("Version with the customer", "Версия у клиента", "Müştərinin gördüyü versiya")}</dt>
                      <dd>v{sentVersion}</dd>
                    </div>
                    <div>
                      <dt>{t("Total", "Итого", "Cəmi")}</dt>
                      <dd>{fmt(total)}</dd>
                    </div>
                    <div>
                      <dt>{t("Services", "Услуг", "Xidmət sayı")}</dt>
                      <dd>{count}</dd>
                    </div>
                  </dl>
                </section>
              </ContractWorkspace>
            </div>
          )}

          {stepKey === "manage" && accepted && (
            <div className="ow-step-body ow-manage">
              <section className="ow-manage-hero" hidden={step !== "manage"}>
                <div className="ow-manage-title">
                  <CircleCheck size={28} aria-hidden="true" />
                  <div>
                    <h2>{t("Contract accepted", "Договор принят", "Müqavilə təsdiqlənib")}</h2>
                    <p>
                      {contract?.accepted_at
                        ? t("Accepted by the customer on ", "Принят клиентом: ", "Müştəri təsdiqləyib: ") +
                          formatDateTime(contract.accepted_at)
                        : t("Accepted by the customer", "Принят клиентом", "Müştəri təsdiqləyib")}
                    </p>
                  </div>
                </div>
                {(() => {
                  const totalMinor = Math.round(total * 100);
                  const share = totalMinor > 0 ? Math.min(100, Math.round((receivedMinor / totalMinor) * 100)) : 0;
                  const left = Math.max(0, totalMinor - receivedMinor);
                  return (
                    <>
                      <div className="ow-manage-money">
                        <div>
                          <small>{t("Offer total", "Сумма предложения", "Təklifin cəmi")}</small>
                          <strong>{fmt(total)}</strong>
                        </div>
                        <div>
                          <small>{t("Received", "Получено", "Daxil olub")}</small>
                          <strong>{fmt(receivedMinor / 100)}</strong>
                        </div>
                        <div>
                          <small>{t("Remaining", "Остаток", "Qalıq")}</small>
                          <strong>{fmt(left / 100)}</strong>
                        </div>
                      </div>
                      <div
                        className="ow-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={share}
                        aria-label={t("Payment progress", "Ход оплаты", "Ödənişin gedişi")}
                      >
                        <span style={{ width: share + "%" }} />
                      </div>
                      <p className="ow-manage-next">
                        {left === 0 && totalMinor > 0
                          ? t("Fully paid. Make sure the tickets and documents are uploaded.", "Оплачено полностью. Проверьте, что билеты и документы загружены.", "Tam ödənilib. Biletlərin və sənədlərin yükləndiyini yoxlayın.")
                          : receivedMinor === 0
                            ? t("Next: request the deposit from the customer.", "Далее: запросите депозит у клиента.", "Növbəti: müştəridən beh tələb edin.")
                            : t("Next: request the following payment or record the one received.", "Далее: запросите следующий платёж или запишите полученный.", "Növbəti: növbəti ödənişi tələb edin və ya daxil olanı qeyd edin.")}
                      </p>
                    </>
                  );
                })()}
              </section>
              {step === "manage" && (
                <div className="ow-hub">
                  {[
                    {
                      key: "pay" as Step,
                      icon: <CreditCard size={26} aria-hidden="true" />,
                      title: t("Payments", "Платежи", "Ödənişlər"),
                      text: t(
                        "Request a payment from the customer and record what was received.",
                        "Запросите платёж у клиента и запишите полученное.",
                        "Müştəridən ödəniş tələb edin və daxil olanı qeyd edin.",
                      ),
                      meta: t("Received ", "Получено ", "Daxil olub ") + fmt(receivedMinor / 100),
                    },
                    {
                      key: "finance" as Step,
                      icon: <Landmark size={26} aria-hidden="true" />,
                      title: t("Funds by service", "Средства по услугам", "Məbləğin bölgüsü"),
                      text: t(
                        "Show which service of the contract each received payment covers.",
                        "Покажите, какую услугу договора покрывает каждая полученная оплата.",
                        "Daxil olan ödənişin müqavilənin hansı xidmətini ödədiyini göstərin.",
                      ),
                      meta: "",
                    },
                    {
                      key: "docs" as Step,
                      icon: <Tickets size={26} aria-hidden="true" />,
                      title: t("Tickets and documents", "Билеты и документы", "Biletlər və sənədlər"),
                      text: t(
                        "Upload tickets and original documents for the customer to download.",
                        "Загрузите билеты и оригиналы документов для клиента.",
                        "Müştərinin yükləməsi üçün bilet və orijinal sənədləri əlavə edin.",
                      ),
                      meta: "",
                    },
                    {
                      key: "status" as Step,
                      icon: <FileText size={26} aria-hidden="true" />,
                      title: t("Offer and contract", "Предложение и договор", "Təklif və müqavilə"),
                      text: t(
                        "View the accepted offer and the signed contract.",
                        "Посмотрите принятое предложение и договор.",
                        "Təsdiqlənmiş təklifə və müqaviləyə baxın.",
                      ),
                      meta: "",
                    },
                  ].map((c) => (
                    <button key={c.key} className="ow-hub-card" onClick={() => goTo(c.key)}>
                      <span className="ow-hub-icon">{c.icon}</span>
                      <span className="ow-hub-body">
                        <strong>{c.title}</strong>
                        <span>{c.text}</span>
                        {c.meta && <em>{c.meta}</em>}
                      </span>
                      <ArrowRight size={20} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              {step !== "manage" && (
                <>
                  <button
                    className="ow-hub-back"
                    onClick={() => {
                      if (
                        (paymentDirty || financeDirty) &&
                        !window.confirm(
                          t(
                            "Leave without saving what you typed?",
                            "Выйти, не сохранив введённое?",
                            "Yazdıqlarınız saxlanmadan çıxılsın?",
                          ),
                        )
                      )
                        return;
                      goTo("manage");
                    }}
                  >
                    <ArrowLeft size={17} aria-hidden="true" />
                    {t("Back to Booking", "Назад к бронированию", "Rezervasiyaya qayıt")}
                  </button>
                  <section className="ow-manage-card">
                    {step === "pay" && (
                      <PaymentWorkspace
                        key={"pay" + b.id}
                        bookingId={b.id}
                        auth={auth}
                        locale={l}
                        onDirtyChange={setPaymentDirty}
                        onRecorded={() => void refreshReceived()}
                        onOpenFinance={() => goTo("finance")}
                      />
                    )}
                    {step === "finance" && (
                      <FinanceWorkspace
                        bookingId={b.id}
                        auth={auth}
                        locale={l}
                        onDirtyChange={setFinanceDirty}
                        onOpenPayments={() => goTo("pay")}
                      />
                    )}
                    {step === "docs" && (
                      <>
                        <h2>{t("Tickets and original documents", "Билеты и оригиналы документов", "Biletlər və orijinal sənədlər")}</h2>
                        <TravelDocuments key={"docs" + b.id} bookingId={b.id} auth={auth} locale={l} hideHeading />
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          )}
        </>
      )}
      {(editor || reject) && (
        <dialog
          ref={modalRef}
          className="ow-dialog"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          aria-label={
            reject
              ? t("Reject request", "Отклонить заявку", "Sorğunu rədd et")
              : t("Edit service", "Изменить услугу", "Xidməti dəyiş")
          }
        >
          <button
            className="ow-close"
            aria-label={t("Close", "Закрыть", "Bağla")}
            onClick={close}
            disabled={busy}
          >
            <X />
          </button>
          {reject ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!b || busy) return;
                const reason = String(
                  new FormData(e.currentTarget).get("reason") || "",
                ).trim();
                if (reason.length < 3) return;
                setBusy(true);
                setError("");
                try {
                  const updated = await api<Booking>(
                    "/api/v1/operations/bookings/" + b.id + "/review",
                    auth,
                    { approve: false, note: reason },
                  );
                  setFreshBooking(updated);
                  modalRef.current?.close();
                  setReject(false);
                  focusRef.current?.focus();
                  setNotice(
                    t(
                      "Request rejected. No payment opened.",
                      "Заявка отклонена. Оплата не открыта.",
                      "Sorğu rədd edildi. Ödəniş açılmadı.",
                    ),
                  );
                } catch (e) {
                  setError(problem(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>
                {t("Reject request", "Отклонить заявку", "Sorğunu rədd et")}
              </h2>
              <label>
                {t(
                  "Reason visible to customer",
                  "Причина для клиента",
                  "Müştəriyə görünən səbəb",
                )}
                <textarea
                  name="reason"
                  minLength={3}
                  maxLength={2000}
                  rows={4}
                  required
                  disabled={busy}
                />
              </label>
              <div className="ow-actions">
                <button
                  className="ow-outline"
                  type="button"
                  disabled={busy}
                  onClick={close}
                >
                  {t("Cancel", "Отмена", "Ləğv et")}
                </button>
                <button className="ow-primary" disabled={busy}>
                  {t("Reject request", "Отклонить заявку", "Sorğunu rədd et")}
                </button>
              </div>
            </form>
          ) : editor && draft ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                edit({
                  ...draft,
                  services: draft.services.map((line) =>
                    line.key === editor.key ? editor : line,
                  ),
                });
                close();
              }}
            >
              <h2>{t("Service details", "Детали услуги", "Xidmət detalları")}</h2>
              <p className="ow-sub">
                {t(
                  "Quantity, cost and margin are set in the route row.",
                  "Количество, себестоимость и маржа задаются в строке маршрута.",
                  "Say, maliyyət və marja marşrut sətrində təyin olunur.",
                )}
              </p>
              <p>
                {editor.name}, {formatDay(b?.departure)}
              </p>
              <PartnerPicker
                auth={auth}
                locale={l}
                serviceKey={baseOf(editor.key)}
                currency={draft.currency}
                date={b?.departure || ""}
                onSelect={(service) =>
                  setEditor({
                    ...editor,
                    name: service.name,
                    supplier: service.partner_name,
                    location: service.location.slice(0, 100),
                    ...priceLine(editor, service.price_minor / 100, lineMargin(editor)),
                    policy: service.policy,
                    availability: "CONFIRMED",
                  })
                }
              />
              <div className="ow-editor-grid">
                <div>
                  <h3>
                    {t("Service details", "Детали услуги", "Xidmət detalları")}
                  </h3>
                  <label>
                    {t("Service name", "Название услуги", "Xidmətin adı")}
                    <input
                      required
                      maxLength={160}
                      value={editor.name}
                      onChange={(e) =>
                        setEditor({ ...editor, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("Source", "Источник", "Mənbə")}
                    <input readOnly value={t("Manual", "Вручную", "Manual")} />
                  </label>
                  <label>
                    {t(
                      "Supplier / property",
                      "Поставщик / отель",
                      "Təchizatçı / otel",
                    )}
                    <input
                      maxLength={200}
                      value={editor.supplier}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          supplier: e.target.value,
                          availability: "CONFIRMED",
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("Location", "Место", "Məkan")}
                    <input
                      maxLength={100}
                      value={editor.location}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          location: e.target.value,
                          availability: "CONFIRMED",
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  {t(
                    "Internal supplier note",
                    "Внутренняя заметка",
                    "Daxili təchizatçı qeydi",
                  )}
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={editor.internalNote}
                    onChange={(e) =>
                      setEditor({ ...editor, internalNote: e.target.value })
                    }
                  />
                  <small>
                    {t(
                      "Only office staff can see this note.",
                      "Только для сотрудников.",
                      "Yalnız ofis əməkdaşları görür.",
                    )}
                  </small>
                </label>
              </div>
              <small>
                {t(
                  "Only this service changes. Save the draft to persist all edits.",
                  "Меняется только эта услуга. Сохраните черновик.",
                  "Yalnız bu xidmət dəyişir. Düzəlişləri saxlamaq üçün qaralamanı saxlayın.",
                )}
              </small>
              <div className="ow-actions ow-dialog-actions">
                <button type="button" className="ow-outline" onClick={close}>
                  {t("Cancel", "Отмена", "Ləğv et")}
                </button>
                <button className="ow-primary">
                  {t("Save service", "Сохранить услугу", "Xidməti saxla")}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          ) : null}
        </dialog>
      )}
    </div>
  );
}
