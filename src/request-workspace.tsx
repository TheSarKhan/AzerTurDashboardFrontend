import { useEffect, useState } from "react";
import {
  Search,
  FileText,
  RefreshCw,
  UserRound,
  CalendarDays,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import "./request-workspace.css";
type Row = {
  id: string;
  name: string;
  email: string;
  title: string;
  departure: string;
  created_at: string;
  assigned_to: string | null;
  stage: string;
  travelers: number;
  route: string[];
  services: { label: string }[];
};
type Activity = {
  id: string;
  booking_id: string;
  actor: string;
  action: string;
  created_at: string;
};
type Data = {
  actor: string;
  admin: boolean;
  staff: { username: string; name: string }[];
  rows: Row[];
  activity: Activity[];
};
export default function RequestWorkspace({
  auth,
  locale,
  onOpen,
  refreshKey,
}: {
  auth: string;
  locale: Locale;
  onOpen: (id: string) => void;
  refreshKey: unknown;
}) {
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [owner, setOwner] = useState(""),
    [date, setDate] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const labels: Record<string, string> = {
    NEEDS_REVIEW: t("Needs review", "На проверке", "Yoxlama gözləyir"),
    IN_PREPARATION: t("In preparation", "В подготовке", "Hazırlanır"),
    OFFER_SENT: t("Offer sent", "Предложение отправлено", "Təklif göndərilib"),
    CONTRACT_ACCEPTED: t(
      "Contract accepted",
      "Договор принят",
      "Müqavilə təsdiqlənib",
    ),
    AWAITING_PAYMENT: t("Awaiting deposit", "Ожидает депозита", "Beh gözləyir"),
    CONFIRMED: t("Confirmed", "Подтверждено", "Təsdiqlənib"),
    CANCELLATION_REVIEW: t(
      "Cancellation review",
      "Проверка отмены",
      "Ləğv yoxlanılır",
    ),
    CHANGE_REVIEW: t(
      "Change review",
      "Проверка изменения",
      "Dəyişiklik yoxlanılır",
    ),
    CANCELLED: t("Cancelled", "Отменено", "Ləğv edilib"),
    REJECTED: t("Rejected", "Отклонено", "Rədd edilib"),
  };
  const serviceLabels: Record<string, string> = {
    transport: t("Driver", "Водитель", "Sürücü"),
    hotel: t("Hotel", "Отель", "Otel"),
    guide: t("Guide", "Гид", "Gid"),
    transfer: t("Transfer", "Трансфер", "Transfer"),
    activity: t("Experience", "Впечатление", "Fəaliyyət"),
  };
  const next = (r: Row) =>
    r.stage === "NEEDS_REVIEW"
      ? t("Check availability", "Проверить доступность", "Mövcudluğu yoxla")
      : r.stage === "IN_PREPARATION"
        ? t("Prepare offer", "Подготовить предложение", "Təklifi hazırla")
        : r.stage === "OFFER_SENT"
          ? t("Awaiting response", "Ожидание ответа", "Cavab gözlənilir")
          : r.stage === "CANCELLATION_REVIEW" || r.stage === "CHANGE_REVIEW"
            ? t(
                "Review and respond",
                "Проверить и ответить",
                "Yoxla və cavabla",
              )
            : t("Open details", "Открыть детали", "Detalları aç");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(await api<Data>("/api/v1/operations/request-workspace", auth));
    } catch {
      setError(
        t(
          "Could not load requests. Please refresh.",
          "Не удалось загрузить заявки. Обновите страницу.",
          "Sorğular yüklənmədi. Yeniləyin.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [auth, refreshKey]);
  useEffect(() => setPage(1), [search, status, owner, date]);
  async function assign(r: Row, assignee?: string) {
    setBusy(true);
    setError("");
    try {
      await api("/api/v1/operations/bookings/" + r.id + "/assignment", auth, {
        assign: assignee !== undefined ? !!assignee : !r.assigned_to,
        assignee: assignee || null,
        expectedOwner: r.assigned_to,
      });
      await load();
    } catch {
      setError(
        t(
          "Assignment changed or could not be saved. Refresh and retry.",
          "Назначение изменилось или не сохранено. Обновите список.",
          "Təyinat dəyişib və ya saxlanmadı. Yeniləyib yoxlayın.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.rows || [],
    filtered = rows.filter(
      (r) =>
        (
          r.id +
          " " +
          r.name +
          " " +
          r.email +
          " " +
          r.title +
          " " +
          (r.route || []).join(" ") +
          " " +
          r.services.map((s) => serviceLabels[s.label] || s.label).join(" ")
        )
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!status || r.stage === status) &&
        (!date || r.departure === date) &&
        (!owner ||
          (owner === "unassigned" ? !r.assigned_to : r.assigned_to === owner)),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 6)),
    currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * 6, currentPage * 6),
    chosen = rows.find((r) => r.id === selected);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = new Date(today + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const last = end.toISOString().slice(0, 10);
  const active = rows.filter(
    (r) => !["CANCELLED", "REJECTED"].includes(r.stage),
  );
  const metrics = [
    [
      FileText,
      t("New requests", "Новые заявки", "Yeni sorğular"),
      rows.filter((r) => r.stage === "NEEDS_REVIEW").length,
    ],
    [
      RefreshCw,
      t("In progress", "В работе", "Hazırlanır"),
      rows.filter((r) => r.stage === "IN_PREPARATION").length,
    ],
    [
      UserRound,
      t("Awaiting customer", "Ожидают клиента", "Müştəri gözlənilir"),
      rows.filter((r) => r.stage === "OFFER_SENT").length,
    ],
    [
      CalendarDays,
      t(
        "Departures · next 7 days",
        "Выезды · 7 дней",
        "Səfərlər · növbəti 7 gün",
      ),
      active.filter(
        (r) =>
          r.departure >= today &&
          r.departure <= last &&
          r.stage === "CONFIRMED",
      ).length,
    ],
  ] as const;
  const priorities = [
    {
      stage: "NEEDS_REVIEW",
      text: t(
        "Check availability",
        "Проверить доступность",
        "Mövcudluğu yoxla",
      ),
    },
    {
      stage: "OFFER_SENT",
      text: t(
        "Follow up on offers",
        "Проверить ответы",
        "Təklif cavablarını yoxla",
      ),
    },
    {
      stage: "CANCELLATION_REVIEW",
      text: t("Review cancellations", "Проверить отмены", "Ləğvləri yoxla"),
    },
  ];
  const actionLabels: Record<string, string> = {
    REQUESTED: t("created a request", "создал заявку", "sorğu yaradıb"),
    ASSIGNED: t("assigned the request", "назначил заявку", "sorğunu götürüb"),
    UNASSIGNED: t("released assignment", "снял назначение", "təyinatı buraxıb"),
    OFFER_SENT: t("sent an offer", "отправил предложение", "təklif göndərib"),
    CONTRACT_ACCEPTED: t(
      "accepted the contract",
      "принял договор",
      "müqaviləni təsdiqləyib",
    ),
  };
  return (
    <section className="rq">
      <div className="rq-heading">
        <div>
          <h1>{t("Requests", "Заявки", "Sorğular")}</h1>
          <p>
            {t(
              "Manage customer journeys from first request to departure",
              "От первой заявки до отправления",
              "İlk sorğudan səfərə qədər müştəri işlərini idarə edin",
            )}
          </p>
        </div>
        <button
          className="rq-primary"
          disabled={!chosen || busy}
          onClick={() => chosen && onOpen(chosen.id)}
        >
          {chosen
            ? next(chosen)
            : t("Select a request", "Выберите заявку", "Sorğu seçin")}
          <ArrowRight size={17} />
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="rq-layout">
        <div className="rq-main">
          <div className="rq-metrics">
            {metrics.map(([Icon, label, count]) => (
              <div key={label}>
                <Icon size={25} />
                <div>
                  <span>{label}</span>
                  <strong>{data ? count : "—"}</strong>
                </div>
              </div>
            ))}
          </div>
          <div className="rq-filters">
            <label className="rq-search">
              <Search size={19} />
              <input
                type="search"
                aria-label={t("Search requests", "Поиск заявок", "Sorğu axtar")}
                placeholder={t(
                  "Search by request, customer, destination, service…",
                  "Заявка, клиент, направление, услуга…",
                  "Sorğu, müştəri, istiqamət, xidmət…",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label={t("Status", "Статус", "Status")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                {t("All statuses", "Все статусы", "Bütün statuslar")}
              </option>
              {Object.entries(labels).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label={t("Travel date", "Дата поездки", "Səfər tarixi")}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <select
              aria-label={t("Assigned to", "Исполнитель", "Məsul əməkdaş")}
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">
                {t("All staff", "Все сотрудники", "Bütün əməkdaşlar")}
              </option>
              <option value="unassigned">
                {t("Unassigned", "Не назначено", "Təyin edilməyib")}
              </option>
              {Array.from(
                new Set(
                  [data?.actor, ...rows.map((r) => r.assigned_to)].filter(
                    Boolean,
                  ),
                ),
              ).map((x) => (
                <option key={x} value={x!}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="rq-table" aria-busy={busy}>
            <table>
              <thead>
                <tr>
                  {[
                    t("Request", "Заявка", "Sorğu"),
                    t("Customer", "Клиент", "Müştəri"),
                    t("Travel dates", "Даты", "Səfər tarixi"),
                    t("Services", "Услуги", "Xidmətlər"),
                    t("Status", "Статус", "Status"),
                    t("Assigned to", "Исполнитель", "Məsul əməkdaş"),
                    t("Next step", "Следующий шаг", "Növbəti addım"),
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    className={selected === r.id ? "rq-selected" : ""}
                  >
                    <td>
                      <button
                        className="rq-reference"
                        aria-pressed={selected === r.id}
                        onClick={() => setSelected(r.id)}
                      >
                        #{r.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.email}</small>
                    </td>
                    <td>
                      <CalendarDays size={15} />{" "}
                      {new Intl.DateTimeFormat(locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(r.departure + "T00:00:00Z"))}
                    </td>
                    <td>
                      <span title={r.title}>
                        {r.services
                          .map((s) => serviceLabels[s.label] || s.label)
                          .join(" · ")}
                      </span>
                      <small>
                        {r.route?.length ? r.route.join(" · ") : r.title}
                      </small>
                    </td>
                    <td>
                      <span className={"rq-state rq-state-" + r.stage}>
                        <i />
                        {labels[r.stage] || r.stage}
                      </span>
                    </td>
                    <td>
                      {data?.admin ? (
                        <select
                          className="rq-assignee"
                          aria-label={
                            t(
                              "Assigned to",
                              "\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c",
                              "Məsul",
                            ) +
                            " " +
                            r.id.slice(0, 8)
                          }
                          value={r.assigned_to || ""}
                          disabled={busy}
                          onChange={(e) => void assign(r, e.target.value)}
                        >
                          <option value="">
                            {t(
                              "Unassigned",
                              "\u041d\u0435 \u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u043e",
                              "Təyin edilməyib",
                            )}
                          </option>
                          {r.assigned_to &&
                            !data.staff.some(
                              (x) => x.username === r.assigned_to,
                            ) && (
                              <option value={r.assigned_to}>
                                {r.assigned_to}
                              </option>
                            )}
                          {data.staff.map((x) => (
                            <option key={x.username} value={x.username}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          className="rq-owner"
                          disabled={
                            busy ||
                            (!!r.assigned_to && r.assigned_to !== data?.actor)
                          }
                          onClick={() => void assign(r)}
                          title={
                            r.assigned_to
                              ? t(
                                  "Release assignment",
                                  "Снять назначение",
                                  "Təyinatı burax",
                                )
                              : t(
                                  "Assign to me",
                                  "Назначить мне",
                                  "Özümə təyin et",
                                )
                          }
                        >
                          <UserRound size={15} />
                          {r.assigned_to ||
                            t("Assign to me", "Назначить мне", "Özümə götür")}
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="rq-next" onClick={() => onOpen(r.id)}>
                        {next(r)}
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="rq-empty">
                {busy
                  ? t("Loading…", "Загрузка…", "Yüklənir…")
                  : t(
                      "No matching requests. Adjust the filters.",
                      "Нет подходящих заявок. Измените фильтры.",
                      "Uyğun sorğu yoxdur. Filtrləri dəyişin.",
                    )}
              </p>
            )}
          </div>
          <div className="rq-pagination">
            <span>
              {filtered.length ? (currentPage - 1) * 6 + 1 : 0}–
              {Math.min(currentPage * 6, filtered.length)} / {filtered.length}
            </span>
            <div>
              <button
                aria-label={t(
                  "Previous page",
                  "Предыдущая страница",
                  "Əvvəlki səhifə",
                )}
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {currentPage} / {pages}
              </span>
              <button
                aria-label={t(
                  "Next page",
                  "Следующая страница",
                  "Növbəti səhifə",
                )}
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>
        <div className="rq-side">
          <section>
            <h2>
              {t(
                "Today’s priorities",
                "Приоритеты на сегодня",
                "Günün prioritetləri",
              )}
            </h2>
            {priorities.map((p) => (
              <button
                key={p.stage}
                onClick={() => {
                  setStatus(p.stage);
                  setSearch("");
                  setDate("");
                  setOwner("");
                }}
              >
                <FileText size={18} />
                <span>
                  {p.text}
                  <small>
                    {data
                      ? rows.filter((r) => r.stage === p.stage).length
                      : "—"}{" "}
                    {t("requests", "заявок", "sorğu")}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            <button
              className="rq-refresh"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw size={15} />
              {t("Refresh", "Обновить", "Yenilə")}
            </button>
          </section>
          <section>
            <h2>
              {t("Recent activity", "Последние действия", "Son fəaliyyət")}
            </h2>
            {data?.activity.slice(0, 3).map((a) => (
              <button
                className="rq-activity"
                key={a.id}
                onClick={() => onOpen(a.booking_id)}
              >
                <i />
                <span>
                  <strong>{a.actor}</strong>
                  <br />
                  {actionLabels[a.action] ||
                    t(
                      "updated the request",
                      "обновил заявку",
                      "sorğunu yeniləyib",
                    )}
                  <small>
                    #{a.booking_id.slice(0, 8)} ·{" "}
                    {new Date(a.created_at).toLocaleString(locale)}
                  </small>
                </span>
              </button>
            ))}
            {data && !data.activity.length && (
              <p>
                {t(
                  "No activity yet.",
                  "Действий пока нет.",
                  "Hələ fəaliyyət yoxdur.",
                )}
              </p>
            )}
          </section>
        </div>
      </div>
      <footer>© {new Date().getFullYear()} azərtur.</footer>
    </section>
  );
}
