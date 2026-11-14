import { useEffect, useState, type ReactNode } from "react";
import {
  BedDouble,
  Check,
  AlertCircle,
  CircleCheck,
  Clock,
  CreditCard,
  Flower2,
  Plane,
  Plus,
  RefreshCw,
  Send,
  Users,
  Wallet,
  X,
  Car,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import "./payments.css";
import "./payment-workspace.css";
import { formatDay, formatDateTime } from "./dates";
type Request = {
  id: string;
  contract_id: string;
  kind: string;
  service_key: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  customer_message: string;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  created_at?: string | null;
  closed_at?: string | null;
  close_note?: string | null;
};
type Offer = {
  id: string;
  revision: number;
  title: string;
  currency: string;
  total: number;
  date: string;
  travelers: number;
  services: { key: string; name: string; total: number }[];
};
type Context = {
  contract: { id: string; version: number } | null;
  offer: Offer | null;
  requests: Request[];
  paidMinor: number;
  receivedMinor?: number;
  paymentBlocked: boolean;
};
type Draft = {
  version: number;
  contractId: string;
  requestKey: string;
  kind: "DEPOSIT" | "SERVICE";
  serviceKey: string | null;
  amount: number;
  message: string;
};
type Saved = {
  version: number;
  preview_version: number;
  payload: string;
  sent: boolean;
};
export default function PaymentWorkspace({
  bookingId,
  auth,
  locale: l,
  onDirtyChange,
  onRecorded,
  onOpenFinance,
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  onDirtyChange: (dirty: boolean) => void;
  // Called after a payment is recorded, so the page summary can refresh the received amount.
  onRecorded?: () => void;
  /** Opens the "Funds by service" page, which some payment errors point to. */
  onOpenFinance?: () => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [context, setContext] = useState<Context | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false),
    [receipt, setReceipt] = useState<string | null>(null),
    [canRecord, setCanRecord] = useState(false),
    [tried, setTried] = useState(false),
    [tab, setTab] = useState<"requests" | "new">("requests"),
    [closing, setClosing] = useState<{ id: string; outcome: "FAILED" | "CANCELLED" } | null>(null);
  const base = "/api/v1/operations/bookings/" + bookingId,
    fmt = (n: number) =>
      new Intl.NumberFormat(l === "az" ? "az-AZ" : l, {
        style: "currency",
        currency: context?.offer?.currency || "EUR",
      }).format(n / 100);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [c, s] = await Promise.all([
        api<Context>(base + "/payment-context", auth),
        api<Saved | null>(base + "/payment-draft", auth),
      ]);
      setContext(c);
      if (!c.requests.length) setTab("new");
      if (s) {
        setDraft(JSON.parse(s.payload));
        setSent(s.sent);
      } else if (c.contract)
        setDraft({
          version: 0,
          contractId: c.contract.id,
          requestKey: crypto.randomUUID(),
          kind: "DEPOSIT",
          serviceKey: null,
          amount: 0,
          message: "",
        });
    } catch {
      setError(
        t(
          "Could not load payment details.",
          "Не удалось загрузить оплату.",
          "Ödəniş məlumatları yüklənmədi.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api<{ roles: string[] }>("/api/v1/operations/me", auth)
      .then((me) => setCanRecord(me.roles.includes("ROLE_FINANCE")))
      .catch(() => setCanRecord(false));
  }, [auth]);
  async function record(r: Request, f: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const received = String(f.get("receivedAt") || "");
      await api(base + "/payment-requests/" + r.id + "/mark-paid", auth, {
        amount: Number(String(f.get("amount")).replace(",", ".")),
        method: String(f.get("method")),
        reference: null,
        receivedAt: received ? new Date(received).toISOString() : null,
      });
      setReceipt(null);
      setNotice(
        t(
          "Payment recorded. The customer was notified.",
          "Платёж записан. Клиент уведомлён.",
          "Ödəniş qeydə alındı. Müştəriyə bildiriş göndərildi.",
        ),
      );
      await load();
      onRecorded?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "AMOUNT_MISMATCH"
          ? t(
              "The amount does not match this payment request.",
              "Сумма не совпадает с запросом оплаты.",
              "Məbləğ ödəniş tələbi ilə üst-üstə düşmür.",
            )
          : code === "FINANCE_REQUIRED"
            ? t(
                "Only finance staff can record a service payment.",
                "Оплату услуги записывает финансовый сотрудник.",
                "Xidmət ödənişini yalnız maliyyə işçisi qeyd edə bilər.",
              )
            : code === "PAYMENT_ALREADY_RECORDED"
            ? t(
                "This payment was already recorded.",
                "Этот платёж уже записан.",
                "Bu ödəniş artıq qeydə alınıb.",
              )
            : t(
                "Could not record the payment. Check the details and try again.",
                "Не удалось записать платёж. Проверьте данные.",
                "Ödəniş qeydə alınmadı. Məlumatları yoxlayın.",
              ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function close(r: Request, outcome: "FAILED" | "CANCELLED", f: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(base + "/payment-requests/" + r.id + "/close", auth, {
        outcome,
        note: String(f.get("note") || "").trim() || null,
      });
      setClosing(null);
      setNotice(
        t(
          "Request closed. The customer was notified.",
          "Запрос закрыт. Клиент уведомлён.",
          "Tələb bağlandı. Müştəriyə bildiriş göndərildi.",
        ),
      );
      await load();
      onRecorded?.();
    } catch (e) {
      setError(
        e instanceof Error && e.message === "PAYMENT_ALREADY_RECORDED"
          ? t("This request is already paid.", "Этот запрос уже оплачен.", "Bu tələb artıq ödənilib.")
          : t("Could not close the request. Refresh and try again.", "Не удалось закрыть запрос. Обновите страницу.", "Tələb bağlanmadı. Səhifəni yeniləyib yenidən cəhd edin."),
      );
    } finally {
      setBusy(false);
    }
  }
  const methodLabel = (m?: string | null) =>
    m === "BANK_TRANSFER"
      ? t("Bank transfer", "Банковский перевод", "Bank köçürməsi")
      : m === "CASH"
        ? t("Cash", "Наличные", "Nağd")
        : m === "CARD_TERMINAL"
          ? t("Card terminal", "Терминал", "Kart terminalı")
          : m === "OTHER"
            ? t("Other", "Другое", "Digər")
            : "";
  const statusLabel = (st: string) =>
    st === "OPEN"
      ? t("Awaiting payment", "Ожидает оплаты", "Ödəniş gözlənilir")
      : st === "PAID"
        ? t("Paid", "Оплачено", "Ödənilib")
        : st === "FAILED"
          ? t("Unsuccessful", "Неуспешно", "Uğursuz")
          : st === "CANCELLED"
            ? t("Withdrawn", "Отозван", "Ləğv edilib")
            : st;
  useEffect(() => {
    void load();
  }, [bookingId]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  function edit(change: Partial<Draft>) {
    setDraft((old) =>
      old
        ? {
            ...old,
            ...change,
            ...(sent ? { requestKey: crypto.randomUUID() } : {}),
          }
        : old,
    );
    setSent(false);
    setError("");
    setDirty(true);
    setNotice("");
  }
  /** One action for the operator: store what was typed, record that it was reviewed, and send it. */
  async function submitRequest() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      let version = draft.version;
      if (dirty || version < 1) {
        const r = await api<Saved>(base + "/payment-draft", auth, draft);
        const saved = JSON.parse(r.payload);
        setDraft(saved);
        setDirty(false);
        version = saved.version;
      }
      await api(base + "/payment-draft/preview", auth, { version });
      const requests = await api<Request[]>(base + "/payment-draft/send", auth, { version });
      setContext((c) => (c ? { ...c, requests } : c));
      setSent(true);
      setTried(false);
      setTab("requests");
      setNotice(
        t(
          "Payment request sent to the customer. No funds were collected.",
          "Запрос отправлен клиенту. Деньги не списаны.",
          "Ödəniş tələbi müştəriyə göndərildi. Pul tutulmayıb.",
        ),
      );
      onRecorded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const serviceIcon = (key: string | null) =>
    key === null
      ? <Wallet size={22} />
      : ({
          transport: <Car size={22} />,
          hotel: <BedDouble size={22} />,
          guide: <Users size={22} />,
          transfer: <Plane size={22} />,
          activity: <Flower2 size={22} />,
        } as Record<string, ReactNode>)[key.split("-")[0]] ?? <CreditCard size={22} />;
  const offer = context?.offer ?? null;
  const totalMinor = offer ? Math.round(offer.total * 100) : 0;
  const receivedNow = context?.receivedMinor ?? context?.paidMinor ?? 0;
  const currentRequests = context && context.contract ? context.requests.filter((r) => r.contract_id === context.contract!.id) : [];
  const openMinor = currentRequests.filter((r) => r.status === "OPEN").reduce((a, r) => a + r.amount_minor, 0);
  const remainingMinor = Math.max(0, totalMinor - receivedNow - openMinor);
  const leftMinor = Math.max(0, totalMinor - receivedNow);
  const share = totalMinor > 0 ? Math.min(100, Math.round((receivedNow / totalMinor) * 100)) : 0;
  const serviceName = (key: string | null) => offer?.services.find((x) => x.key === key)?.name || key || "";
  const amountMinor = draft ? Math.round(draft.amount * 100) : 0;
  const justSent = sent && !dirty;
  const depositRow = currentRequests.find((r) => r.kind === "DEPOSIT" && r.status !== "FAILED" && r.status !== "CANCELLED");
  const chosenService = offer?.services.find((x) => x.key === draft?.serviceKey);
  type Problem = { field: "kind" | "service" | "amount" | "general"; text: string; action?: { label: string; run: () => void } };
  const problems: Problem[] = [];
  if (draft && context) {
    if (context.paymentBlocked)
      problems.push({ field: "general", text: t("A pending customer request or a cancellation needs office review first. Resolve it before sending a payment request.", "Сначала нужно обработать запрос клиента или отмену.", "Əvvəl müştərinin gözləyən sorğusunu və ya ləğvi həll edin, sonra ödəniş tələbi göndərin.") });
    if (justSent)
      problems.push({ field: "general", text: t("This request was already sent. To send another, change the amount or the type.", "Этот запрос уже отправлен. Для нового измените сумму или тип.", "Bu tələb artıq göndərilib. Yenisini göndərmək üçün məbləği və ya növü dəyişin.") });
    if (!justSent && draft.kind === "DEPOSIT" && depositRow)
      problems.push({
        field: "kind",
        text:
          depositRow.status === "PAID"
            ? t("The deposit is already paid. Choose Service payment for the next request.", "Депозит уже оплачен. Выберите оплату услуги.", "Beh artıq ödənilib. Növbəti tələb üçün 'Xidmət ödənişi' seçin.")
            : t("A deposit request is already waiting for payment. Close it as Unsuccessful or Withdraw it, then send a new one.", "Запрос на депозит уже ожидает оплаты. Закройте его как неуспешный или отзовите.", "Beh üçün tələb artıq göndərilib və ödəniş gözləyir. Onu 'Uğursuz' və ya 'Ləğv et' kimi bağlayın, sonra yenisini göndərin."),
        action: depositRow.status === "PAID" ? undefined : { label: t("Open requests", "Открыть запросы", "Tələblərə keç"), run: () => setTab("requests") },
      });
    if (!justSent && draft.kind === "DEPOSIT" && !depositRow && receivedNow > 0)
      problems.push({ field: "kind", text: t("The deposit has already been received. Choose Service payment.", "Депозит уже получен. Выберите оплату услуги.", "Beh artıq daxil olub. 'Xidmət ödənişi' seçin.") });
    if (draft.kind === "SERVICE" && !receivedNow)
      problems.push({ field: "kind", text: t("A service payment can be requested only after the deposit has been received. Request the deposit first and record it as paid.", "Оплату услуги можно запросить только после получения депозита.", "Xidmət ödənişini yalnız beh daxil olandan sonra tələb etmək olar. Əvvəl behi tələb edin və 'Uğurlu' kimi qeyd edin.") });
    if (draft.kind === "SERVICE" && !draft.serviceKey)
      problems.push({ field: "service", text: t("Choose which service this payment is for.", "Выберите услугу.", "Ödənişin hansı xidmət üçün olduğunu seçin.") });
    if (!amountMinor)
      problems.push({ field: "amount", text: t("Enter the amount to request.", "Укажите сумму.", "Tələb olunan məbləği yazın.") });
    else if (amountMinor > remainingMinor)
      problems.push({ field: "amount", text: t(`The amount is more than what is left to request. You can ask for at most ${fmt(remainingMinor)}.`, `Сумма больше остатка. Максимум ${fmt(remainingMinor)}.`, `Məbləğ tələb oluna biləcək qalıqdan çoxdur. Ən çoxu ${fmt(remainingMinor)} yaza bilərsiniz.`) });
    else if (draft.kind === "SERVICE" && chosenService && amountMinor > Math.round(chosenService.total * 100))
      problems.push({ field: "amount", text: t(`The amount is more than the price of this service (${fmt(Math.round(chosenService.total * 100))}).`, `Сумма больше цены услуги (${fmt(Math.round(chosenService.total * 100))}).`, `Məbləğ bu xidmətin qiymətindən (${fmt(Math.round(chosenService.total * 100))}) çoxdur.`) });
  }
  const problemFor = (field: Problem["field"]) => (tried ? problems.find((x) => x.field === field) : undefined);
  function jump(field: Problem["field"]) {
    const id = field === "amount" ? "pw-amount-input" : "pw-err-" + field;
    const el = document.getElementById(id) ?? document.getElementById("pw-problems");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  }
  function trySend() {
    setTried(true);
    setNotice("");
    if (problems.length) {
      setError("");
      window.setTimeout(() => jump(problems[0].field), 30);
      return;
    }
    void submitRequest();
  }
  /** Turns a server code into a sentence the office can act on. */
  function explain(code: string): { text: string; action?: { label: string; run: () => void } } {
    const toFunds = onOpenFinance ? { label: t("Open Funds by service", "Открыть распределение", "Məbləğin bölgüsünə keç"), run: onOpenFinance } : undefined;
    const map: Record<string, { text: string; action?: { label: string; run: () => void } }> = {
      DEPOSIT_ALREADY_REQUESTED: { text: t("A deposit request already exists. Close the earlier one first.", "Запрос на депозит уже существует.", "Beh üçün tələb artıq mövcuddur. Əvvəlkini bağlayın.") },
      DEPOSIT_ALREADY_RECEIVED: { text: t("The deposit has already been received. Choose Service payment.", "Депозит уже получен.", "Beh artıq daxil olub. 'Xidmət ödənişi' seçin.") },
      DEPOSIT_REQUIRED: { text: t("The deposit must be received before a service payment.", "Сначала нужен депозит.", "Xidmət ödənişindən əvvəl beh daxil olmalıdır.") },
      PAYMENT_EXCEEDS_CONTRACT: { text: t("This amount plus the open requests is more than the contract total. Lower the amount.", "Сумма с открытыми запросами превышает договор.", "Bu məbləğ açıq tələblərlə birlikdə müqavilənin cəmini aşır. Məbləği azaldın.") },
      SERVICE_AMOUNT_EXCEEDED: { text: t("The amount is more than what is left for this service. Check the funds already assigned to it, or lower the amount.", "Сумма больше остатка по услуге.", "Məbləğ bu xidmət üçün qalan hissədən çoxdur. Ona artıq düşən məbləği yoxlayın və ya məbləği azaldın."), action: toFunds },
      CURRENT_ALLOCATION_REQUIRED: { text: t("Before a service payment, split the received money between the services and save it.", "Перед оплатой услуги распределите полученные деньги.", "Xidmət ödənişindən əvvəl daxil olan pulu xidmətlər arasında bölüb saxlayın."), action: toFunds },
      REQUEST_PENDING: { text: t("The customer has a pending change request. Resolve it first.", "У клиента есть запрос на изменение.", "Müştərinin gözləyən dəyişiklik sorğusu var. Əvvəl onu həll edin.") },
      PAYMENT_WORKFLOW_CONFLICT: { text: t("A payment request cannot be sent in the booking's current state (cancelled or rejected).", "В текущем статусе бронирования запрос невозможен.", "Rezervasiyanın hazırkı vəziyyətində (ləğv və ya rədd) ödəniş tələbi göndərmək olmur.") },
      PAYMENT_PLAN_REVIEW_REQUIRED: { text: t("A service was cancelled. Review and send the revised payment plan first.", "Услуга отменена. Сначала отправьте обновлённый план.", "Xidmət ləğv olunub. Əvvəl yenilənmiş ödəniş planını yoxlayıb göndərin."), action: toFunds },
      CURRENT_CONTRACT_ACCEPTANCE_REQUIRED: { text: t("The customer must accept the contract for the current offer first.", "Клиент должен принять договор.", "Əvvəl müştəri cari təklifin müqaviləsini təsdiqləməlidir.") },
      ACCEPTED_CONTRACT_REQUIRED: { text: t("The customer must accept the contract first.", "Клиент должен принять договор.", "Əvvəl müştəri müqaviləni təsdiqləməlidir.") },
      STALE_PAYMENT_DRAFT: { text: t("The draft was changed elsewhere. Refresh the page.", "Черновик изменён. Обновите страницу.", "Qaralama başqa yerdə dəyişdirilib. Səhifəni yeniləyin.") },
      INVALID_SERVICE_KEY: { text: t("The chosen service is not in the offer or was cancelled. Choose another.", "Услуга не найдена или отменена.", "Seçilmiş xidmət təklifdə yoxdur və ya ləğv edilib. Başqasını seçin.") },
      INVALID_AMOUNT: { text: t("The amount is not valid. Use a positive number with at most two decimals.", "Неверная сумма.", "Məbləğ düzgün deyil. Müsbət rəqəm yazın (vergüldən sonra ən çox iki rəqəm).") },
      IDEMPOTENCY_KEY_REUSED: { text: t("This request was already sent with different details. Refresh the page.", "Запрос уже отправлен. Обновите страницу.", "Bu tələb artıq başqa məlumatlarla göndərilib. Səhifəni yeniləyin.") },
      PREVIEW_REQUIRED: { text: t("The review was not recorded. Try again.", "Просмотр не записан. Повторите.", "Önbaxış qeydə alınmayıb. Yenidən cəhd edin.") },
      ACCESS_DENIED: { text: t("You have no permission for this, or the session expired. Sign in again.", "Нет доступа или сессия истекла.", "Bu əməliyyat üçün icazəniz yoxdur və ya sessiya bitib. Yenidən daxil olun.") },
    };
    if (map[code]) return map[code];
    if (!/^[A-Z][A-Z_]+$/.test(code))
      return /abort|timeout|fetch|network/i.test(code)
        ? { text: t("Could not reach the server. Check the connection and try again.", "Нет связи с сервером.", "Serverə qoşulmaq olmadı. Bağlantını yoxlayıb yenidən cəhd edin.") }
        : { text: code };
    return { text: t(`The action failed (${code}). Refresh the page and try again.`, `Действие не выполнено (${code}).`, `Əməliyyat alınmadı (${code}). Səhifəni yeniləyib yenidən cəhd edin.`) };
  }
  const shown = error ? explain(error) : null;
  const chips = [
    { label: "30%", minor: Math.round(totalMinor * 0.3) },
    { label: "50%", minor: Math.round(totalMinor * 0.5) },
    { label: t("All that is left", "Весь остаток", "Bütün qalıq"), minor: remainingMinor },
  ].filter((c) => c.minor > 0 && c.minor <= remainingMinor);
  const kindTitle = draft?.kind === "DEPOSIT" ? t("Deposit", "Депозит", "Beh") : t("Service payment", "Оплата услуги", "Xidmət ödənişi");
  const statusTone = (st: string) => (st === "PAID" ? "ok" : st === "OPEN" ? "info" : st === "FAILED" ? "bad" : "muted");
  return (
    <section className="payment-ops pw">
      <div className="pw-head">
        <span className="pw-icon">
          <CreditCard size={24} aria-hidden="true" />
        </span>
        <div>
          <h2>{t("Payments", "Платежи", "Ödənişlər")}</h2>
          <p>
            {offer
              ? `${offer.title}, ${formatDay(offer.date)}, ${offer.travelers} ${t("travelers", "чел.", "nəfər")}`
              : t("Request payments from the customer and record what was received.", "Запрашивайте оплату у клиента и записывайте полученное.", "Müştəridən ödəniş tələb edin və daxil olanı qeyd edin.")}
          </p>
        </div>
        <button
          className="pw-refresh"
          disabled={busy}
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                t("Discard what you typed and reload?", "Отменить введённое и обновить?", "Yazdıqlarınız silinib səhifə yenilənsin?"),
              )
            )
              return;
            setDirty(false);
            void load();
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t("Refresh", "Обновить", "Yenilə")}
        </button>
      </div>
      {shown && (tab !== "new" || !draft) && (
        <div role="alert" className="pw-alert">
          <AlertCircle size={20} aria-hidden="true" />
          <span>{shown.text}</span>
          {shown.action && (
            <button type="button" onClick={shown.action.run}>
              {shown.action.label}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="pw-notice">
          <CircleCheck size={18} aria-hidden="true" />
          {notice}
        </p>
      )}
      {!context?.contract || !context.offer ? (
        <div className="pw-empty">
          <Clock size={34} aria-hidden="true" />
          <strong>{t("The contract is not accepted yet", "Договор ещё не принят", "Müqavilə hələ təsdiqlənməyib")}</strong>
          <span>
            {t(
              "Payment requests open after the customer accepts the current contract.",
              "Запросы оплаты откроются после принятия договора клиентом.",
              "Ödəniş tələbləri müştəri cari müqaviləni təsdiqlədikdən sonra açılır.",
            )}
          </span>
        </div>
      ) : (
        draft && (
          <>
            <div className="pw-stats">
              <div>
                <small>{t("Trip total", "Сумма поездки", "Səfərin cəmi")}</small>
                <strong>{fmt(totalMinor)}</strong>
              </div>
              <div className="ok">
                <small>{t("Received", "Получено", "Daxil olub")}</small>
                <strong>{fmt(receivedNow)}</strong>
              </div>
              <div className={openMinor ? "wait" : ""}>
                <small>{t("Waiting for payment", "Ожидает оплаты", "Ödəniş gözlənilir")}</small>
                <strong>{fmt(openMinor)}</strong>
              </div>
              <div>
                <small>{t("Left to pay", "Осталось", "Qalıq")}</small>
                <strong>{fmt(leftMinor)}</strong>
              </div>
            </div>
            <div className="pw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}>
              <span style={{ width: share + "%" }} />
            </div>
            {context.paymentBlocked && (
              <p className="payment-error">
                {t(
                  "A pending request or cancellation requires office review before new payment requests.",
                  "Перед новым запросом требуется проверка офиса.",
                  "Yeni ödəniş tələbindən əvvəl sorğu və ya ləğv üzrə ofis yoxlaması lazımdır.",
                )}
              </p>
            )}
            <div className="pw-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>
                {t("Requests", "Запросы", "Tələblər")}
                <em>{context.requests.length}</em>
              </button>
              <button role="tab" aria-selected={tab === "new"} className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>
                <Plus size={16} aria-hidden="true" />
                {t("New request", "Новый запрос", "Yeni tələb")}
              </button>
            </div>

            {tab === "new" && (
              <div className="pw-new">
                <div className="pw-form">
                  <h3>
                    <b>1</b>
                    {t("What do you ask for?", "Что запрашиваем?", "Nəyi tələb edirsiniz?")}
                  </h3>
                  <div className="pw-kinds" id="pw-err-kind">
                    <button
                      type="button"
                      className={draft.kind === "DEPOSIT" ? "on" : ""}
                      aria-pressed={draft.kind === "DEPOSIT"}
                      onClick={() => edit({ kind: "DEPOSIT", serviceKey: null })}
                    >
                      <Wallet size={24} aria-hidden="true" />
                      <strong>{t("Deposit", "Депозит", "Beh")}</strong>
                      <span>{t("The first payment that confirms the booking.", "Первый платёж, подтверждающий бронь.", "Rezervasiyanı təsdiqləyən ilk ödəniş.")}</span>
                    </button>
                    <button
                      type="button"
                      className={draft.kind === "SERVICE" ? "on" : ""}
                      aria-pressed={draft.kind === "SERVICE"}
                      onClick={() => edit({ kind: "SERVICE", serviceKey: null })}
                    >
                      <CreditCard size={24} aria-hidden="true" />
                      <strong>{t("Service payment", "Оплата услуги", "Xidmət ödənişi")}</strong>
                      <span>{t("Payment for one service, after the deposit.", "Оплата одной услуги после депозита.", "Behdən sonra bir xidmət üçün ödəniş.")}</span>
                    </button>
                  </div>
                  {problemFor("kind") && (
                    <p className="pw-err" role="alert">
                      <AlertCircle size={16} aria-hidden="true" />
                      <span>{problemFor("kind")!.text}</span>
                      {problemFor("kind")!.action && (
                        <button type="button" onClick={problemFor("kind")!.action!.run}>
                          {problemFor("kind")!.action!.label}
                        </button>
                      )}
                    </p>
                  )}
                  {draft.kind === "SERVICE" && (
                    <>
                      <div className={"pw-services" + (problemFor("service") ? " bad" : "")} id="pw-err-service">
                        {offer!.services.map((svc) => (
                          <button
                            type="button"
                            key={svc.key}
                            className={draft.serviceKey === svc.key ? "on" : ""}
                            aria-pressed={draft.serviceKey === svc.key}
                            onClick={() => edit({ serviceKey: svc.key })}
                          >
                            <span className="pw-svc-icon">{serviceIcon(svc.key)}</span>
                            <span>{svc.name}</span>
                            <strong>{fmt(svc.total * 100)}</strong>
                          </button>
                        ))}
                      </div>
                      {problemFor("service") && (
                        <p className="pw-err" role="alert">
                          <AlertCircle size={16} aria-hidden="true" />
                          <span>{problemFor("service")!.text}</span>
                        </p>
                      )}
                    </>
                  )}
                  <h3>
                    <b>2</b>
                    {t("How much?", "Сколько?", "Nə qədər?")}
                  </h3>
                  <label className={"pw-amount" + (problemFor("amount") ? " bad" : "")}>
                    <span className="sr-only">{t("Amount", "Сумма", "Məbləğ")}</span>
                    <input
                      id="pw-amount-input"
                      type="number"
                      min="0.01"
                      max={offer!.total}
                      step=".01"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={draft.amount || ""}
                      onChange={(e) => edit({ amount: Number(e.target.value) })}
                    />
                    <em>{offer!.currency}</em>
                  </label>
                  {problemFor("amount") && (
                    <p className="pw-err" role="alert">
                      <AlertCircle size={16} aria-hidden="true" />
                      <span>{problemFor("amount")!.text}</span>
                    </p>
                  )}
                  {chips.length > 0 && (
                    <div className="pw-chips">
                      {chips.map((c) => (
                        <button type="button" key={c.label} onClick={() => edit({ amount: c.minor / 100 })}>
                          {c.label}, {fmt(c.minor)}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className="pw-field">
                    {t("Message to the customer (optional)", "Сообщение клиенту (необязательно)", "Müştəriyə mesaj (istəyə bağlı)")}
                    <textarea
                      maxLength={2000}
                      rows={3}
                      value={draft.message}
                      onChange={(e) => edit({ message: e.target.value })}
                      placeholder={t("For example: bank details are in the email", "Например: реквизиты в письме", "Məsələn: bank rekvizitləri e-poçtdadır")}
                    />
                  </label>
                </div>
                <div className="pw-side">
                  <h3>
                    <b>3</b>
                    {t("Check and send", "Проверьте и отправьте", "Yoxlayın və göndərin")}
                  </h3>
                  <div className="pw-preview">
                    <small>{t("The customer will see", "Клиент увидит", "Müştəri belə görəcək")}</small>
                    <div className="pw-preview-row">
                      <span className="pw-svc-icon">{serviceIcon(draft.kind === "SERVICE" ? draft.serviceKey || "x" : null)}</span>
                      <div>
                        <strong>{kindTitle}</strong>
                        {draft.kind === "SERVICE" && draft.serviceKey && <span>{serviceName(draft.serviceKey)}</span>}
                      </div>
                      <b>{fmt(amountMinor)}</b>
                    </div>
                    {draft.message && <p>{draft.message}</p>}
                    <em>
                      {t(
                        "Shown as a payment request, not a completed payment.",
                        "Показывается как запрос, а не завершённый платёж.",
                        "Tamamlanmış ödəniş yox, ödəniş tələbi kimi görünür.",
                      )}
                    </em>
                  </div>
                  <button className="ow-primary pw-send" disabled={busy} onClick={trySend}>
                    <Send size={18} aria-hidden="true" />
                    {busy ? t("Sending...", "Отправка...", "Göndərilir...") : t("Send to the customer", "Отправить клиенту", "Müştəriyə göndər")}
                  </button>
                  {tried && problems.length > 0 && (
                    <div className="pw-problems" id="pw-problems" role="alert">
                      <strong>
                        <AlertCircle size={18} aria-hidden="true" />
                        {t("Fix this to send:", "Исправьте, чтобы отправить:", "Göndərmək üçün düzəldin:")}
                      </strong>
                      <ul>
                        {problems.map((pb, i) => (
                          <li key={i}>
                            <button type="button" onClick={() => jump(pb.field)}>
                              {pb.text}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {shown && (
                    <div role="alert" className="pw-problems server" id="pw-server-error">
                      <strong>
                        <AlertCircle size={18} aria-hidden="true" />
                        {t("The server did not accept the request:", "Сервер не принял запрос:", "Server tələbi qəbul etmədi:")}
                      </strong>
                      <p>{shown.text}</p>
                      {shown.action && (
                        <button type="button" className="pw-problem-action" onClick={shown.action.run}>
                          {shown.action.label}
                        </button>
                      )}
                    </div>
                  )}
                  {tried && problems.length === 0 && !shown && (
                    <p className="pw-hint" role="status">
                      {t("Everything looks right. Press the button to send.", "Всё верно. Нажмите для отправки.", "Hər şey düzgündür. Göndərmək üçün düyməni basın.")}
                    </p>
                  )}
                  <p className="pw-fine">
                    {t(
                      "A request does not collect money. Online payment is not connected yet.",
                      "Запрос не списывает деньги. Онлайн-оплата ещё не подключена.",
                      "Tələb pul tutmur. Onlayn ödəniş hələ qoşulmayıb.",
                    )}
                  </p>
                </div>
              </div>
            )}

            {tab === "requests" &&
              (context.requests.length ? (
                <div className="pw-list">
                  {context.requests.map((r) => {
                    const outdated = r.contract_id !== context.contract?.id;
                    return (
                      <div className={"pw-card" + (r.status === "OPEN" && !outdated ? " open" : "")} key={r.id}>
                        <div className="pw-card-main">
                          <span className="pw-svc-icon">{serviceIcon(r.kind === "DEPOSIT" ? null : r.service_key || "x")}</span>
                          <div className="pw-card-title">
                            <strong>{r.kind === "DEPOSIT" ? t("Deposit", "Депозит", "Beh") : serviceName(r.service_key)}</strong>
                            <small>
                              {outdated
                                ? t("Outdated contract", "Устаревший договор", "Köhnə müqavilə")
                                : r.status === "PAID" && r.paid_at
                                  ? [formatDay(r.paid_at), methodLabel(r.payment_method)].filter(Boolean).join(", ")
                                  : r.status === "FAILED" || r.status === "CANCELLED"
                                    ? [r.closed_at ? formatDay(r.closed_at) : "", r.close_note || ""].filter(Boolean).join(", ")
                                    : r.created_at
                                      ? formatDay(r.created_at)
                                      : ""}
                            </small>
                          </div>
                          <span className={"pw-badge " + statusTone(r.status)}>{outdated ? t("Outdated", "Устарел", "Köhnəlib") : statusLabel(r.status)}</span>
                          <b className="pw-amount-cell">{fmt(r.amount_minor)}</b>
                        </div>
                        {r.status === "OPEN" && !outdated && (
                          <div className="pw-card-actions">
                            {(canRecord || r.kind === "DEPOSIT") && (
                              <button
                                type="button"
                                className="payment-ok"
                                onClick={() => {
                                  setClosing(null);
                                  setReceipt(receipt === r.id ? null : r.id);
                                }}
                              >
                                <Check size={16} aria-hidden="true" />
                                {t("Paid", "Оплачено", "Uğurlu, ödənilib")}
                              </button>
                            )}
                            <button
                              type="button"
                              className="payment-bad"
                              onClick={() => {
                                setReceipt(null);
                                setClosing(closing?.id === r.id && closing.outcome === "FAILED" ? null : { id: r.id, outcome: "FAILED" });
                              }}
                            >
                              <X size={16} aria-hidden="true" />
                              {t("Unsuccessful", "Неуспешно", "Uğursuz")}
                            </button>
                            <button
                              type="button"
                              className="pw-quiet"
                              onClick={() => {
                                setReceipt(null);
                                setClosing(closing?.id === r.id && closing.outcome === "CANCELLED" ? null : { id: r.id, outcome: "CANCELLED" });
                              }}
                            >
                              {t("Withdraw", "Отозвать", "Ləğv et")}
                            </button>
                            {!canRecord && r.kind !== "DEPOSIT" && (
                              <span className="pw-fine">
                                {t(
                                  "Only finance staff can record a service payment. Operators can record deposits.",
                                  "Оплату услуги записывает финансовый сотрудник. Депозит может записать оператор.",
                                  "Xidmət ödənişini yalnız maliyyə işçisi qeyd edə bilər. Behi operator özü qeyd edə bilər.",
                                )}
                              </span>
                            )}
                          </div>
                        )}
                        {closing?.id === r.id && (
                          <form
                            className="payment-record"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void close(r, closing.outcome, new FormData(e.currentTarget));
                            }}
                          >
                            <p>
                              {closing.outcome === "FAILED"
                                ? t(
                                    "The customer did not pay or the transfer failed. The request will be closed and a new one can be sent.",
                                    "Клиент не оплатил или перевод не прошёл. Запрос закроется, можно отправить новый.",
                                    "Müştəri ödəmədi və ya köçürmə alınmadı. Tələb bağlanacaq, yenisini göndərə bilərsiniz.",
                                  )
                                : t(
                                    "Withdraw this request, for example if it was sent by mistake.",
                                    "Отозвать запрос, например если он отправлен по ошибке.",
                                    "Bu tələbi geri götürün, məsələn səhvən göndərilibsə.",
                                  )}
                            </p>
                            <label>
                              {t("Note (optional)", "Заметка (необязательно)", "Qeyd (istəyə bağlı)")}
                              <textarea name="note" maxLength={500} rows={2} />
                            </label>
                            <button disabled={busy}>
                              {closing.outcome === "FAILED"
                                ? t("Mark unsuccessful", "Отметить неуспешным", "Uğursuz kimi bağla")
                                : t("Withdraw request", "Отозвать запрос", "Tələbi ləğv et")}
                            </button>
                          </form>
                        )}
                        {receipt === r.id && (
                          <form
                            className="payment-record"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void record(r, new FormData(e.currentTarget));
                            }}
                          >
                            <p>
                              {t(
                                "Record money you have received. Type the exact amount to confirm.",
                                "Запишите полученные деньги. Введите точную сумму для подтверждения.",
                                "Aldığınız ödənişi qeyd edin. Təsdiq üçün dəqiq məbləği yazın.",
                              )}
                            </p>
                            <label>
                              {t("Amount received", "Получено", "Alınan məbləğ")}
                              <input name="amount" inputMode="decimal" required autoComplete="off" placeholder={String(r.amount_minor / 100)} />
                            </label>
                            <label>
                              {t("Method", "Способ", "Üsul")}
                              <select name="method" defaultValue="BANK_TRANSFER">
                                <option value="BANK_TRANSFER">{t("Bank transfer", "Банковский перевод", "Bank köçürməsi")}</option>
                                <option value="CASH">{t("Cash", "Наличные", "Nağd")}</option>
                                <option value="CARD_TERMINAL">{t("Card terminal", "Терминал", "Kart terminalı")}</option>
                                <option value="OTHER">{t("Other", "Другое", "Digər")}</option>
                              </select>
                            </label>
                            <label>
                              {t("Received on", "Дата получения", "Alınma tarixi")}
                              <input name="receivedAt" type="datetime-local" max={new Date().toISOString().slice(0, 16)} />
                            </label>
                            <button disabled={busy}>{t("Record payment", "Записать платёж", "Ödənişi qeyd et")}</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pw-empty">
                  <Wallet size={34} aria-hidden="true" />
                  <strong>{t("No payment requests yet", "Запросов оплаты пока нет", "Hələ ödəniş tələbi yoxdur")}</strong>
                  <button className="ow-primary" onClick={() => setTab("new")}>
                    {t("Create the first request", "Создать первый запрос", "İlk tələbi yarat")}
                  </button>
                </div>
              ))}
          </>
        )
      )}
    </section>
  );
}
