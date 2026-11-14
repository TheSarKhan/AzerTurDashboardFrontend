import { useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  Search,
  UserRound,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDateTime, formatDay } from "./dates";
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
    [sorting, setSorting] = useState<SortingState>([]),
    [pageIndex, setPageIndex] = useState(0),
    // null = as many rows as fit the screen; a number = the size the staff member picked
    [manualSize, setManualSize] = useState<number | null>(null),
    [fit, setFit] = useState({ rows: 10, rowHeight: 44 });
  const tableBox = useRef<HTMLDivElement>(null);
  const pageSize = manualSize ?? fit.rows;
  const pagination = { pageIndex, pageSize };
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
  useEffect(() => setPageIndex(0), [search, status, owner, date]);
  // The table card fills the space under the filters; rows are sized so the last one ends at its bottom edge.
  useEffect(() => {
    const box = tableBox.current;
    if (!box) return;
    const measure = () => {
      const head =
        box.querySelector("thead")?.getBoundingClientRect().height ?? 36;
      const room = box.clientHeight - head;
      const rows = Math.max(5, Math.min(50, Math.floor(room / 44)));
      setFit({ rows, rowHeight: Math.max(44, room / rows) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
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
  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Status chips group the ten stages into the handful an operator actually works with.
  const groups: { key: string; label: string; stages: string[] }[] = [
    { key: "", label: t("All", "Все", "Hamısı"), stages: [] },
    {
      key: "new",
      label: t("New", "Новые", "Yeni"),
      stages: ["NEEDS_REVIEW"],
    },
    {
      key: "prep",
      label: t("In preparation", "В подготовке", "Hazırlanır"),
      stages: ["IN_PREPARATION"],
    },
    {
      key: "customer",
      label: t("Awaiting customer", "Ждут клиента", "Müştəri gözləyir"),
      stages: ["OFFER_SENT"],
    },
    {
      key: "pay",
      label: t("Contract & deposit", "Договор и депозит", "Müqavilə və beh"),
      stages: ["CONTRACT_ACCEPTED", "AWAITING_PAYMENT"],
    },
    {
      key: "confirmed",
      label: t("Confirmed", "Подтверждено", "Təsdiqlənib"),
      stages: ["CONFIRMED"],
    },
    {
      key: "review",
      label: t(
        "Changes & cancellations",
        "Изменения и отмены",
        "Dəyişiklik və ləğv",
      ),
      stages: ["CANCELLATION_REVIEW", "CHANGE_REVIEW"],
    },
    {
      key: "closed",
      label: t("Closed", "Закрытые", "Bağlı"),
      stages: ["CANCELLED", "REJECTED"],
    },
  ];
  const group = groups.find((g) => g.key === status) ?? groups[0];
  const filtered = useMemo(
    () =>
      rows.filter(
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
          (!group.stages.length || group.stages.includes(r.stage)) &&
          (!date || r.departure === date) &&
          (!owner ||
            (owner === "unassigned"
              ? !r.assigned_to
              : r.assigned_to === owner)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, search, status, date, owner, locale],
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = new Date(today + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const last = end.toISOString().slice(0, 10);
  const departing = rows.filter(
    (r) =>
      r.stage === "CONFIRMED" && r.departure >= today && r.departure <= last,
  ).length;
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

  const column = createColumnHelper<Row>();
  const columns = [
    column.accessor("created_at", {
      id: "reference",
      header: t("Request", "Заявка", "Sorğu"),
      cell: (c) => (
        <button
          className="rq-reference"
          onClick={() => onOpen(c.row.original.id)}
          title={t("Open request", "Открыть заявку", "Sorğunu aç")}
        >
          #{c.row.original.id.slice(0, 8)}
        </button>
      ),
    }),
    column.accessor("name", {
      id: "customer",
      header: t("Customer", "Клиент", "Müştəri"),
      cell: (c) => (
        <span className="rq-customer" title={c.row.original.email}>
          {c.getValue()}
        </span>
      ),
    }),
    column.accessor("departure", {
      id: "departure",
      header: t("Departure", "Выезд", "Səfər tarixi"),
      cell: (c) => (
        <span className="rq-date">{formatDay(c.getValue(), locale)}</span>
      ),
    }),
    column.display({
      id: "route",
      header: t("Route", "Маршрут", "Marşrut"),
      enableSorting: false,
      cell: (c) => {
        const r = c.row.original;
        const route = r.route?.length ? r.route.join(" → ") : r.title;
        return (
          <span
            className="rq-route"
            title={
              route +
              " · " +
              r.services
                .map((s) => serviceLabels[s.label] || s.label)
                .join(", ")
            }
          >
            {route}
          </span>
        );
      },
    }),
    column.accessor("stage", {
      id: "status",
      header: t("Status", "Статус", "Status"),
      cell: (c) => (
        <span
          className={"rq-state rq-state-" + c.getValue()}
          title={next(c.row.original)}
        >
          <i />
          {labels[c.getValue()] || c.getValue()}
        </span>
      ),
    }),
    column.accessor("assigned_to", {
      id: "owner",
      header: t("Assigned to", "Исполнитель", "Məsul"),
      cell: (c) => {
        const r = c.row.original;
        return data?.admin ? (
          <select
            className="rq-assignee"
            aria-label={
              t("Assigned to", "Исполнитель", "Məsul") + " " + r.id.slice(0, 8)
            }
            value={r.assigned_to || ""}
            disabled={busy}
            onChange={(e) => void assign(r, e.target.value)}
          >
            <option value="">
              {t("Unassigned", "Не назначено", "Təyin edilməyib")}
            </option>
            {r.assigned_to &&
              !data.staff.some((x) => x.username === r.assigned_to) && (
                <option value={r.assigned_to}>{r.assigned_to}</option>
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
              busy || (!!r.assigned_to && r.assigned_to !== data?.actor)
            }
            onClick={() => void assign(r)}
            title={
              r.assigned_to
                ? t("Release assignment", "Снять назначение", "Təyinatı burax")
                : t("Assign to me", "Назначить мне", "Özümə təyin et")
            }
          >
            <UserRound size={14} />
            <span>
              {r.assigned_to ||
                t("Assign to me", "Назначить мне", "Özümə götür")}
            </span>
          </button>
        );
      },
    }),
    column.display({
      id: "open",
      header: "",
      enableSorting: false,
      cell: (c) => (
        <button
          className="rq-next"
          onClick={() => onOpen(c.row.original.id)}
          aria-label={next(c.row.original)}
          title={next(c.row.original)}
        >
          <ArrowRight size={16} />
        </button>
      ),
    }),
  ];
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: (update) => {
      const next = typeof update === "function" ? update(pagination) : update;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const from = filtered.length
      ? pagination.pageIndex * pagination.pageSize + 1
      : 0,
    to = Math.min(
      (pagination.pageIndex + 1) * pagination.pageSize,
      filtered.length,
    );
  const sortFor = (id: string) => {
    const state = table.getColumn(id)?.getIsSorted();
    return state === "asc"
      ? "ascending"
      : state === "desc"
        ? "descending"
        : "none";
  };

  return (
    <section className="rq">
      <div className="rq-heading">
        <div>
          <h1>{t("Requests", "Заявки", "Sorğular")}</h1>
          <p>
            {data
              ? t(
                  `${rows.length} requests · ${departing} departing in 7 days`,
                  `${rows.length} заявок · выезд в ближайшие 7 дней: ${departing}`,
                  `${rows.length} sorğu · növbəti 7 gündə ${departing} səfər`,
                )
              : t("Loading…", "Загрузка…", "Yüklənir…")}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="rq-layout">
        <div className="rq-main">
          <div
            className="rq-chips"
            role="group"
            aria-label={t("Status", "Статус", "Status")}
          >
            {groups.map((g) => {
              const n = g.stages.length
                ? rows.filter((r) => g.stages.includes(r.stage)).length
                : rows.length;
              return (
                <button
                  key={g.key}
                  aria-pressed={status === g.key}
                  onClick={() => setStatus(g.key)}
                >
                  {g.label}
                  <b>{data ? n : "—"}</b>
                </button>
              );
            })}
          </div>
          <div className="rq-filters">
            <label className="rq-search">
              <Search size={17} />
              <input
                type="search"
                aria-label={t("Search requests", "Поиск заявок", "Sorğu axtar")}
                placeholder={t(
                  "Search by request, customer, destination…",
                  "Заявка, клиент, направление…",
                  "Sorğu, müştəri, istiqamət…",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
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
          <div
            className="rq-table"
            aria-busy={busy}
            ref={tableBox}
            style={{ ["--rq-row" as string]: fit.rowHeight + "px" }}
          >
            <table>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className={"rq-col-" + h.column.id}
                        aria-sort={
                          h.column.getCanSort()
                            ? sortFor(h.column.id)
                            : undefined
                        }
                      >
                        {h.column.getCanSort() ? (
                          <button
                            className="rq-sort"
                            onClick={h.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
                            {h.column.getIsSorted() === "asc" && (
                              <ArrowUp size={12} />
                            )}
                            {h.column.getIsSorted() === "desc" && (
                              <ArrowDown size={12} />
                            )}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onDoubleClick={() => onOpen(row.original.id)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={"rq-col-" + cell.column.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {manualSize === null &&
                  Array.from({
                    length: Math.max(
                      0,
                      pageSize - table.getRowModel().rows.length,
                    ),
                  }).map((_, n) => (
                    <tr
                      key={"ghost" + n}
                      className="rq-ghost"
                      aria-hidden="true"
                    >
                      <td colSpan={columns.length} />
                    </tr>
                  ))}
              </tbody>
            </table>
            {!filtered.length && (
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
              {from}–{to} / {filtered.length}
            </span>
            <label>
              {t("Rows", "Строк", "Sətir")}
              <select
                value={manualSize ?? "auto"}
                onChange={(e) => {
                  setManualSize(
                    e.target.value === "auto" ? null : Number(e.target.value),
                  );
                  setPageIndex(0);
                }}
              >
                <option value="auto">{t("Auto", "Авто", "Avto")}</option>
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button
                aria-label={t(
                  "Previous page",
                  "Предыдущая страница",
                  "Əvvəlki səhifə",
                )}
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
              </span>
              <button
                aria-label={t(
                  "Next page",
                  "Следующая страница",
                  "Növbəti səhifə",
                )}
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>
        <div className="rq-side">
          <section>
            <h2>
              {t("Recent activity", "Последние действия", "Son fəaliyyət")}
            </h2>
            {data?.activity.slice(0, 5).map((a) => (
              <button
                className="rq-activity"
                key={a.id}
                onClick={() => onOpen(a.booking_id)}
              >
                <i />
                <span>
                  <strong>{a.actor}</strong>{" "}
                  {actionLabels[a.action] ||
                    t(
                      "updated the request",
                      "обновил заявку",
                      "sorğunu yeniləyib",
                    )}
                  <small>
                    #{a.booking_id.slice(0, 8)} · {formatDateTime(a.created_at)}
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
    </section>
  );
}
