import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";
import "./office-management.css";
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
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  onDirtyChange: (v: boolean) => void;
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
  return (
    <section className="om om-finance">
      <div className="om-heading">
        <div>
          <h2>
            {t(
              "Allocate received funds",
              "Распределить полученные средства",
              "Alınmış məbləğin bölgüsü",
            )}
          </h2>
          <p>
            {t(
              "Assign received funds to each contracted service. Open requests are not received funds.",
              "Распределите только полученные средства по услугам.",
              "Yalnız alınmış məbləği müqavilədəki xidmətlərə bölüşdürün.",
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
      {notice && (
        <p role="status" className="om-notice">
          {notice}
        </p>
      )}
      {c?.contractId && (
        <>
          <p>
            {t(
              "Available for active services",
              "Доступно для действующих услуг",
              "Aktiv xidmətlərə bölünəcək məbləğ",
            )}
            : <strong className="om-number">{fmt(c.allocatableMinor)}</strong>
          </p>
          {!finance && (
            <p>
              {t(
                "Finance access is required to change allocations.",
                "Для изменений нужен доступ финансов.",
                "Bölgünü dəyişmək üçün maliyyə icazəsi lazımdır.",
              )}
            </p>
          )}
          {c.allocation && !c.allocationCurrent && (
            <p className="error">
              {t(
                "The saved allocation is outdated. Review it using the current amount and services.",
                "Распределение устарело. Проверьте текущую сумму и услуги.",
                "Saxlanmış bölgü köhnəlib. Cari məbləğ və xidmətlərlə yenidən yoxlayın.",
              )}
            </p>
          )}
          <div className="om-fields">
            {c.services.map((s) => (
              <label key={s.key}>
                {s.name} · {t("Service price", "Цена услуги", "Xidmət qiyməti")}{" "}
                {fmt(s.total * 100)}
                <input
                  type="number"
                  min="0"
                  max={s.total}
                  step=".01"
                  value={shares[s.key] || ""}
                  disabled={!finance || busy}
                  onChange={(e) => {
                    setShares({ ...shares, [s.key]: e.target.value });
                    setDirty(true);
                    setNotice("");
                  }}
                />
              </label>
            ))}
          </div>
          <p>
            {t("Allocated", "Распределено", "Bölünüb")}: {fmt(sum)} ·{" "}
            {t("Unallocated", "Осталось", "Bölünməyib")}:{" "}
            {fmt(c.allocatableMinor - sum)}
          </p>
          <button
            className="om-primary"
            disabled={
              busy ||
              !finance ||
              !dirty ||
              sum !== c.allocatableMinor ||
              c.services.some(
                (s) =>
                  !Number.isFinite(Number(shares[s.key])) ||
                  Number(shares[s.key]) < 0 ||
                  Number(shares[s.key]) > s.total,
              )
            }
            onClick={() => void save()}
          >
            {t("Save allocation", "Сохранить распределение", "Bölgünü saxla")}
          </button>
          {c.cancellationCount > 0 && (
            <div className="om-plan">
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
              <p>
                {t("Revised total", "Обновлённая сумма", "Yeni cəm")}:{" "}
                {fmt(c.services.reduce((s, x) => s + x.total * 100, 0))}
                <br />
                {t(
                  "Received for remaining services",
                  "Получено за оставшиеся услуги",
                  "Qalan xidmətlər üzrə alınıb",
                )}
                : {fmt(c.allocatableMinor)}
                <br />
                {t("Remaining", "Осталось", "Qalıq")}:{" "}
                {fmt(
                  Math.max(
                    0,
                    c.services.reduce((s, x) => s + x.total * 100, 0) -
                      c.allocatableMinor,
                  ),
                )}
              </p>
              {c.plan && (
                <p>
                  {t("Plan", "План", "Plan")} v{c.plan.version} ·{" "}
                  {c.plan.state === "ACCEPTED"
                    ? t(
                        "Accepted by customer",
                        "Принят клиентом",
                        "Müştəri təsdiqləyib",
                      )
                    : c.plan.state === "SENT"
                      ? t(
                          "Awaiting customer acceptance",
                          "Ожидает принятия клиентом",
                          "Müştəri təsdiqi gözlənilir",
                        )
                      : t("Superseded", "Заменён", "Köhnəlib")}
                </p>
              )}
              <button
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
                {t(
                  "Send reviewed plan",
                  "Отправить проверенный план",
                  "Yoxlanmış planı göndər",
                )}
              </button>
            </div>
          )}
        </>
      )}
      {c && !c.contractId && (
        <p>
          {t(
            "Accept the contract before allocating funds.",
            "Сначала примите договор.",
            "Bölgüdən əvvəl müqavilə təsdiqlənməlidir.",
          )}
        </p>
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
