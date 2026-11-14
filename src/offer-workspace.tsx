import TravelDocuments from './travel-documents';
import PartnerPicker from "./partner-picker";
import { FinanceWorkspace } from "./finance-workspace";
import RequestWorkspace from "./request-workspace";
import PaymentWorkspace from "./payment-workspace";
import ContractWorkspace from "./contract-workspace";
import { useEffect, useRef, useState } from "react";
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
  Flower2,
  X,
  Eye,
  FileText,
  AlertTriangle,
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
import { lineAmount } from "./offer-pricing";
import { formatDay, formatDateTime } from "./dates";
const names: Record<string, string[]> = {
  transport: [
    "Private car & driver",
    "Автомобиль с водителем",
    "Şəxsi avtomobil və sürücü",
  ],
  hotel: ["Comfort stay", "Проживание", "Qalma yeri"],
  guide: ["Local guide", "Местный гид", "Yerli gid"],
  transfer: ["Airport transfer", "Трансфер", "Hava limanı transferi"],
  activity: ["Local craft experience", "Мастер-класс", "Sənətkarlıq təcrübəsi"],
};
const icons: Record<string, typeof Car> = {
  transport: Car,
  hotel: BedDouble,
  guide: Users,
  transfer: Plane,
  activity: Flower2,
};
const routes: Record<string, string[]> = {
  "quba-khinalug": ["Quba", "Khinalug"],
  "baku-discovery": ["Baku"],
  "sheki-gabala": ["Baku", "Gabala", "Sheki"],
};
function initial(b: Booking): OfferDraft {
  const q = JSON.parse(b.quotePayload),
    input = q.input,
    route = input.cities || routes[input.slug] || ["Baku"];
  return {
    version: 0,
    sourceQuoteId: b.quoteId,
    title: "Your custom journey",
    currency: b.currency,
    itinerary: route.map((city: string) => ({ city, description: city })),
    returnRoute: "",
    services: q.lines.map((line: { label: string; amount: number }) => {
      const key = line.label;
      const days = route.length;
      const quantity =
        key === "hotel"
          ? Math.ceil(input.pax / 2)
          : key === "activity"
            ? input.pax
            : key === "transfer"
              ? 1
              : days;
      const nights = key === "hotel" ? Math.max(1, days - 1) : 1;
      return {
        key,
        name: names[key]?.[0] || key,
        quantity,
        nights,
        unitPrice: Math.max(
          0.000001,
          Number((line.amount / (quantity * nights)).toFixed(6)),
        ),
        unit:
          key === "hotel"
            ? "room"
            : key === "activity"
              ? "person"
              : key === "transfer"
                ? "transfer"
                : "day",
        supplier: "",
        location: "",
        availability: "NOT_CHECKED",
        policy: "",
        internalNote: "",
      };
    }),
    message: "",
    internalNote: "",
  };
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
    checked =
      draft?.services.filter(
        (x) => x.availability === "CONFIRMED" && x.supplier.trim(),
      ).length || 0,
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
    names[key]?.[l === "az" ? 2 : l === "ru" ? 1 : 0] || key;
  const availability = (value: string) =>
    value === "CONFIRMED"
      ? t("Confirmed", "Подтверждено", "Təsdiqlənib")
      : value === "UNAVAILABLE"
        ? t("Unavailable", "Недоступно", "Mövcud deyil")
        : t("Not checked", "Не проверено", "Yoxlanılmayıb");
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
    setAudit([]);
    try {
      const [state, c, booking, payments] = await Promise.all([
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
      ]);
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
  type Step = "info" | "offer" | "preview" | "status";
  const STEP_ORDER: Step[] = ["info", "offer", "preview", "status"];
  const sent = sentVersion > 0;
  const step: Step =
    route.view === "Bookings" && STEP_ORDER.includes(route.sub as Step)
      ? (route.sub as Step)
      : sent
        ? "status"
        : "info";
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
        ...(checked !== count
          ? [
              t(
                "Confirm the supplier and availability of every service",
                "Подтвердите поставщика и доступность каждой услуги",
                "Hər xidmətin təchizatçısını və mövcudluğunu təsdiqləyin",
              ),
            ]
          : []),
        ...(!draft.message.trim()
          ? [t("Write a short message for the customer", "Напишите сообщение клиенту", "Müştəriyə qısa mesaj yazın")]
          : []),
        ...(!draft.returnRoute.trim()
          ? [t("Add the return route", "Укажите обратный маршрут", "Geri dönüş marşrutunu yazın")]
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
    else if (step === "preview") {
      if (!canEdit) goTo("status");
      else if (dirty || !draft.version) goTo("offer");
      else if (!preview || preview.draftVersion !== draft.version)
        void loadPreview();
    }
  }, [step, loading, draft?.version, dirty, sentVersion, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
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
    checked === count &&
    !!draft.message.trim() &&
    !!draft.returnRoute.trim() &&
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
  const stepsList: { key: Step; label: string; enabled: boolean }[] = [
    { key: "info", label: t("Request", "Заявка", "Sorğu"), enabled: true },
    { key: "offer", label: t("Offer", "Предложение", "Təklif"), enabled: canEdit },
    {
      key: "preview",
      label: t("Preview & send", "Просмотр и отправка", "Önbaxış və göndərmə"),
      enabled: canEdit && count > 0,
    },
    { key: "status", label: t("Status", "Статус", "Status"), enabled: sent },
  ];
  const stepIndex = STEP_ORDER.indexOf(step);
  const pricedTotal = draft ? total : 0;
  const money = (n: number) => fmt(n);
  const costSummary = draft && (
    <aside className="ow-summary">
      <div>
        <h2>{t("Customer sees", "Клиент увидит", "Müştəri görür")}</h2>
        <p>
          {draft.title}
          <br />
          {draft.itinerary.map((d) => d.city).join(" → ")}
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
              {x.action} · {x.actor}
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
              <p>
                #{b.id.slice(0, 8)} · {formatDay(b.departure)}
                {customer?.email ? " · " + customer.email : ""}
              </p>
            </div>
          </div>
          <ol className="ow-steps" aria-label={t("Steps", "Шаги", "Mərhələlər")}>
            {stepsList.map((x, i) => (
              <li
                key={x.key}
                className={
                  (step === x.key ? "current " : "") +
                  (i < stepIndex ? "done " : "") +
                  (x.enabled ? "" : "off")
                }
              >
                <button
                  disabled={!x.enabled || busy}
                  aria-current={step === x.key ? "step" : undefined}
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
                  <small>{customer?.email || "—"}</small>
                </div>
                <div>
                  <small>{t("Travel dates", "Даты", "Səfər tarixi")}</small>
                  <strong>{formatDay(b.departure)}</strong>
                </div>
                <div>
                  <small>{t("Travelers", "Участники", "Səyahətçilər")}</small>
                  <strong>{String(input.pax ?? "—")}</strong>
                </div>
                <div>
                  <small>{t("Language", "Язык", "Dil")}</small>
                  <strong>{customer?.locale.toUpperCase() || "—"}</strong>
                </div>
              </div>
              <div className="ow-info-grid">
                <section>
                  <h2>{t("Requested route", "Запрошенный маршрут", "İstənilən marşrut")}</h2>
                  <div className="ow-route-days">
                    {initial(b).itinerary.map((day, i) => (
                      <div className="ow-day" key={i}>
                        <strong>
                          {t("Day", "День", "Gün")} {i + 1}
                        </strong>
                        <span>{day.city}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h2>{t("Customer's choices", "Выбор клиента", "Müştərinin seçimləri")}</h2>
                  <ul className="ow-choices">
                    {quoted.lines.map((line) => (
                      <li key={line.label}>
                        <span>{label(line.label)}</span>
                        {line.label === "hotel" && input.hotel ? (
                          <small>{hotelNames[String(input.hotel)] ?? String(input.hotel)}</small>
                        ) : line.label === "guide" && input.guideLanguage ? (
                          <small>
                            {langNames[String(input.guideLanguage)] ?? String(input.guideLanguage)}
                          </small>
                        ) : null}
                      </li>
                    ))}
                    {quoted.lines.length === 0 && <li>—</li>}
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
                  <section>
                    <h2>{t("Offer details", "Детали предложения", "Təklif detalları")}</h2>
                    <div className="ow-fields">
                      <label>
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
                        <input readOnly value={draft.currency} />
                      </label>
                    </div>
                  </section>
                  <section>
                    <h2>{t("Final itinerary", "Итоговый маршрут", "Yekun marşrut")}</h2>
                    <div>
                      {draft.itinerary.map((day, i) => (
                        <div className="ow-day" key={i}>
                          <strong>
                            {t("Day", "День", "Gün")} {i + 1}
                          </strong>
                          <select
                            aria-label={t("Destination day ", "Направление дня ", "Günün istiqaməti ") + (i + 1)}
                            disabled={!canEdit || busy}
                            value={day.city}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                itinerary: draft.itinerary.map((d, n) =>
                                  n === i ? { ...d, city: e.target.value } : d,
                                ),
                              })
                            }
                          >
                            {["Baku", "Quba", "Khinalug", "Gabala", "Sheki"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                          <textarea
                            aria-label={t("Day description ", "Описание дня ", "Günün təsviri ") + (i + 1)}
                            maxLength={1500}
                            disabled={!canEdit || busy}
                            value={day.description}
                            onChange={(e) =>
                              edit({
                                ...draft,
                                itinerary: draft.itinerary.map((d, n) =>
                                  n === i ? { ...d, description: e.target.value } : d,
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <label>
                      {t("Return route", "Обратный маршрут", "Geri dönüş marşrutu")}
                      <input
                        maxLength={1500}
                        disabled={!canEdit || busy}
                        value={draft.returnRoute}
                        onChange={(e) => edit({ ...draft, returnRoute: e.target.value })}
                      />
                    </label>
                  </section>
                  <section>
                    <h2>{t("Services & customer prices", "Услуги и цены", "Xidmətlər və müştəri qiymətləri")}</h2>
                    <div className="ow-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              t("Service", "Услуга", "Xidmət"),
                              t("Quantity", "Количество", "Say"),
                              t("Total", "Сумма", "Cəm"),
                              t("Availability", "Наличие", "Mövcudluq"),
                              "",
                            ].map((x, i) => (
                              <th key={i}>{x}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {draft.services.map((line) => {
                            const Icon = icons[line.key] || FileText;
                            return (
                              <tr key={line.key}>
                                <td>
                                  <div className="ow-service-name">
                                    <Icon size={21} />
                                    <strong>{line.name || label(line.key)}</strong>
                                  </div>
                                </td>
                                <td>
                                  {line.quantity}
                                  {line.key === "hotel" ? " × " + line.nights : ""} × {fmt(line.unitPrice)}
                                </td>
                                <td>
                                  <strong>{fmt(lineAmount(line))}</strong>
                                </td>
                                <td>
                                  <span className={line.availability === "CONFIRMED" ? "ow-good" : ""}>
                                    {line.availability === "CONFIRMED" ? <Check size={14} /> : <Clock size={14} />}{" "}
                                    {availability(line.availability)}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="ow-link"
                                    disabled={!canEdit || busy}
                                    onClick={() => openLine(line)}
                                  >
                                    {t("Edit", "Изменить", "Dəyiş")}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={3}>{t("Group total", "Итого для группы", "Qrup üçün cəm")}</th>
                            <td colSpan={2}>
                              <strong>{fmt(total)}</strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
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
                {costSummary}
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
                      {customer?.name} · {formatDay(preview.date)} · {preview.travelers} {t("travelers", "чел.", "nəfər")}
                    </p>
                    {preview.itinerary.map((d, i) => (
                      <div className="ow-day" key={i}>
                        <strong>
                          {i + 1}. {d.city}
                        </strong>
                        <p>{d.description}</p>
                      </div>
                    ))}
                    <p>{preview.returnRoute}</p>
                    {preview.services.map((line) => (
                      <section className="ow-preview-service" key={line.key}>
                        <div className="ow-summary-line">
                          <strong>{line.name}</strong>
                          <strong>{fmt(line.total)}</strong>
                        </div>
                        <p>{line.policy}</p>
                      </section>
                    ))}
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
                        <Check size={15} /> {t("Services confirmed", "Услуги подтверждены", "Xidmətlər təsdiqlənib")}
                      </p>
                      <p className="ow-good">
                        <Check size={15} /> {t("Message written", "Сообщение написано", "Mesaj yazılıb")}
                      </p>
                      <p className="ow-good">
                        <Check size={15} /> {t("Return route set", "Обратный маршрут указан", "Geri dönüş marşrutu var")}
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
              <section className="ow-status">
                <h2>{t("Offer sent", "Предложение отправлено", "Təklif göndərilib")}</h2>
                <p>
                  {t(
                    `Version ${sentVersion} is with the customer`,
                    `Версия ${sentVersion} у клиента`,
                    `${sentVersion}-ci versiya müştərindədir`,
                  )}
                  {" · "}
                  {fmt(total)}
                </p>
                {canEdit && (
                  <button className="ow-outline" onClick={() => goTo("offer")}>
                    {t("Edit and send a new version", "Изменить и отправить новую версию", "Dəyişib yeni versiya göndər")}
                  </button>
                )}
              </section>
              <details key={"docs" + b.id} className="ow-secondary ow-documents">
                <summary>
                  {t("Tickets & original documents", "Билеты и оригиналы документов", "Biletlər və orijinal sənədlər")}
                </summary>
                <TravelDocuments bookingId={b.id} auth={auth} locale={l} hideHeading />
              </details>
              <ContractWorkspace key={b.id} bookingId={b.id} auth={auth} locale={l} />
              <FinanceWorkspace
                bookingId={b.id}
                auth={auth}
                locale={l}
                onDirtyChange={setFinanceDirty}
              />
              <PaymentWorkspace
                key={"pay" + b.id}
                bookingId={b.id}
                auth={auth}
                locale={l}
                onDirtyChange={setPaymentDirty}
              />
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
              <h2>{t("Edit service", "Изменить услугу", "Xidməti dəyiş")}</h2>
              <p>
                {editor.name} · {formatDay(b?.departure)}
              </p>
              <PartnerPicker
                auth={auth}
                locale={l}
                serviceKey={editor.key}
                currency={draft.currency}
                date={b?.departure || ""}
                onSelect={(service) =>
                  setEditor({
                    ...editor,
                    name: service.name,
                    supplier: service.partner_name,
                    location: service.location.slice(0, 100),
                    unitPrice: service.price_minor / 100,
                    policy: service.policy,
                    availability: "NOT_CHECKED",
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
                          availability: "NOT_CHECKED",
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
                          availability: "NOT_CHECKED",
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("Availability", "Наличие", "Mövcudluq")}
                    <select
                      value={editor.availability}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          availability: e.target
                            .value as OfferLine["availability"],
                        })
                      }
                    >
                      {["NOT_CHECKED", "CONFIRMED", "UNAVAILABLE"].map((v) => (
                        <option key={v} value={v}>
                          {availability(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    {t(
                      "Records an office check; does not book the supplier.",
                      "Фиксирует проверку, не бронирует поставщика.",
                      "Ofis yoxlamasını qeyd edir, təchizatçıda rezervasiya etmir.",
                    )}
                  </small>
                </div>
                <div>
                  <h3>
                    {t("Customer price", "Цена для клиента", "Müştəri qiyməti")}
                  </h3>
                  <label>
                    {t("Quantity", "Количество", "Say")}
                    <input
                      type="number"
                      min={1}
                      max={168}
                      step={1}
                      required
                      value={editor.quantity}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          quantity: Number(e.target.value),
                          availability: "NOT_CHECKED",
                        })
                      }
                    />
                  </label>
                  {editor.key === "hotel" && (
                    <label>
                      {t("Nights", "Ночей", "Gecə")}
                      <input
                        type="number"
                        min={1}
                        max={14}
                        step={1}
                        required
                        value={editor.nights}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            nights: Number(e.target.value),
                            availability: "NOT_CHECKED",
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    {t("Unit price", "Цена за единицу", "Vahid qiyməti")} (
                    {draft.currency})
                    <input
                      required
                      type="number"
                      min={0.000001}
                      max={100000}
                      step={0.000001}
                      value={editor.unitPrice}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          unitPrice: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <div className="ow-summary-line ow-total">
                    <strong>
                      {t("Service total", "Стоимость услуги", "Xidmətin cəmi")}
                    </strong>
                    <strong>
                      {fmt(
                        Math.round(
                          editor.quantity * editor.nights * editor.unitPrice,
                        ),
                      )}
                    </strong>
                  </div>
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
              <div className="ow-sage">
                {editor.quantity} × {editor.nights} × {fmt(editor.unitPrice)} ={" "}
                <strong>
                  {fmt(
                    Math.round(
                      editor.quantity * editor.nights * editor.unitPrice,
                    ),
                  )}
                </strong>
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
