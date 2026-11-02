import ContractWorkspace from "./contract-workspace";
import { useEffect, useRef, useState } from "react";
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
}: {
  auth: string;
  locale: Locale;
  bookings: Booking[];
  requests: BookingRequest[];
  catalog: Tour[];
  onDirtyChange: (value: boolean) => void;
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
  const [reject, setReject] = useState(false);
  const [freshBooking, setFreshBooking] = useState<Booking | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<"review" | "compose">("review"),
    [draft, setDraft] = useState<OfferDraft | null>(null),
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
  const b = freshBooking || bookings.find((x) => x.id === selected);
  const canEdit = b?.status === "PENDING_REVIEW" && b.paid === 0;
  const count = draft?.services.length || 0,
    total = draft?.services.reduce((s, line) => s + lineAmount(line), 0) || 0,
    checked =
      draft?.services.filter(
        (x) => x.availability === "CONFIRMED" && x.supplier.trim(),
      ).length || 0,
    terms = draft?.services.filter((x) => x.policy.trim()).length || 0,
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
          "Complete supplier, availability and cancellation terms for every service.",
          "Заполните поставщика, доступность и условия каждой услуги.",
          "Hər xidmətin təchizatçısını, mövcudluğunu və ləğv şərtlərini tamamlayın.",
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
    setAudit([]);
    try {
      const [state, c, booking] = await Promise.all([
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
      ]);
      setFreshBooking(booking);
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
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (selected) void load(selected);
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
    if ((editor || preview || reject) && !modalRef.current?.open)
      modalRef.current?.showModal();
  }, [editor, preview, reject]);
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
  async function showPreview() {
    if (!draft || !b) return;
    const saved = dirty || !draft.version ? await save() : draft;
    if (!saved) return;
    setBusy(true);
    setError("");
    try {
      const p = await api<PublicOffer>(
        "/api/v1/operations/bookings/" + b.id + "/offer/preview",
        auth,
        { version: saved.version },
      );
      focusRef.current = document.activeElement as HTMLElement;
      setPreview(p);
      setPreviewVersion(saved.version);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  const ready =
    !!draft &&
    count > 0 &&
    checked === count &&
    terms === count &&
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
      setNotice(
        t(
          "Offer revision " +
            result.revision +
            " sent to the customer account. No payment opened.",
          "Версия " +
            result.revision +
            " отправлена в кабинет. Оплата не открыта.",
          "Təklifin " +
            result.revision +
            " versiyası müştəri kabinetinə göndərildi. Ödəniş açılmadı.",
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
      dirty &&
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
      <div className="ow">
        <div className="ow-queue-heading">
          <h2>{t("Request queue", "Очередь заявок", "Sorğu növbəsi")}</h2>
          <input
            type="search"
            aria-label={t("Search requests", "Поиск заявок", "Sorğu axtar")}
            placeholder={t(
              "Reference or title",
              "Номер или название",
              "Nömrə və ya başlıq",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ow-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  t("Request", "Заявка", "Sorğu"),
                  t("Travel date", "Дата поездки", "Səfər tarixi"),
                  t("Status", "Статус", "Status"),
                  t("Total", "Сумма", "Cəm"),
                  t("Action", "Действие", "Əməliyyat"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings
                .filter((x) =>
                  (x.id + x.title).toLowerCase().includes(search.toLowerCase()),
                )
                .map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{bookingName(x)}</strong>
                      <small>{x.id.slice(0, 8)}</small>
                    </td>
                    <td>{x.departure}</td>
                    <td>
                      {{
                        PENDING_REVIEW: t(
                          "Needs review",
                          "На проверке",
                          "Yoxlama gözləyir",
                        ),
                        AWAITING_PAYMENT: t(
                          "Awaiting demo payment",
                          "Ожидает демо-оплаты",
                          "Demo ödəniş gözlənilir",
                        ),
                        CONFIRMED: t(
                          "Confirmed",
                          "Подтверждено",
                          "Təsdiqlənib",
                        ),
                        REJECTED: t("Rejected", "Отклонено", "Rədd edilib"),
                        CANCELLED: t("Cancelled", "Отменено", "Ləğv edilib"),
                      }[x.status] || x.status}
                    </td>
                    <td>
                      {x.total} {x.currency}
                    </td>
                    <td>
                      <button
                        className="ow-link"
                        onClick={() => {
                          setMode("review");
                          setSelected(x.id);
                        }}
                      >
                        {t("Open request", "Открыть заявку", "Sorğunu aç")}
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!bookings.length && (
          <p>
            {t("No requests yet.", "Пока нет заявок.", "Hələ sorğu yoxdur.")}
          </p>
        )}
      </div>
    );
  return (
    <div className="ow">
      <button className="ow-link" disabled={busy} onClick={back}>
        <ArrowLeft size={15} />
        {t("Back to requests", "К заявкам", "Sorğulara qayıt")}
      </button>
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
      {draft && b && (
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
                {mode === "compose"
                  ? t(
                      "Prepare customer offer",
                      "Подготовить предложение",
                      "Müştəri təklifini hazırla",
                    )
                  : t(
                      "Custom journey",
                      "Индивидуальный маршрут",
                      "Fərdi səfər",
                    )}
              </h1>
              <p>
                #{b.id.slice(0, 8)} ·{" "}
                {mode === "compose"
                  ? t("Draft", "Черновик", "Qaralama") + " · v" + draft.version
                  : t("Request details", "Детали заявки", "Sorğu detalları")}
              </p>
            </div>
            <div className="ow-actions">
              {mode === "review" && (
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
              )}
              {mode === "review" ? (
                <button
                  className="ow-primary"
                  disabled={!canEdit || busy}
                  onClick={() => setMode("compose")}
                >
                  {t(
                    "Prepare offer",
                    "Подготовить предложение",
                    "Təklif hazırla",
                  )}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <>
                  <button
                    className="ow-outline"
                    disabled={busy || !canEdit}
                    onClick={() => void save()}
                  >
                    {t("Save draft", "Сохранить", "Qaralamanı saxla")}
                  </button>
                  <button
                    className="ow-outline"
                    disabled={busy || !canEdit}
                    onClick={() => void showPreview()}
                  >
                    <Eye size={15} />
                    {t(
                      "Preview as customer",
                      "Просмотр клиента",
                      "Müştəri kimi bax",
                    )}
                  </button>
                  <button
                    className="ow-primary"
                    disabled={!ready || busy || !canEdit}
                    onClick={() => void send()}
                  >
                    {t("Send offer", "Отправить", "Təklifi göndər")}
                  </button>
                </>
              )}
            </div>
          </div>
          {!canEdit && (
            <p className="ow-notice">
              {t(
                "This booking is read-only in the offer workspace. Existing customer requests remain in Customer requests.",
                "Эта бронь доступна только для чтения. Изменения — в запросах клиентов.",
                "Bu rezervasiya təklif bölməsində yalnız baxış üçündür. Dəyişikliklər Müştəri sorğuları bölməsindədir.",
              )}
            </p>
          )}
          {pending && (
            <p className="ow-error">
              {t(
                "A customer change/cancellation request is pending. Resolve it before sending.",
                "Есть запрос клиента. Обработайте его перед отправкой.",
                "Müştərinin dəyişiklik/ləğv sorğusu gözləyir. Göndərməzdən əvvəl həll edin.",
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
              <small>{t("Travel dates", "Даты", "Səfər tarixləri")}</small>
              <strong>{b.departure}</strong>
            </div>
            <div>
              <small>{t("Travelers", "Участники", "Səyahətçilər")}</small>
              <strong>{JSON.parse(b.quotePayload).input.pax}</strong>
            </div>
            <div>
              <small>{t("Language", "Язык", "Dil")}</small>
              <strong>{customer?.locale.toUpperCase() || "—"}</strong>
            </div>
          </div>
          <div className="ow-tabs">
            <button
              aria-pressed={mode === "review"}
              onClick={() => setMode("review")}
            >
              {t("Request details", "Детали заявки", "Sorğu detalları")}
            </button>
            <button
              aria-pressed={mode === "compose"}
              onClick={() => setMode("compose")}
            >
              {t("Offer", "Предложение", "Təklif")}
            </button>
            <button
              onClick={async () => {
                try {
                  setAudit(
                    await api(
                      "/api/v1/operations/bookings/" + b.id + "/audit",
                      auth,
                    ),
                  );
                } catch (e) {
                  setError(problem(e));
                }
              }}
            >
              {t("Activity", "История", "Tarixçə")}
            </button>
          </div>
          {sentVersion > 0 && <ContractWorkspace key={b.id} bookingId={b.id} auth={auth} locale={l} />}
          {audit.length > 0 && (
            <details open className="ow-audit">
              <summary>
                {t("Activity history", "История", "Əməliyyat tarixçəsi")}
              </summary>
              {audit.map((x, i) => (
                <p key={i}>
                  {x.created_at} · {x.action} · {x.actor}
                </p>
              ))}
            </details>
          )}
          <div className="ow-grid">
            <div>
              {mode === "compose" && (
                <section>
                  <h2>
                    <span>01</span>
                    {t(
                      "Offer details",
                      "Детали предложения",
                      "Təklif detalları",
                    )}
                  </h2>
                  <div className="ow-fields">
                    <label>
                      {t("Offer title", "Название", "Təklif başlığı")}
                      <input
                        maxLength={160}
                        disabled={!canEdit || busy}
                        value={draft.title}
                        onChange={(e) =>
                          edit({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Currency", "Валюта", "Valyuta")}
                      <input readOnly value={draft.currency} />
                    </label>
                  </div>
                </section>
              )}
              <section>
                <h2>
                  <span>{mode === "review" ? "01" : "02"}</span>
                  {mode === "review"
                    ? t(
                        "Requested itinerary",
                        "Запрошенный маршрут",
                        "İstənilən marşrut",
                      )
                    : t("Final itinerary", "Итоговый маршрут", "Yekun marşrut")}
                </h2>
                {(mode === "review"
                  ? initial(b).itinerary
                  : draft.itinerary
                ).map((day, i) => (
                  <div className="ow-day" key={i}>
                    <strong>
                      {t("Day", "День", "Gün")} {i + 1}
                    </strong>
                    {mode === "compose" ? (
                      <>
                        <select
                          aria-label={
                            t(
                              "Destination day ",
                              "Направление дня ",
                              "Günün istiqaməti ",
                            ) +
                            (i + 1)
                          }
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
                          {["Baku", "Quba", "Khinalug", "Gabala", "Sheki"].map(
                            (c) => (
                              <option key={c}>{c}</option>
                            ),
                          )}
                        </select>
                        <textarea
                          aria-label={
                            t(
                              "Day description ",
                              "Описание дня ",
                              "Günün təsviri ",
                            ) +
                            (i + 1)
                          }
                          maxLength={1500}
                          disabled={!canEdit || busy}
                          value={day.description}
                          onChange={(e) =>
                            edit({
                              ...draft,
                              itinerary: draft.itinerary.map((d, n) =>
                                n === i
                                  ? { ...d, description: e.target.value }
                                  : d,
                              ),
                            })
                          }
                        />
                      </>
                    ) : (
                      <span>
                        {day.city}
                        {day.description !== day.city
                          ? " · " + day.description
                          : ""}
                      </span>
                    )}
                  </div>
                ))}
                {mode === "compose" ? (
                  <label>
                    {t(
                      "Return route",
                      "Обратный маршрут",
                      "Geri dönüş marşrutu",
                    )}
                    <input
                      maxLength={1500}
                      disabled={!canEdit || busy}
                      value={draft.returnRoute}
                      onChange={(e) =>
                        edit({ ...draft, returnRoute: e.target.value })
                      }
                    />
                  </label>
                ) : (
                  <p>
                    {t(
                      "Return route to be confirmed with the team.",
                      "Обратный маршрут нужно согласовать.",
                      "Geri dönüş marşrutu komanda ilə dəqiqləşdirilməlidir.",
                    )}
                  </p>
                )}
              </section>
              {mode === "review" && (
                <section>
                  <h2>
                    <span>02</span>
                    {t(
                      "Customer notes",
                      "Пожелания клиента",
                      "Müştəri qeydləri",
                    )}
                  </h2>
                  <p className="ow-read-note">{b.customerNote || "—"}</p>
                </section>
              )}
              <section>
                <h2>
                  <span>03</span>
                  {mode === "review"
                    ? t(
                        "Service checks",
                        "Проверка услуг",
                        "Xidmət yoxlamaları",
                      )
                    : t(
                        "Services & customer prices",
                        "Услуги и цены",
                        "Xidmətlər və müştəri qiymətləri",
                      )}
                </h2>
                <div className="ow-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          t("Service", "Услуга", "Xidmət"),
                          t("Quantity", "Количество", "Say"),
                          t("Total", "Сумма", "Cəm"),
                          t("Availability", "Наличие", "Mövcudluq"),
                          t("Terms", "Условия", "Şərtlər"),
                          t("Action", "Действие", "Əməliyyat"),
                        ].map((s) => (
                          <th key={s}>{s}</th>
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
                              {line.key === "hotel"
                                ? " × " + line.nights
                                : ""}{" "}
                              × {fmt(line.unitPrice)}
                            </td>
                            <td>
                              <strong>
                                {fmt(
                                  Math.round(
                                    line.quantity *
                                      line.nights *
                                      line.unitPrice,
                                  ),
                                )}
                              </strong>
                            </td>
                            <td>
                              <span
                                className={
                                  line.availability === "CONFIRMED"
                                    ? "ow-good"
                                    : ""
                                }
                              >
                                {line.availability === "CONFIRMED" ? (
                                  <Check size={14} />
                                ) : (
                                  <Clock size={14} />
                                )}{" "}
                                {availability(line.availability)}
                              </span>
                            </td>
                            <td>
                              {line.policy.trim() ? (
                                <span className="ow-good">
                                  <Check size={14} />
                                  {t("Reviewed", "Проверено", "Yoxlanılıb")}
                                </span>
                              ) : (
                                <span className="ow-missing">
                                  <AlertTriangle size={14} />
                                  {t("Missing", "Нет", "Çatışmır")}
                                </span>
                              )}
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
                        <th colSpan={4}>
                          {t(
                            "Group total",
                            "Итого для группы",
                            "Qrup üçün cəm",
                          )}
                        </th>
                        <td colSpan={2}>
                          <strong>{fmt(total)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
              <section>
                <h2>
                  <span>04</span>
                  {mode === "review"
                    ? t(
                        "Internal office note",
                        "Внутренняя заметка",
                        "Daxili ofis qeydi",
                      )
                    : t(
                        "Message to customer",
                        "Сообщение клиенту",
                        "Müştəriyə mesaj",
                      )}
                </h2>
                <textarea
                  aria-label={
                    mode === "review"
                      ? t(
                          "Internal office note",
                          "Внутренняя заметка",
                          "Daxili ofis qeydi",
                        )
                      : t(
                          "Message to customer",
                          "Сообщение клиенту",
                          "Müştəriyə mesaj",
                        )
                  }
                  maxLength={mode === "review" ? 4000 : 2000}
                  disabled={!canEdit || busy}
                  rows={4}
                  value={mode === "review" ? draft.internalNote : draft.message}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      [mode === "review" ? "internalNote" : "message"]:
                        e.target.value,
                    })
                  }
                />
                <small>
                  {mode === "review"
                    ? t(
                        "Visible to office staff only.",
                        "Видно только сотрудникам.",
                        "Yalnız ofis əməkdaşlarına görünür.",
                      )
                    : t(
                        "Included in the customer offer.",
                        "Будет в предложении клиенту.",
                        "Müştəri təklifində görünəcək.",
                      )}
                </small>
              </section>
              {mode === "compose" && (
                <details>
                  <summary>
                    {t(
                      "Internal notes — not shared",
                      "Внутренние заметки — не видны клиенту",
                      "Daxili qeydlər — paylaşılmır",
                    )}
                  </summary>
                  <textarea
                    aria-label={t(
                      "Internal office note",
                      "Внутренняя заметка",
                      "Daxili ofis qeydi",
                    )}
                    rows={3}
                    maxLength={4000}
                    disabled={!canEdit || busy}
                    value={draft.internalNote}
                    onChange={(e) =>
                      edit({ ...draft, internalNote: e.target.value })
                    }
                  />
                </details>
              )}
            </div>
            <aside className="ow-summary">
              <div>
                <h2>
                  {mode === "review"
                    ? t("Review summary", "Итог проверки", "Yoxlama xülasəsi")
                    : t("Customer sees", "Клиент увидит", "Müştəri görür")}
                </h2>
                <p>
                  {draft.title}
                  <br />
                  {draft.itinerary.map((d) => d.city).join(" → ")}
                </p>
                {mode === "compose" &&
                  draft.services.map((line) => (
                    <div className="ow-summary-line" key={line.key}>
                      <span>{line.name}</span>
                      <strong>
                        {fmt(
                          Math.round(
                            line.quantity * line.nights * line.unitPrice,
                          ),
                        )}
                      </strong>
                    </div>
                  ))}
                <div className="ow-summary-line ow-total">
                  <strong>
                    {t("Estimated total", "Примерная сумма", "Təxmini cəm")}
                  </strong>
                  <strong>{fmt(total)}</strong>
                </div>
                <div className="ow-summary-line">
                  <span>{t("Paid", "Оплачено", "Ödənilib")}</span>
                  <strong>{fmt(b.paid)}</strong>
                </div>
              </div>
              <div>
                <h2>
                  {t(
                    "Ready to send?",
                    "Готово к отправке?",
                    "Göndərməyə hazırdır?",
                  )}
                </h2>
                <p className={checked === count ? "ow-good" : ""}>
                  {checked}/{count}{" "}
                  {t(
                    "services available",
                    "услуг доступны",
                    "xidmət mövcuddur",
                  )}
                </p>
                <p className={terms === count ? "ow-good" : "ow-missing"}>
                  {terms}/{count}{" "}
                  {t(
                    "service terms reviewed",
                    "условий проверено",
                    "xidmət şərti yoxlanılıb",
                  )}
                </p>
                <p>
                  {draft.message.trim() ? (
                    <Check size={15} />
                  ) : (
                    <Clock size={15} />
                  )}{" "}
                  {t(
                    "Customer message",
                    "Сообщение клиенту",
                    "Müştəriyə mesaj",
                  )}
                </p>
                <p>
                  {!dirty &&
                  previewVersion === draft.version &&
                  draft.version > 0 ? (
                    <Check size={15} />
                  ) : (
                    <Clock size={15} />
                  )}{" "}
                  {t(
                    "Saved customer preview reviewed",
                    "Сохранённая версия просмотрена",
                    "Saxlanmış müştəri görünüşünə baxılıb",
                  )}
                </p>
                {pending && (
                  <p className="ow-missing">
                    {t(
                      "Customer request pending",
                      "Запрос клиента ожидает ответа",
                      "Müştəri sorğusu cavab gözləyir",
                    )}
                  </p>
                )}
                <div className="ow-sage">
                  {t(
                    "Offer only. No payment is requested or charged. Contract approval and later service payments are separate planned steps.",
                    "Только предложение. Оплата не запрашивается. Договор и платежи по услугам — следующие этапы.",
                    "Yalnız təklifdir. Ödəniş tələb olunmur. Müqavilə təsdiqi və xidmət ödənişləri ayrıca planlaşdırılan mərhələlərdir.",
                  )}
                </div>
              </div>
            </aside>
          </div>
          <footer className="ow-footer">
            <span>
              {dirty
                ? t(
                    "Unsaved changes",
                    "Есть изменения",
                    "Saxlanmamış dəyişikliklər",
                  )
                : sentVersion > 0 && sentVersion === draft.version
                  ? t(
                      "Offer sent",
                      "Предложение отправлено",
                      "Təklif göndərilib",
                    )
                  : t(
                      "Draft not sent",
                      "Черновик не отправлен",
                      "Qaralama göndərilməyib",
                    )}
            </span>
            <div className="ow-actions">
              <button
                className="ow-outline"
                disabled={busy || !canEdit}
                onClick={() => void save()}
              >
                {t("Save draft", "Сохранить", "Qaralamanı saxla")}
              </button>
              {mode === "review" ? (
                <button
                  className="ow-primary"
                  disabled={!canEdit || busy}
                  onClick={() => setMode("compose")}
                >
                  {t(
                    "Prepare offer",
                    "Подготовить предложение",
                    "Təklif hazırla",
                  )}
                  <ArrowRight size={16} />
                </button>
              ) : (
                <>
                  <button
                    className="ow-outline"
                    disabled={busy || !canEdit}
                    onClick={() => void showPreview()}
                  >
                    {t(
                      "Preview as customer",
                      "Просмотр клиента",
                      "Müştəri kimi bax",
                    )}
                  </button>
                  <button
                    className="ow-primary"
                    disabled={busy || !canEdit || !ready}
                    onClick={() => void send()}
                  >
                    {t("Send offer", "Отправить", "Təklifi göndər")}
                  </button>
                </>
              )}
            </div>
          </footer>
        </>
      )}
      {(editor || preview || reject) && (
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
              : editor
                ? t("Edit service", "Изменить услугу", "Xidməti dəyiş")
                : t("Customer preview", "Просмотр клиента", "Müştəri görünüşü")
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
                {editor.name} · {b?.departure}
              </p>
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
                    "Customer-facing cancellation terms",
                    "Условия отмены для клиента",
                    "Müştəriyə görünən ləğv şərtləri",
                  )}
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={editor.policy}
                    onChange={(e) =>
                      setEditor({ ...editor, policy: e.target.value })
                    }
                  />
                  <small>
                    {t(
                      "Required before sending; depends on this service, supplier and timing.",
                      "Нужно перед отправкой; зависит от услуги, поставщика и времени.",
                      "Göndərməzdən əvvəl tələb olunur; xidmət, təchizatçı və vaxtdan asılıdır.",
                    )}
                  </small>
                </label>
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
          ) : (
            preview && (
              <>
                <h2>{preview.title}</h2>
                <p>
                  {customer?.name} · {preview.date} · {preview.travelers}{" "}
                  {t("travelers", "чел.", "nəfər")}
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
                    <p>
                      {line.policy ||
                        t(
                          "Cancellation policy missing",
                          "Нет условий отмены",
                          "Ləğv şərti çatışmır",
                        )}
                    </p>
                  </section>
                ))}
                <div className="ow-summary-line ow-total">
                  <strong>
                    {t("Group total", "Сумма для группы", "Qrup üçün cəm")}
                  </strong>
                  <strong>{fmt(preview.total)}</strong>
                </div>
                <p className="ow-read-note">{preview.message}</p>
                <p>
                  {t(
                    "No payment requested. Contract approval is a later planned step.",
                    "Оплата не запрашивается. Договор — следующий этап.",
                    "Ödəniş tələb olunmur. Müqavilə təsdiqi sonrakı planlaşdırılan mərhələdir.",
                  )}
                </p>
                <button className="ow-primary" onClick={close}>
                  {t("Return to draft", "К черновику", "Qaralamaya qayıt")}
                </button>
              </>
            )
          )}
        </dialog>
      )}
    </div>
  );
}
