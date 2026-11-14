import OriginalPdfPreview from "./original-pdf-preview";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BedDouble,
  Bus,
  Car,
  Check,
  CircleCheck,
  Eye,
  FileText,
  Flower2,
  Map as MapIcon,
  Plane,
  Plus,
  RefreshCw,
  Ticket,
  Undo2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import "./travel-documents.css";
type Document = {
  id: string;
  version: number;
  title: string;
  filename: string;
  mime: string;
  sha256: string;
  state: string;
  status: string;
  service_key: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
};
const base = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");

const KINDS: { key: string; service: string; icon: ReactNode }[] = [
  { key: "E_TICKET", service: "flight", icon: <Plane size={22} /> },
  { key: "BOARDING_PASS", service: "flight", icon: <Ticket size={22} /> },
  { key: "HOTEL_VOUCHER", service: "hotel", icon: <BedDouble size={22} /> },
  { key: "TRANSFER_VOUCHER", service: "transfer", icon: <Bus size={22} /> },
  { key: "TOUR_VOUCHER", service: "activity", icon: <MapIcon size={22} /> },
  { key: "OTHER", service: "activity", icon: <FileText size={22} /> },
];
const SERVICE_ICONS: Record<string, ReactNode> = {
  flight: <Plane size={16} />,
  hotel: <BedDouble size={16} />,
  transport: <Car size={16} />,
  guide: <Users size={16} />,
  transfer: <Bus size={16} />,
  activity: <Flower2 size={16} />,
};
const ZONES = ["Asia/Baku", "Europe/Istanbul", "Europe/Moscow", "Europe/London", "Europe/Berlin", "Asia/Dubai", "UTC"];
/** "2026-12-18T10:00" typed in a time zone becomes the ISO text with offset the server expects. */
function toIso(local: string, zone: string) {
  if (!local) return "";
  const guess = new Date(local + ":00Z");
  const part = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((x) => x.type === "timeZoneName")?.value;
  const offset = !part || part === "GMT" ? "+00:00" : part.replace("GMT", "");
  return local + ":00" + offset;
}
const when = (iso: string, zone: string, locale: Locale) => {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: zone,
      })
        .formatToParts(new Date(iso))
        .map((x) => [x.type, x.value]),
    );
    void locale;
    return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`;
  } catch {
    return iso;
  }
};
export default function TravelDocuments({
  bookingId,
  auth,
  locale,
  hideHeading = false,
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  hideHeading?: boolean;
}) {
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  const [rows, setRows] = useState<Document[]>([]),
    [selected, setSelected] = useState<Document | null>(null),
    [url, setUrl] = useState(""),
    [previewLoaded, setPreviewLoaded] = useState(false),
    [checked, setChecked] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [customer, setCustomer] = useState<{ name: string; email: string } | null>(
      null,
    );
  const [serviceKey, setServiceKey] = useState("flight"),
    [kind, setKind] = useState("E_TICKET"),
    [title, setTitle] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [timezone, setTimezone] = useState("Asia/Baku"),
    [instructions, setInstructions] = useState(""),
    [replaces, setReplaces] = useState("");
  const path = "/api/v1/operations/bookings/" + bookingId + "/documents";
  async function load() {
    const [docs, owner] = await Promise.all([
      api<Document[]>(path, auth),
      api<{ name: string; email: string }>(
        "/api/v1/operations/bookings/" + bookingId + "/customer",
        auth,
      ),
    ]);
    setRows(docs);
    setCustomer(owner);
  }
  useEffect(() => {
    let active = true;
    setRows([]);
    setSelected(null);
    setCustomer(null);
    void load().catch(() => {
      if (active)
        setError(
          t(
            "Could not load documents.",
            "Документы не загружены.",
            "Sənədlər yüklənmədi.",
          ),
        );
    });
    return () => {
      active = false;
    };
  }, [bookingId, auth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUrl("");
    setChecked(false);
    setReviewed(false);
    setPreviewLoaded(false);
    if (!selected) return;
    const abort = new AbortController();
    let object = "";
    void fetch(base + path + "/" + selected.id + "/file", {
      headers: { Authorization: auth },
      cache: "no-store",
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.blob();
      })
      .then((blob) => {
        if (abort.signal.aborted) return;
        object = URL.createObjectURL(blob);
        setUrl(object);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            t(
              "Preview unavailable.",
              "Просмотр недоступен.",
              "Önbaxış açılmadı.",
            ),
          );
      });
    return () => {
      abort.abort();
      if (object) URL.revokeObjectURL(object);
    };
  }, [selected?.id, bookingId, auth]); // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(file: File, startsAt: string, endsAt: string) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (replaces) form.append("replaces", replaces);
      form.append("file", file);
      Object.entries({
        serviceKey,
        kind,
        title,
        startsAt,
        endsAt,
        timezone,
        instructions,
      }).forEach(([k, v]) => form.append(k, v));
      const r = await fetch(base + path, {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      await load();
      setComposer(false);
      setFile(null);
      setSelected(d);
      setReplaces("");
    } catch {
      setError(
        t(
          "Upload failed. Check dates, format and booking state.",
          "Загрузка не удалась. Проверьте даты, формат и статус поездки.",
          "Yüklənmədi. Tarix, format və səfərin vəziyyətini yoxlayın.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(op: "preview" | "publish" | "revoke") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<Document>(path + "/" + selected.id + "/" + op, auth, {
        sha256: selected.sha256,
        customerChecked: checked,
      });
      setSelected(d);
      await load();
      if (op === "preview") setReviewed(true);
    } catch {
      setReviewed(false);
      setError(
        t(
          "Action failed. Refresh and review the latest document.",
          "Не удалось. Обновите и проверьте последний документ.",
          "Əməliyyat alınmadı. Son sənədi yeniləyib yoxlayın.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const kindLabel: Record<string, string> = {
    E_TICKET: t("Flight ticket", "Авиабилет", "Aviabilet"),
    BOARDING_PASS: t("Boarding pass", "Посадочный талон", "Boarding pass"),
    HOTEL_VOUCHER: t("Hotel voucher", "Ваучер отеля", "Otel vouçeri"),
    TRANSFER_VOUCHER: t("Transfer voucher", "Ваучер трансфера", "Transfer vouçeri"),
    TOUR_VOUCHER: t("Tour voucher", "Ваучер тура", "Tur vouçeri"),
    OTHER: t("Other document", "Другой документ", "Digər sənəd"),
  };
  const serviceLabel: Record<string, string> = {
    flight: t("Flight", "Перелёт", "Uçuş"),
    hotel: t("Hotel", "Отель", "Otel"),
    transport: t("Car", "Авто", "Avtomobil"),
    guide: t("Guide", "Гид", "Bələdçi"),
    transfer: t("Transfer", "Трансфер", "Transfer"),
    activity: t("Activity", "Активность", "Fəaliyyət"),
  };
  const statusInfo = (d: Document): { label: string; tone: string } => {
    const m: Record<string, [string, string]> = {
      DRAFT: [t("Draft, not shown to customer", "Черновик", "Qaralama, müştəri görmür"), "warn"],
      ACTIVE: [t("Published", "Опубликован", "Müştəriyə açıqdır"), "ok"],
      UPCOMING: [t("Published, upcoming", "Опубликован, скоро", "Açıqdır, tezliklə"), "ok"],
      EXPIRED: [t("Expired", "Истёк", "Vaxtı keçib"), "muted"],
      REVOKED: [t("Revoked", "Отозван", "Geri götürülüb"), "bad"],
      SUPERSEDED: [t("Replaced by a newer version", "Заменён новой версией", "Yeni versiya ilə əvəz olunub"), "muted"],
      CANCELLED: [t("Service cancelled", "Услуга отменена", "Xidmət ləğv edilib"), "bad"],
      REQUIRES_REVIEW: [t("Needs review", "Требует проверки", "Yenidən baxılmalıdır"), "warn"],
    };
    const key = d.state === "PUBLISHED" ? d.status : d.state;
    const [label, tone] = m[key] || [key, "muted"];
    return { label, tone };
  };
  const [composer, setComposer] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [dragging, setDragging] = useState(false),
    fileInput = useRef<HTMLInputElement | null>(null);
  const kindIcon = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? <FileText size={22} />;
  function openComposer(replace?: Document) {
    setSelected(null);
    setError("");
    setFile(null);
    setStart("");
    setEnd("");
    setInstructions("");
    if (replace) {
      setReplaces(replace.id);
      setServiceKey(replace.service_key);
      setKind(replace.kind);
      setTitle(replace.title);
      setTimezone(replace.timezone || "Asia/Baku");
    } else {
      setReplaces("");
      setTitle("");
    }
    setComposer(true);
  }
  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 10_000_000 || !["application/pdf", "image/png", "image/jpeg"].includes(f.type)) {
      setError(t("Use PDF, JPG or PNG up to 10 MB.", "PDF, JPG или PNG до 10 МБ.", "10 MB-a qədər PDF, JPG və ya PNG seçin."));
      return;
    }
    setError("");
    setFile(f);
  }
  const startIso = toIso(start, timezone),
    endIso = toIso(end, timezone);
  const formReady = !!file && !!title.trim() && !!start && !!end && new Date(endIso) > new Date(startIso);
  const fieldsHint = !title.trim()
    ? t("Write a title.", "Укажите название.", "Başlıq yazın.")
    : !start || !end
      ? t("Choose the start and end of the service.", "Укажите начало и конец услуги.", "Xidmətin başlama və bitmə vaxtını seçin.")
      : new Date(endIso) <= new Date(startIso)
        ? t("The end must be after the start.", "Конец должен быть позже начала.", "Bitmə vaxtı başlanğıcdan sonra olmalıdır.")
        : !file
          ? t("Choose the original file.", "Выберите файл оригинала.", "Orijinal faylı seçin.")
          : t("Ready to upload.", "Готово к загрузке.", "Yükləməyə hazırdır.");
  async function submit() {
    if (!file || !formReady) return;
    await upload(file, startIso, endIso);
  }
  const steps = (d: Document) => [
    { done: previewLoaded, text: t("Open and read the whole original file", "Откройте и прочитайте весь оригинал", "Orijinal faylı tam açıb oxuyun") },
    { done: checked, text: t("Confirm it is the right customer and journey", "Подтвердите клиента и поездку", "Müştəri və səfərin düzgün olduğunu təsdiqləyin") },
    { done: reviewed || d.state !== "DRAFT", text: t("Record the review", "Зафиксируйте проверку", "Yoxlamanı qeyd edin") },
  ];
  const groups = [
    { id: "DRAFT", title: t("Drafts", "Черновики", "Qaralamalar"), rows: rows.filter((d) => d.state === "DRAFT") },
    { id: "PUBLISHED", title: t("Visible to the customer", "Видны клиенту", "Müştəriyə açıq"), rows: rows.filter((d) => d.state === "PUBLISHED") },
    { id: "OLD", title: t("Revoked and older versions", "Отозванные и старые", "Geri götürülmüş və köhnə versiyalar"), rows: rows.filter((d) => d.state !== "DRAFT" && d.state !== "PUBLISHED") },
  ].filter((g) => g.rows.length);
  return (
    <section className="tdoc">
      <div className="tdoc-top">
        <div className="tdoc-owner">
          <Users size={18} aria-hidden="true" />
          <span>
            <strong>{customer?.name || "..."}</strong>
            {customer?.email ? ", " + customer.email : ""}
          </span>
        </div>
        <button className="ow-primary tdoc-add" onClick={() => openComposer()} disabled={busy || !customer}>
          <Plus size={17} aria-hidden="true" />
          {t("Add document", "Добавить документ", "Sənəd əlavə et")}
        </button>
      </div>
      <p className="tdoc-note">
        <AlertTriangle size={16} aria-hidden="true" />
        {t(
          "Upload only genuine supplier PDF, JPG or PNG files. No airline QR or barcode is generated here.",
          "Загружайте только оригиналы поставщика. QR и штрихкоды авиакомпаний здесь не создаются.",
          "Yalnız təchizatçının orijinal PDF, JPG və ya PNG fayllarını yükləyin. Aviaşirkət QR və barkodu burada yaradılmır.",
        )}
      </p>
      {error && (
        <p role="alert" className="ow-error">
          {error}
        </p>
      )}

      {composer && (
        <div className="tdoc-panel">
          <div className="tdoc-panel-head">
            <h3>
              {replaces
                ? t("Replace with a new version", "Заменить новой версией", "Yeni versiya ilə əvəz et")
                : t("New document", "Новый документ", "Yeni sənəd")}
            </h3>
            <button className="tdoc-icon-btn" onClick={() => setComposer(false)} aria-label={t("Close", "Закрыть", "Bağla")}>
              <X size={18} />
            </button>
          </div>
          <h4>
            <b>1</b>
            {t("What is it?", "Что это?", "Bu nədir?")}
          </h4>
          <div className="tdoc-kinds">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className={kind === k.key ? "on" : ""}
                disabled={!!replaces}
                aria-pressed={kind === k.key}
                onClick={() => {
                  setKind(k.key);
                  setServiceKey(k.service);
                }}
              >
                {k.icon}
                <span>{kindLabel[k.key]}</span>
              </button>
            ))}
          </div>
          <h4>
            <b>2</b>
            {t("Details", "Детали", "Məlumat")}
          </h4>
          <div className="tdoc-fields">
            <label className="wide">
              {t("Title", "Название", "Başlıq")}
              <input maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("For example: Baku to Gabala, Ali Karimov", "Например: Баку, Габала", "Məsələn: Bakı Qəbələ, Əli Kərimov")} />
            </label>
            <label>
              {t("Service", "Услуга", "Xidmət")}
              <select value={serviceKey} disabled={!!replaces} onChange={(e) => setServiceKey(e.target.value)}>
                {Object.keys(serviceLabel).map((v) => (
                  <option key={v} value={v}>
                    {serviceLabel[v]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Time zone", "Часовой пояс", "Saat qurşağı")}
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Starts", "Начало", "Başlanır")}
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              {t("Ends", "Конец", "Bitir")}
              <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className="wide">
              {t("Note for the customer (optional)", "Заметка клиенту (необязательно)", "Müştəri üçün qeyd (istəyə bağlı)")}
              <textarea
                value={instructions}
                maxLength={2000}
                rows={3}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("For example: arrive 2 hours before departure", "Например: приходите за 2 часа", "Məsələn: uçuşdan 2 saat əvvəl gəlin")}
              />
            </label>
          </div>
          <h4>
            <b>3</b>
            {t("Original file", "Файл оригинала", "Orijinal fayl")}
          </h4>
          <div
            className={"tdoc-drop" + (dragging ? " over" : "") + (file ? " has" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            {file ? (
              <>
                <FileText size={28} aria-hidden="true" />
                <strong>{file.name}</strong>
                <small>{file.size < 1_000_000 ? Math.max(1, Math.round(file.size / 1000)) + " KB" : (file.size / 1_000_000).toFixed(1) + " MB"}</small>
                <button type="button" className="ow-outline" onClick={() => fileInput.current?.click()}>
                  {t("Choose another file", "Выбрать другой файл", "Başqa fayl seç")}
                </button>
              </>
            ) : (
              <>
                <Upload size={28} aria-hidden="true" />
                <strong>{t("Drop the file here", "Перетащите файл сюда", "Faylı bura atın")}</strong>
                <small>{t("PDF, JPG or PNG, up to 10 MB", "PDF, JPG или PNG, до 10 МБ", "PDF, JPG və ya PNG, maksimum 10 MB")}</small>
                <button type="button" className="ow-outline" onClick={() => fileInput.current?.click()}>
                  {t("Choose file", "Выбрать файл", "Fayl seç")}
                </button>
              </>
            )}
          </div>
          <div className="tdoc-actions">
            <button className="ow-primary" disabled={busy || !formReady} onClick={() => void submit()}>
              <Upload size={17} aria-hidden="true" />
              {t("Upload and review", "Загрузить и проверить", "Yüklə və yoxlamağa keç")}
            </button>
            <span className="tdoc-hint" role="status">
              {fieldsHint}
            </span>
          </div>
        </div>
      )}

      {!composer && !selected && rows.length === 0 && (
        <div className="tdoc-empty">
          <Ticket size={34} aria-hidden="true" />
          <strong>{t("No documents yet", "Документов пока нет", "Hələ sənəd yoxdur")}</strong>
          <span>
            {t(
              "Add the tickets and vouchers the customer needs for the trip.",
              "Добавьте билеты и ваучеры, которые нужны клиенту.",
              "Müştərinin səfər üçün lazım olan bilet və vouçerlərini əlavə edin.",
            )}
          </span>
        </div>
      )}

      {!composer && !selected && groups.map((g) => (
        <div key={g.id} className="tdoc-group">
          <h3>
            {g.title}
            <em>{g.rows.length}</em>
          </h3>
          <div className="tdoc-cards">
            {g.rows.map((d) => {
              const st = statusInfo(d);
              return (
                <button type="button" className="tdoc-card" key={d.id} disabled={busy} onClick={() => setSelected(d)}>
                  <span className="tdoc-card-icon">{kindIcon(d.kind)}</span>
                  <span className="tdoc-card-body">
                    <strong>{d.title}</strong>
                    <span>
                      {kindLabel[d.kind] || d.kind}, v{d.version}
                    </span>
                    <span className="tdoc-when">{when(d.starts_at, d.timezone, locale)}</span>
                    <span className={"tdoc-badge " + st.tone}>{st.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && !composer && (
        <div className="tdoc-panel">
          <div className="tdoc-panel-head">
            <button className="tdoc-icon-btn wide" onClick={() => setSelected(null)}>
              <X size={16} aria-hidden="true" />
              {t("Close", "Закрыть", "Bağla")}
            </button>
          </div>
          <div className="tdoc-detail-title">
            <span className="tdoc-card-icon">{kindIcon(selected.kind)}</span>
            <div>
              <h3>
                {selected.title}, v{selected.version}
              </h3>
              <p>
                {kindLabel[selected.kind] || selected.kind}
                {", "}
                {serviceLabel[selected.service_key] || selected.service_key}
              </p>
            </div>
            <span className={"tdoc-badge " + statusInfo(selected).tone}>{statusInfo(selected).label}</span>
          </div>
          <dl className="tdoc-meta">
            <div>
              <dt>{t("Starts", "Начало", "Başlanır")}</dt>
              <dd>{when(selected.starts_at, selected.timezone, locale)}</dd>
            </div>
            <div>
              <dt>{t("Ends", "Конец", "Bitir")}</dt>
              <dd>{when(selected.ends_at, selected.timezone, locale)}</dd>
            </div>
            <div>
              <dt>{t("Time zone", "Часовой пояс", "Saat qurşağı")}</dt>
              <dd>{selected.timezone}</dd>
            </div>
            <div>
              <dt>{t("File", "Файл", "Fayl")}</dt>
              <dd>{selected.filename}</dd>
            </div>
          </dl>
          <div className="tdoc-preview">
            {url ? (
              selected.mime === "application/pdf" ? (
                <OriginalPdfPreview
                  key={url}
                  url={url}
                  locale={locale}
                  onReady={() => setPreviewLoaded(true)}
                  onError={() => setPreviewLoaded(false)}
                />
              ) : (
                <img
                  alt={t("Original supplier document", "Оригинал документа", "Orijinal sənəd")}
                  src={url}
                  onLoad={() => setPreviewLoaded(true)}
                />
              )
            ) : (
              <p className="tdoc-loading">
                <Eye size={18} aria-hidden="true" />
                {t("Opening the file...", "Открываем файл...", "Fayl açılır...")}
              </p>
            )}
          </div>

          {selected.state === "DRAFT" && (
            <div className="tdoc-publish">
              <h4>{t("Before the customer can see it", "Прежде чем клиент увидит", "Müştəri görməmişdən əvvəl")}</h4>
              <ol className="tdoc-steps">
                {steps(selected).map((st, i) => (
                  <li key={i} className={st.done ? "done" : ""}>
                    <b>{st.done ? <Check size={14} /> : i + 1}</b>
                    {st.text}
                  </li>
                ))}
              </ol>
              <label className="tdoc-check">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                {t(
                  "I checked the full original file and confirm this is the correct customer and journey.",
                  "Я проверил оригинал, клиента и поездку.",
                  "Tam orijinal faylı yoxladım, müştəri və səfərin düzgün olduğunu təsdiqləyirəm.",
                )}
              </label>
              <div className="tdoc-actions">
                <button className="ow-outline" disabled={busy || !previewLoaded || !checked || reviewed} onClick={() => void action("preview")}>
                  <CircleCheck size={17} aria-hidden="true" />
                  {reviewed ? t("Review recorded", "Проверка записана", "Yoxlama qeyd olundu") : t("Record review", "Зафиксировать проверку", "Yoxlamanı qeyd et")}
                </button>
                <button className="ow-primary" disabled={busy || !previewLoaded || !checked || !reviewed} onClick={() => void action("publish")}>
                  <Upload size={17} aria-hidden="true" />
                  {t("Publish to customer", "Опубликовать клиенту", "Müştəriyə yayımla")}
                </button>
              </div>
              <p className="tdoc-hint" role="status">
                {!previewLoaded
                  ? t("Wait for the file to open.", "Дождитесь открытия файла.", "Faylın açılmasını gözləyin.")
                  : !checked
                    ? t("Tick the confirmation to continue.", "Отметьте подтверждение.", "Davam etmək üçün təsdiqi işarələyin.")
                    : !reviewed
                      ? t("Now record the review.", "Теперь зафиксируйте проверку.", "İndi yoxlamanı qeyd edin.")
                      : t("Ready. Publishing notifies the customer.", "Готово. Клиент получит уведомление.", "Hazırdır. Yayımlayanda müştəriyə bildiriş gedir.")}
              </p>
            </div>
          )}
          {selected.state === "PUBLISHED" && (
            <div className="tdoc-actions">
              <button className="ow-outline" disabled={busy} onClick={() => openComposer(selected)}>
                <RefreshCw size={17} aria-hidden="true" />
                {t("Replace with a new version", "Заменить новой версией", "Yeni versiya ilə əvəz et")}
              </button>
              <button
                className="tdoc-danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Revoke this document? The customer will see it as invalid.",
                        "Отозвать документ? Клиент увидит, что он недействителен.",
                        "Sənəd geri götürülsün? Müştəri onu etibarsız görəcək.",
                      ),
                    )
                  )
                    void action("revoke");
                }}
              >
                <Undo2 size={17} aria-hidden="true" />
                {t("Revoke", "Отозвать", "Geri götür")}
              </button>
            </div>
          )}
          {selected.state === "REVOKED" && (
            <div className="tdoc-actions">
              <button className="ow-outline" disabled={busy} onClick={() => openComposer(selected)}>
                <RefreshCw size={17} aria-hidden="true" />
                {t("Upload a replacement", "Загрузить замену", "Əvəzedici sənəd yüklə")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
