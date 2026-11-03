import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";
import "./payments.css";
type Request = {
  id: string;
  contract_id: string;
  kind: string;
  service_key: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  customer_message: string;
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
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [context, setContext] = useState<Context | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [previewed, setPreviewed] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState(false);
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
      if (s) {
        setDraft(JSON.parse(s.payload));
        setPreviewed(s.preview_version === s.version);
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
    setDirty(true);
    setPreviewed(false);
    setNotice("");
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<Saved>(base + "/payment-draft", auth, draft);
      setDraft(JSON.parse(r.payload));
      setDirty(false);
      setPreviewed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    if (!draft || dirty || draft.version < 1) return;
    setBusy(true);
    setError("");
    try {
      await api(base + "/payment-draft/preview", auth, {
        version: draft.version,
      });
      setPreviewed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!draft || dirty || !previewed) return;
    setBusy(true);
    setError("");
    try {
      const requests = await api<Request[]>(
        base + "/payment-draft/send",
        auth,
        { version: draft.version },
      );
      setContext((c) => (c ? { ...c, requests } : c));
      setSent(true);
      setNotice(
        t(
          "Payment request sent. No funds were collected.",
          "Запрос отправлен. Деньги не списаны.",
          "Ödəniş tələbi göndərildi. Pul tutulmayıb.",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="payment-ops">
      <h2>
        {t(
          "Prepare payment request",
          "Подготовить запрос оплаты",
          "Ödəniş tələbi hazırla",
        )}
      </h2>
      <button disabled={busy || dirty} onClick={() => void load()}>
        {t("Refresh", "Обновить", "Yenilə")}
      </button>
      {error && (
        <p role="alert" className="payment-error">
          {t(
            "Could not complete this action. Check the current contract, pending requests and payment amounts.",
            "Не удалось выполнить действие. Проверьте договор и суммы.",
            "Əməliyyat alınmadı. Cari müqaviləni, sorğuları və məbləği yoxlayın.",
          )}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!context?.contract || !context.offer ? (
        <p>
          {t(
            "An accepted current contract is required before a payment request.",
            "Для запроса нужен действующий принятый договор.",
            "Ödəniş tələbi üçün cari müqavilə təsdiqlənməlidir.",
          )}
        </p>
      ) : (
        draft && (
          <>
            {context.paymentBlocked && (
              <p className="payment-error">
                {t(
                  "A pending request or cancellation requires office review before new payment requests.",
                  "Перед новым запросом требуется проверка офиса.",
                  "Yeni ödəniş tələbindən əvvəl sorğu və ya ləğv üzrə ofis yoxlaması lazımdır.",
                )}
              </p>
            )}
            <div className="payment-grid">
              <div>
                <p>
                  {context.offer.title} · {context.offer.date} ·{" "}
                  {context.offer.travelers} {t("travelers", "чел.", "nəfər")}
                </p>
                <p>
                  {t(
                    "Accepted contract",
                    "Принятый договор",
                    "Təsdiqlənmiş müqavilə",
                  )}{" "}
                  v{context.contract.version} ·{" "}
                  {t("Offer", "Предложение", "Təklif")} v
                  {context.offer.revision}
                </p>
                <h3>
                  {t(
                    "Choose payment request",
                    "Тип запроса",
                    "Ödəniş tələbini seç",
                  )}
                </h3>
                <label>
                  <input
                    type="radio"
                    checked={draft.kind === "DEPOSIT"}
                    onChange={() => edit({ kind: "DEPOSIT", serviceKey: null })}
                  />
                  {t("Deposit", "Депозит", "Beh")}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={draft.kind === "SERVICE"}
                    onChange={() => edit({ kind: "SERVICE", serviceKey: null })}
                  />
                  {t("Service payment", "Оплата услуги", "Xidmət ödənişi")}
                </label>
                {draft.kind === "SERVICE" &&
                  !(context.receivedMinor || context.paidMinor) && (
                    <p className="payment-error">
                      {t(
                        "The deposit must be paid before a service payment request can be sent.",
                        "Перед отправкой запроса на оплату услуги необходимо оплатить депозит.",
                        "Xidmət ödənişi tələbini göndərmək üçün əvvəlcə beh ödənilməlidir.",
                      )}
                    </p>
                  )}
                {draft.kind === "SERVICE" && (
                  <label>
                    {t("Service", "Услуга", "Xidmət")}
                    <select
                      value={draft.serviceKey || ""}
                      onChange={(e) =>
                        edit({ serviceKey: e.target.value || null })
                      }
                    >
                      <option value="">
                        {t("Choose service", "Выберите услугу", "Xidmət seçin")}
                      </option>
                      {context.offer.services.map((s) => (
                        <option value={s.key} key={s.key}>
                          {s.name} · {fmt(s.total * 100)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {t("Amount", "Сумма", "Məbləğ")} ({context.offer.currency})
                  <input
                    type="number"
                    min="0.01"
                    max={context.offer.total}
                    step=".01"
                    value={draft.amount || ""}
                    onChange={(e) => edit({ amount: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {t(
                    "Message to customer (optional)",
                    "Сообщение клиенту",
                    "Müştəriyə mesaj (istəyə bağlı)",
                  )}
                  <textarea
                    maxLength={2000}
                    value={draft.message}
                    onChange={(e) => edit({ message: e.target.value })}
                  />
                </label>
                <h3>
                  {t(
                    "Services in this offer",
                    "Услуги в предложении",
                    "Təklifdəki xidmətlər",
                  )}
                </h3>
                {context.offer.services.map((s) => (
                  <div className="payment-row" key={s.key}>
                    <span>{s.name}</span>
                    <strong>{fmt(s.total * 100)}</strong>
                  </div>
                ))}
              </div>
              <aside>
                <h3>
                  {t("Payment overview", "Обзор оплаты", "Ödəniş xülasəsi")}
                </h3>
                <div className="payment-row">
                  <span>
                    {t("Trip total", "Сумма поездки", "Səfərin cəmi")}
                  </span>
                  <strong>{fmt(context.offer.total * 100)}</strong>
                </div>
                <div className="payment-row">
                  <span>{t("Received", "Получено", "Alınıb")}</span>
                  <strong>{fmt(context.paidMinor)}</strong>
                </div>
                <div className="payment-row">
                  <span>{t("This request", "Этот запрос", "Bu tələb")}</span>
                  <strong>{fmt(Math.round(draft.amount * 100))}</strong>
                </div>
                <p>
                  {t(
                    "A request does not collect money. Epoint is not configured yet.",
                    "Запрос не списывает деньги. Epoint ещё не настроен.",
                    "Tələb pul tutmur. Epoint hələ qoşulmayıb.",
                  )}
                </p>
              </aside>
            </div>
            {previewed && !dirty && (
              <div className="payment-preview">
                <h3>
                  {t(
                    "Customer preview",
                    "Просмотр клиента",
                    "Müştərinin görəcəyi",
                  )}
                </h3>
                <p>
                  {draft.kind === "DEPOSIT"
                    ? t("Deposit", "Депозит", "Beh")
                    : t("Service payment", "Оплата услуги", "Xidmət ödənişi")}
                  : <strong>{fmt(Math.round(draft.amount * 100))}</strong>
                </p>
                <p>{draft.message}</p>
                <p>
                  {t(
                    "The customer sees this as a payment request, not a completed payment.",
                    "Клиент увидит запрос, а не завершённый платёж.",
                    "Müştəri bunu tamamlanmış ödəniş deyil, ödəniş tələbi kimi görəcək.",
                  )}
                </p>
              </div>
            )}
            <div className="payment-actions">
              <button
                disabled={
                  busy ||
                  !dirty ||
                  !draft.amount ||
                  (draft.kind === "SERVICE" && !draft.serviceKey)
                }
                onClick={() => void save()}
              >
                {t("Save draft", "Сохранить черновик", "Qaralamanı saxla")}
              </button>
              <button
                disabled={busy || dirty || !draft.version}
                onClick={() => void preview()}
              >
                {t(
                  "Preview as customer",
                  "Просмотр клиента",
                  "Müştəri kimi bax",
                )}
              </button>
              <button
                className="payment-primary"
                disabled={
                  busy ||
                  dirty ||
                  !previewed ||
                  sent ||
                  context.paymentBlocked ||
                  (draft.kind === "SERVICE" &&
                    !(context.receivedMinor || context.paidMinor))
                }
                onClick={() => void send()}
              >
                {t(
                  "Send payment request",
                  "Отправить запрос",
                  "Ödəniş tələbini göndər",
                )}
              </button>
            </div>
            <h3>
              {t("Payment requests", "Запросы оплаты", "Ödəniş tələbləri")}
            </h3>
            {context.requests.length ? (
              context.requests.map((r) => (
                <div className="payment-row" key={r.id}>
                  <span>
                    {r.kind === "DEPOSIT"
                      ? t("Deposit", "Депозит", "Beh")
                      : r.service_key}{" "}
                    ·{" "}
                    {r.contract_id !== context.contract?.id
                      ? t(
                          "Outdated contract",
                          "Устаревший договор",
                          "Köhnə müqavilə",
                        )
                      : r.status}
                  </span>
                  <strong>{fmt(r.amount_minor)}</strong>
                </div>
              ))
            ) : (
              <p>
                {t(
                  "No requests yet.",
                  "Запросов пока нет.",
                  "Hələ ödəniş tələbi yoxdur.",
                )}
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
