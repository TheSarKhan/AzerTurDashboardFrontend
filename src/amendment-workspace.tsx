import OriginalPdfPreview from "./original-pdf-preview";
import { useEffect, useState } from "react";
import { api, type Locale, type BookingRequest } from "./api/client";
import { FinanceWorkspace } from "./finance-workspace";
import type { OfferLine, PublicOffer } from "./offer-types";
import { lineAmount } from "./offer-pricing";
import "./cancellation.css";
import "./amendment.css";
type Tier = {
  fromInclusive: string;
  retainedPercent: string;
  fixedFeeMinor: number;
  feeBasis: string;
};
type Term = {
  serviceKey: string;
  policyText: string;
  supplierReference: string;
  basis: string;
  tiers: Tier[];
  verified: boolean;
};
type Draft = {
  version: number;
  replacementQuoteId: string;
  title: string;
  itinerary: { city: string; description: string }[];
  returnRoute: string;
  services: OfferLine[];
  previousTerms: Term[];
  allocations: { serviceKey: string; amountMinor: number }[];
  message: string;
  internalNote: string;
};
type Saved = {
  version: number;
  payload: string;
  pdf_filename: string | null;
  pdf_sha256: string | null;
  preview_version: number;
};
type Context = {
  bookingId: string;
  bookingStatus: string;
  request: { status: string; created_at: string; message: string };
  customer: { name: string; email: string };
  contract: { id: string; version: number };
  offer: PublicOffer;
  services: PublicOffer["services"];
  paidMinor: number;
  allocationCurrent: boolean;
  allocations: { serviceKey: string; amountMinor: number }[];
  quotePayload: { input: Record<string, unknown> };
  draft: Saved | null;
  versions: { id: string; state: string; draft_version: number }[];
};
type Projection = {
  paidMinor: number;
  retainedMinor: number;
  refundMinor: number;
  appliedMinor: number;
  totalMinor: number;
  remainingMinor: number;
};
const apiRoot = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");
export default function AmendmentWorkspace({
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
  const [c, setC] = useState<Context | null>(null),
    [d, setD] = useState<Draft | null>(null),
    [saved, setSaved] = useState<Saved | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [preview, setPreview] = useState<Projection | null>(null),
    [calculation, setCalculation] = useState<Projection | null>(null),
    [pdf, setPdf] = useState(""),
    [draftPdf, setDraftPdf] = useState(false),
    [finance, setFinance] = useState(false);
  const path = "/api/v1/operations/requests/" + request.id + "/amendment";
  const fmt = (v: number) =>
    new Intl.NumberFormat(l, {
      style: "currency",
      currency: c?.offer.currency || "EUR",
    }).format(v / 100);
  async function load() {
    const ctx = await api<Context>(path, auth);
    setC(ctx);
    setSaved(ctx.draft);
    if (ctx.draft) setD(JSON.parse(ctx.draft.payload));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ roles: string[] }>("/api/v1/operations/me", auth)
      .then((x) =>
        setFinance(
          x.roles.some(
            (r) =>
              r === "FINANCE" ||
              r === "ADMIN" ||
              r === "ROLE_FINANCE" ||
              r === "ROLE_ADMIN",
          ),
        ),
      )
      .catch(() => {});
  }, [request.id, auth]); // eslint-disable-line react-hooks/exhaustive-deps
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
  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf);
    },
    [pdf],
  );
  function edit(p: Partial<Draft>) {
    if (!d) return;
    setD({ ...d, ...p });
    setDirty(true);
    setCalculation(null);
    setPreview(null);
    setReviewed(false);
    setPdf("");
    setNotice("");
  }
  function term(i: number, p: Partial<Term>) {
    if (d)
      edit({
        previousTerms: d.previousTerms.map((v, j) =>
          i === j ? { ...v, ...p } : v,
        ),
      });
  }
  function service(i: number, p: Partial<OfferLine>) {
    if (d)
      edit({
        services: d.services.map((v, j) => (i === j ? { ...v, ...p } : v)),
      });
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(
        (
          {
            CURRENT_ALLOCATION_REQUIRED: t(
              "Save the current payment allocation below, then reload.",
              "Сохраните распределение платежей и обновите.",
              "Əvvəl aşağıda cari ödəniş bölgüsünü saxla, sonra yenilə.",
            ),
            AMENDMENT_SOURCE_CHANGED: t(
              "The booking changed. Reload and prepare a fresh proposal.",
              "Бронирование изменилось. Обновите предложение.",
              "Sifariş dəyişib. Yenilə və təklifi yenidən hazırla.",
            ),
            PAYMENT_ALLOCATION_REQUIRED: t(
              "New service allocations must equal the funds applied after fees and refund.",
              "Проверьте распределение средств по новым услугам.",
              "Yeni xidmətlərə bölgü tutulma və geri qaytarmadan sonra tətbiq edilən məbləğə bərabər olmalıdır.",
            ),
            SERVICE_CHECKS_REQUIRED: t(
              "Confirm suppliers, availability and policies for every new service.",
              "Проверьте поставщиков, доступность и условия всех услуг.",
              "Bütün yeni xidmətlərin təchizatçısını, mövcudluğunu və şərtlərini təsdiqlə.",
            ),
          } as Record<string, string>
        )[code] || code,
      );
    } finally {
      setBusy(false);
    }
  }
  async function openPdf(url: string) {
    const r = await fetch(apiRoot + url, {
      headers: { Authorization: auth },
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("PDF_UNAVAILABLE");
    setPdf(URL.createObjectURL(await r.blob()));
    setDraftPdf(url === path + "/draft/" + saved?.version + "/pdf");
    setReviewed(false);
  }
  const pending = c?.request.status === "PENDING";
  return (
    <section className="amendment-workspace">
      <button
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
      <header>
        <div>
          <p>
            {t(
              "PAID BOOKING AMENDMENT",
              "ИЗМЕНЕНИЕ ОПЛАЧЕННОЙ ПОЕЗДКИ",
              "ÖDƏNİŞLİ SİFARİŞİN DƏYİŞİKLİYİ",
            )}
          </p>
          <h2>
            {t(
              "Booking change proposal",
              "Предложение изменения поездки",
              "Sifarişin dəyişiklik təklifi",
            )}
          </h2>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!c ? (
        <p>{t("Loading…", "Загрузка…", "Yüklənir…")}</p>
      ) : (
        <>
          <article className="amendment-summary">
            <div>
              <h3>{c.customer.name}</h3>
              <p>{c.customer.email}</p>
              <p>{c.request.message}</p>
            </div>
            <div>
              <strong>{c.offer.title}</strong>
              <p>
                {c.offer.date} · {c.offer.travelers}{" "}
                {t("travelers", "туристов", "nəfər")}
              </p>
              <p>
                {t(
                  "Accepted contract",
                  "Принятый договор",
                  "Təsdiqlənmiş müqavilə",
                )}{" "}
                v{c.contract.version}
              </p>
            </div>
            <div>
              <span>
                {t(
                  "Available paid funds",
                  "Доступные оплаченные средства",
                  "Aktiv ödənmiş məbləğ",
                )}
              </span>
              <h3>{fmt(c.paidMinor)}</h3>
            </div>
          </article>
          <p className="notice">
            {t(
              "The existing booking stays effective until the customer accepts this exact PDF and price. Sending a proposal does not charge or refund money.",
              "Текущее бронирование действует до принятия клиентом этого PDF и цены. Отправка не списывает и не возвращает средства.",
              "Müştəri bu PDF və qiyməti təsdiqləyənə qədər mövcud sifariş qüvvədədir. Təklif göndərmək pul tutmur və qaytarmır.",
            )}
          </p>
          {!c.allocationCurrent && (
            <section>
              <FinanceWorkspace
                bookingId={c.bookingId}
                auth={auth}
                locale={l}
                onDirtyChange={onDirtyChange}
              />
              <button disabled={busy} onClick={() => run(load)}>
                {t(
                  "Reload allocation",
                  "Обновить распределение",
                  "Bölgünü yenilə",
                )}
              </button>
            </section>
          )}
          {pending && (
            <form
              className="amendment-block"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const input = {
                    ...c.quotePayload.input,
                    date: f.get("date"),
                    pax: Number(f.get("pax")),
                    hotel: f.get("hotel"),
                    driver: f.has("driver"),
                    stay: f.has("stay"),
                    guide: f.has("guide"),
                    transfer: f.has("transfer"),
                    activity: f.has("activity"),
                    customDays: undefined,
                    cities: undefined,
                  };
                  const route = String(f.get("route"))
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean);
                  const q = await api<{
                    id: string;
                    lines: { label: string; amount: number }[];
                  }>("/api/v1/quotes", auth, {
                    ...input,
                    customDays: route.length,
                    cities: route,
                  });
                  const old = new Map(c.offer.services.map((s) => [s.key, s]));
                  const lines = q.lines.map((s) => {
                    const prior = old.get(s.label);
                    return {
                      key: s.label,
                      name: prior?.name || s.label,
                      quantity: 1,
                      nights: 1,
                      unitPrice: s.amount,
                      unit: (
                        {
                          transport: "day",
                          hotel: "room",
                          guide: "day",
                          transfer: "transfer",
                          activity: "person",
                        } as Record<string, string>
                      )[s.label],
                      supplier: "",
                      location: "",
                      availability: "NOT_CHECKED" as const,
                      policy: prior?.policy || "",
                      internalNote: "",
                    };
                  });
                  setD({
                    version: saved?.version || 0,
                    replacementQuoteId: q.id,
                    title: c.offer.title,
                    itinerary: route.map((city) => ({ city, description: "" })),
                    returnRoute: "",
                    services: lines,
                    previousTerms: c.services.map((s) => ({
                      serviceKey: s.key,
                      policyText: s.policy,
                      supplierReference: "",
                      basis: "",
                      tiers: [],
                      verified: false,
                    })),
                    allocations: lines.map((s) => ({
                      serviceKey: s.key,
                      amountMinor: 0,
                    })),
                    message: "",
                    internalNote: "",
                  });
                  setDirty(true);
                  setCalculation(null);
                  setPreview(null);
                  setReviewed(false);
                  setPdf("");
                });
              }}
            >
              <h3>
                1.{" "}
                {t(
                  "New dates and route",
                  "Новые даты и маршрут",
                  "Yeni tarix və marşrut",
                )}
              </h3>
              <div className="amendment-grid">
                <label>
                  {t("Departure", "Дата выезда", "Başlama tarixi")}
                  <input
                    type="date"
                    name="date"
                    defaultValue={c.offer.date}
                    min={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label>
                  {t("Travelers", "Туристы", "Səyahətçilər")}
                  <input
                    type="number"
                    name="pax"
                    defaultValue={c.offer.travelers}
                    min={1}
                    max={12}
                    required
                  />
                </label>
                <label>
                  {t(
                    "Route, one city per day (comma separated)",
                    "Маршрут: город на день, через запятую",
                    "Marşrut: hər gün üçün şəhər, vergüllə ayır",
                  )}
                  <input
                    name="route"
                    defaultValue={c.offer.itinerary
                      .map((x) => x.city)
                      .join(", ")}
                    required
                  />
                  <small>Baku, Quba, Khinalug, Gabala, Sheki</small>
                </label>
                <label>
                  {t("Hotel category", "Категория отеля", "Otel kateqoriyası")}
                  <select
                    name="hotel"
                    defaultValue={String(
                      c.quotePayload.input.hotel || "comfort",
                    )}
                  >
                    <option value="standard">Standard</option>
                    <option value="comfort">Comfort</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
              </div>
              <div className="amendment-grid">
                {(
                  [
                    [
                      "driver",
                      "Private driver",
                      "Личный водитель",
                      "Şəxsi sürücü",
                    ],
                    ["stay", "Hotel", "Отель", "Otel"],
                    ["guide", "Guide", "Гид", "Gid"],
                    ["transfer", "Transfer", "Трансфер", "Transfer"],
                    ["activity", "Experience", "Впечатление", "Təcrübə"],
                  ] as const
                ).map((x) => (
                  <label className="amendment-check" key={x[0]}>
                    <input
                      type="checkbox"
                      name={x[0]}
                      defaultChecked={
                        c.quotePayload.input[x[0]] !== false &&
                        (x[0] === "driver" ||
                          x[0] === "stay" ||
                          !!c.quotePayload.input[x[0]])
                      }
                    />
                    {t(x[1], x[2], x[3])}
                  </label>
                ))}
              </div>
              <button disabled={busy || !c.allocationCurrent}>
                {t(
                  "Create replacement quote",
                  "Рассчитать новый маршрут",
                  "Yeni qiymət hesabla",
                )}
              </button>
            </form>
          )}
          {d && (
            <fieldset disabled={busy || !pending} className="amendment-editor">
              <section className="amendment-block">
                <h3>
                  2.{" "}
                  {t(
                    "Review existing service terms",
                    "Проверка условий прежних услуг",
                    "Mövcud xidmət şərtlərinin yoxlanması",
                  )}
                </h3>
                <p>
                  {t(
                    "Use supplier-confirmed time bands. No fee is assumed. The request time determines the applicable band.",
                    "Введите подтверждённые поставщиком временные интервалы. Применяется интервал на момент запроса.",
                    "Təchizatçının təsdiqlədiyi vaxt şərtlərini daxil et. Sorğunun verildiyi vaxt uyğun şərti müəyyən edir.",
                  )}
                </p>
                {d.previousTerms.map((v, i) => (
                  <article key={v.serviceKey} className="amendment-service">
                    <h4>
                      {c.services.find((s) => s.key === v.serviceKey)?.name ||
                        v.serviceKey}
                    </h4>
                    <p className="customer-note">{v.policyText}</p>
                    <div className="amendment-grid">
                      <label>
                        {t(
                          "Supplier reference",
                          "Подтверждение поставщика",
                          "Təchizatçı istinadı",
                        )}
                        <input
                          value={v.supplierReference}
                          maxLength={200}
                          onChange={(e) =>
                            term(i, { supplierReference: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t(
                          "Calculation basis (office only)",
                          "Основание расчёта (для офиса)",
                          "Hesablamanın əsası (yalnız ofis)",
                        )}
                        <textarea
                          value={v.basis}
                          maxLength={2000}
                          onChange={(e) => term(i, { basis: e.target.value })}
                        />
                      </label>
                    </div>
                    {v.tiers.map((tier, j) => (
                      <div className="amendment-tier" key={j}>
                        <label>
                          {t(
                            "Applies from (UTC)",
                            "Действует с (UTC)",
                            "Bu vaxtdan etibarən (UTC)",
                          )}
                          <input
                            type="datetime-local"
                            value={tier.fromInclusive.slice(0, 16)}
                            onChange={(e) =>
                              term(i, {
                                tiers: v.tiers.map((x, k) =>
                                  j === k
                                    ? {
                                        ...x,
                                        fromInclusive: e.target.value + ":00Z",
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          {t("Retained %", "Удержание %", "Tutulma %")}
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={tier.retainedPercent}
                            onChange={(e) =>
                              term(i, {
                                tiers: v.tiers.map((x, k) =>
                                  j === k
                                    ? { ...x, retainedPercent: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          {t(
                            "Fixed fee (minor units)",
                            "Фикс. сбор (копейки)",
                            "Sabit tutulma (qəpik)",
                          )}
                          <input
                            type="number"
                            min={0}
                            value={tier.fixedFeeMinor}
                            onChange={(e) =>
                              term(i, {
                                tiers: v.tiers.map((x, k) =>
                                  j === k
                                    ? {
                                        ...x,
                                        fixedFeeMinor: Number(e.target.value),
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          {t(
                            "Percentage basis",
                            "База процента",
                            "Faizin əsası",
                          )}
                          <select
                            value={tier.feeBasis}
                            onChange={(e) =>
                              term(i, {
                                tiers: v.tiers.map((x, k) =>
                                  j === k
                                    ? { ...x, feeBasis: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          >
                            <option value="PAID_AMOUNT">
                              {t(
                                "Paid share",
                                "Оплаченная доля",
                                "Ödənmiş pay",
                              )}
                            </option>
                            <option value="SERVICE_PRICE">
                              {t(
                                "Service price",
                                "Цена услуги",
                                "Xidmətin qiyməti",
                              )}
                            </option>
                          </select>
                        </label>
                        <button
                          onClick={() =>
                            term(i, {
                              tiers: v.tiers.filter((_, k) => k !== j),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        term(i, {
                          tiers: [
                            ...v.tiers,
                            {
                              fromInclusive:
                                c.request.created_at.slice(0, 19) + "Z",
                              retainedPercent: "",
                              fixedFeeMinor: 0,
                              feeBasis: "PAID_AMOUNT",
                            },
                          ],
                        })
                      }
                    >
                      {t(
                        "Add time band",
                        "Добавить интервал",
                        "Vaxt şərti əlavə et",
                      )}
                    </button>
                    <label className="amendment-check">
                      <input
                        type="checkbox"
                        checked={v.verified}
                        onChange={(e) =>
                          term(i, { verified: e.target.checked })
                        }
                      />
                      {t(
                        "Supplier terms checked",
                        "Условия поставщика проверены",
                        "Təchizatçı şərtləri yoxlanılıb",
                      )}
                    </label>
                  </article>
                ))}
              </section>
              <section className="amendment-block">
                <h3>
                  3.{" "}
                  {t(
                    "New services and itinerary",
                    "Новые услуги и маршрут",
                    "Yeni xidmətlər və marşrut",
                  )}
                </h3>
                <label>
                  {t(
                    "Proposal title",
                    "Название предложения",
                    "Təklifin başlığı",
                  )}
                  <input
                    value={d.title}
                    maxLength={160}
                    onChange={(e) => edit({ title: e.target.value })}
                  />
                </label>
                {d.itinerary.map((day, i) => (
                  <label key={i}>
                    {i + 1}. {day.city}
                    <textarea
                      value={day.description}
                      maxLength={1500}
                      onChange={(e) =>
                        edit({
                          itinerary: d.itinerary.map((x, j) =>
                            i === j ? { ...x, description: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  {t("Return route", "Обратный маршрут", "Qayıdış marşrutu")}
                  <input
                    value={d.returnRoute}
                    maxLength={1500}
                    onChange={(e) => edit({ returnRoute: e.target.value })}
                  />
                </label>
                {d.services.map((v, i) => (
                  <article className="amendment-service" key={v.key}>
                    <h4>
                      {v.name} · {fmt(lineAmount(v) * 100)}
                    </h4>
                    <div className="amendment-grid">
                      <label>
                        {t("Name", "Название", "Ad")}
                        <input
                          value={v.name}
                          onChange={(e) => service(i, { name: e.target.value })}
                        />
                      </label>
                      <label>
                        {t("Quantity", "Количество", "Say")}
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={v.quantity}
                          onChange={(e) =>
                            service(i, { quantity: Number(e.target.value) })
                          }
                        />
                      </label>
                      {v.key === "hotel" && (
                        <label>
                          {t("Nights", "Ночи", "Gecələr")}
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={v.nights}
                            onChange={(e) =>
                              service(i, { nights: Number(e.target.value) })
                            }
                          />
                        </label>
                      )}
                      <label>
                        {t("Unit price", "Цена за единицу", "Vahid qiyməti")}
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={v.unitPrice}
                          onChange={(e) =>
                            service(i, { unitPrice: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        {t(
                          "Supplier (office only)",
                          "Поставщик (для офиса)",
                          "Təchizatçı (yalnız ofis)",
                        )}
                        <input
                          value={v.supplier}
                          onChange={(e) =>
                            service(i, { supplier: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Location", "Место", "Məkan")}
                        <input
                          value={v.location}
                          onChange={(e) =>
                            service(i, { location: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Availability", "Доступность", "Mövcudluq")}
                        <select
                          value={v.availability}
                          onChange={(e) =>
                            service(i, {
                              availability: e.target
                                .value as OfferLine["availability"],
                            })
                          }
                        >
                          <option value="NOT_CHECKED">
                            {t("Not checked", "Не проверено", "Yoxlanılmayıb")}
                          </option>
                          <option value="CONFIRMED">
                            {t("Confirmed", "Подтверждено", "Təsdiqlənib")}
                          </option>
                          <option value="UNAVAILABLE">
                            {t("Unavailable", "Недоступно", "Mövcud deyil")}
                          </option>
                        </select>
                      </label>
                      <label>
                        {t(
                          "Paid funds applied (minor units)",
                          "Зачтённая оплата (копейки)",
                          "Tətbiq edilən ödəniş (qəpik)",
                        )}
                        <input
                          type="number"
                          min={0}
                          value={
                            d.allocations.find((a) => a.serviceKey === v.key)
                              ?.amountMinor || 0
                          }
                          onChange={(e) =>
                            edit({
                              allocations: d.allocations.map((a) =>
                                a.serviceKey === v.key
                                  ? {
                                      ...a,
                                      amountMinor: Number(e.target.value),
                                    }
                                  : a,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      {t(
                        "Customer-visible service and cancellation terms",
                        "Условия услуги и отмены для клиента",
                        "Müştəri üçün xidmət və ləğv şərtləri",
                      )}
                      <textarea
                        value={v.policy}
                        onChange={(e) => service(i, { policy: e.target.value })}
                      />
                    </label>
                  </article>
                ))}
                <label>
                  {t(
                    "Customer explanation",
                    "Пояснение для клиента",
                    "Müştəri üçün izah",
                  )}
                  <textarea
                    value={d.message}
                    maxLength={2000}
                    onChange={(e) => edit({ message: e.target.value })}
                  />
                </label>
                <label>
                  {t("Internal note", "Внутренняя заметка", "Daxili qeyd")}
                  <textarea
                    value={d.internalNote}
                    maxLength={4000}
                    onChange={(e) => edit({ internalNote: e.target.value })}
                  />
                </label>
                <button
                  onClick={() =>
                    run(async () =>
                      setCalculation(
                        await api<Projection>(path + "/calculate", auth, d),
                      ),
                    )
                  }
                >
                  {t(
                    "Calculate fees and new balance",
                    "Рассчитать сборы и новый баланс",
                    "Tutulmaları və yeni qalıq məbləği hesabla",
                  )}
                </button>
                {calculation && (
                  <div className="amendment-finance">
                    <div>
                      <span>
                        {t(
                          "Supplier fees",
                          "Сборы поставщиков",
                          "Təchizatçı tutulmaları",
                        )}
                      </span>
                      <strong>{fmt(calculation.retainedMinor)}</strong>
                    </div>
                    <div>
                      <span>
                        {t("Refund due", "К возврату", "Qaytarılacaq")}
                      </span>
                      <strong>{fmt(calculation.refundMinor)}</strong>
                    </div>
                    <div>
                      <span>
                        {t(
                          "Allocate to new services",
                          "Распределить по новым услугам",
                          "Yeni xidmətlərə bölüşdür",
                        )}
                      </span>
                      <strong>{fmt(calculation.appliedMinor)}</strong>
                    </div>
                    <div>
                      <span>
                        {t(
                          "Remaining to pay",
                          "Осталось оплатить",
                          "Qalıq ödəniş",
                        )}
                      </span>
                      <strong>{fmt(calculation.remainingMinor)}</strong>
                    </div>
                    <div>
                      <span>
                        {t(
                          "Currently allocated",
                          "Распределено сейчас",
                          "Hazırda bölüşdürülüb",
                        )}
                      </span>
                      <strong>
                        {fmt(
                          d.allocations.reduce((s, x) => s + x.amountMinor, 0),
                        )}
                      </strong>
                    </div>
                  </div>
                )}
                <button
                  onClick={() =>
                    run(async () => {
                      const row = await api<Saved>(path + "/draft", auth, {
                        ...d,
                        version: saved?.version || 0,
                      });
                      setSaved(row);
                      setD(JSON.parse(row.payload));
                      setDirty(false);
                      setPreview(null);
                      setReviewed(false);
                      setPdf("");
                      setNotice(
                        t(
                          "Draft saved. Upload the PDF for this version.",
                          "Черновик сохранён. Загрузите PDF этой версии.",
                          "Qaralama saxlandı. Bu versiyanın PDF-ini yüklə.",
                        ),
                      );
                    })
                  }
                >
                  {t("Save draft", "Сохранить черновик", "Qaralamanı saxla")}
                </button>
              </section>
              {saved && !dirty && (
                <section className="amendment-block">
                  <h3>
                    4.{" "}
                    {t(
                      "PDF and final review",
                      "PDF и окончательная проверка",
                      "PDF və yekun yoxlama",
                    )}{" "}
                    · v{saved.version}
                  </h3>
                  <label>
                    {t(
                      "Contract PDF (up to 5 MB)",
                      "PDF договора (до 5 МБ)",
                      "Müqavilə PDF-i (5 MB-a qədər)",
                    )}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void run(async () => {
                          const form = new FormData();
                          form.set("version", String(saved.version));
                          form.set("file", file);
                          const r = await fetch(apiRoot + path + "/pdf", {
                            method: "POST",
                            headers: { Authorization: auth },
                            body: form,
                            credentials: "omit",
                            signal: AbortSignal.timeout(20000),
                          });
                          if (!r.ok) {
                            const data = await r.json();
                            throw Error(data.error || "UPLOAD_FAILED");
                          }
                          setSaved(await r.json());
                          setReviewed(false);
                          setPreview(null);
                          setPdf("");
                        });
                      }}
                    />
                  </label>
                  {saved.pdf_sha256 && (
                    <>
                      <p>{saved.pdf_filename}</p>
                      <button
                        onClick={() =>
                          run(() =>
                            openPdf(path + "/draft/" + saved.version + "/pdf"),
                          )
                        }
                      >
                        {t(
                          "Open saved PDF",
                          "Открыть сохранённый PDF",
                          "Saxlanmış PDF-i aç",
                        )}
                      </button>
                      {pdf && draftPdf && (
                        <>
                          <a href={pdf} target="_blank" rel="noreferrer">
                            {t(
                              "Open in new tab",
                              "Открыть в новой вкладке",
                              "Yeni vərəqdə aç",
                            )}
                          </a>
                          <OriginalPdfPreview key={pdf} url={pdf} locale={l}/>
                          <label className="amendment-check">
                            <input
                              type="checkbox"
                              checked={reviewed}
                              onChange={(e) => {
                                setReviewed(e.target.checked);
                                setPreview(null);
                              }}
                            />
                            {t(
                              "I reviewed this exact PDF, route, service policies and price.",
                              "Я проверил этот PDF, маршрут, условия услуг и цену.",
                              "Bu PDF-i, marşrutu, xidmət şərtlərini və qiyməti yoxladım.",
                            )}
                          </label>
                        </>
                      )}
                      <button
                        disabled={!reviewed}
                        onClick={() =>
                          run(async () =>
                            setPreview(
                              await api<Projection>(path + "/preview", auth, {
                                version: saved.version,
                                sha256: saved.pdf_sha256,
                                pdfReviewed: reviewed,
                              }),
                            ),
                          )
                        }
                      >
                        {t(
                          "Validate final amounts",
                          "Проверить итоговые суммы",
                          "Yekun məbləğləri yoxla",
                        )}
                      </button>
                    </>
                  )}
                  {preview && (
                    <>
                      <div className="amendment-finance">
                        {(
                          [
                            [
                              "Available paid funds",
                              "Оплаченные средства",
                              "Ödənmiş məbləğ",
                              preview.paidMinor,
                            ],
                            [
                              "Supplier fees",
                              "Сборы поставщиков",
                              "Təchizatçı tutulmaları",
                              preview.retainedMinor,
                            ],
                            [
                              "Refund due",
                              "К возврату",
                              "Qaytarılacaq",
                              preview.refundMinor,
                            ],
                            [
                              "Applied to new plan",
                              "Зачтено в новый план",
                              "Yeni plana tətbiq edilən",
                              preview.appliedMinor,
                            ],
                            [
                              "New total",
                              "Новая стоимость",
                              "Yeni yekun",
                              preview.totalMinor,
                            ],
                            [
                              "Remaining to pay",
                              "Осталось оплатить",
                              "Qalıq ödəniş",
                              preview.remainingMinor,
                            ],
                          ] as [string, string, string, number][]
                        ).map((x) => (
                          <div key={x[0]}>
                            <span>{t(x[0], x[1], x[2])}</span>
                            <strong>{fmt(x[3])}</strong>
                          </div>
                        ))}
                      </div>
                      <button
                        disabled={!finance}
                        onClick={() =>
                          run(async () => {
                            await api(path + "/send", auth, {
                              version: saved.version,
                              sha256: saved.pdf_sha256,
                              pdfReviewed: reviewed,
                            });
                            setNotice(
                              t(
                                "Proposal sent for customer approval. The current booking remains effective.",
                                "Предложение отправлено клиенту. Текущее бронирование действует.",
                                "Təklif müştərinin təsdiqinə göndərildi. Cari sifariş qüvvədə qalır.",
                              ),
                            );
                            await load();
                            onDone();
                          })
                        }
                      >
                        {t(
                          "Send for customer approval",
                          "Отправить на согласование",
                          "Müştərinin təsdiqinə göndər",
                        )}
                      </button>
                      {!finance && (
                        <p>
                          {t(
                            "Finance permission is required to send.",
                            "Для отправки нужны права финансового сотрудника.",
                            "Göndərmək üçün maliyyə səlahiyyəti lazımdır.",
                          )}
                        </p>
                      )}
                    </>
                  )}
                </section>
              )}
            </fieldset>
          )}
          <section className="amendment-block">
            <h3>
              {t("Proposal history", "История предложений", "Təklif tarixçəsi")}
            </h3>
            {c.versions.map((v) => (
              <div className="security-session" key={v.id}>
                v{v.draft_version} · {v.state}{" "}
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() => openPdf(path + "/versions/" + v.id + "/pdf"))
                  }
                >
                  {t("View PDF", "Открыть PDF", "PDF-ə bax")}
                </button>
              </div>
            ))}
            {!c.versions.length && (
              <p>
                {t(
                  "Nothing sent yet.",
                  "Пока нет предложений.",
                  "Hələ təklif göndərilməyib.",
                )}
              </p>
            )}
            {pdf && (!pending || !draftPdf) && (
              <OriginalPdfPreview key={pdf} url={pdf} locale={l}/>
            )}
          </section>
        </>
      )}
    </section>
  );
}
