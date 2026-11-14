import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  FileText,
  MessageSquare,
  RotateCcw,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import { formatDay } from "./dates";
import "./overview-dashboard.css";

type Period = 7 | 30 | 90 | 365;
type Point = { day: string; n: number };
type Money = { day: string; amount: number };
type Dashboard = {
  days: number;
  requests: {
    created: number;
    created_prev: number;
    confirmed: number;
    confirmed_prev: number;
    lost: number;
    lost_prev: number;
  };
  statuses: Record<string, number>;
  requestSeries: Point[];
  topTours: { title: string; n: number }[];
  customers: {
    total: number;
    created: number;
    created_prev: number;
    repeat: number;
  };
  messages: { created: number; created_prev: number; open: number };
  attention: {
    unassigned: number;
    changeRequests: number;
    refunds: number;
    messages: number;
  };
  finance: null | {
    totals: {
      received: number;
      received_prev: number;
      payments: number;
      payments_prev: number;
    };
    open: { n: number; amount: number };
    byCurrency: Record<string, number>;
    methods: { method: string; n: number; amount: number }[];
    series: Money[];
  };
};

const PERIODS: Period[] = [7, 30, 90, 365];

/** Groups a daily series into at most ~30 columns so a year stays readable. */
function bucket<T extends { day: string }>(
  rows: T[],
  value: (r: T) => number,
): { from: string; to: string; value: number }[] {
  const size = Math.max(1, Math.ceil(rows.length / 30));
  const out: { from: string; to: string; value: number }[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    out.push({
      from: part[0].day,
      to: part[part.length - 1].day,
      value: part.reduce((sum, r) => sum + value(r), 0),
    });
  }
  return out;
}

/** 0, 1 000, 12 400 … (full below 10 000, compact above). */
function compact(n: number) {
  if (Math.abs(n) >= 10000)
    return (n / 1000).toLocaleString("en", { maximumFractionDigits: 1 }) + "K";
  return Math.round(n).toLocaleString("en").replace(/,/g, " ");
}

/** Whole, round tick steps: at most five intervals (0, 2, 4, 6, 8, 10). */
function niceScale(max: number) {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= rough) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

/** Whole amount with a thin gap between thousands: 18 450. */
function full(n: number) {
  return Math.round(n).toLocaleString("en").replace(/,/g, "\u00a0");
}

const shortDate = (day: string, _locale?: Locale) => formatDay(day);

function Delta({
  now,
  before,
  goodWhenUp = true,
  t,
}: {
  now: number;
  before: number;
  goodWhenUp?: boolean;
  t: (en: string, ru: string, az: string) => string;
}) {
  if (now === before)
    return (
      <span className="ov-delta">
        {t("same as before", "как раньше", "əvvəlki kimi")}
      </span>
    );
  if (before === 0)
    return (
      <span className="ov-delta">
        {t("new this period", "новое за период", "bu dövrdə yeni")}
      </span>
    );
  const change = Math.round(((now - before) / before) * 100);
  const up = change > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={"ov-delta " + (good ? "good" : "bad")}>
      <Icon size={14} aria-hidden="true" />
      {(up ? "+" : "") + change}%
      <small>
        {t("vs previous period", "к прошлому периоду", "əvvəlki dövrə görə")}
      </small>
    </span>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="ov-tile">
      <p>
        <Icon size={16} aria-hidden="true" />
        {label}
      </p>
      <strong>{value}</strong>
      {children}
    </article>
  );
}

type Tip = { x: number; y: number; title: string; value: string } | null;

/** One series over time: line with a light area wash, crosshair and one tooltip. */
function TrendChart({
  rows,
  unit,
  color,
  locale,
  label,
  format,
}: {
  rows: { from: string; to: string; value: number }[];
  unit: string;
  color: string;
  locale: Locale;
  label: string;
  format: (n: number) => string;
}) {
  const W = 640,
    H = 220,
    L = 44,
    R = 16,
    T = 12,
    B = 28;
  const { top: max, step } = niceScale(
    Math.max(...rows.map((r) => r.value), 0),
  );
  const x = (i: number) =>
    rows.length === 1
      ? (L + W - R) / 2
      : L + (i * (W - L - R)) / (rows.length - 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const line = rows
    .map(
      (r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(rows.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const ticks = Array.from(
    { length: Math.round(max / step) + 1 },
    (_, i) => i * step,
  );
  const labelEvery = Math.max(1, Math.ceil(rows.length / 5));
  function nearest(clientX: number) {
    const box = svg.current!.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    rows.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    return best;
  }
  const last = rows.length - 1;
  const active = hover ?? null;
  const tipRow = active === null ? null : rows[active];
  return (
    <div className="ov-chart-wrap">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerMove={(e) => setHover(nearest(e.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="ov-grid"
              x1={L}
              x2={W - R}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="ov-axis"
              x={L - 8}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {compact(tick)}
            </text>
          </g>
        ))}
        {rows.map((r, i) =>
          i % labelEvery === 0 || i === last ? (
            <text
              key={r.from}
              className="ov-axis"
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
            >
              {shortDate(r.from, locale)}
            </text>
          ) : null,
        )}
        <path d={area} fill={color} opacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {active !== null && (
          <line
            className="ov-cross"
            x1={x(active)}
            x2={x(active)}
            y1={T}
            y2={H - B}
          />
        )}
        {/* the end of the line carries the one direct label */}
        <circle
          cx={x(last)}
          cy={y(rows[last].value)}
          r={4}
          fill={color}
          className="ov-dot"
        />
        {active !== null && (
          <circle
            cx={x(active)}
            cy={y(rows[active].value)}
            r={4}
            fill={color}
            className="ov-dot"
          />
        )}
      </svg>
      {tipRow && active !== null && (
        <div
          className="ov-tip"
          style={{
            left: `${(x(active) / W) * 100}%`,
            transform:
              active > rows.length / 2 ? "translateX(-100%)" : "translateX(0)",
          }}
          role="status"
        >
          <strong>
            {format(tipRow.value)} <small>{unit}</small>
          </strong>
          <span>
            {tipRow.from === tipRow.to
              ? shortDate(tipRow.from, locale)
              : shortDate(tipRow.from, locale) +
                " – " +
                shortDate(tipRow.to, locale)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Magnitude per category as horizontal bars, value at the tip. */
function BarList({
  rows,
  color,
  empty,
  format = (n: number) => String(n),
}: {
  rows: { label: string; value: number; hint?: string }[];
  color: string;
  empty: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length || max === 0) return <p className="ov-empty">{empty}</p>;
  return (
    <ul className="ov-bars">
      {rows.map((r) => (
        <li
          key={r.label}
          title={
            r.hint ? `${r.label}: ${r.hint}` : `${r.label}: ${format(r.value)}`
          }
        >
          <span className="ov-bar-label">{r.label}</span>
          <span className="ov-bar-track">
            <span
              className="ov-bar-fill"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                background: color,
              }}
            />
          </span>
          <b>{format(r.value)}</b>
        </li>
      ))}
    </ul>
  );
}

export function OverviewDashboard({
  auth,
  locale,
  onNavigate,
  onError,
}: {
  auth: string;
  locale: Locale;
  onNavigate: (view: string) => void;
  onError: (message: string) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  const [days, setDays] = useState<Period>(30),
    [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<Dashboard>("/api/v1/operations/dashboard?days=" + days, auth)
      .then((d) => {
        if (!active) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        onError(
          t(
            "Could not load the statistics. Try again.",
            "Не удалось загрузить статистику. Повторите.",
            "Statistika yüklənmədi. Yenidən yoxlayın.",
          ),
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [auth, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestRows = useMemo(
    () => (data ? bucket(data.requestSeries, (r) => r.n) : []),
    [data],
  );
  const moneyRows = useMemo(
    () => (data?.finance ? bucket(data.finance.series, (r) => r.amount) : []),
    [data],
  );
  const statusNames: Record<string, string> = {
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
  const methodNames: Record<string, string> = {
    BANK_TRANSFER: t("Bank transfer", "Банковский перевод", "Bank köçürməsi"),
    CASH: t("Cash", "Наличные", "Nağd"),
    CARD_TERMINAL: t("Card terminal", "Терминал", "Kart terminalı"),
    OTHER: t("Other", "Другое", "Digər"),
  };
  const periodLabel = (p: Period) =>
    p === 365 ? t("Year", "Год", "İl") : t(`${p} days`, `${p} дн.`, `${p} gün`);
  const azn = (n: number) => full(n) + " ₼";

  if (!data)
    return (
      <section className="ov" aria-busy={loading}>
        <p className="ov-empty">
          {failed
            ? t(
                "The statistics are unavailable.",
                "Статистика недоступна.",
                "Statistika əlçatan deyil.",
              )
            : t("Loading…", "Загрузка…", "Yüklənir…")}
        </p>
      </section>
    );

  const r = data.requests,
    conversion = r.created ? Math.round((r.confirmed / r.created) * 100) : 0,
    conversionPrev = r.created_prev
      ? Math.round((r.confirmed_prev / r.created_prev) * 100)
      : 0;
  const attention = [
    {
      key: "unassigned",
      icon: FileText,
      n: data.attention.unassigned,
      view: "Bookings",
      text: t(
        "Requests nobody has taken yet",
        "Заявки без ответственного",
        "Heç kimə təyin olunmamış sorğular",
      ),
    },
    {
      key: "changes",
      icon: RotateCcw,
      n: data.attention.changeRequests,
      view: "Requests",
      text: t(
        "Change or cancellation requests",
        "Запросы на изменение или отмену",
        "Dəyişiklik və ləğv sorğuları",
      ),
    },
  ];
  const waiting = attention.filter((a) => a.n > 0);
  const f = data.finance;
  const statusRows = Object.keys(statusNames).map((k) => ({
    label: statusNames[k],
    value: data.statuses[k] ?? 0,
  }));

  return (
    <section className="ov" aria-busy={loading}>
      <div
        className="ov-filters"
        role="group"
        aria-label={t("Period", "Период", "Dövr")}
      >
        <span>{t("Period", "Период", "Dövr")}</span>
        {PERIODS.map((p) => (
          <button key={p} aria-pressed={days === p} onClick={() => setDays(p)}>
            {periodLabel(p)}
          </button>
        ))}
      </div>

      <div className={"ov-body" + (loading ? " loading" : "")}>
        <div className={"ov-tiles" + (data.finance ? " six" : "")}>
          <Tile
            icon={FileText}
            label={t("New requests", "Новые заявки", "Yeni sorğular")}
            value={String(r.created)}
          >
            <Delta now={r.created} before={r.created_prev} t={t} />
          </Tile>
          <Tile
            icon={CalendarCheck}
            label={t("Confirmed", "Подтверждено", "Təsdiqlənib")}
            value={String(r.confirmed)}
          >
            <span className="ov-delta">
              {t(
                `${conversion}% of new requests`,
                `${conversion}% от новых заявок`,
                `yeni sorğuların ${conversion}%-i`,
              )}
            </span>
            <Delta now={conversion} before={conversionPrev} t={t} />
          </Tile>
          <Tile
            icon={XCircle}
            label={t(
              "Rejected or cancelled",
              "Отклонено или отменено",
              "Rədd və ya ləğv",
            )}
            value={String(r.lost)}
          >
            <Delta now={r.lost} before={r.lost_prev} goodWhenUp={false} t={t} />
          </Tile>
          <Tile
            icon={UserPlus}
            label={t("New customers", "Новые клиенты", "Yeni müştərilər")}
            value={String(data.customers.created)}
          >
            <Delta
              now={data.customers.created}
              before={data.customers.created_prev}
              t={t}
            />
          </Tile>
          {f && (
            <>
              <Tile
                icon={Banknote}
                label={t(
                  "Payments received",
                  "Получено платежей",
                  "Alınan ödənişlər",
                )}
                value={azn(f.totals.received)}
              >
                <Delta
                  now={f.totals.received}
                  before={f.totals.received_prev}
                  t={t}
                />
              </Tile>
              <Tile
                icon={Banknote}
                label={t(
                  "Awaiting payment",
                  "Ожидает оплаты",
                  "Gözlənilən ödənişlər",
                )}
                value={azn(f.open.amount)}
              >
                <span className="ov-delta">
                  {t(
                    `${f.open.n} open requests`,
                    `${f.open.n} открытых запросов`,
                    `${f.open.n} açıq sorğu`,
                  )}
                </span>
              </Tile>
            </>
          )}
        </div>

        <div className="ov-grid-2">
          <section className="ov-card">
            <h2>
              {t(
                "Requests over time",
                "Заявки по времени",
                "Zamana görə sorğular",
              )}
            </h2>
            <p className="ov-sub">
              {t(
                "New requests per period",
                "Новые заявки за период",
                "Dövr üzrə yeni sorğular",
              )}
            </p>
            <TrendChart
              rows={requestRows}
              unit={t("requests", "заявок", "sorğu")}
              color="var(--ov-requests)"
              locale={locale}
              label={t(
                "Line chart of new requests over time",
                "График новых заявок",
                "Yeni sorğuların zaman qrafiki",
              )}
              format={(n) => String(n)}
            />
            <details className="ov-table">
              <summary>
                {t("Show as table", "Показать таблицей", "Cədvəl kimi göstər")}
              </summary>
              <table>
                <thead>
                  <tr>
                    <th>{t("Date", "Дата", "Tarix")}</th>
                    <th>{t("Requests", "Заявки", "Sorğular")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requestRows.map((row) => (
                    <tr key={row.from}>
                      <td>
                        {row.from === row.to
                          ? shortDate(row.from, locale)
                          : shortDate(row.from, locale) +
                            " – " +
                            shortDate(row.to, locale)}
                      </td>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <section className="ov-card">
            <h2>
              {t(
                "Requests by status",
                "Заявки по статусам",
                "Statuslara görə sorğular",
              )}
            </h2>
            <p className="ov-sub">
              {t(
                "All requests right now",
                "Все заявки сейчас",
                "Hazırda bütün sorğular",
              )}
            </p>
            <BarList
              rows={statusRows}
              color="var(--ov-requests)"
              empty={t(
                "No requests yet.",
                "Заявок пока нет.",
                "Hələ sorğu yoxdur.",
              )}
            />
          </section>
        </div>

        <div className="ov-grid-2">
          <section className="ov-card">
            <h2>
              {t(
                "Most requested journeys",
                "Самые востребованные поездки",
                "Ən çox sorğu gələn səfərlər",
              )}
            </h2>
            <p className="ov-sub">
              {t(
                "In the selected period",
                "За выбранный период",
                "Seçilmiş dövrdə",
              )}
            </p>
            <BarList
              rows={data.topTours.map((x) => ({ label: x.title, value: x.n }))}
              color="var(--ov-requests)"
              empty={t(
                "No requests in this period.",
                "За период заявок нет.",
                "Bu dövrdə sorğu yoxdur.",
              )}
            />
          </section>

          <section className="ov-card">
            <h2>{t("Customers", "Клиенты", "Müştərilər")}</h2>
            <p className="ov-sub">
              {t("All time", "За всё время", "Bütün dövr üzrə")}
            </p>
            <dl className="ov-facts">
              <div>
                <dt>
                  <Users size={16} aria-hidden="true" />
                  {t(
                    "Registered customers",
                    "Зарегистрировано клиентов",
                    "Qeydiyyatdan keçmiş müştərilər",
                  )}
                </dt>
                <dd>{data.customers.total}</dd>
              </div>
              <div>
                <dt>
                  <RotateCcw size={16} aria-hidden="true" />
                  {t(
                    "Customers with more than one request",
                    "Клиенты с несколькими заявками",
                    "Birdən çox sorğu verənlər",
                  )}
                </dt>
                <dd>{data.customers.repeat}</dd>
              </div>
              <div>
                <dt>
                  <MessageSquare size={16} aria-hidden="true" />
                  {t(
                    "Website messages this period",
                    "Сообщений с сайта за период",
                    "Bu dövrdə saytdan gələn mesajlar",
                  )}
                </dt>
                <dd>
                  {data.messages.created}{" "}
                  <Delta
                    now={data.messages.created}
                    before={data.messages.created_prev}
                    t={t}
                  />
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {f && (
          <div className="ov-grid-2">
            <section className="ov-card">
              <h2>
                {t(
                  "Payments received",
                  "Полученные платежи",
                  "Alınan ödənişlər",
                )}
              </h2>
              <p className="ov-sub">
                {t(
                  "Everything converted to AZN at the website rates",
                  "Всё в манатах по курсу сайта",
                  "Hamısı saytın məzənnəsi ilə manata çevrilib",
                )}
              </p>
              {moneyRows.every((row) => row.value === 0) ? (
                <p className="ov-empty">
                  {t(
                    "No payments were recorded in this period.",
                    "За период платежей не зафиксировано.",
                    "Bu dövrdə ödəniş qeyd olunmayıb.",
                  )}
                </p>
              ) : (
                <>
                  <TrendChart
                    rows={moneyRows}
                    unit="₼"
                    color="var(--ov-money)"
                    locale={locale}
                    label={t(
                      "Payments received over time",
                      "Полученные платежи по времени",
                      "Zamana görə alınan ödənişlər",
                    )}
                    format={(n) => compact(n)}
                  />
                  <details className="ov-table">
                    <summary>
                      {t(
                        "Show as table",
                        "Показать таблицей",
                        "Cədvəl kimi göstər",
                      )}
                    </summary>
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Date", "Дата", "Tarix")}</th>
                          <th>₼</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moneyRows.map((row) => (
                          <tr key={row.from}>
                            <td>
                              {row.from === row.to
                                ? shortDate(row.from, locale)
                                : shortDate(row.from, locale) +
                                  " – " +
                                  shortDate(row.to, locale)}
                            </td>
                            <td>{compact(row.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>

            <section className="ov-card">
              <h2>
                {t(
                  "How payments arrived",
                  "Как поступили платежи",
                  "Ödənişlər necə daxil olub",
                )}
              </h2>
              <p className="ov-sub">
                {t(
                  `${f.totals.payments} payments`,
                  `${f.totals.payments} платежей`,
                  `${f.totals.payments} ödəniş`,
                )}
              </p>
              <BarList
                rows={f.methods.map((m) => ({
                  label: methodNames[m.method] ?? m.method,
                  value: m.amount,
                  hint: `${compact(m.amount)} ₼ · ${m.n}`,
                }))}
                color="var(--ov-money)"
                format={azn}
                empty={t(
                  "No payments yet.",
                  "Платежей пока нет.",
                  "Hələ ödəniş yoxdur.",
                )}
              />
              {Object.keys(f.byCurrency).length > 0 && (
                <p className="ov-sub ov-currencies">
                  {t(
                    "Original currencies",
                    "Исходные валюты",
                    "Orijinal valyutalar",
                  )}
                  :{" "}
                  {Object.entries(f.byCurrency)
                    .map(([c, v]) => `${compact(v)} ${c}`)
                    .join(" · ")}
                </p>
              )}
            </section>
          </div>
        )}

        <section className="ov-card ov-attention">
          <h2>
            {t("Needs attention", "Требует внимания", "Diqqət tələb edənlər")}
          </h2>
          {waiting.length === 0 ? (
            <p className="ov-empty">
              {t(
                "Everything is in order.",
                "Всё в порядке.",
                "Hər şey qaydasındadır.",
              )}
            </p>
          ) : (
            <ul>
              {waiting.map((a) => (
                <li key={a.key}>
                  <button onClick={() => onNavigate(a.view)}>
                    <a.icon size={18} aria-hidden="true" />
                    <span>{a.text}</span>
                    <b>{a.n}</b>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
