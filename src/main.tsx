import OfficeManagement from "./office-management";
import { RefundWorkspace } from "./finance-workspace";
import { Handshake, Wallet } from "lucide-react";
import AmendmentWorkspace from "./amendment-workspace";
import CancellationWorkspace from "./cancellation-workspace";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Map,
  FileText,
  LogOut,
  ArrowUpRight,
  RefreshCw,
  ClipboardCheck,
  Inbox,
  Bell,
  Users,
  CalendarDays,
  MessageSquare,
} from "lucide-react";
import {
  api,
  overview,
  tours,
  bookings,
  requests,
  notifications,
  staffLogin,
  staffLogout,
  staffAccounts,
  type Staff,
  type StaffAccount,
  type Overview,
  type Tour,
  type Booking,
  type BookingRequest,
  type Notification,
  type Audit,
  type Locale,
} from "./api/client";
import { EventsWorkspace } from "./events-workspace";
import { MessagesWorkspace } from "./messages-workspace";
import "./styles.css";
import OfferWorkspace from "./offer-workspace";

function QuoteDetails({
  booking,
  t,
}: {
  booking: Booking;
  t: (en: string, ru: string, az: string) => string;
}) {
  try {
    const q = JSON.parse(booking.quotePayload) as {
      currency: string;
      input: {
        date: string;
        pax: number;
        hotel: string;
        driver?: boolean;
        stay?: boolean;
        guide: boolean;
        guideLanguage: string;
        transfer: boolean;
        activity: boolean;
        cities?: string[];
      };
      lines: { label: string; amount: number }[];
    };
    const labels: Record<string, string> = {
      transport: t("Private driver", "Личный водитель", "Şəxsi sürücü"),
      hotel: t("Hotel stay", "Проживание", "Oteldə qalma"),
      guide: t("Local guide", "Гид", "Gid"),
      transfer: t("Airport transfer", "Трансфер", "Transfer"),
      activity: t("Experience", "Впечатление", "Təcrübə"),
    };
    const hotel =
      {
        standard: t("Standard", "Стандарт", "Standart"),
        comfort: t("Comfort", "Комфорт", "Komfort"),
        premium: t("Premium", "Премиум", "Premium"),
      }[q.input.hotel] || q.input.hotel;
    return (
      <div className="quote-details">
        <dl>
          <dt>{t("Departure", "Отправление", "Başlama")}</dt>
          <dd>{q.input.date}</dd>
          <dt>{t("Travellers", "Участники", "Səyahətçilər")}</dt>
          <dd>{q.input.pax}</dd>
          {q.input.stay !== false && (
            <>
              <dt>
                {t("Hotel category", "Категория отеля", "Otel kateqoriyası")}
              </dt>
              <dd>{hotel}</dd>
            </>
          )}
          {q.input.guide && (
            <>
              <dt>{t("Guide language", "Язык гида", "Gidin dili")}</dt>
              <dd>
                {{ en: "English", ru: "Русский", az: "Azərbaycanca" }[
                  q.input.guideLanguage
                ] || q.input.guideLanguage}
              </dd>
            </>
          )}
          {q.input.cities && (
            <>
              <dt>{t("Route", "Маршрут", "Marşrut")}</dt>
              <dd>{q.input.cities.join(" → ")}</dd>
            </>
          )}
        </dl>
        {q.lines.map((line) => (
          <p key={line.label}>
            <span>{labels[line.label] || line.label}</span>
            <strong>
              {line.amount} {q.currency}
            </strong>
          </p>
        ))}
      </div>
    );
  } catch {
    return (
      <p>
        {t(
          "Service details are unavailable. Refresh the booking.",
          "Детали недоступны. Обновите бронирование.",
          "Xidmət detalları görünmür. Rezervasiyanı yeniləyin.",
        )}
      </p>
    );
  }
}

function App() {
  const [roles, setRoles] = useState<string[]>([]);
  const [offerDirty, setOfferDirty] = useState(false);
  const [amendmentRequestId, setAmendmentRequestId] = useState<string | null>(
    null,
  );
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null),
    [catalog, setCatalog] = useState<Tour[]>([]),
    [reservations, setReservations] = useState<Booking[]>([]),
    [inbox, setInbox] = useState<BookingRequest[]>([]),
    [outbox, setOutbox] = useState<Notification[]>([]),
    [auth, setAuth] = useState(""),
    [staff, setStaff] = useState<Staff | null>(null),
    [accounts, setAccounts] = useState<StaffAccount[]>([]),
    [view, setView] = useState("Overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [locale, setLocale] = useState<Locale>("az"),
    [filter, setFilter] = useState("PENDING_REVIEW"),
    [history, setHistory] = useState<Record<string, Audit[]>>({}),
    [amendments, setAmendments] = useState<
      Record<string, { id: string; total: number; currency: string }>
    >({});
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  // admin.* is for administrators only; the API enforces roles, this keeps the UI honest.
  const adminHost = window.location.hostname.startsWith("admin.");
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (view !== "Staff" || staff?.role !== "ADMIN" || !auth) return;
    staffAccounts(auth)
      .then(setAccounts)
      .catch((e) => setError(problem(e)));
  }, [view, auth, staff]);
  const names: Record<string, string> = {
    Partners: t("Partners", "Партнёры", "Partnyorlar"),
    Finance: t("Refunds", "Возвраты", "Geri ödənişlər"),
    Overview: t("Overview", "Обзор", "İcmal"),
    Tours: t("Tours", "Туры", "Turlar"),
    Quotes: t("Quotes", "Расчёты", "Qiymət sorğuları"),
    Bookings: t("Requests", "Заявки", "Sorğular"),
    Requests: t("Customer requests", "Запросы клиентов", "Müştəri sorğuları"),
    Notifications: t("Notifications", "Уведомления", "Bildirişlər"),
    Events: t("Events", "События", "Tədbirlər"),
    Messages: t("Messages", "Сообщения", "Mesajlar"),
    Staff: t("Staff", "Сотрудники", "İşçilər"),
  };
  const statuses: Record<string, string> = {
    PENDING_REVIEW: t("Needs review", "На проверке", "Yoxlama gözləyir"),
    AWAITING_PAYMENT: t(
      "Awaiting deposit",
      "Ожидает депозита",
      "Depozit gözləyir",
    ),
    CONFIRMED: t("Confirmed", "Подтверждено", "Təsdiqlənib"),
    REJECTED: t("Rejected", "Отклонено", "Rədd edilib"),
    CANCELLED: t("Cancelled", "Отменено", "Ləğv edilib"),
  };
  function problem(e: unknown) {
    const specific: Record<string, [string, string, string]> = {
      AMENDMENT_WORKFLOW_REQUIRED: [
        "Open the contract amendment workspace; customer PDF approval is required.",
        "Откройте изменение договора: требуется согласие клиента с PDF.",
        "Müqavilə dəyişikliyi iş sahəsini açın; müştərinin PDF təsdiqi tələb olunur.",
      ],
      MANUAL_REFUND_REQUIRED: [
        "The revised total is below the amount already paid. A manual refund must be handled first.",
        "Новая сумма меньше уже оплаченной. Сначала нужно обработать ручной возврат.",
        "Yeni məbləğ artıq ödənilmiş məbləğdən azdır. Əvvəl manual geri ödəniş həll edilməlidir.",
      ],
      PAID_CURRENCY_CANNOT_CHANGE: [
        "A paid reservation must keep its original currency.",
        "Оплаченное бронирование должно сохранить исходную валюту.",
        "Ödəniş edilmiş rezervasiyanın valyutası dəyişdirilə bilməz.",
      ],
      QUOTE_EXPIRED: [
        "The quote expired. Calculate a new one.",
        "Срок расчёта истёк. Рассчитайте заново.",
        "Qiymətin müddəti bitib. Yenidən hesablayın.",
      ],
      ALREADY_RESOLVED: [
        "Another employee already handled this request. Refresh the queue.",
        "Другой сотрудник уже обработал запрос. Обновите очередь.",
        "Bu sorğunu başqa əməkdaş artıq həll edib. Növbəni yeniləyin.",
      ],
      ALREADY_REVIEWED: [
        "This reservation has already been reviewed. Refresh the queue.",
        "Это бронирование уже проверено. Обновите очередь.",
        "Bu rezervasiya artıq yoxlanılıb. Növbəni yeniləyin.",
      ],
    };
    Object.assign(specific, {
      TOO_MANY_ATTEMPTS: [
        "Too many attempts. Wait 15 minutes and try again.",
        "Слишком много попыток. Подождите 15 минут.",
        "Çox cəhd edilib. 15 dəqiqə gözləyib yenidən cəhd edin.",
      ],
      ACCOUNT_UNAVAILABLE: [
        "An account with this email already exists.",
        "Аккаунт с таким email уже существует.",
        "Bu email ilə hesab artıq mövcuddur.",
      ],
      PASSWORD_TOO_SHORT: [
        "The password must have at least 12 characters.",
        "Пароль должен содержать не менее 12 символов.",
        "Şifrə ən azı 12 simvoldan ibarət olmalıdır.",
      ],
      PASSWORD_TOO_LONG: [
        "The password is too long (72 bytes at most).",
        "Пароль слишком длинный (не более 72 байт).",
        "Şifrə çox uzundur (ən çox 72 bayt).",
      ],
      CANNOT_DEACTIVATE_SELF: [
        "You cannot deactivate your own account.",
        "Нельзя отключить собственный аккаунт.",
        "Öz hesabınızı deaktiv edə bilməzsiniz.",
      ],
      CANNOT_DEMOTE_SELF: [
        "You cannot remove your own administrator role.",
        "Нельзя снять с себя роль администратора.",
        "Öz administrator rolunuzu ala bilməzsiniz.",
      ],
      LAST_ADMIN: [
        "At least one active administrator must remain.",
        "Должен остаться хотя бы один активный администратор.",
        "Ən azı bir aktiv administrator qalmalıdır.",
      ],
      VALIDATION_ERROR: [
        "Check the entered details.",
        "Проверьте введённые данные.",
        "Daxil edilən məlumatları yoxlayın.",
      ],
    });
    if (e instanceof Error && specific[e.message])
      return t(...specific[e.message]);
    return e instanceof Error && e.message === "ACCESS_DENIED"
      ? t(
          "Access denied. Check your email and password.",
          "Доступ запрещён. Проверьте email и пароль.",
          "Giriş mümkün deyil. Email və şifrəni yoxlayın.",
        )
      : t(
          "Request failed. Refresh to see the latest state.",
          "Запрос не выполнен. Обновите состояние.",
          "Sorğu alınmadı. Son vəziyyəti görmək üçün yeniləyin.",
        );
  }
  function reset() {
    setAuth("");
    setStaff(null);
    setData(null);
    setCatalog([]);
    setReservations([]);
    setInbox([]);
    setOutbox([]);
    setAccounts([]);
    setHistory({});
    setView("Overview");
  }
  async function load(credentials: string) {
    setBusy(true);
    setError("");
    try {
      const [summary, list, b, r, n] = await Promise.all([
        overview(credentials),
        tours(),
        bookings(credentials),
        requests(credentials),
        notifications(credentials),
      ]);
      setRoles(
        (await api<{ roles: string[] }>("/api/v1/operations/me", credentials))
          .roles,
      );
      setData(summary);
      setCatalog(list);
      setReservations(b);
      setInbox(r);
      setOutbox(n);
      setAuth(credentials);
      return true;
    } catch (e) {
      // An expired or revoked session cannot recover by refreshing.
      if (credentials && e instanceof Error && e.message === "ACCESS_DENIED")
        reset();
      setError(problem(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signIn(email: string, password: string) {
    setBusy(true);
    setError("");
    try {
      const session = await staffLogin(email, password);
      const token = "Bearer " + session.token;
      if (adminHost && session.staff.role !== "ADMIN") {
        await staffLogout(token).catch(() => undefined);
        setError(
          t(
            "This address is for administrators. Use operator.aztrip.online.",
            "Этот адрес только для администраторов. Используйте operator.aztrip.online.",
            "Bu ünvan yalnız administratorlar üçündür. operator.aztrip.online-dan istifadə edin.",
          ),
        );
        return;
      }
      setStaff(session.staff);
      if (!(await load(token))) {
        setStaff(null);
        await staffLogout(token).catch(() => undefined);
      }
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    const token = auth;
    reset();
    setError("");
    if (token) await staffLogout(token).catch(() => undefined);
  }
  async function manage(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setAccounts(await staffAccounts(auth));
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  async function decision(
    path: string,
    approve: boolean,
    note: string,
    replacementQuoteId?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(path, auth, { approve, note, replacementQuoteId });
      await load(auth);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  const language = (
    <label className="language">
      {t("Language", "Язык", "Dil")}
      <select
        aria-label={t("Language", "Язык", "Dil")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        <option value="az">AZ</option>
        <option value="en">EN</option>
        <option value="ru">RU</option>
      </select>
    </label>
  );
  if (!auth)
    return (
      <main className="login">
        <div className="login-brand">
          <p className="brand">
            azertur <span>operations</span>
          </p>
          {language}
        </div>
        <h1>
          {t("A clear view.", "Ясная картина.", "Aydın görünüş.")}
          <br />
          {t("A better journey.", "Лучшее путешествие.", "Daha yaxşı səyahət.")}
        </h1>
        <p>
          {t(
            "Office staff workspace. Drivers and guides use separate systems.",
            "Рабочее место офиса. Для водителей и гидов — отдельные системы.",
            "Ofis əməkdaşlarının iş mühiti. Sürücü və gidlər ayrıca sistemdən istifadə edir.",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void signIn(String(f.get("email")), String(f.get("password")));
          }}
        >
          <label>
            {t("Email", "Email", "Email")}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {t("Password", "Пароль", "Şifrə")}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy
              ? t("Connecting…", "Подключение…", "Qoşulur…")
              : t("Open workspace", "Открыть", "İş mühitinə daxil ol")}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <small>
          {t(
            "The session is kept only in memory.",
            "Сессия хранится только в памяти.",
            "Sessiya yalnız yaddaşda saxlanılır.",
          )}
        </small>
      </main>
    );
  const pending = reservations.filter(
    (b) => b.status === "PENDING_REVIEW",
  ).length;
  return (
    <div className="shell">
      <aside>
        <p className="brand">
          <span className="ow-brand-mark" aria-hidden="true">
            A
          </span>{" "}
          azərtur
        </p>
        <p className="workspace">
          {t("Office operations", "Операции офиса", "Ofis əməliyyatları")}
        </p>
        {staff && (
          <p className="workspace who">
            {staff.name}
            <br />
            {staff.email} ·{" "}
            {staff.role === "ADMIN"
              ? t("Administrator", "Администратор", "Administrator")
              : t("Operator", "Оператор", "Operator")}
          </p>
        )}
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [ClipboardCheck, "Bookings"],
            [Inbox, "Requests"],
            [Map, "Tours"],
            [FileText, "Quotes"],
            [Bell, "Notifications"],
            [CalendarDays, "Events"],
            [MessageSquare, "Messages"],
            [Handshake, "Partners"],
            [Wallet, "Finance"],
            ...(staff?.role === "ADMIN" ? [[Users, "Staff"]] : []),
          ].map(([Icon, title]) => {
            const I = Icon as typeof Map;
            return (
              <button
                key={title as string}
                className={view === title ? "active" : ""}
                onClick={() => {
                  if (title === view) return;
                  if (
                    offerDirty &&
                    title !== view &&
                    !window.confirm(
                      t(
                        "Discard unsaved changes?",
                        "Отменить несохранённые изменения?",
                        "Saxlanmamış təklif düzəlişləri silinsin?",
                      ),
                    )
                  )
                    return;
                  setOfferDirty(false);
                  setView(title as string);
                }}
              >
                <I size={18} />
                {names[title as string]}
              </button>
            );
          })}
        </nav>
        <button
          className="logout"
          onClick={() => {
            if (
              offerDirty &&
              !window.confirm(
                t(
                  "Discard unsaved changes?",
                  "Отменить несохранённые изменения?",
                  "Saxlanmamış təklif düzəlişləri silinsin?",
                ),
              )
            )
              return;
            setOfferDirty(false);
            void signOut();
          }}
        >
          <LogOut size={18} />
          {t("Sign out", "Выйти", "Çıxış")}
        </button>
      </aside>
      <main>
        <header>
          <div>
            <p>
              AZERTUR /{" "}
              {staff?.role === "ADMIN" && adminHost ? "ADMIN" : "OPERATIONS"}
            </p>
            <h1>{names[view]}</h1>
          </div>
          <div className="header-actions">
            {language}
            <button
              className="refresh"
              disabled={busy}
              onClick={() => void load(auth)}
            >
              <RefreshCw size={17} />
              {busy
                ? t("Refreshing…", "Обновление…", "Yenilənir…")
                : t("Refresh", "Обновить", "Yenilə")}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="notice">
          {t(
            "Review suppliers and service terms before sending an offer. Sending an offer does not open payment.",
            "Проверьте поставщиков и условия услуг перед отправкой предложения. Отправка не открывает оплату.",
            "Təklif göndərməzdən əvvəl təchizatçıları və xidmət şərtlərini yoxlayın. Təklif göndərmək ödəniş açmır.",
          )}
        </p>
        {view === "Overview" && (
          <>
            <section className="metrics">
              <article>
                <p>
                  {t("Awaiting review", "Ожидают проверки", "Yoxlama gözləyir")}
                </p>
                <strong>{pending}</strong>
              </article>
              <article>
                <p>
                  {t(
                    "Reservation requests",
                    "Запросы на бронирование",
                    "Rezervasiya sorğuları",
                  )}
                </p>
                <strong>{reservations.length}</strong>
              </article>
              <article>
                <p>
                  {t(
                    "Customer requests",
                    "Запросы клиентов",
                    "Müştəri sorğuları",
                  )}
                </p>
                <strong>
                  {inbox.filter((r) => r.status === "PENDING").length}
                </strong>
              </article>
            </section>
            <button onClick={() => setView("Bookings")}>
              {t(
                "Open review queue",
                "Открыть очередь",
                "Yoxlama növbəsini aç",
              )}
              <ArrowUpRight size={18} />
            </button>
            <h2>
              {t("Recent quotes", "Последние расчёты", "Son qiymət sorğuları")}
            </h2>
          </>
        )}
        {view === "Bookings" && (
          <OfferWorkspace
            auth={auth}
            locale={locale}
            bookings={reservations}
            requests={inbox}
            catalog={catalog}
            onDirtyChange={setOfferDirty}
          />
        )}
        {view === "Requests" &&
          amendmentRequestId &&
          inbox.find((r) => r.id === amendmentRequestId) && (
            <AmendmentWorkspace
              key={amendmentRequestId}
              request={inbox.find((r) => r.id === amendmentRequestId)!}
              auth={auth}
              locale={locale}
              onBack={() => setAmendmentRequestId(null)}
              onDone={() => void load(auth)}
              onDirtyChange={setOfferDirty}
            />
          )}
        {view === "Requests" &&
          cancelRequestId &&
          inbox.find((r) => r.id === cancelRequestId) && (
            <CancellationWorkspace
              key={cancelRequestId}
              request={inbox.find((r) => r.id === cancelRequestId)!}
              auth={auth}
              locale={locale}
              onBack={() => setCancelRequestId(null)}
              onDone={() => void load(auth)}
              onDirtyChange={setOfferDirty}
            />
          )}
        {view === "Requests" &&
          !amendmentRequestId &&
          !(cancelRequestId && inbox.find((r) => r.id === cancelRequestId)) && (
            <>
              <p>
                {t(
                  "Staff handle every change and cancellation. For changes, describe the agreed arrangement in the response.",
                  "Все изменения и отмены обрабатывает сотрудник. Для изменений опишите согласованный вариант в ответе.",
                  "Hər dəyişiklik və ləğvi əməkdaş idarə edir. Dəyişiklik üçün razılaşdırılmış detalları cavabda qeyd edin.",
                )}
              </p>
              {inbox.map((r) => (
                <article key={r.id} className="reservation">
                  <small>{r.bookingId}</small>
                  <h2>
                    {r.kind === "CANCEL"
                      ? t("Cancellation", "Отмена", "Ləğv")
                      : t(
                          "Change request",
                          "Изменение",
                          "Dəyişiklik sorğusu",
                        )}{" "}
                    · {r.status}
                  </h2>
                  <p className="customer-note">{r.message}</p>
                  {r.kind === "CANCEL" && (
                    <button onClick={() => setCancelRequestId(r.id)}>
                      {t(
                        "Review cancellation",
                        "Проверить отмену",
                        "Ləğvə bax",
                      )}
                    </button>
                  )}
                  {r.kind === "CHANGE" && (
                    <button onClick={() => setAmendmentRequestId(r.id)}>
                      {t(
                        "Review contract amendment",
                        "Проверить изменение договора",
                        "Müqavilə dəyişikliyini hazırla",
                      )}
                    </button>
                  )}
                  {r.response && <p>{r.response}</p>}
                  {r.status === "PENDING" && r.kind === "CHANGE" && (
                    <details>
                      <summary>
                        {t(
                          "Before contract: revise dates and pricing",
                          "До договора: обновить даты и стоимость",
                          "Müqavilədən əvvəl: tarix və qiyməti yenilə",
                        )}
                      </summary>
                      <form
                        onChange={() =>
                          setAmendments((current) => {
                            const next = { ...current };
                            delete next[r.id];
                            return next;
                          })
                        }
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (busy) return;
                          const f = new FormData(e.currentTarget);
                          const booking = reservations.find(
                            (b) => b.id === r.bookingId,
                          );
                          if (!booking) return;
                          setBusy(true);
                          setError("");
                          try {
                            const input = JSON.parse(
                              booking.quotePayload,
                            ).input;
                            const q = await api<{
                              id: string;
                              total: number;
                              currency: string;
                            }>("/api/v1/quotes", auth, {
                              ...input,
                              date: f.get("date"),
                              pax: Number(f.get("pax")),
                              hotel: f.get("hotel"),
                            });
                            setAmendments((a) => ({ ...a, [r.id]: q }));
                          } catch (e) {
                            setError(problem(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label>
                          {t(
                            "New departure",
                            "Новая дата",
                            "Yeni başlama tarixi",
                          )}
                          <input
                            name="date"
                            type="date"
                            required
                            defaultValue={
                              reservations.find((b) => b.id === r.bookingId)
                                ?.departure
                            }
                          />
                        </label>
                        <label>
                          {t("Travellers", "Участники", "Səyahətçilər")}
                          <input
                            name="pax"
                            type="number"
                            min={1}
                            max={12}
                            defaultValue={(() => {
                              try {
                                return JSON.parse(
                                  reservations.find((b) => b.id === r.bookingId)
                                    ?.quotePayload || "{}",
                                ).input.pax;
                              } catch {
                                return 2;
                              }
                            })()}
                            required
                          />
                        </label>
                        <label>
                          {t(
                            "Hotel category",
                            "Категория отеля",
                            "Otel kateqoriyası",
                          )}
                          <select
                            name="hotel"
                            defaultValue={(() => {
                              try {
                                return JSON.parse(
                                  reservations.find((b) => b.id === r.bookingId)
                                    ?.quotePayload || "{}",
                                ).input.hotel;
                              } catch {
                                return "comfort";
                              }
                            })()}
                          >
                            <option value="standard">
                              {t("Standard", "Стандарт", "Standart")}
                            </option>
                            <option value="comfort">
                              {t("Comfort", "Комфорт", "Komfort")}
                            </option>
                            <option value="premium">Premium</option>
                          </select>
                        </label>
                        <button disabled={busy}>
                          {t(
                            "Calculate revised quote",
                            "Рассчитать новую цену",
                            "Yeni qiyməti hesabla",
                          )}
                        </button>
                      </form>
                    </details>
                  )}
                  {amendments[r.id] && (
                    <p className="customer-note">
                      {t("Revised total", "Новая сумма", "Yenilənmiş məbləğ")}:{" "}
                      {amendments[r.id].total} {amendments[r.id].currency} ·{" "}
                      {amendments[r.id].id.slice(0, 8)}
                    </p>
                  )}
                  {r.status === "PENDING" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const button = (e.nativeEvent as SubmitEvent)
                          .submitter as HTMLButtonElement;
                        if (
                          button.value === "accept" &&
                          r.kind === "CHANGE" &&
                          !amendments[r.id]
                        ) {
                          setError(
                            t(
                              "Calculate a replacement quote before accepting a change.",
                              "Рассчитайте новую цену перед принятием изменения.",
                              "Dəyişikliyi qəbul etməzdən əvvəl yeni qiyməti hesablayın.",
                            ),
                          );
                          return;
                        }
                        void decision(
                          "/api/v1/operations/requests/" + r.id + "/resolve",
                          button.value === "accept",
                          String(f.get("note")),
                          amendments[r.id]?.id,
                        );
                      }}
                    >
                      <label>
                        {t(
                          "Response to customer",
                          "Ответ клиенту",
                          "Müştəriyə cavab",
                        )}
                        <textarea
                          name="note"
                          required
                          minLength={3}
                          maxLength={2000}
                          rows={3}
                        />
                      </label>
                      <div className="decision-actions">
                        <button
                          value="accept"
                          disabled={
                            busy ||
                            r.kind === "CANCEL" ||
                            reservations.some(
                              (b) =>
                                b.id === r.bookingId &&
                                (b.paid > 0 || b.status === "CONFIRMED"),
                            )
                          }
                        >
                          {t("Accept request", "Принять", "Sorğunu qəbul et")}
                        </button>
                        <button
                          value="decline"
                          className="reject"
                          disabled={busy}
                        >
                          {t(
                            "Decline request",
                            "Отклонить",
                            "Sorğunu qəbul etmə",
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              ))}
              {!inbox.length && (
                <div className="empty">
                  {t(
                    "No requests yet.",
                    "Запросов пока нет.",
                    "Hələ sorğu yoxdur.",
                  )}
                </div>
              )}
            </>
          )}
        {["Partners", "Notifications"].includes(view) && (
          <OfficeManagement
            key={view}
            module={view as "Partners" | "Notifications"}
            auth={auth}
            locale={locale}
            onDirtyChange={setOfferDirty}
          />
        )}
        {view === "Finance" && (
          <RefundWorkspace
            auth={auth}
            locale={locale}
            onDirtyChange={setOfferDirty}
          />
        )}
        {view === "Messages" && (
          <MessagesWorkspace auth={auth} locale={locale} onError={setError} />
        )}
        {view === "Events" && (
          <EventsWorkspace
            auth={auth}
            isAdmin={staff?.role === "ADMIN"}
            t={t}
            locale={locale}
            onError={setError}
          />
        )}
        {view === "Staff" && staff?.role === "ADMIN" && (
          <>
            <p>
              {t(
                "Every employee signs in with their own email. Role, password and deactivation changes take effect immediately and end that person's active sessions.",
                "Каждый сотрудник входит со своим email. Изменение роли, пароля и отключение действуют сразу и завершают активные сессии.",
                "Hər əməkdaş öz emaili ilə daxil olur. Rol, şifrə və deaktiv etmə dəyişiklikləri dərhal qüvvəyə minir və həmin şəxsin aktiv sessiyalarını bağlayır.",
              )}
            </p>
            <form
              className="staff-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void manage(async () => {
                  await api("/api/v1/admin/staff", auth, {
                    email: String(f.get("email")),
                    name: String(f.get("name")),
                    role: String(f.get("role")),
                    password: String(f.get("password")),
                  });
                  form.reset();
                });
              }}
            >
              <label>
                {t("Full name", "Имя", "Ad, soyad")}
                <input name="name" minLength={2} maxLength={120} required />
              </label>
              <label>
                {t("Email", "Email", "Email")}
                <input name="email" type="email" required />
              </label>
              <label>
                {t("Role", "Роль", "Rol")}
                <select name="role" defaultValue="OPERATOR">
                  <option value="OPERATOR">
                    {t("Operator", "Оператор", "Operator")}
                  </option>
                  <option value="ADMIN">
                    {t("Administrator", "Администратор", "Administrator")}
                  </option>
                </select>
              </label>
              <label>
                {t(
                  "Temporary password (12+ characters)",
                  "Временный пароль (от 12 символов)",
                  "Müvəqqəti şifrə (12+ simvol)",
                )}
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
              <button disabled={busy}>
                {t("Create account", "Создать аккаунт", "Hesab yarat")}
              </button>
            </form>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Employee", "Сотрудник", "Əməkdaş")}</th>
                    <th>{t("Role", "Роль", "Rol")}</th>
                    <th>{t("Last sign-in", "Последний вход", "Son giriş")}</th>
                    <th>{t("Status", "Статус", "Status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.name}
                        <small>{a.email}</small>
                      </td>
                      <td>
                        <select
                          aria-label={t("Role", "Роль", "Rol")}
                          value={a.role}
                          disabled={busy || a.id === staff.id}
                          onChange={(e) =>
                            void manage(() =>
                              api(`/api/v1/admin/staff/${a.id}/role`, auth, {
                                role: e.target.value,
                              }),
                            )
                          }
                        >
                          <option value="OPERATOR">
                            {t("Operator", "Оператор", "Operator")}
                          </option>
                          <option value="ADMIN">
                            {t(
                              "Administrator",
                              "Администратор",
                              "Administrator",
                            )}
                          </option>
                        </select>
                      </td>
                      <td>
                        {a.lastLoginAt
                          ? new Date(a.lastLoginAt).toLocaleString()
                          : t("Never", "Никогда", "Heç vaxt")}
                      </td>
                      <td>
                        {a.active
                          ? t("Active", "Активен", "Aktiv")
                          : t("Deactivated", "Отключён", "Deaktiv")}
                      </td>
                      <td className="row-actions">
                        <button
                          className="small"
                          disabled={busy}
                          onClick={() => {
                            const password = window.prompt(
                              t(
                                "New temporary password (12+ characters):",
                                "Новый временный пароль (от 12 символов):",
                                "Yeni müvəqqəti şifrə (12+ simvol):",
                              ),
                            );
                            if (password)
                              void manage(() =>
                                api(
                                  `/api/v1/admin/staff/${a.id}/password`,
                                  auth,
                                  { password },
                                ),
                              );
                          }}
                        >
                          {t(
                            "Reset password",
                            "Сбросить пароль",
                            "Şifrəni sıfırla",
                          )}
                        </button>
                        <button
                          className="small danger"
                          disabled={busy || (a.id === staff.id && a.active)}
                          onClick={() =>
                            void manage(() =>
                              api(`/api/v1/admin/staff/${a.id}/active`, auth, {
                                active: !a.active,
                              }),
                            )
                          }
                        >
                          {a.active
                            ? t("Deactivate", "Отключить", "Deaktiv et")
                            : t("Activate", "Включить", "Aktiv et")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {view === "Tours" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Journey", "Поездка", "Səfər")}</th>
                  <th>{t("Region", "Регион", "Bölgə")}</th>
                  <th>{t("Duration", "Длительность", "Müddət")}</th>
                  <th>
                    {t("From / person", "От / чел.", "Başlayan qiymət / nəfər")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((tour) => (
                  <tr key={tour.slug}>
                    <td>
                      {locale === "az"
                        ? tour.titleAz
                        : locale === "ru"
                          ? tour.titleRu
                          : tour.titleEn}
                      <small>{tour.slug}</small>
                    </td>
                    <td>{tour.region}</td>
                    <td>
                      {tour.days} {t("days", "дн.", "gün")}
                    </td>
                    <td>€{tour.fromPriceEur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {["Overview", "Quotes"].includes(view) &&
          (data?.recentQuotes.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Reference", "Номер", "Nömrə")}</th>
                    <th>{t("Journey", "Поездка", "Səfər")}</th>
                    <th>{t("Departure", "Отправление", "Başlama")}</th>
                    <th>{t("Total", "Всего", "Cəmi")}</th>
                    <th>{t("Deposit", "Депозит", "Depozit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentQuotes.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <code>{q.id.slice(0, 8)}</code>
                        <small>{new Date(q.createdAt).toLocaleString()}</small>
                      </td>
                      <td>{q.tourSlug}</td>
                      <td>{q.departure}</td>
                      <td>
                        {q.total} {q.currency}
                      </td>
                      <td>
                        {q.deposit} {q.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="empty">
              <FileText size={32} />
              <h2>
                {t(
                  "No quotes yet.",
                  "Нет расчётов.",
                  "Hələ qiymət sorğusu yoxdur.",
                )}
              </h2>
            </section>
          ))}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
