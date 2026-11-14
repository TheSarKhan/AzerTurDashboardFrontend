import { useEffect, useState, type ReactNode } from "react";
import {
  BedDouble,
  Bus,
  Car,
  Check,
  CircleCheck,
  Flower2,
  Landmark,
  Lock,
  Plane,
  RefreshCw,
  Send,
  Users,
  Wand2,
  Wallet,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import "./office-management.css";
import "./finance-workspace.css";
const SERVICE_ICON: Record<string, ReactNode> = {
  transport: <Car size={20} />,
  hotel: <BedDouble size={20} />,
  guide: <Users size={20} />,
  transfer: <Plane size={20} />,
  intercity: <Bus size={20} />,
  activity: <Flower2 size={20} />,
};
type Service = { key: string; name: string; total: number };
type Plan = { id: string; version: number; payload: string; state: string };
type Context = {
  contractId: string | null;
  offer: { currency: string };
  services: Service[];
  allocatableMinor: number;
  allocation: { version: number; payload: string } | null;
  allocationCurrent: boolean;
  cancellationCount: number;
  plan: Plan | null;
};
export function FinanceWorkspace({
  bookingId,
  auth,
  locale: l,
  onDirtyChange,
  onOpenPayments,
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  onDirtyChange: (v: boolean) => void;
  /** Opens the payments page, shown when no money has been received yet. */
  onOpenPayments?: () => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [c, setC] = useState<Context | null>(null),
    [shares, setShares] = useState<Record<string, string>>({}),
    [finance, setFinance] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const base = "/api/v1/operations/bookings/" + bookingId;
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
  function hydrate(data: Context) {
    setC(data);
    const saved: { serviceKey: string; amountMinor: number }[] = data.allocation
      ? JSON.parse(data.allocation.payload)
      : [];
    setShares(
      Object.fromEntries(
        data.services.map((s) => [
          s.key,
          String(
            (saved.find((x) => x.serviceKey === s.key)?.amountMinor || 0) / 100,
          ),
        ]),
      ),
    );
    setDirty(false);
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      const [data, me] = await Promise.all([
        api<Context>(base + "/allocation", auth),
        api<{ roles: string[] }>("/api/v1/operations/me", auth),
      ]);
      hydrate(data);
      setFinance(me.roles.includes("ROLE_FINANCE"));
    } catch {
      setError(
        t(
          "Could not load allocations. An accepted contract is required.",
          "Не удалось загрузить распределение. Нужен принятый договор.",
          "Bölgü yüklənmədi. Təsdiqlənmiş müqavilə lazımdır.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [bookingId, auth]);
  const sum =
    c?.services.reduce(
      (total, s) => total + Math.round(Number(shares[s.key] || 0) * 100),
      0,
    ) || 0;
  const fmt = (n: number) =>
    new Intl.NumberFormat(l, {
      style: "currency",
      currency: c?.offer.currency || "EUR",
    }).format(n / 100);
  async function save() {
    if (!c?.contractId) return;
    setBusy(true);
    setError("");
    try {
      hydrate(
        await api<Context>(base + "/allocation", auth, {
          version: c.allocation?.version || 0,
          contractId: c.contractId,
          expectedPaidMinor: c.allocatableMinor,
          lines: c.services.map((s) => ({
            serviceKey: s.key,
            amountMinor: Math.round(Number(shares[s.key] || 0) * 100),
          })),
        }),
      );
      setNotice(
        t("Allocation saved.", "Распределение сохранено.", "Bölgü saxlanıldı."),
      );
    } catch {
      setError(
        t(
          "Could not save. The received amount, contract or allocation may have changed. Refresh before retrying.",
          "Не удалось сохранить. Обновите договор и полученную сумму.",
          "Saxlanmadı. Alınmış məbləğ, müqavilə və ya bölgü dəyişmiş ola bilər. Yeniləyin.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const allocatable = c?.allocatableMinor ?? 0;
  const left = allocatable - sum;
  const rowValid = (svc: Service) =>
    Number.isFinite(Number(shares[svc.key] || 0)) &&
    Number(shares[svc.key] || 0) >= 0 &&
    Number(shares[svc.key] || 0) <= svc.total;
  const allValid = !!c && c.services.every(rowValid);
  const setShare = (key: string, value: string) => {
    setShares({ ...shares, [key]: value });
    setDirty(true);
    setNotice("");
  };
  /** Gives each service a share of the received money in proportion to its price. */
  function autoSplit() {
    if (!c || !c.services.length) return;
    const caps = c.services.map((x) => Math.round(x.total * 100));
    const totalCap = caps.reduce((a, b) => a + b, 0) || 1;
    const out = caps.map((cap) => Math.min(cap, Math.floor((allocatable * cap) / totalCap)));
    let rest = allocatable - out.reduce((a, b) => a + b, 0);
    for (let i = 0; rest > 0 && i < out.length; i++) {
      const add = Math.min(rest, caps[i] - out[i]);
      out[i] += add;
      rest -= add;
    }
    setShares(Object.fromEntries(c.services.map((x, i) => [x.key, String(out[i] / 100)])));
    setDirty(true);
    setNotice("");
  }
  function fillRest(svc: Service) {
    const current = Math.round(Number(shares[svc.key] || 0) * 100);
    const room = Math.round(svc.total * 100) - current;
    const add = Math.max(0, Math.min(room, left));
    setShare(svc.key, String((current + add) / 100));
  }
  const saveHint = !finance
    ? t("Only finance staff can change the split.", "Менять распределение может финансовый сотрудник.", "Bölgünü yalnız maliyyə işçisi dəyişə bilər.")
    : !allValid
      ? t("Check the amounts: each must be between zero and the service price.", "Проверьте суммы: от нуля до цены услуги.", "Məbləğləri yoxlayın: hər biri sıfırla xidmət qiyməti arasında olmalıdır.")
      : left > 0
        ? t(`${fmt(left)} is still unallocated.`, `Не распределено ${fmt(left)}.`, `${fmt(left)} hələ bölünməyib.`)
        : left < 0
          ? t(`${fmt(-left)} too much is allocated.`, `Распределено больше на ${fmt(-left)}.`, `${fmt(-left)} artıq bölünüb.`)
          : !dirty
            ? t("The split is saved.", "Распределение сохранено.", "Bölgü saxlanılıb.")
            : t("Everything adds up. Save the split.", "Всё сходится. Сохраните.", "Hər şey düzgündür. Bölgünü saxlayın.");
  return (
    <section className="om om-finance fw">
      <div className="fw-head">
        <span className="fw-icon">
          <Landmark size={24} aria-hidden="true" />
        </span>
        <div>
          <h2>{t("Funds by service", "Средства по услугам", "Məbləğin bölgüsü")}</h2>
          <p>
            {t(
              "Show which service each received payment covers. Only money that has arrived counts, not open requests.",
              "Покажите, какую услугу покрывает полученная оплата. Считаются только поступившие деньги.",
              "Daxil olan pulun hansı xidməti ödədiyini göstərin. Yalnız daxil olmuş pul sayılır, açıq tələblər yox.",
            )}
          </p>
        </div>
        <button
          className="fw-refresh"
          disabled={busy}
          onClick={() => {
            if (
              dirty &&
              !window.confirm(
                t(
                  "Discard what you typed and reload?",
                  "Отменить введённое и обновить?",
                  "Yazdıqlarınız silinib səhifə yenilənsin?",
                ),
              )
            )
              return;
            void load();
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t("Refresh", "Обновить", "Yenilə")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="fw-notice">
          <CircleCheck size={18} aria-hidden="true" />
          {notice}
        </p>
      )}
      {c?.contractId && allocatable === 0 && (
        <div className="fw-empty">
          <Wallet size={34} aria-hidden="true" />
          <strong>{t("No money has been received yet", "Деньги ещё не поступали", "Hələ pul daxil olmayıb")}</strong>
          <span>
            {t(
              "Once a payment is recorded as received, you can split it between the services here.",
              "Когда оплата будет записана как полученная, её можно распределить здесь.",
              "Ödəniş daxil olmuş kimi qeyd ediləndən sonra onu burada xidmətlər arasında bölə bilərsiniz.",
            )}
          </span>
          {onOpenPayments && (
            <button className="ow-primary" onClick={onOpenPayments}>
              {t("Go to Payments", "Перейти к платежам", "Ödənişlərə keç")}
            </button>
          )}
        </div>
      )}
      {c?.contractId && allocatable > 0 && (
        <>
          <div className="fw-stats">
            <div>
              <small>{t("Received", "Получено", "Daxil olub")}</small>
              <strong>{fmt(allocatable)}</strong>
            </div>
            <div>
              <small>{t("Allocated", "Распределено", "Bölünüb")}</small>
              <strong>{fmt(sum)}</strong>
            </div>
            <div className={left === 0 ? "ok" : "todo"}>
              <small>{t("Unallocated", "Осталось", "Bölünməyib")}</small>
              <strong>{fmt(left)}</strong>
            </div>
          </div>
          <div
            className={"fw-bar" + (left === 0 ? " ok" : left < 0 ? " over" : "")}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round((sum / allocatable) * 100))}
          >
            <span style={{ width: Math.min(100, (sum / allocatable) * 100) + "%" }} />
          </div>
          {!finance && (
            <p className="fw-lock">
              <Lock size={16} aria-hidden="true" />
              {t(
                "Finance access is required to change the split. You can view it here.",
                "Для изменений нужен доступ финансов. Здесь можно только смотреть.",
                "Bölgünü dəyişmək üçün maliyyə icazəsi lazımdır. Burada yalnız baxa bilərsiniz.",
              )}
            </p>
          )}
          {c.allocation && !c.allocationCurrent && (
            <p className="fw-warn" role="alert">
              {t(
                "The saved split is outdated. Review it using the current amount and services.",
                "Распределение устарело. Проверьте текущую сумму и услуги.",
                "Saxlanmış bölgü köhnəlib. Cari məbləğ və xidmətlərlə yenidən yoxlayın.",
              )}
            </p>
          )}
          {finance && (
            <div className="fw-tools">
              <button className="fw-link" disabled={busy} onClick={autoSplit}>
                <Wand2 size={15} aria-hidden="true" />
                {t("Split in proportion to prices", "Разделить пропорционально ценам", "Qiymətlərə mütənasib böl")}
              </button>
              <button
                className="fw-link"
                disabled={busy}
                onClick={() => {
                  setShares(Object.fromEntries(c.services.map((x) => [x.key, "0"])));
                  setDirty(true);
                  setNotice("");
                }}
              >
                {t("Clear all", "Очистить всё", "Hamısını sıfırla")}
              </button>
            </div>
          )}
          <div className="fw-rows">
            {c.services.map((svc) => {
              const value = Number(shares[svc.key] || 0);
              const pct = svc.total > 0 ? Math.min(100, (value / svc.total) * 100) : 0;
              const full = Math.round(value * 100) === Math.round(svc.total * 100);
              return (
                <div className={"fw-row" + (rowValid(svc) ? "" : " bad")} key={svc.key}>
                  <span className="fw-row-icon">{SERVICE_ICON[svc.key.split("-")[0]] ?? <Flower2 size={20} />}</span>
                  <div className="fw-row-name">
                    <strong>{svc.name}</strong>
                    <small>
                      {t("Price", "Цена", "Qiymət")} {fmt(svc.total * 100)}
                      {full ? ", " + t("fully covered", "покрыто полностью", "tam ödənilir") : ""}
                    </small>
                    <div className={"fw-mini" + (full ? " ok" : "")}>
                      <span style={{ width: pct + "%" }} />
                    </div>
                  </div>
                  <label className="fw-amount">
                    <span className="sr-only">{svc.name}</span>
                    <input
                      type="number"
                      min="0"
                      max={svc.total}
                      step=".01"
                      inputMode="decimal"
                      value={shares[svc.key] || ""}
                      disabled={!finance || busy}
                      onChange={(e) => setShare(svc.key, e.target.value)}
                    />
                    <em>{c.offer.currency}</em>
                  </label>
                  {finance && (
                    <button
                      className="fw-link"
                      disabled={busy || left <= 0 || full}
                      onClick={() => fillRest(svc)}
                      title={t("Put the unallocated money here", "Положить сюда остаток", "Bölünməyən məbləği bura yaz")}
                    >
                      {t("Add the rest", "Добавить остаток", "Qalanı yaz")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="fw-foot">
            <button
              className="ow-primary fw-save"
              disabled={busy || !finance || !dirty || left !== 0 || !allValid}
              onClick={() => void save()}
            >
              <Check size={18} aria-hidden="true" />
              {t("Save the split", "Сохранить распределение", "Bölgünü saxla")}
            </button>
            <span className="fw-hint" role="status">
              {saveHint}
            </span>
          </div>
          {c.cancellationCount > 0 && (
            <div className="fw-plan">
              <h3>
                {t(
                  "Revised payment plan",
                  "Обновлённый план оплаты",
                  "Yenilənmiş ödəniş planı",
                )}
              </h3>
              <p>
                {t(
                  "Review the remaining services after cancellation. Sending this plan cancels old open payment requests. The customer must accept it before new requests.",
                  "Проверьте оставшиеся услуги. Отправка отменит старые неоплаченные запросы. Клиент должен принять план.",
                  "Ləğvdən sonra qalan xidmətləri yoxlayın. Plan göndəriləndə köhnə açıq ödəniş tələbləri bağlanır. Yeni tələbdən əvvəl müştəri planı təsdiqləməlidir.",
                )}
              </p>
              <dl className="fw-stats">
                <div>
                  <small>{t("Revised total", "Обновлённая сумма", "Yeni cəm")}</small>
                  <strong>{fmt(c.services.reduce((s, x) => s + x.total * 100, 0))}</strong>
                </div>
                <div>
                  <small>{t("Received for remaining services", "Получено за оставшиеся услуги", "Qalan xidmətlər üzrə alınıb")}</small>
                  <strong>{fmt(c.allocatableMinor)}</strong>
                </div>
                <div>
                  <small>{t("Remaining", "Осталось", "Qalıq")}</small>
                  <strong>
                    {fmt(
                      Math.max(
                        0,
                        c.services.reduce((s, x) => s + x.total * 100, 0) -
                          c.allocatableMinor,
                      ),
                    )}
                  </strong>
                </div>
              </dl>
              {c.plan && (
                <p className="fw-plan-state">
                  {t("Plan", "План", "Plan")} v{c.plan.version},{" "}
                  {c.plan.state === "ACCEPTED"
                    ? t("Accepted by customer", "Принят клиентом", "Müştəri təsdiqləyib")
                    : c.plan.state === "SENT"
                      ? t("Awaiting customer acceptance", "Ожидает принятия клиентом", "Müştəri təsdiqi gözlənilir")
                      : t("Superseded", "Заменён", "Köhnəlib")}
                </p>
              )}
              <button
                className="ow-outline fw-send"
                disabled={
                  busy ||
                  !finance ||
                  dirty ||
                  !c.allocationCurrent ||
                  c.services.length === 0 ||
                  (!!c.plan && c.plan.state !== "SUPERSEDED")
                }
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(base + "/revised-plan", auth, {
                      allocationVersion: c.allocation!.version,
                    });
                    await load();
                    setNotice(
                      t(
                        "Revised plan sent for customer acceptance.",
                        "План отправлен клиенту.",
                        "Yenilənmiş plan müştəri təsdiqinə göndərildi.",
                      ),
                    );
                  } catch {
                    setError(
                      t(
                        "Could not send the plan. Resolve pending requests and review the current allocation.",
                        "Не удалось отправить. Проверьте запросы и распределение.",
                        "Plan göndərilmədi. Açıq sorğuları və cari bölgünü yoxlayın.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Send size={16} aria-hidden="true" />
                {t("Send reviewed plan", "Отправить проверенный план", "Yoxlanmış planı göndər")}
              </button>
            </div>
          )}
        </>
      )}
      {c && !c.contractId && (
        <div className="fw-empty">
          <Lock size={34} aria-hidden="true" />
          <strong>{t("The contract is not accepted yet", "Договор ещё не принят", "Müqavilə hələ təsdiqlənməyib")}</strong>
          <span>
            {t(
              "Funds can be allocated after the customer accepts the contract.",
              "Распределять средства можно после принятия договора клиентом.",
              "Müştəri müqaviləni təsdiqlədikdən sonra məbləği bölmək olar.",
            )}
          </span>
        </div>
      )}
    </section>
  );
}

type Refund = {
  request_id: string;
  kind?: string;
  booking_id: string;
  payload: string;
  version: number | null;
  state: string | null;
  external_reference: string | null;
  customer_message: string | null;
};
export function RefundWorkspace({
  auth,
  locale: l,
  onDirtyChange,
}: {
  auth: string;
  locale: Locale;
  onDirtyChange: (v: boolean) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [rows, setRows] = useState<Refund[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [finance, setFinance] = useState(false),
    [selected, setSelected] = useState<Refund | null>(null),
    [dirty, setDirty] = useState(false);
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
  async function load() {
    setBusy(true);
    try {
      const [r, me] = await Promise.all([
        api<Refund[]>("/api/v1/operations/refunds", auth),
        api<{ roles: string[] }>("/api/v1/operations/me", auth),
      ]);
      setRows(r);
      setFinance(me.roles.includes("ROLE_FINANCE"));
    } catch {
      setError(
        t(
          "Could not load refund tracking.",
          "Не удалось загрузить возвраты.",
          "Geri ödənişlər yüklənmədi.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [auth]);
  const labels: Record<string, string> = {
    PENDING: t("Pending", "Ожидает", "Gözlənilir"),
    PROCESSING: t("Processing", "В обработке", "İcradadır"),
    COMPLETED_MANUAL: t(
      "Office recorded transfer",
      "Перевод отмечен офисом",
      "Ofis köçürməni qeyd edib",
    ),
    FAILED: t("Failed", "Ошибка", "Uğursuz"),
    UNKNOWN: t("Result unknown", "Результат неизвестен", "Nəticə bilinmir"),
  };
  function pick(r: Refund | null) {
    if (
      dirty &&
      !window.confirm(
        t(
          "Discard unsaved changes?",
          "Отменить изменения?",
          "Saxlanmamış dəyişikliklər silinsin?",
        ),
      )
    )
      return;
    setSelected(r);
    setDirty(false);
  }
  return (
    <section className="om">
      <div className="om-heading">
        <div>
          <h2>
            {t(
              "Refund tracking",
              "Учёт возвратов",
              "Geri qaytarılmanın izlənməsi",
            )}
          </h2>
          <p>
            {t(
              "Approved cancellation and change refunds, with transfer tracking.",
              "Одобренные суммы и состояние возврата средств.",
              "Təsdiqlənmiş ləğv və dəyişiklik geri ödənişləri, köçürmələrin izlənməsi.",
            )}
          </p>
        </div>
        <button disabled={busy || dirty} onClick={() => void load()}>
          {t("Refresh", "Обновить", "Yenilə")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="om-info">
        {t(
          "A manual completion requires a transfer reference and staff verification. It records the office report; bank confirmation is separate.",
          "Для ручного завершения нужны номер перевода и проверка сотрудника. Банковская проверка отдельно.",
          "Manual tamamlanma üçün köçürmə nömrəsi və əməkdaş yoxlaması lazımdır. Qeyd ofisin məlumatını bildirir; bank təsdiqi ayrıdır.",
        )}
      </p>
      {rows.map((r) => {
        const p = JSON.parse(r.payload);
        return (
          <article className="om-refund" key={r.request_id}>
            <h3>#{r.booking_id.slice(0, 8)}</h3>
            <p>
              {r.kind === "CHANGE"
                ? t(
                    "Booking change",
                    "Изменение поездки",
                    "Sifariş dəyişikliyi",
                  )
                : t("Cancellation", "Отмена", "Ləğv")}
            </p>
            <p className="om-number">
              {new Intl.NumberFormat(l, {
                style: "currency",
                currency: p.currency,
              }).format(p.refundMinor / 100)}
            </p>
            <p>{labels[r.state || "PENDING"]}</p>
            {r.customer_message && <p>{r.customer_message}</p>}
            <button
              disabled={!finance || r.state === "COMPLETED_MANUAL"}
              onClick={() => pick(r)}
            >
              {t("Update tracking", "Обновить статус", "Vəziyyəti yenilə")}
            </button>
          </article>
        );
      })}
      {!rows.length && (
        <p>
          {t(
            "No approved refunds to track yet.",
            "Пока нет одобренных возвратов.",
            "Hələ izlənəcək təsdiqlənmiş geri ödəniş yoxdur.",
          )}
        </p>
      )}
      {selected && (
        <form
          className="om-editor"
          key={selected.request_id + ":" + selected.version}
          onChange={() => setDirty(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api(
                "/api/v1/operations/refunds/" + selected.request_id,
                auth,
                {
                  version: selected.version || 0,
                  state: String(f.get("state")),
                  reference: String(f.get("reference") || ""),
                  customerMessage: String(f.get("message") || ""),
                  manualTransferVerified: f.has("verified"),
                },
              );
              setDirty(false);
              setSelected(null);
              await load();
            } catch {
              setError(
                t(
                  "Could not update. Check transfer evidence and refresh the latest state.",
                  "Не удалось обновить. Проверьте подтверждение перевода и текущий статус.",
                  "Yenilənmədi. Köçürmə sübutunu və cari vəziyyəti yoxlayın.",
                ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="om-fields">
            <label>
              {t("New state", "Новый статус", "Yeni vəziyyət")}
              <select name="state">
                {(["PENDING", "FAILED"].includes(selected.state || "PENDING")
                  ? ["PROCESSING", "UNKNOWN"]
                  : ["COMPLETED_MANUAL", "FAILED", "UNKNOWN"]
                ).map((x) => (
                  <option key={x} value={x}>
                    {labels[x]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Transfer reference", "Номер перевода", "Köçürmə nömrəsi")}
              <input
                name="reference"
                maxLength={200}
                defaultValue={selected.external_reference || ""}
              />
            </label>
            <label>
              {t(
                "Message visible to customer",
                "Сообщение клиенту",
                "Müştəriyə görünən mesaj",
              )}
              <textarea
                name="message"
                maxLength={2000}
                defaultValue={selected.customer_message || ""}
              />
            </label>
            <label className="om-check">
              <input type="checkbox" name="verified" />
              {t(
                "I verified the manual transfer evidence",
                "Я проверил подтверждение ручного перевода",
                "Manual köçürmənin sübutunu yoxladım",
              )}
            </label>
          </div>
          <div className="om-actions">
            <button className="om-primary" disabled={busy || !dirty}>
              {t("Save tracking", "Сохранить статус", "Vəziyyəti saxla")}
            </button>
            <button type="button" onClick={() => pick(null)}>
              {t("Close", "Закрыть", "Bağla")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
