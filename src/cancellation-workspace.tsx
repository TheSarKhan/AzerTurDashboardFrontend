import { useEffect, useState } from "react";
import { Car, BedDouble, Users, Plane, Flower2 } from "lucide-react";
import { api, type Locale, type BookingRequest } from "./api/client";
import "./cancellation.css";
type Tier = {
  fromInclusive: string;
  retainedPercent: string;
  fixedFeeMinor: number;
  feeBasis: string;
};
type Line = {
  serviceKey: string;
  supplierReference: string;
  policyText: string;
  basis: string;
  allocatedPaidMinor: number;
  tiers: Tier[];
  verified: boolean;
};
type Service = { key: string; name: string; total: number; policy: string };
type Context = {
  savedAllocation?: { serviceKey: string; amountMinor: number }[];
  customer?: { name: string; email: string; locale: string };
  contractVersion: number;
  contractId: string | null;
  paidMinor: number;
  allocatableMinor: number;
  serviceKeys: string[];
  reason: string;
  services: Service[];
  offer: {
    title: string;
    currency: string;
    date: string;
    travelers: number;
    services: Service[];
  };
  request: { created_at: string; message: string; status: string };
};
type Saved = {
  version: number;
  state: string;
  payload: string;
  customer_explanation: string;
  internal_note: string;
};
type Calculation = {
  serviceKey: string;
  policyText: string;
  cancelled?: boolean;
  calculation: {
    paidMinor: number;
    retainedMinor: number;
    refundMinor: number;
  };
  supplierReference: string;
  basis: string;
  rules: Tier[];
};
export default function CancellationWorkspace({
  request,
  auth,
  locale: l,
  onBack,
  onDone,
  onDirtyChange,
}: {
  request: BookingRequest;
  auth: string;
  locale: Locale;
  onBack: () => void;
  onDone: () => void;
  onDirtyChange: (v: boolean) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [context, setContext] = useState<Context | null>(null),
    [saved, setSaved] = useState<Saved | null>(null),
    [lines, setLines] = useState<Line[]>([]),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [explanation, setExplanation] = useState(""),
    [internal, setInternal] = useState("");
  const serviceNames: Record<string, string> = {
    transport: t(
      "Private car & driver",
      "Авто с водителем",
      "Şəxsi avtomobil və sürücü",
    ),
    hotel: t("Comfort stay", "Проживание", "Oteldə qalma"),
    guide: t("Local guide", "Местный гид", "Yerli gid"),
    transfer: t("Airport transfer", "Трансфер", "Hava limanı transferi"),
    activity: t(
      "Local craft experience",
      "Местное впечатление",
      "Yerli təcrübə",
    ),
  };
  const serviceIcons: Record<string, typeof Car> = {
    transport: Car,
    hotel: BedDouble,
    guide: Users,
    transfer: Plane,
    activity: Flower2,
  };
  const path =
    "/api/v1/operations/requests/" + request.id + "/cancellation-assessment";
  const fmt = (n: number) =>
    new Intl.NumberFormat(l === "az" ? "az-AZ" : l, {
      style: "currency",
      currency: context?.offer.currency || "EUR",
    }).format(n / 100);
  const date = (s: string) =>
    new Date(s).toLocaleString(l === "az" ? "az-AZ" : l);
  function problem(e: unknown) {
    const code = e instanceof Error ? e.message : "";
    return (
      (
        {
          STALE_ASSESSMENT: t(
            "Another employee changed this assessment. Reload before continuing.",
            "Расчёт изменён. Обновите страницу.",
            "Başqa əməkdaş hesablamanı dəyişib. Səhifəni yeniləyin.",
          ),
          ACCEPTED_CONTRACT_REQUIRED: t(
            "An accepted contract is needed for a policy-based assessment.",
            "Нужен принятый договор.",
            "Hesablama üçün təsdiqlənmiş müqavilə lazımdır.",
          ),
          PAYMENT_ALLOCATION_REQUIRED: t(
            "Allocate exactly the available received payment across all active services.",
            "Распределите всю полученную сумму.",
            "Mövcud ödənişi aktiv xidmətlər arasında tam bölüşdürün.",
          ),
          STALE_CONTRACT: t(
            "The contract changed. Reload.",
            "Договор изменился.",
            "Müqavilə dəyişib. Yeniləyin.",
          ),
        } as Record<string, string>
      )[code] ||
      t(
        "Could not complete the action. Check the saved state and retry.",
        "Не удалось выполнить действие. Проверьте данные.",
        "Əməliyyat alınmadı. Məlumatları yoxlayıb yenidən cəhd edin.",
      )
    );
  }
  async function load() {
    setError("");
    setBusy(true);
    try {
      const [c, s] = await Promise.all([
        api<Context>(
          "/api/v1/operations/requests/" + request.id + "/cancellation-context",
          auth,
        ),
        api<Saved | null>(path, auth),
      ]);
      setContext(c);
      setSaved(s);
      setExplanation(s?.customer_explanation || "");
      setInternal(s?.internal_note || "");
      if (s) {
        const p = JSON.parse(s.payload);
        if (s.state === "APPROVED")
          setContext({ ...c, allocatableMinor: p.paidMinor });
        setLines(
          p.lines.map((x: Calculation) => ({
            serviceKey: x.serviceKey,
            policyText: x.policyText,
            supplierReference: x.supplierReference,
            basis: x.basis,
            allocatedPaidMinor: x.calculation.paidMinor,
            tiers: x.rules.map((r: Tier) => ({
              ...r,
              retainedPercent: String(r.retainedPercent),
            })),
            verified: true,
          })),
        );
      } else
        setLines(
          c.services.map((s) => ({
            serviceKey: s.key,
            policyText: s.policy,
            supplierReference: "",
            basis: "",
            allocatedPaidMinor:
              c.savedAllocation?.find((x) => x.serviceKey === s.key)
                ?.amountMinor || 0,
            tiers: [],
            verified: false,
          })),
        );
      setDirty(false);
      setPreview(false);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [request.id]);
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
  const selected = (key: string) => {
    if (saved?.state === "APPROVED") {
      const x = JSON.parse(saved.payload).lines.find(
        (v: Calculation) => v.serviceKey === key,
      );
      return x?.cancelled !== false;
    }
    return !context?.serviceKeys?.length || context.serviceKeys.includes(key);
  };
  function edit(index: number, values: Partial<Line>) {
    setLines((old) =>
      old.map((x, i) =>
        i === index
          ? { ...x, ...values, verified: values.verified ?? false }
          : x,
      ),
    );
    setDirty(true);
    setPreview(false);
  }
  function moneyInput(value: string): number {
    if (!/^\d*(\.\d{0,2})?$/.test(value)) return NaN;
    const [a, b = ""] = value.split(".");
    return Number(BigInt(a || "0") * 100n + BigInt((b + "00").slice(0, 2)));
  }
  function estimate(line: Line) {
    if (!selected(line.serviceKey)) return { fee: 0, refund: 0, covered: true };
    const rule = line.tiers
      .filter(
        (r) =>
          r.fromInclusive &&
          new Date(r.fromInclusive).getTime() <=
            new Date(context!.request.created_at).getTime(),
      )
      .sort(
        (a, b) => Date.parse(b.fromInclusive) - Date.parse(a.fromInclusive),
      )[0];
    if (
      !rule ||
      !/^\d+(\.\d{1,6})?$/.test(rule.retainedPercent) ||
      Number(rule.retainedPercent) > 100 ||
      !["PAID_AMOUNT", "SERVICE_PRICE"].includes(rule.feeBasis)
    )
      return { fee: 0, refund: 0, covered: false };
    const [a, b = ""] = rule.retainedPercent.split(".");
    const scale = 10n ** BigInt(b.length),
      percent = BigInt(a) * scale + BigInt(b || "0");
    const price =
      context!.offer.services.find((s) => s.key === line.serviceKey)!.total *
      100;
    const base = BigInt(
      rule.feeBasis === "SERVICE_PRICE" ? price : line.allocatedPaidMinor,
    );
    const denominator = 100n * scale;
    const fee = Math.min(
      line.allocatedPaidMinor,
      Number((base * percent + denominator / 2n) / denominator) +
        rule.fixedFeeMinor,
    );
    return { fee, refund: line.allocatedPaidMinor - fee, covered: true };
  }
  const readonly =
    saved?.state === "APPROVED" || context?.request.status !== "PENDING";
  const allocated = lines.reduce((sum, x) => sum + x.allocatedPaidMinor, 0);
  const calculated = lines.map((x) =>
    context ? estimate(x) : { fee: 0, refund: 0, covered: false },
  );
  const refund = calculated.reduce((sum, x) => sum + x.refund, 0),
    fee = calculated.reduce((sum, x) => sum + x.fee, 0);
  const verified = lines.every(
    (x, i) =>
      !selected(x.serviceKey) ||
      (x.verified &&
        x.supplierReference.trim() &&
        x.basis.trim() &&
        calculated[i].covered),
  );
  const ready =
    !!context &&
    allocated === context.allocatableMinor &&
    verified &&
    lines.every(
      (x) =>
        Number.isSafeInteger(x.allocatedPaidMinor) && x.allocatedPaidMinor >= 0,
    ) &&
    !!explanation.trim();
  async function save() {
    if (!context || !ready) return;
    setBusy(true);
    setError("");
    try {
      setSaved(
        await api<Saved>(path, auth, {
          version: saved?.version || 0,
          contractId: context.contractId,
          lines: lines.map((x) => ({
            ...x,
            tiers: x.tiers.map((r) => ({
              ...r,
              retainedPercent: Number(r.retainedPercent),
            })),
            supplierReference: x.supplierReference || "Not cancelled",
            basis: x.basis || "Not cancelled",
          })),
          customerExplanation: explanation,
          internalNote: internal,
        }),
      );
      setDirty(false);
      setPreview(false);
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!saved || dirty || !preview) return;
    setBusy(true);
    setError("");
    try {
      setSaved(
        await api<Saved>(path + "/approve", auth, { version: saved.version }),
      );
      setDirty(false);
      onDone();
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }
  if (context && !context.contractId)
    return (
      <section className="cancel-ops">
        <button className="cancel-link" onClick={onBack}>
          {t(
            "← Customer requests",
            "← Запросы клиентов",
            "← Müştəri sorğuları",
          )}
        </button>
        <h1>
          {t("Review cancellation", "Проверить отмену", "Ləğv sorğusunu yoxla")}
        </h1>
        <p>{request.message}</p>
        {error && (
          <p className="cancel-error" role="alert">
            {error}
          </p>
        )}
        <p>
          {t(
            "No accepted contract or received payment. There is no refund to calculate.",
            "Нет принятого договора или полученной оплаты. Возврат рассчитывать не требуется.",
            "Təsdiqlənmiş müqavilə və qəbul olunmuş ödəniş yoxdur. Geri ödəniş hesablanmır.",
          )}
        </p>
        {context.request.status === "PENDING" ? (
          <>
            <label>
              {t("Response to customer", "Ответ клиенту", "Müştəriyə cavab")}
              <textarea
                minLength={3}
                maxLength={2000}
                value={explanation}
                onChange={(e) => {
                  setExplanation(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            {[true, false].map((approve) => (
              <button
                key={String(approve)}
                disabled={busy || explanation.trim().length < 3}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(
                      "/api/v1/operations/requests/" + request.id + "/resolve",
                      auth,
                      { approve, note: explanation },
                    );
                    setDirty(false);
                    onDone();
                    await load();
                  } catch (e) {
                    setError(problem(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {approve
                  ? t(
                      "Approve cancellation",
                      "Одобрить отмену",
                      "Ləğvi təsdiqlə",
                    )
                  : t("Decline request", "Отклонить", "Sorğunu rədd et")}
              </button>
            ))}
          </>
        ) : (
          <p>
            {t("Decision recorded", "Решение сохранено", "Qərar qeydə alınıb")}
          </p>
        )}
      </section>
    );
  return (
    <section className="cancel-ops">
      <button
        className="cancel-link"
        onClick={() => {
          if (
            !dirty ||
            window.confirm(
              t(
                "Discard unsaved changes?",
                "Отменить изменения?",
                "Saxlanmamış dəyişikliklər silinsin?",
              ),
            )
          )
            onBack();
        }}
      >
        {t("← Customer requests", "← Запросы клиентов", "← Müştəri sorğuları")}
      </button>
      <div className="cancel-heading">
        <div>
          <h1>
            {t(
              "Review cancellation",
              "Проверить отмену",
              "Ləğv sorğusunu yoxla",
            )}
          </h1>
          <p>
            #{request.bookingId.slice(0, 8)} · {date(request.createdAt)}
          </p>
        </div>
        <button disabled={busy || dirty} onClick={() => void load()}>
          {t("Refresh", "Обновить", "Yenilə")}
        </button>
      </div>
      {error && (
        <p role="alert" className="cancel-error">
          {error}
        </p>
      )}
      {!context && (
        <p>
          {busy
            ? t("Loading…", "Загрузка…", "Yüklənir…")
            : t(
                "No assessment context available.",
                "Нет данных для расчёта.",
                "Hesablama məlumatları mövcud deyil.",
              )}
        </p>
      )}
      {context && (
        <>
          <div className="cancel-trip">
            <strong>
              {context.customer?.name} · {context.offer.title}
            </strong>
            <span>
              {context.offer.date} · {context.offer.travelers}{" "}
              {t("travelers", "чел.", "nəfər")}
            </span>
            <p>
              {context.customer?.email} ·{" "}
              {context.customer?.locale.toUpperCase()} ·{" "}
              {t("Contract", "Договор", "Müqavilə")} v{context.contractVersion}
            </p>
            <p>{request.message}</p>
          </div>
          <ol className="cancel-steps">
            <li>{t("Check terms", "Проверить условия", "Şərtləri yoxla")}</li>
            <li>
              {t("Review calculation", "Проверить расчёт", "Hesablamaya bax")}
            </li>
            <li>{t("Approve plan", "Утвердить план", "Planı təsdiqlə")}</li>
          </ol>
          <div className="cancel-ops-grid">
            <div>
              <h2>
                {t(
                  "01 · Allocate received payments",
                  "01 · Распределить оплату",
                  "01 · Ödənişi xidmətlərə böl",
                )}
              </h2>
              <div className="cancel-allocation">
                <strong>{fmt(context.allocatableMinor)}</strong>
                <span>
                  {t(
                    "Available to allocate",
                    "Доступно для распределения",
                    "Bölüşdürülə bilən məbləğ",
                  )}
                </span>
                <p>
                  {t("Allocated", "Распределено", "Bölüşdürülüb")}:{" "}
                  {fmt(allocated)} / {fmt(context.allocatableMinor)}
                </p>
              </div>
              <div className="cancel-lines">
                {lines.map((line, i) => {
                  const service = context.offer.services.find(
                    (s) => s.key === line.serviceKey,
                  )!;
                  const est = calculated[i];
                  const Icon = serviceIcons[line.serviceKey] || Car;
                  return (
                    <details
                      key={line.serviceKey}
                      open={undefined}
                      className={
                        selected(line.serviceKey) ? "" : "cancel-unaffected"
                      }
                    >
                      <summary>
                        <Icon size={24} />
                        <strong>
                          {serviceNames[line.serviceKey] || service.name}
                        </strong>
                        <span>
                          {selected(line.serviceKey)
                            ? t("Cancel", "Отменить", "Ləğv")
                            : t("Keep service", "Сохранить", "Xidmət qalır")}
                        </span>
                        <span>
                          {fmt(line.allocatedPaidMinor)} → {fmt(est.refund)}
                        </span>
                      </summary>
                      <fieldset disabled={busy || readonly}>
                        <label>
                          {t(
                            "Allocated payment",
                            "Выделенная оплата",
                            "Ödənmiş pay",
                          )}{" "}
                          ({context.offer.currency})
                          <input
                            aria-label={
                              (serviceNames[line.serviceKey] || service.name) +
                              " " +
                              t("allocated payment", "оплата", "ödənmiş pay")
                            }
                            type="number"
                            min="0"
                            max={service.total}
                            step=".01"
                            value={line.allocatedPaidMinor / 100}
                            onChange={(e) => {
                              const n = moneyInput(e.target.value);
                              if (Number.isSafeInteger(n))
                                edit(i, { allocatedPaidMinor: n });
                            }}
                          />
                        </label>
                        {selected(line.serviceKey) && (
                          <>
                            <label>
                              {t(
                                "Supplier reference",
                                "Поставщик / договор",
                                "Təchizatçı / müqavilə",
                              )}
                              <input
                                value={line.supplierReference}
                                maxLength={200}
                                onChange={(e) =>
                                  edit(i, { supplierReference: e.target.value })
                                }
                              />
                            </label>
                            <h3>
                              {t(
                                "Agreed cancellation terms",
                                "Согласованные условия",
                                "Razılaşdırılmış ləğv şərtləri",
                              )}
                            </h3>
                            <p className="cancel-policy">{line.policyText}</p>
                            <p>
                              {t(
                                "Request time",
                                "Время запроса",
                                "Sorğunun vaxtı",
                              )}
                              : {date(context.request.created_at)}
                            </p>
                            {line.tiers.map((rule, j) => (
                              <div className="cancel-rule" key={j}>
                                <label>
                                  {t(
                                    "Applies from (local time)",
                                    "Действует с (местное время)",
                                    "Bu vaxtdan tətbiq olunur (yerli vaxt)",
                                  )}
                                  <input
                                    type="datetime-local"
                                    value={
                                      rule.fromInclusive
                                        ? new Date(
                                            Date.parse(rule.fromInclusive) -
                                              new Date(
                                                rule.fromInclusive,
                                              ).getTimezoneOffset() *
                                                60000,
                                          )
                                            .toISOString()
                                            .slice(0, 16)
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const tiers = [...line.tiers];
                                      tiers[j] = {
                                        ...rule,
                                        fromInclusive: e.target.value
                                          ? new Date(
                                              e.target.value,
                                            ).toISOString()
                                          : "",
                                      };
                                      edit(i, { tiers });
                                    }}
                                  />
                                </label>
                                <label>
                                  {t(
                                    "Fee basis",
                                    "База штрафа",
                                    "Cərimənin əsası",
                                  )}
                                  <select
                                    value={rule.feeBasis}
                                    onChange={(e) => {
                                      const tiers = [...line.tiers];
                                      tiers[j] = {
                                        ...rule,
                                        feeBasis: e.target.value,
                                      };
                                      edit(i, { tiers });
                                    }}
                                  >
                                    <option value="">
                                      {t("Choose", "Выбрать", "Seç")}
                                    </option>
                                    <option value="PAID_AMOUNT">
                                      {t(
                                        "Allocated payment",
                                        "Выделенная оплата",
                                        "Ödənmiş pay",
                                      )}
                                    </option>
                                    <option value="SERVICE_PRICE">
                                      {t(
                                        "Full service price",
                                        "Полная цена услуги",
                                        "Xidmətin tam qiyməti",
                                      )}
                                    </option>
                                  </select>
                                </label>
                                <label>
                                  {t(
                                    "Retained (%)",
                                    "Удержание (%)",
                                    "Saxlanılan (%)",
                                  )}
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step=".000001"
                                    value={rule.retainedPercent}
                                    onChange={(e) => {
                                      const tiers = [...line.tiers];
                                      tiers[j] = {
                                        ...rule,
                                        retainedPercent: e.target.value,
                                      };
                                      edit(i, { tiers });
                                    }}
                                  />
                                </label>
                                <label>
                                  {t(
                                    "Fixed fee",
                                    "Фиксированный сбор",
                                    "Sabit cərimə",
                                  )}
                                  <input
                                    type="number"
                                    min="0"
                                    step=".01"
                                    value={rule.fixedFeeMinor / 100}
                                    onChange={(e) => {
                                      const n = moneyInput(e.target.value);
                                      if (Number.isSafeInteger(n)) {
                                        const tiers = [...line.tiers];
                                        tiers[j] = {
                                          ...rule,
                                          fixedFeeMinor: n,
                                        };
                                        edit(i, { tiers });
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    edit(i, {
                                      tiers: line.tiers.filter(
                                        (_, k) => k !== j,
                                      ),
                                    })
                                  }
                                >
                                  {t(
                                    "Remove band",
                                    "Удалить период",
                                    "Vaxt qaydasını sil",
                                  )}
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                edit(i, {
                                  tiers: [
                                    ...line.tiers,
                                    {
                                      fromInclusive: "",
                                      retainedPercent: "",
                                      fixedFeeMinor: 0,
                                      feeBasis: "",
                                    },
                                  ],
                                })
                              }
                            >
                              {t(
                                "Add time band",
                                "Добавить период",
                                "Vaxt qaydası əlavə et",
                              )}
                            </button>
                            <label>
                              {t(
                                "Rule explanation",
                                "Обоснование",
                                "Qaydanın izahı",
                              )}
                              <textarea
                                maxLength={2000}
                                value={line.basis}
                                onChange={(e) =>
                                  edit(i, { basis: e.target.value })
                                }
                              />
                            </label>
                            <p>
                              {est.covered
                                ? t("Retained", "Удержано", "Saxlanılan") +
                                  ": " +
                                  fmt(est.fee) +
                                  " · " +
                                  t("Refund", "Возврат", "Geri qaytarılacaq") +
                                  ": " +
                                  fmt(est.refund)
                                : t(
                                    "Add the applicable supplier rule; no default is assumed.",
                                    "Добавьте применимое правило поставщика.",
                                    "Tətbiq olunan qaydanı əlavə edin; standart faiz qəbul edilmir.",
                                  )}
                            </p>
                            <label className="cancel-check">
                              <input
                                type="checkbox"
                                checked={line.verified}
                                onChange={(e) =>
                                  edit(i, { verified: e.target.checked })
                                }
                              />
                              {t(
                                "Verified against supplier terms",
                                "Проверено по условиям поставщика",
                                "Təchizatçının şərtlərinə əsasən yoxlanılıb",
                              )}
                            </label>
                          </>
                        )}
                      </fieldset>
                    </details>
                  );
                })}
              </div>
              <label>
                {t(
                  "Customer explanation",
                  "Объяснение клиенту",
                  "Müştəriyə izah",
                )}
                <textarea
                  disabled={busy || readonly}
                  value={explanation}
                  maxLength={2000}
                  onChange={(e) => {
                    setExplanation(e.target.value);
                    setDirty(true);
                    setPreview(false);
                  }}
                />
              </label>
              <label>
                {t(
                  "Internal notes · staff only",
                  "Внутренние заметки",
                  "Daxili qeydlər · yalnız əməkdaşlar",
                )}
                <textarea
                  disabled={busy || readonly}
                  value={internal}
                  maxLength={4000}
                  onChange={(e) => {
                    setInternal(e.target.value);
                    setDirty(true);
                    setPreview(false);
                  }}
                />
              </label>
            </div>
            <aside>
              <h2>
                {t("Cancellation summary", "Итог отмены", "Ləğv xülasəsi")}
              </h2>
              <dl>
                <dt>
                  {t(
                    "Proposed refund",
                    "Предлагаемый возврат",
                    "Təklif olunan geri ödəniş",
                  )}
                </dt>
                <dd>{fmt(refund)}</dd>
                <dt>{t("Retained", "Удержано", "Saxlanılan")}</dt>
                <dd>{fmt(fee)}</dd>
                <dt>{t("Allocated", "Распределено", "Bölüşdürülüb")}</dt>
                <dd>{fmt(allocated)}</dd>
              </dl>
              <p>
                {verified
                  ? t(
                      "Supplier checks complete",
                      "Проверка завершена",
                      "Şərtlər yoxlanılıb",
                    )
                  : t(
                      "Supplier checks remain",
                      "Нужна проверка поставщиков",
                      "Şərtlərin yoxlanması qalıb",
                    )}
              </p>
              <p>
                {t(
                  "Approving this plan does not transfer money.",
                  "Утверждение плана не переводит деньги.",
                  "Planın təsdiqi pul köçürmür.",
                )}
              </p>
              {saved && (
                <p>
                  {dirty
                    ? t(
                        "Unsaved changes",
                        "Несохранённые изменения",
                        "Saxlanmamış dəyişikliklər",
                      )
                    : saved.state === "APPROVED"
                      ? t(
                          "Cancellation approved · refund pending",
                          "Отмена одобрена · возврат ожидается",
                          "Ləğv təsdiqlənib · geri ödəniş gözləyir",
                        )
                      : t(
                          "Saved assessment",
                          "Расчёт сохранён",
                          "Hesablama saxlanılıb",
                        )}{" "}
                  · v{saved.version}
                </p>
              )}
            </aside>
          </div>
          {preview && saved && (
            <section className="cancel-preview">
              <h2>
                {t(
                  "Customer preview",
                  "Предпросмотр клиента",
                  "Müştərinin görəcəyi xülasə",
                )}
              </h2>
              <p>{saved.customer_explanation}</p>
              {JSON.parse(saved.payload)
                .lines.filter((x: Calculation) => x.cancelled !== false)
                .map((x: Calculation) => (
                  <p key={x.serviceKey}>
                    {serviceNames[x.serviceKey] ||
                      context.offer.services.find((s) => s.key === x.serviceKey)
                        ?.name}{" "}
                    — {fmt(x.calculation.paidMinor)} /{" "}
                    {fmt(x.calculation.retainedMinor)} /{" "}
                    {fmt(x.calculation.refundMinor)}
                  </p>
                ))}
              <p>
                {t(
                  "Paid / retained / refund due. Transfer not completed.",
                  "Оплачено / удержано / возврат. Перевод не выполнен.",
                  "Ödənilib / saxlanılır / qaytarılacaq. Pul köçürülməyib.",
                )}
              </p>
            </section>
          )}
          {!readonly && (
            <footer className="cancel-actions">
              <button
                disabled={busy || explanation.trim().length < 3}
                onClick={async () => {
                  if (
                    !window.confirm(
                      t(
                        "Decline this cancellation request?",
                        "Отклонить запрос отмены?",
                        "Ləğv sorğusu rədd edilsin?",
                      ),
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await api(
                      "/api/v1/operations/requests/" + request.id + "/resolve",
                      auth,
                      { approve: false, note: explanation },
                    );
                    setDirty(false);
                    onDone();
                    await load();
                  } catch (e) {
                    setError(problem(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Decline request", "Отклонить запрос", "Sorğunu rədd et")}
              </button>
              <button
                disabled={busy || !ready || (!dirty && !!saved)}
                onClick={() => void save()}
              >
                {t("Save assessment", "Сохранить расчёт", "Hesablamanı saxla")}
              </button>
              <button
                disabled={busy || dirty || !saved}
                onClick={() => setPreview(true)}
              >
                {t(
                  "Preview customer summary",
                  "Предпросмотр клиента",
                  "Müştəri xülasəsinə bax",
                )}
              </button>
              <button
                className="cancel-primary"
                disabled={busy || dirty || !saved || !preview || !ready}
                onClick={() => void approve()}
              >
                {t(
                  "Approve cancellation plan",
                  "Утвердить отмену",
                  "Ləğv planını təsdiqlə",
                )}
              </button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
