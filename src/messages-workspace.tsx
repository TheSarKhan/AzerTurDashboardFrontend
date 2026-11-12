import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";

type Message = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  locale: string;
  state: "NEW" | "HANDLED";
  email_state: string;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
};

/** Messages from the public contact form. Staff mark each one handled once answered. */
export function MessagesWorkspace({
  auth,
  locale: l,
  onError,
}: {
  auth: string;
  locale: Locale;
  onError: (message: string) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [rows, setRows] = useState<Message[] | null>(null),
    [busy, setBusy] = useState(false);
  const topics: Record<string, string> = {
    general: t("General question", "Общий вопрос", "Ümumi sual"),
    custom: t("Custom journey", "Индивидуальный маршрут", "Fərdi səfər"),
    group: t("Group or corporate", "Группа / компания", "Qrup və ya korporativ"),
    partner: t("Partnership", "Партнёрство", "Əməkdaşlıq"),
  };
  async function load() {
    try {
      setRows(await api<Message[]>("/api/v1/operations/contact-messages", auth));
    } catch {
      onError(
        t(
          "Could not load messages.",
          "Не удалось загрузить сообщения.",
          "Mesajlar yüklənmədi.",
        ),
      );
    }
  }
  useEffect(() => {
    void load();
  }, [auth]);
  async function handled(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      setRows(
        await api<Message[]>(
          "/api/v1/operations/contact-messages/" + id + "/handled",
          auth,
          {},
        ),
      );
    } catch {
      await load();
    } finally {
      setBusy(false);
    }
  }
  if (!rows) return <p>{t("Loading…", "Загрузка…", "Yüklənir…")}</p>;
  return (
    <>
      <p>
        {t(
          "Messages sent from the website contact form. Reply by email, then mark the message handled.",
          "Сообщения из контактной формы сайта. Ответьте по email и отметьте сообщение обработанным.",
          "Saytın əlaqə formasından gələn mesajlar. Email ilə cavab verin, sonra mesajı işlənmiş kimi qeyd edin.",
        )}
      </p>
      {rows.length === 0 && (
        <div className="empty">
          {t("No messages yet.", "Сообщений пока нет.", "Hələ mesaj yoxdur.")}
        </div>
      )}
      {rows.map((m) => (
        <article key={m.id} className="reservation">
          <small>
            {new Date(m.created_at).toLocaleString(l)} ·{" "}
            {topics[m.topic] || m.topic} · {m.state}
          </small>
          <h2>{m.name}</h2>
          <p>
            <a href={"mailto:" + m.email}>{m.email}</a>
          </p>
          <p className="customer-note" style={{ whiteSpace: "pre-wrap" }}>
            {m.message}
          </p>
          {m.state === "NEW" ? (
            <button disabled={busy} onClick={() => void handled(m.id)}>
              {t("Mark handled", "Отметить обработанным", "İşlənmiş qeyd et")}
            </button>
          ) : (
            <small>
              {t("Handled by", "Обработал", "İşləyən")} {m.handled_by}
            </small>
          )}
        </article>
      ))}
    </>
  );
}
