import React, { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Check, X, Trash2, Search } from "lucide-react";
import { api } from "./api/client";
import "./events.css";

type T = (en: string, ru: string, az: string) => string;
type City = { slug: string; nameEn: string; nameRu: string; nameAz: string };
export type StaffEvent = {
  id: string;
  slug: string;
  titleEn: string;
  titleRu: string | null;
  titleAz: string;
  descriptionEn: string;
  descriptionRu: string | null;
  descriptionAz: string;
  category: string;
  citySlug: string;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  timeKnown: boolean;
  free: boolean;
  priceFromMinor: number | null;
  currency: string;
  ticketUrl: string | null;
  image: string | null;
  status: string;
  source: string;
  externalSource: string | null;
  adminLocked: boolean;
  sourceNote: string;
  version: number;
  updatedBy: string;
};
type Page = { items: StaffEvent[]; total: number };
type Audit = { actor: string; action: string; note: string; created_at: string };

const CATEGORIES = ["CONCERT", "FESTIVAL", "SPORT", "CULTURE", "MARKET", "FOOD", "FAMILY", "OTHER"];
const BAKU_OFFSET_MS = 4 * 3600_000; // Azerbaijan has no daylight saving time

/** The form keeps Baku-local date and time strings; they become offset timestamps on save. */
type Form = {
  titleEn: string; titleAz: string; titleRu: string;
  descriptionEn: string; descriptionAz: string; descriptionRu: string;
  category: string; citySlug: string; venueName: string; address: string;
  latitude: string; longitude: string;
  startDate: string; startTime: string; endDate: string; endTime: string; timeKnown: boolean;
  free: boolean; price: string; currency: string;
  ticketUrl: string; image: string; sourceNote: string;
};
const empty = (): Form => ({
  titleEn: "", titleAz: "", titleRu: "", descriptionEn: "", descriptionAz: "", descriptionRu: "",
  category: "CONCERT", citySlug: "baku", venueName: "", address: "", latitude: "", longitude: "",
  startDate: "", startTime: "19:00", endDate: "", endTime: "22:00", timeKnown: true,
  free: false, price: "", currency: "AZN", ticketUrl: "", image: "", sourceNote: "",
});
const bakuParts = (iso: string) => {
  const d = new Date(Date.parse(iso) + BAKU_OFFSET_MS).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};
function toForm(e: StaffEvent): Form {
  const s = bakuParts(e.startsAt), f = bakuParts(e.endsAt);
  return {
    titleEn: e.titleEn, titleAz: e.titleAz, titleRu: e.titleRu ?? "",
    descriptionEn: e.descriptionEn, descriptionAz: e.descriptionAz, descriptionRu: e.descriptionRu ?? "",
    category: e.category, citySlug: e.citySlug, venueName: e.venueName, address: e.address,
    latitude: String(e.latitude), longitude: String(e.longitude),
    startDate: s.date, startTime: s.time, endDate: f.date, endTime: f.time, timeKnown: e.timeKnown,
    free: e.free, price: e.priceFromMinor == null ? "" : String(e.priceFromMinor / 100),
    currency: e.currency, ticketUrl: e.ticketUrl ?? "", image: e.image ?? "", sourceNote: e.sourceNote,
  };
}
const body = (f: Form, version?: number) => ({
  titleEn: f.titleEn, titleAz: f.titleAz, titleRu: f.titleRu || null,
  descriptionEn: f.descriptionEn, descriptionAz: f.descriptionAz, descriptionRu: f.descriptionRu || null,
  category: f.category, citySlug: f.citySlug, venueName: f.venueName, address: f.address,
  latitude: Number(f.latitude), longitude: Number(f.longitude),
  startsAt: f.timeKnown ? `${f.startDate}T00:00:00+04:00` : `${f.startDate}T${f.startTime}:00+04:00`,
  endsAt: f.timeKnown
    ? `${f.endDate || f.startDate}T23:59:59+04:00`
    : `${f.endDate || f.startDate}T${f.endTime}:00+04:00`,
  timeKnown: f.timeKnown, free: f.free,
  priceFromMinor: f.free || f.price === "" ? null : Math.round(Number(f.price) * 100),
  currency: f.currency, ticketUrl: f.ticketUrl || null, image: f.image || null,
  sourceNote: f.sourceNote, ...(version === undefined ? {} : { version }),
});

export function EventsWorkspace({
  auth, isAdmin, t, locale, onError,
}: {
  auth: string; isAdmin: boolean; t: T; locale: "en" | "ru" | "az"; onError: (message: string) => void;
}) {
  const [page, setPage] = useState<Page>({ items: [], total: 0 });
  const [cities, setCities] = useState<City[]>([]);
  const [filters, setFilters] = useState({ status: "", city: "", category: "", q: "" });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ event: StaffEvent | null; form: Form; audit: Audit[] } | null>(null);
  const idx = locale === "az" ? 2 : locale === "ru" ? 1 : 0;
  const cityName = (slug: string) => {
    const c = cities.find((x) => x.slug === slug);
    return c ? [c.nameEn, c.nameRu, c.nameAz][idx] : slug;
  };
  const title = (e: Pick<StaffEvent, "titleEn" | "titleRu" | "titleAz">) =>
    (idx === 2 ? e.titleAz : idx === 1 ? e.titleRu || e.titleEn : e.titleEn) || e.titleEn;
  const categories: Record<string, string> = {
    CONCERT: t("Concert", "Концерт", "Konsert"), FESTIVAL: t("Festival", "Фестиваль", "Festival"),
    SPORT: t("Sport", "Спорт", "İdman"), CULTURE: t("Culture", "Культура", "Mədəniyyət"),
    MARKET: t("Market", "Ярмарка", "Yarmarka"), FOOD: t("Food", "Еда", "Yemək"),
    FAMILY: t("Family", "Семья", "Ailə"), OTHER: t("Other", "Другое", "Digər"),
  };
  const statuses: Record<string, string> = {
    DRAFT: t("Draft", "Черновик", "Qaralama"), PENDING_REVIEW: t("To review", "На проверке", "Yoxlama gözləyir"),
    PUBLISHED: t("Published", "Опубликовано", "Dərc olunub"), CANCELLED: t("Cancelled", "Отменено", "Ləğv edilib"),
  };
  const problems: Record<string, [string, string, string]> = {
    STALE_EVENT: ["Someone changed this event. Reopen it and try again.", "Событие изменили. Откройте его заново.", "Tədbiri başqası dəyişib. Yenidən açıb cəhd edin."],
    TITLE_REQUIRED: ["English and Azerbaijani titles are required.", "Нужны названия на английском и азербайджанском.", "İngilis və Azərbaycan başlıqları vacibdir."],
    DESCRIPTION_REQUIRED: ["English and Azerbaijani descriptions are required to publish.", "Для публикации нужны описания на английском и азербайджанском.", "Dərc üçün İngilis və Azərbaycan təsvirləri vacibdir."],
    VENUE_REQUIRED: ["Enter the venue.", "Укажите место.", "Məkanı yazın."],
    INVALID_LOCATION: ["Latitude must be −90…90 and longitude −180…180.", "Широта −90…90, долгота −180…180.", "Enlik −90…90, uzunluq −180…180 olmalıdır."],
    INVALID_DATE_RANGE: ["The end must not be before the start.", "Окончание не может быть раньше начала.", "Bitmə başlanğıcdan əvvəl ola bilməz."],
    INVALID_TICKET_URL: ["The ticket link must start with https://", "Ссылка на билеты должна начинаться с https://", "Bilet linki https:// ilə başlamalıdır."],
    INVALID_IMAGE_URL: ["The image link must start with https://", "Ссылка на изображение должна начинаться с https://", "Şəkil linki https:// ilə başlamalıdır."],
    HTML_NOT_ALLOWED: ["Remove markup such as <b> or <script>; text only.", "Уберите разметку (<b>, <script>); только текст.", "<b> və ya <script> kimi işarələməni silin; yalnız mətn."],
    TEXT_TOO_LONG: ["A text is too long.", "Слишком длинный текст.", "Mətn çox uzundur."],
    EVENT_ALREADY_ENDED: ["This event has already ended.", "Событие уже закончилось.", "Tədbir artıq bitib."],
    EVENT_CANCELLED: ["A cancelled event cannot be published.", "Отменённое событие нельзя опубликовать.", "Ləğv olunmuş tədbiri dərc etmək olmaz."],
    ONLY_DRAFTS_CAN_BE_DELETED: ["Only drafts can be deleted. Cancel a published event instead.", "Удалять можно только черновики. Опубликованное — отменяйте.", "Yalnız qaralamalar silinir. Dərc olunmuşu ləğv edin."],
  };
  const explain = (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    const known = problems[code];
    onError(known ? t(...known) : t("Request failed. Check the form and try again.", "Запрос не выполнен. Проверьте форму.", "Sorğu alınmadı. Formu yoxlayın."));
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams({ size: "100" });
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
      setPage(await api<Page>("/api/v1/operations/events?" + p, auth));
    } catch (e) {
      explain(e);
    } finally {
      setBusy(false);
    }
  }, [auth, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api<City[]>("/api/v1/cities").then(setCities).catch(() => undefined);
  }, []);

  async function open(e: StaffEvent | null) {
    onError("");
    if (!e) return setEdit({ event: null, form: empty(), audit: [] });
    try {
      const full = await api<{ event: StaffEvent; audit: Audit[] }>(`/api/v1/operations/events/${e.id}`, auth);
      setEdit({ event: full.event, form: toForm(full.event), audit: full.audit });
    } catch (err) { explain(err); }
  }
  async function save(publish: boolean) {
    if (!edit || busy) return;
    const f = edit.form;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || Number.isNaN(Number(f.latitude)) || Number.isNaN(Number(f.longitude)) || f.latitude === "" || f.longitude === "")
      return onError(t("Enter the start date and the venue coordinates.", "Укажите дату начала и координаты места.", "Başlama tarixini və məkanın koordinatlarını yazın."));
    setBusy(true);
    onError("");
    try {
      let saved = edit.event
        ? await api<StaffEvent>(`/api/v1/operations/events/${edit.event.id}`, auth, body(f, edit.event.version))
        : await api<StaffEvent>("/api/v1/operations/events", auth, body(f));
      if (publish && saved.status !== "PUBLISHED") saved = await api<StaffEvent>(`/api/v1/operations/events/${saved.id}/publish`, auth, {});
      setEdit(null);
      await load();
    } catch (e) { explain(e); } finally { setBusy(false); }
  }
  async function act(e: StaffEvent, action: "publish" | "cancel" | "delete") {
    const confirmText = { publish: "", cancel: t("Cancel this event? Customers will no longer see it.", "Отменить событие? Клиенты его больше не увидят.", "Tədbir ləğv edilsin? Müştərilər onu daha görməyəcək."), delete: t("Delete this draft?", "Удалить этот черновик?", "Bu qaralama silinsin?") }[action];
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    onError("");
    try {
      await api(`/api/v1/operations/events/${e.id}/${action}`, auth, {});
      await load();
    } catch (err) { explain(err); } finally { setBusy(false); }
  }
  const when = (e: Pick<StaffEvent, "startsAt" | "endsAt" | "timeKnown">) => {
    const fmt = (iso: string, withTime: boolean) =>
      new Date(iso).toLocaleString(locale === "az" ? "az-AZ" : locale === "ru" ? "ru-RU" : "en-GB", {
        timeZone: "Asia/Baku", day: "numeric", month: "short", year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
    const a = fmt(e.startsAt, e.timeKnown), b = fmt(e.endsAt, false);
    return e.timeKnown && bakuParts(e.startsAt).date !== bakuParts(e.endsAt).date ? `${a} – ${b}` : a;
  };

  if (edit) {
    const f = edit.form;
    const set = <K extends keyof Form>(k: K, v: Form[K]) => setEdit({ ...edit, form: { ...f, [k]: v } });
    const input = (k: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
      <input value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
    );
    const previewStart = /^\d{4}-\d{2}-\d{2}$/.test(f.startDate);
    return (
      <section className="events">
        <div className="events-head">
          <h2>{edit.event ? t("Edit event", "Изменить событие", "Tədbiri dəyiş") : t("New event", "Новое событие", "Yeni tədbir")}</h2>
          {edit.event && <span className={"badge " + edit.event.status}>{statuses[edit.event.status]}</span>}
        </div>
        <div className="events-edit">
          <form onSubmit={(e) => { e.preventDefault(); void save(false); }}>
            <fieldset>
              <legend>{t("Text (plain, no markup)", "Текст (без разметки)", "Mətn (işarələmə olmadan)")}</legend>
              <label>{t("Title · English", "Название · английский", "Başlıq · İngiliscə")}{input("titleEn", { required: true, maxLength: 160 })}</label>
              <label>{t("Title · Azerbaijani", "Название · азербайджанский", "Başlıq · Azərbaycanca")}{input("titleAz", { required: true, maxLength: 160 })}</label>
              <label>{t("Title · Russian (optional)", "Название · русский (необязательно)", "Başlıq · Rusca (könüllü)")}{input("titleRu", { maxLength: 160 })}</label>
              <label>{t("Description · English", "Описание · английский", "Təsvir · İngiliscə")}<textarea rows={3} maxLength={4000} value={f.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} /></label>
              <label>{t("Description · Azerbaijani", "Описание · азербайджанский", "Təsvir · Azərbaycanca")}<textarea rows={3} maxLength={4000} value={f.descriptionAz} onChange={(e) => set("descriptionAz", e.target.value)} /></label>
              <label>{t("Description · Russian (optional)", "Описание · русский (необязательно)", "Təsvir · Rusca (könüllü)")}<textarea rows={3} maxLength={4000} value={f.descriptionRu} onChange={(e) => set("descriptionRu", e.target.value)} /></label>
            </fieldset>
            <fieldset>
              <legend>{t("Where", "Где", "Harada")}</legend>
              <label>{t("Category", "Категория", "Kateqoriya")}
                <select value={f.category} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{categories[c]}</option>)}
                </select></label>
              <label>{t("City", "Город", "Şəhər")}
                <select value={f.citySlug} onChange={(e) => set("citySlug", e.target.value)}>
                  {cities.map((c) => <option key={c.slug} value={c.slug}>{cityName(c.slug)}</option>)}
                </select></label>
              <label>{t("Venue", "Место", "Məkan")}{input("venueName", { required: true, maxLength: 160 })}</label>
              <label>{t("Address (optional)", "Адрес (необязательно)", "Ünvan (könüllü)")}{input("address", { maxLength: 240 })}</label>
              <label>{t("Latitude", "Широта", "Enlik")}{input("latitude", { required: true, inputMode: "decimal", placeholder: "40.4093" })}</label>
              <label>{t("Longitude", "Долгота", "Uzunluq")}{input("longitude", { required: true, inputMode: "decimal", placeholder: "49.8671" })}</label>
            </fieldset>
            <fieldset>
              <legend>{t("When (Baku time)", "Когда (время Баку)", "Nə vaxt (Bakı vaxtı)")}</legend>
              <label className="check"><input type="checkbox" checked={f.timeKnown} onChange={(e) => set("timeKnown", e.target.checked)} />{t("The start time is known", "Время начала известно", "Başlama saatı məlumdur")}</label>
              <label>{t("Start date", "Дата начала", "Başlama tarixi")}{input("startDate", { type: "date", required: true })}</label>
              {f.timeKnown && <label>{t("Start time", "Время начала", "Başlama saatı")}{input("startTime", { type: "time", required: true })}</label>}
              <label>{t("End date (optional)", "Дата окончания (необязательно)", "Bitmə tarixi (könüllü)")}{input("endDate", { type: "date" })}</label>
              {f.timeKnown && <label>{t("End time", "Время окончания", "Bitmə saatı")}{input("endTime", { type: "time" })}</label>}
              {!f.timeKnown && <p className="hint">{t("Only the date will be shown to customers; no clock time is invented.", "Клиентам покажут только дату, время не придумывается.", "Müştərilərə yalnız tarix göstərilir, saat uydurulmur.")}</p>}
            </fieldset>
            <fieldset>
              <legend>{t("Price and links", "Цена и ссылки", "Qiymət və linklər")}</legend>
              <label className="check"><input type="checkbox" checked={f.free} onChange={(e) => set("free", e.target.checked)} />{t("Free", "Бесплатно", "Pulsuz")}</label>
              {!f.free && <label>{t("Price from (optional)", "Цена от (необязательно)", "Qiymət (başlayaraq, könüllü)")}{input("price", { inputMode: "decimal", placeholder: "25" })}</label>}
              {!f.free && <label>{t("Currency", "Валюта", "Valyuta")}<select value={f.currency} onChange={(e) => set("currency", e.target.value)}>{["AZN", "EUR", "USD"].map((c) => <option key={c}>{c}</option>)}</select></label>}
              <label>{t("Ticket link (https)", "Ссылка на билеты (https)", "Bilet linki (https)")}{input("ticketUrl", { type: "url", placeholder: "https://" })}</label>
              <label>{t("Image link (https, optional)", "Ссылка на изображение (https)", "Şəkil linki (https, könüllü)")}{input("image", { type: "url", placeholder: "https://" })}</label>
              <label>{t("Where you checked it", "Где проверено", "Haradan yoxlanılıb")}{input("sourceNote", { maxLength: 500, placeholder: t("e.g. venue website, date checked", "напр. сайт площадки, дата проверки", "məs. məkanın saytı, yoxlama tarixi") })}</label>
            </fieldset>
            <div className="events-actions">
              <button type="submit" disabled={busy}><Check size={16} />{edit.event ? t("Save", "Сохранить", "Yadda saxla") : t("Save as draft", "Сохранить черновик", "Qaralama kimi saxla")}</button>
              {edit.event?.status !== "PUBLISHED" && edit.event?.status !== "CANCELLED" && <button type="button" className="primary" disabled={busy} onClick={() => void save(true)}>{t("Save and publish", "Сохранить и опубликовать", "Saxla və dərc et")}</button>}
              <button type="button" className="ghost" onClick={() => { setEdit(null); onError(""); }}>{t("Close", "Закрыть", "Bağla")}</button>
            </div>
          </form>
          <aside>
            <h3>{t("How customers see it", "Как увидят клиенты", "Müştərilər necə görəcək")}</h3>
            <article className="events-card">
              <p className="cat">{categories[f.category]} · {cityName(f.citySlug)}</p>
              <h4>{title({ titleEn: f.titleEn, titleRu: f.titleRu || null, titleAz: f.titleAz }) || "—"}</h4>
              <p>{previewStart ? when({ startsAt: body(f).startsAt, endsAt: body(f).endsAt, timeKnown: f.timeKnown }) : "—"}</p>
              <p>{f.venueName || "—"}</p>
              <p className="price">{f.free ? t("Free", "Бесплатно", "Pulsuz") : f.price ? `${t("from", "от", "başlayaraq")} ${f.price} ${f.currency}` : ""}</p>
            </article>
            {edit.event && (
              <>
                <h3>{t("History", "История", "Tarixçə")}</h3>
                <ul className="events-audit">
                  {edit.audit.map((a, i) => <li key={i}><b>{a.action}</b> · {a.actor}<small>{new Date(a.created_at).toLocaleString()}</small>{a.note && <em>{a.note}</em>}</li>)}
                </ul>
              </>
            )}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="events">
      <div className="events-head">
        <p>{t("Plain-text events shown to customers on the website and in the app. Staff enter them; customers can browse by city or near them.", "События для клиентов на сайте и в приложении. Вносит команда; клиенты ищут по городу или рядом.", "Müştərilərə vebsaytda və appdə göstərilən tədbirlər. Komanda daxil edir; müştərilər şəhər üzrə və ya yaxınlıqda axtarır.")}</p>
        <button onClick={() => void open(null)}><Plus size={16} />{t("New event", "Новое событие", "Yeni tədbir")}</button>
      </div>
      <div className="events-filters">
        <label className="search"><Search size={15} /><input type="search" placeholder={t("Search title or venue", "Поиск по названию или месту", "Başlıq və ya məkan axtar")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
        <select aria-label={t("Status", "Статус", "Status")} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{t("All statuses", "Все статусы", "Bütün statuslar")}</option>
          {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label={t("City", "Город", "Şəhər")} value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}>
          <option value="">{t("All cities", "Все города", "Bütün şəhərlər")}</option>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{cityName(c.slug)}</option>)}
        </select>
        <select aria-label={t("Category", "Категория", "Kateqoriya")} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">{t("All categories", "Все категории", "Bütün kateqoriyalar")}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{categories[c]}</option>)}
        </select>
      </div>
      {page.items.length === 0 ? (
        <p className="empty">{busy ? t("Loading…", "Загрузка…", "Yüklənir…") : t("No events match. Create the first one.", "Событий нет. Создайте первое.", "Tədbir yoxdur. İlkini yaradın.")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>{t("Event", "Событие", "Tədbir")}</th><th>{t("When", "Когда", "Nə vaxt")}</th>
              <th>{t("Status", "Статус", "Status")}</th><th>{t("Source", "Источник", "Mənbə")}</th><th />
            </tr></thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.id}>
                  <td><strong>{title(e)}</strong><small>{categories[e.category]} · {cityName(e.citySlug)} · {e.venueName}</small></td>
                  <td>{when(e)}</td>
                  <td><span className={"badge " + e.status}>{statuses[e.status]}</span></td>
                  <td>{e.source === "EXTERNAL" ? (e.adminLocked ? t("External · edited", "Внешний · изменён", "Xarici · dəyişdirilib") : t("External", "Внешний", "Xarici")) : t("Office", "Офис", "Ofis")}{e.sourceNote && <small title={e.sourceNote}>{e.sourceNote.slice(0, 40)}{e.sourceNote.length > 40 ? "…" : ""}</small>}</td>
                  <td className="row-actions">
                    <button className="small" onClick={() => void open(e)} aria-label={t("Edit", "Изменить", "Dəyiş")}><Pencil size={14} /></button>
                    {(e.status === "DRAFT" || e.status === "PENDING_REVIEW") && <button className="small" disabled={busy} onClick={() => void act(e, "publish")}>{t("Publish", "Опубликовать", "Dərc et")}</button>}
                    {(e.status === "PUBLISHED" || e.status === "PENDING_REVIEW") && <button className="small danger" disabled={busy} onClick={() => void act(e, "cancel")}><X size={14} />{t("Cancel", "Отменить", "Ləğv et")}</button>}
                    {e.status === "DRAFT" && isAdmin && <button className="small danger" disabled={busy} onClick={() => void act(e, "delete")} aria-label={t("Delete draft", "Удалить черновик", "Qaralamanı sil")}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{page.total} {t("events", "событий", "tədbir")}</p>
    </section>
  );
}
