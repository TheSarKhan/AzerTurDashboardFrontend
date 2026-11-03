import { useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Users,
  Handshake,
  Bell,
  ArrowRight,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import "./office-management.css";
type Account = {
  username: string;
  name: string;
  role: string;
  enabled: boolean;
  version: number;
};
type Partner = {
  id: string;
  name: string;
  kind: string;
  email: string;
  phone: string;
  notes: string;
  active: boolean;
  version: number;
  sync_enabled: boolean;
};
export type PartnerService = {
  id: string;
  partner_id: string;
  name: string;
  service_key: string;
  location: string;
  currency: string;
  price_minor: number;
  available_from: string;
  available_to: string;
  capacity: number;
  policy: string;
  active: boolean;
  partner_active: boolean;
  partner_name: string;
  version: number;
};
type Job = {
  id: string;
  booking_id: string;
  channel: string;
  event: string;
  status: string;
  attempts: number;
  customer_name: string;
  last_error: string;
};
export default function OfficeManagement({
  module,
  auth,
  locale: l,
  onDirtyChange,
}: {
  module: "Staff" | "Partners" | "Notifications";
  auth: string;
  locale: Locale;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [roles, setRoles] = useState<string[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [bootstrap, setBootstrap] = useState(""),
    [partners, setPartners] = useState<Partner[]>([]),
    [services, setServices] = useState<PartnerService[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [emailEnabled, setEmailEnabled] = useState(false),
    [selection, setSelection] = useState<
      Account | Partner | PartnerService | null
    >(null),
    [formType, setFormType] = useState<
      "account" | "partner" | "service" | null
    >(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [key, setKey] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [jobPage, setJobPage] = useState(1);
  useEffect(() => setJobPage(1), [query]);
  const kindNames: Record<string, string> = {
    HOTEL: t("Hotel", "Отель", "Otel"),
    TRANSPORT: t("Transport", "Транспорт", "Nəqliyyat"),
    GUIDE: t("Guide", "Гид", "Gid"),
    ACTIVITY: t("Activity", "Активность", "Fəaliyyət"),
    OTHER: t("Other", "Другое", "Digər"),
  };
  const serviceNames: Record<string, string> = {
    hotel: kindNames.HOTEL,
    transport: kindNames.TRANSPORT,
    guide: kindNames.GUIDE,
    transfer: t("Transfer", "Трансфер", "Transfer"),
    activity: kindNames.ACTIVITY,
  };
  const eventNames: Record<string, string> = {
    AMENDMENT_SENT: t(
      "A change proposal is ready",
      "Предложение изменения готово",
      "Dəyişiklik təklifi hazırdır",
    ),
    AMENDMENT_ACCEPTED: t(
      "Changes accepted",
      "Изменения приняты",
      "Dəyişikliklər təsdiqlənib",
    ),
    AMENDMENT_DECLINED: t(
      "Proposal declined",
      "Предложение отклонено",
      "Təklif rədd edilib",
    ),
    AMENDMENT_REFUND_UPDATED: t(
      "Refund tracking updated",
      "Статус возврата обновлён",
      "Geri ödəniş vəziyyəti yenilənib",
    ),
    OFFER_SENT: t("Offer sent", "Предложение отправлено", "Təklif göndərilib"),
    CONTRACT_SENT: t(
      "Contract sent",
      "Договор отправлен",
      "Müqavilə göndərilib",
    ),
    PAYMENT_REQUESTED: t(
      "Payment requested",
      "Запрошена оплата",
      "Ödəniş tələb edilib",
    ),
    REFUND_UPDATED: t(
      "Refund update",
      "Обновление возврата",
      "Geri ödəniş yeniliyi",
    ),
    REVISED_PLAN_SENT: t(
      "Revised payment plan",
      "Обновлённый план оплаты",
      "Yenilənmiş ödəniş planı",
    ),
  };
  const admin = roles.includes("ROLE_ADMIN");
  const mark = (value: boolean) => {
    setDirty(value);
    onDirtyChange(value);
  };
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
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const me = await api<{ roles: string[] }>("/api/v1/operations/me", auth);
      setRoles(me.roles);
      if (module === "Staff") {
        const x = await api<{ bootstrap: string; accounts: Account[] }>(
          "/api/v1/operations/staff",
          auth,
        );
        setAccounts(x.accounts);
        setBootstrap(x.bootstrap);
      } else if (module === "Partners") {
        const x = await api<{
          partners: Partner[];
          services: PartnerService[];
        }>("/api/v1/operations/partners", auth);
        setPartners(x.partners);
        setServices(x.services);
      } else {
        const x = await api<{
          emailConfigured: boolean;
          pushConfigured?: boolean;
          items: Job[];
        }>("/api/v1/operations/notifications", auth);
        setJobs(x.items);
        setEmailEnabled(x.emailConfigured);
        setPushEnabled(!!x.pushConfigured);
      }
    } catch {
      setError(
        t(
          "Could not load this workspace. Check your access and refresh.",
          "Не удалось загрузить раздел. Проверьте доступ.",
          "Bölmə yüklənmədi. Giriş icazənizi yoxlayıb yeniləyin.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [module, auth]);
  function edit(type: typeof formType, item: typeof selection) {
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
    setFormType(type);
    setSelection(item);
    setKey("");
    setNotice("");
    mark(false);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget),
      s = (name: string) => String(f.get(name) || "");
    setBusy(true);
    setError("");
    try {
      if (formType === "account") {
        await api("/api/v1/operations/staff", auth, {
          username: s("username"),
          name: s("name"),
          role: s("role"),
          password: s("password"),
          enabled: f.has("enabled"),
          version: selection?.version || 0,
        });
      }
      if (formType === "partner") {
        await api("/api/v1/operations/partners", auth, {
          id: selection && "id" in selection ? selection.id : null,
          name: s("name"),
          kind: s("kind"),
          email: s("email"),
          phone: s("phone"),
          notes: s("notes"),
          active: f.has("active"),
          version: selection?.version || 0,
        });
      }
      if (formType === "service") {
        const price = Number(s("price"));
        await api("/api/v1/operations/partner-services", auth, {
          id: selection && "id" in selection ? selection.id : null,
          partnerId: s("partnerId"),
          name: s("name"),
          serviceKey: s("serviceKey"),
          location: s("location"),
          currency: s("currency"),
          priceMinor: Math.round(price * 100),
          availableFrom: s("from"),
          availableTo: s("to"),
          capacity: Number(s("capacity")),
          policy: s("policy"),
          active: f.has("active"),
          version: selection?.version || 0,
        });
      }
      mark(false);
      setFormType(null);
      setSelection(null);
      setNotice(t("Saved.", "Сохранено.", "Saxlanıldı."));
      await load();
    } catch {
      setError(
        t(
          "Could not save. Check the fields or refresh if another employee changed this record.",
          "Не удалось сохранить. Проверьте поля и актуальность записи.",
          "Saxlanmadı. Xanaları yoxlayın; qeyd dəyişibsə yeniləyin.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const formKey =
    formType +
    ":" +
    ((selection &&
      ("username" in selection
        ? selection.username
        : "id" in selection
          ? selection.id
          : "")) ||
      "new");
  const a = selection as Account | null,
    p = selection as Partner | null,
    s = selection as PartnerService | null;
  return (
    <div className="om">
      <div className="om-heading">
        <div>
          <h2>
            {module === "Staff"
              ? t("Office staff", "Сотрудники офиса", "Ofis əməkdaşları")
              : module === "Partners"
                ? t(
                    "Hotels & partners",
                    "Отели и партнёры",
                    "Otellər və partnyorlar",
                  )
                : t(
                    "Notification delivery",
                    "Отправка уведомлений",
                    "Bildirişlərin göndərilməsi",
                  )}
          </h2>
          <p>
            {module === "Staff"
              ? t(
                  "Individual accounts, roles and access.",
                  "Индивидуальные аккаунты, роли и доступ.",
                  "Fərdi hesablar, rollar və giriş icazələri.",
                )
              : module === "Partners"
                ? t(
                    "Keep supplier services, rates and availability in one place.",
                    "Услуги, цены и доступность поставщиков.",
                    "Təchizatçı xidmətləri, qiymətlər və mövcudluq bir yerdə.",
                  )
                : t(
                    "Track email delivery and safely retry known failures.",
                    "Следите за доставкой и повторяйте подтверждённые ошибки.",
                    "Göndərişləri izləyin və məlum uğursuzluqları yenidən sınayın.",
                  )}
          </p>
        </div>
        <button disabled={busy || dirty} onClick={() => void load()}>
          <RefreshCw size={16} />
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
      <div className="om-toolbar">
        <input
          type="search"
          aria-label={t("Search", "Поиск", "Axtar")}
          placeholder={t("Search…", "Поиск…", "Axtar…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {module === "Staff" && admin && (
          <button className="om-primary" onClick={() => edit("account", null)}>
            <Plus size={16} />
            {t("Add employee", "Добавить сотрудника", "Əməkdaş əlavə et")}
          </button>
        )}
        {module === "Partners" && (
          <>
            <button
              className="om-primary"
              onClick={() => edit("partner", null)}
            >
              <Plus size={16} />
              {t("Add partner", "Добавить партнёра", "Partnyor əlavə et")}
            </button>
            <button
              disabled={!partners.length}
              onClick={() => edit("service", null)}
            >
              <Plus size={16} />
              {t("Add service", "Добавить услугу", "Xidmət əlavə et")}
            </button>
          </>
        )}
      </div>
      {module === "Staff" && (
        <>
          <p className="om-info">
            {t(
              "Administrator manages accounts. Finance manages allocations and refunds. Operators prepare journeys. Disabling an account blocks its next request.",
              "Администратор управляет аккаунтами. Финансы — распределением и возвратами. Операторы готовят поездки.",
              "Administrator hesabları, maliyyə rolu bölgü və geri ödənişləri, operator isə səfərləri idarə edir.",
            )}
          </p>
          <p>
            {t(
              "Server administrator",
              "Администратор сервера",
              "Server administratoru",
            )}
            : {bootstrap}
          </p>
          <div className="om-table">
            <table>
              <thead>
                <tr>
                  {[
                    t("Employee", "Сотрудник", "Əməkdaş"),
                    t("Username", "Логин", "İstifadəçi"),
                    t("Role", "Роль", "Rol"),
                    t("Access", "Доступ", "Giriş"),
                    "",
                  ].map((x, i) => (
                    <th key={i}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts
                  .filter((x) =>
                    (x.name + x.username)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((x) => (
                    <tr key={x.username}>
                      <td>{x.name}</td>
                      <td>{x.username}</td>
                      <td>
                        {x.role === "ADMIN"
                          ? t("Administrator", "Администратор", "Administrator")
                          : x.role === "FINANCE"
                            ? t("Finance", "Финансы", "Maliyyə")
                            : t("Operator", "Оператор", "Operator")}
                      </td>
                      <td>
                        {x.enabled
                          ? t("Active", "Активен", "Aktiv")
                          : t("Disabled", "Отключён", "Bağlı")}
                      </td>
                      <td>
                        <button onClick={() => edit("account", x)}>
                          {t("Edit", "Изменить", "Düzəlt")}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!accounts.length && (
              <p className="om-empty">
                {t(
                  "Add your first employee.",
                  "Добавьте первого сотрудника.",
                  "İlk əməkdaşı əlavə edin.",
                )}
              </p>
            )}
          </div>
        </>
      )}
      {module === "Partners" && (
        <>
          <div className="om-partners">
            {partners
              .filter((x) =>
                (x.name + x.kind).toLowerCase().includes(query.toLowerCase()),
              )
              .map((x) => (
                <article key={x.id}>
                  <Handshake size={22} />
                  <h3>{x.name}</h3>
                  <p>
                    {kindNames[x.kind]} ·{" "}
                    {x.active
                      ? t("Active", "Активен", "Aktiv")
                      : t("Inactive", "Неактивен", "Deaktiv")}
                  </p>
                  <p>
                    {x.email}
                    <br />
                    {x.phone}
                  </p>
                  <button onClick={() => edit("partner", x)}>
                    {t(
                      "Manage partner",
                      "Управлять партнёром",
                      "Partnyoru idarə et",
                    )}
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
          </div>
          <h3>
            {t(
              "Services & availability",
              "Услуги и доступность",
              "Xidmətlər və mövcudluq",
            )}
          </h3>
          <div className="om-table">
            <table>
              <thead>
                <tr>
                  {[
                    t(
                      "Service / partner",
                      "Услуга / партнёр",
                      "Xidmət / partnyor",
                    ),
                    t("Location", "Место", "Məkan"),
                    t("Unit price", "Цена единицы", "Vahid qiyməti"),
                    t("Dates", "Даты", "Tarixlər"),
                    t("Capacity", "Доступно", "Tutum"),
                    "",
                  ].map((x, i) => (
                    <th key={i}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services
                  .filter((x) =>
                    (x.name + x.partner_name + x.location)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((x) => (
                    <tr key={x.id}>
                      <td>
                        {x.name}
                        <small>
                          {x.partner_name}
                          {!x.active || !x.partner_active
                            ? " · " + t("Inactive", "Неактивен", "Deaktiv")
                            : ""}
                        </small>
                      </td>
                      <td>{x.location}</td>
                      <td>
                        {(x.price_minor / 100).toFixed(2)} {x.currency}
                      </td>
                      <td>
                        {String(x.available_from).slice(0, 10)} —{" "}
                        {String(x.available_to).slice(0, 10)}
                      </td>
                      <td>{x.capacity}</td>
                      <td>
                        <button onClick={() => edit("service", x)}>
                          {t("Edit", "Изменить", "Düzəlt")}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!services.length && (
              <p className="om-empty">
                {t(
                  "No services added yet.",
                  "Услуг пока нет.",
                  "Hələ xidmət əlavə edilməyib.",
                )}
              </p>
            )}
          </div>
        </>
      )}
      {module === "Notifications" && (
        <>
          <p className="om-info">
            {emailEnabled
              ? t(
                  "Gmail SMTP is enabled.",
                  "Gmail SMTP включён.",
                  "Gmail SMTP aktivdir.",
                )
              : t(
                  "Email is waiting for server SMTP configuration.",
                  "Email ожидает настройки SMTP на сервере.",
                  "Email serverdə SMTP konfiqurasiyasını gözləyir.",
                )}{" "}
            {t(
              "An unknown result requires review before sending again. No SMS is used.",
              "Неизвестный результат нужно проверить перед повтором. SMS не используется.",
              "Nəticə bilinmirsə, təkrar göndərməzdən əvvəl yoxlanmalıdır. SMS istifadə edilmir.",
            )}
          </p>
          <div className="om-table">
            <table>
              <thead>
                <tr>
                  {[
                    t(
                      "Customer / event",
                      "Клиент / событие",
                      "Müştəri / hadisə",
                    ),
                    t("Channel", "Канал", "Kanal"),
                    t("State", "Статус", "Vəziyyət"),
                    t("Attempts", "Попытки", "Cəhdlər"),
                    "",
                  ].map((x, i) => (
                    <th key={i}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs
                  .filter((j) =>
                    (j.customer_name + j.event + j.status + j.channel)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .slice((jobPage - 1) * 20, jobPage * 20)
                  .map((j) => (
                    <tr key={j.id}>
                      <td>
                        {j.customer_name}
                        <small>
                          {eventNames[j.event] ||
                            t(
                              "Journey update",
                              "Обновление поездки",
                              "Səfər yeniliyi",
                            )}{" "}
                          · #{j.booking_id?.slice(0, 8)}
                        </small>
                      </td>
                      <td>{j.channel}</td>
                      <td>
                        {(
                          {
                            WAITING_DEVICE: t(
                              "Awaiting a registered device",
                              "Ожидает устройство",
                              "Cihaz qeydiyyatı gözlənilir",
                            ),
                            CANCELLED: t(
                              "Delivery cancelled",
                              "Отправка отменена",
                              "Göndəriş dayandırılıb",
                            ),
                            WAITING_CONFIGURATION: t(
                              "Awaiting configuration",
                              "Ожидает настройки",
                              "Konfiqurasiya gözlənilir",
                            ),
                            QUEUED: t("Queued", "В очереди", "Növbədə"),
                            DELIVERING: t(
                              "Sending",
                              "Отправляется",
                              "Göndərilir",
                            ),
                            SENT: t("Sent", "Отправлено", "Göndərilib"),
                            FAILED: t("Failed", "Ошибка", "Uğursuz"),
                            DELIVERY_UNKNOWN: t(
                              "Result unknown — review",
                              "Результат неизвестен — проверка",
                              "Nəticə bilinmir — yoxlayın",
                            ),
                            ACCEPTED: t(
                              "Provider accepted",
                              "Принято провайдером",
                              "Provayder qəbul edib",
                            ),
                            PROVIDER_CONFIRMED: t(
                              "Provider confirmed",
                              "Подтверждено провайдером",
                              "Provayder təsdiqləyib",
                            ),
                          } as Record<string, string>
                        )[j.status] || j.status}
                      </td>
                      <td>{j.attempts}</td>
                      <td>
                        {((j.channel === "EMAIL" &&
                          ["FAILED", "WAITING_CONFIGURATION"].includes(
                            j.status,
                          )) ||
                          (j.channel === "PUSH" && j.status === "FAILED")) && (
                          <button
                            disabled={
                              busy ||
                              (j.channel === "PUSH"
                                ? !pushEnabled
                                : !emailEnabled)
                            }
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await api(
                                  "/api/v1/operations/notifications/" +
                                    j.id +
                                    (j.channel === "PUSH"
                                      ? "/retry-push"
                                      : "/retry"),
                                  auth,
                                  {},
                                );
                                await load();
                              } catch {
                                setError(
                                  t(
                                    "Could not retry. Refresh the delivery state.",
                                    "Не удалось повторить. Обновите статус.",
                                    "Təkrar alınmadı. Göndəriş statusunu yeniləyin.",
                                  ),
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {t("Retry", "Повторить", "Təkrar sına")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!jobs.length && (
              <p className="om-empty">
                {t(
                  "No notifications yet.",
                  "Уведомлений пока нет.",
                  "Hələ bildiriş yoxdur.",
                )}
              </p>
            )}
          </div>
        </>
      )}
      {module === "Notifications" && jobs.length > 20 && (
        <div className="om-actions">
          <button
            disabled={jobPage === 1}
            onClick={() => setJobPage(jobPage - 1)}
          >
            {t("Previous", "\u041d\u0430\u0437\u0430\u0434", "Geri")}
          </button>
          <span>{jobPage}</span>
          <button
            disabled={
              jobs.filter((j) =>
                (j.customer_name + j.event + j.status + j.channel)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ).length <=
              jobPage * 20
            }
            onClick={() => setJobPage(jobPage + 1)}
          >
            {t("Next", "\u0414\u0430\u043b\u0435\u0435", "Sonra")}
          </button>
        </div>
      )}
      {formType && (
        <section className="om-editor">
          <h3>
            {formType === "account"
              ? t("Employee account", "Аккаунт сотрудника", "Əməkdaş hesabı")
              : formType === "partner"
                ? t(
                    "Partner details",
                    "Данные партнёра",
                    "Partnyor məlumatları",
                  )
                : t("Service details", "Данные услуги", "Xidmət məlumatları")}
          </h3>
          <form key={formKey} onSubmit={submit} onChange={() => mark(true)}>
            <div className="om-fields">
              <label>
                {t("Name", "Название", "Ad")}
                <input
                  name="name"
                  required
                  maxLength={formType === "account" ? 100 : 160}
                  defaultValue={selection?.name || ""}
                />
              </label>
              {formType === "account" && (
                <>
                  <label>
                    {t("Username", "Логин", "İstifadəçi adı")}
                    <input
                      name="username"
                      required
                      pattern="[a-zA-Z0-9._-]{3,100}"
                      readOnly={!!selection}
                      defaultValue={a?.username || ""}
                    />
                  </label>
                  <label>
                    {t("Role", "Роль", "Rol")}
                    <select name="role" defaultValue={a?.role || "OPERATOR"}>
                      <option value="OPERATOR">
                        {t("Operator", "Оператор", "Operator")}
                      </option>
                      <option value="FINANCE">
                        {t("Finance", "Финансы", "Maliyyə")}
                      </option>
                      <option value="ADMIN">
                        {t("Administrator", "Администратор", "Administrator")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t(
                      "Password (16+ characters; leave blank to keep)",
                      "Пароль (16+ символов; пусто — без изменений)",
                      "Şifrə (16+ simvol; boş saxlamaqla dəyişmir)",
                    )}
                    <input
                      name="password"
                      type="password"
                      minLength={16}
                      maxLength={120}
                      required={!selection}
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="om-check">
                    <input
                      name="enabled"
                      type="checkbox"
                      defaultChecked={a?.enabled ?? true}
                    />
                    {t("Account enabled", "Аккаунт включён", "Hesab aktivdir")}
                  </label>
                </>
              )}
              {formType === "partner" && (
                <>
                  <label>
                    {t("Type", "Тип", "Növ")}
                    <select name="kind" defaultValue={p?.kind || "HOTEL"}>
                      {["HOTEL", "TRANSPORT", "GUIDE", "ACTIVITY", "OTHER"].map(
                        (x) => (
                          <option key={x} value={x}>
                            {kindNames[x] || serviceNames[x] || x}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      maxLength={254}
                      defaultValue={p?.email || ""}
                    />
                  </label>
                  <label>
                    {t("Phone", "Телефон", "Telefon")}
                    <input
                      name="phone"
                      maxLength={60}
                      defaultValue={p?.phone || ""}
                    />
                  </label>
                  <label>
                    {t(
                      "Internal notes",
                      "Внутренние заметки",
                      "Daxili qeydlər",
                    )}
                    <textarea
                      name="notes"
                      maxLength={4000}
                      defaultValue={p?.notes || ""}
                    />
                  </label>
                  <label className="om-check">
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={p?.active ?? true}
                    />
                    {t("Active", "Активен", "Aktiv")}
                  </label>
                </>
              )}
              {formType === "service" && (
                <>
                  <label>
                    {t("Partner", "Партнёр", "Partnyor")}
                    <select
                      name="partnerId"
                      required
                      defaultValue={s?.partner_id || partners[0]?.id}
                      disabled={!!selection}
                    >
                      {partners.map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    {selection && (
                      <input
                        type="hidden"
                        name="partnerId"
                        value={s?.partner_id}
                      />
                    )}
                  </label>
                  <label>
                    {t("Service type", "Тип услуги", "Xidmət növü")}
                    <select
                      name="serviceKey"
                      defaultValue={s?.service_key || "hotel"}
                    >
                      {[
                        "hotel",
                        "transport",
                        "guide",
                        "transfer",
                        "activity",
                      ].map((x) => (
                        <option key={x} value={x}>
                          {kindNames[x] || serviceNames[x] || x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Location", "Место", "Məkan")}
                    <input
                      required
                      name="location"
                      maxLength={160}
                      defaultValue={s?.location || ""}
                    />
                  </label>
                  <label>
                    {t("Currency", "Валюта", "Valyuta")}
                    <select name="currency" defaultValue={s?.currency || "EUR"}>
                      {["EUR", "USD", "AZN"].map((x) => (
                        <option key={x} value={x}>
                          {kindNames[x] || serviceNames[x] || x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Unit price", "Цена единицы", "Vahid qiyməti")}
                    <input
                      required
                      name="price"
                      type="number"
                      min="0"
                      step=".01"
                      defaultValue={s ? s.price_minor / 100 : ""}
                    />
                  </label>
                  <label>
                    {t("Available from", "Доступно с", "Başlama tarixi")}
                    <input
                      required
                      type="date"
                      name="from"
                      defaultValue={
                        s ? String(s.available_from).slice(0, 10) : ""
                      }
                    />
                  </label>
                  <label>
                    {t("Available to", "Доступно до", "Bitmə tarixi")}
                    <input
                      required
                      type="date"
                      name="to"
                      defaultValue={
                        s ? String(s.available_to).slice(0, 10) : ""
                      }
                    />
                  </label>
                  <label>
                    {t("Capacity", "Доступно", "Tutum")}
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      name="capacity"
                      defaultValue={s?.capacity ?? 1}
                    />
                  </label>
                  <label>
                    {t(
                      "Cancellation policy",
                      "Условия отмены",
                      "Ləğv şərtləri",
                    )}
                    <textarea
                      required
                      name="policy"
                      maxLength={4000}
                      defaultValue={s?.policy || ""}
                    />
                  </label>
                  <label className="om-check">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={s?.active ?? true}
                    />
                    {t("Active", "Активен", "Aktiv")}
                  </label>
                </>
              )}
            </div>
            <div className="om-actions">
              <button className="om-primary" disabled={busy || !dirty}>
                {t("Save", "Сохранить", "Saxla")}
              </button>
              <button type="button" onClick={() => edit(null, null)}>
                {t("Close", "Закрыть", "Bağla")}
              </button>
            </div>
          </form>
          {formType === "partner" && selection && admin && (
            <div className="om-sync">
              <h3>
                {t(
                  "Partner integration",
                  "Интеграция партнёра",
                  "Partnyor inteqrasiyası",
                )}
              </h3>
              <p>
                {t(
                  "Generate a key for this partner’s inventory API. Rotating invalidates the old key. Share it securely with the partner.",
                  "Создайте ключ API для этого партнёра. Старый ключ будет отозван.",
                  "Bu partnyorun inventar API-si üçün açar yaradın. Yeni açar köhnəni etibarsız edir. Partnyora təhlükəsiz ötürün.",
                )}
              </p>
              <button
                disabled={busy || dirty}
                onClick={async () => {
                  if (
                    !window.confirm(
                      t(
                        "Replace the integration key?",
                        "Заменить ключ интеграции?",
                        "İnteqrasiya açarı dəyişdirilsin?",
                      ),
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    const result = await api<{ key: string }>(
                      "/api/v1/operations/partners/" + p!.id + "/sync-key",
                      auth,
                      { version: p!.version },
                    );
                    setKey(result.key);
                    setSelection({ ...p!, version: p!.version + 1 });
                    await load();
                  } catch {
                    setError(
                      t(
                        "Could not rotate the key. Refresh and try again.",
                        "Не удалось заменить ключ. Обновите данные.",
                        "Açar dəyişmədi. Yeniləyib yoxlayın.",
                      ),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t(
                  "Generate / rotate key",
                  "Создать / заменить ключ",
                  "Açar yarat / dəyişdir",
                )}
              </button>
              {key && (
                <label>
                  {t(
                    "Shown once — store securely",
                    "Показывается один раз — сохраните безопасно",
                    "Bir dəfə göstərilir — təhlükəsiz saxlayın",
                  )}
                  <input readOnly value={key} />
                </label>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
