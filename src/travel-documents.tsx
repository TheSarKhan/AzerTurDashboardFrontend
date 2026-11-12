import OriginalPdfPreview from "./original-pdf-preview";
import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";
type Document = {
  id: string;
  version: number;
  title: string;
  filename: string;
  mime: string;
  sha256: string;
  state: string;
  status: string;
  service_key: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
};
const base = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
).replace(/\/$/, "");
export default function TravelDocuments({
  bookingId,
  auth,
  locale,
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
}) {
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  const [rows, setRows] = useState<Document[]>([]),
    [selected, setSelected] = useState<Document | null>(null),
    [url, setUrl] = useState(""),
    [previewLoaded, setPreviewLoaded] = useState(false),
    [checked, setChecked] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [customer, setCustomer] = useState<{ name: string; email: string } | null>(
      null,
    );
  const [serviceKey, setServiceKey] = useState("flight"),
    [kind, setKind] = useState("E_TICKET"),
    [title, setTitle] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [timezone, setTimezone] = useState("Asia/Baku"),
    [instructions, setInstructions] = useState(""),
    [replaces, setReplaces] = useState("");
  const path = "/api/v1/operations/bookings/" + bookingId + "/documents";
  async function load() {
    const [docs, owner] = await Promise.all([
      api<Document[]>(path, auth),
      api<{ name: string; email: string }>(
        "/api/v1/operations/bookings/" + bookingId + "/customer",
        auth,
      ),
    ]);
    setRows(docs);
    setCustomer(owner);
  }
  useEffect(() => {
    let active = true;
    setRows([]);
    setSelected(null);
    setCustomer(null);
    void load().catch(() => {
      if (active)
        setError(
          t(
            "Could not load documents.",
            "Документы не загружены.",
            "Sənədlər yüklənmədi.",
          ),
        );
    });
    return () => {
      active = false;
    };
  }, [bookingId, auth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUrl("");
    setChecked(false);
    setReviewed(false);
    setPreviewLoaded(false);
    if (!selected) return;
    const abort = new AbortController();
    let object = "";
    void fetch(base + path + "/" + selected.id + "/file", {
      headers: { Authorization: auth },
      cache: "no-store",
      signal: abort.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.blob();
      })
      .then((blob) => {
        if (abort.signal.aborted) return;
        object = URL.createObjectURL(blob);
        setUrl(object);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            t(
              "Preview unavailable.",
              "Просмотр недоступен.",
              "Önbaxış açılmadı.",
            ),
          );
      });
    return () => {
      abort.abort();
      if (object) URL.revokeObjectURL(object);
    };
  }, [selected?.id, bookingId, auth]); // eslint-disable-line react-hooks/exhaustive-deps
  async function upload(file: File) {
    if (
      file.size > 10_000_000 ||
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
    ) {
      setError(
        t(
          "Use PDF, JPG or PNG up to 10 MB.",
          "PDF, JPG или PNG до 10 МБ.",
          "10 MB-a qədər PDF, JPG və ya PNG seçin.",
        ),
      );
      return;
    }
    if (!title.trim() || !start || !end) {
      setError(
        t(
          "Enter title and ISO dates with timezone offset.",
          "Введите название и ISO-даты с часовым поясом.",
          "Başlıq və saat qurşağı ilə ISO tarixləri daxil edin.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (replaces) form.append("replaces", replaces);
      form.append("file", file);
      Object.entries({
        serviceKey,
        kind,
        title,
        startsAt: start,
        endsAt: end,
        timezone,
        instructions,
      }).forEach(([k, v]) => form.append(k, v));
      const r = await fetch(base + path, {
        method: "POST",
        headers: { Authorization: auth },
        body: form,
      });
      if (!r.ok) throw Error();
      const d = await r.json();
      await load();
      setSelected(d);
      setReplaces("");
    } catch {
      setError(
        t(
          "Upload failed. Check dates, format and booking state.",
          "Загрузка не удалась. Проверьте даты, формат и статус поездки.",
          "Yüklənmədi. Tarix, format və səfərin vəziyyətini yoxlayın.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(op: "preview" | "publish" | "revoke") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<Document>(path + "/" + selected.id + "/" + op, auth, {
        sha256: selected.sha256,
        customerChecked: checked,
      });
      setSelected(d);
      await load();
      if (op === "preview") setReviewed(true);
    } catch {
      setReviewed(false);
      setError(
        t(
          "Action failed. Refresh and review the latest document.",
          "Не удалось. Обновите и проверьте последний документ.",
          "Əməliyyat alınmadı. Son sənədi yeniləyib yoxlayın.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ow-contract">
      <h2>
        {t(
          "Tickets & original documents",
          "Билеты и оригиналы документов",
          "Biletlər və orijinal sənədlər",
        )}
      </h2>
      <p>
        {t(
          "Upload only genuine supplier PDF/JPG/PNG files. No airline QR or barcode is generated here.",
          "Загружайте только оригиналы поставщика PDF/JPG/PNG. QR и штрихкоды авиакомпаний здесь не создаются.",
          "Yalnız təchizatçının orijinal PDF/JPG/PNG fayllarını yükləyin. Aviaşirkət QR və barkodu yaradılmır.",
        )}
      </p>
      <p>
        <strong>{customer?.name}</strong> · {customer?.email} · #
        {bookingId.slice(0, 8)}
      </p>
      <label>
        {t(
          "New document or replacement?",
          "Новый документ или замена?",
          "Yeni sənəd, yoxsa əvəzləmə?",
        )}
        <select
          value={replaces}
          onChange={(e) => {
            setReplaces(e.target.value);
            const d = rows.find((x) => x.id === e.target.value);
            if (d) {
              setServiceKey(d.service_key);
              setKind(d.kind);
              setTitle(d.title);
            }
          }}
        >
          <option value="">
            {t(
              "New separate document (another passenger / leg)",
              "Отдельный документ (другой пассажир / рейс)",
              "Ayrı yeni sənəd (başqa sərnişin / istiqamət)",
            )}
          </option>
          {rows
            .filter((x) => x.state === "PUBLISHED" || x.state === "REVOKED")
            .map((d) => (
              <option value={d.id} key={d.id}>
                {t("Replace", "Заменить", "Əvəz et")}: {d.title} · v{d.version}
              </option>
            ))}
        </select>
      </label>
      <div className="td-grid">
        <label>
          {t("Service", "Услуга", "Xidmət")}
          <select
            value={serviceKey}
            onChange={(e) => setServiceKey(e.target.value)}
          >
            {[
              "flight",
              "hotel",
              "transport",
              "guide",
              "transfer",
              "activity",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Document type", "Тип документа", "Sənəd növü")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              "E_TICKET",
              "BOARDING_PASS",
              "HOTEL_VOUCHER",
              "TRANSFER_VOUCHER",
              "TOUR_VOUCHER",
              "OTHER",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Title", "Название", "Başlıq")}
          <input
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          {t("Timezone", "Часовой пояс", "Saat qurşağı")}
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="Asia/Baku"
          />
        </label>
        <label>
          {t(
            "Start · ISO with offset",
            "Начало · ISO с поясом",
            "Başlanğıc · saat qurşağı ilə ISO",
          )}
          <input
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="2026-12-18T10:00:00+04:00"
          />
        </label>
        <label>
          {t(
            "End · ISO with offset",
            "Конец · ISO с поясом",
            "Son · saat qurşağı ilə ISO",
          )}
          <input
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="2026-12-18T14:00:00+04:00"
          />
        </label>
      </div>
      <label>
        {t(
          "Customer instructions",
          "Инструкции клиенту",
          "Müştəri təlimatları",
        )}
        <textarea
          value={instructions}
          maxLength={2000}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="ow-outline">
        {t(
          "Upload original · max 10 MB",
          "Загрузить оригинал · до 10 МБ",
          "Orijinalı yüklə · maksimum 10 MB",
        )}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          disabled={busy || !customer}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.currentTarget.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="ow-error">
          {error}
        </p>
      )}
      <div className="td-list">
        {rows.map((d) => (
          <button
            type="button"
            className="ow-outline"
            key={d.id}
            disabled={busy}
            onClick={() => setSelected(d)}
          >
            {d.title} · v{d.version} · {d.status}
          </button>
        ))}
      </div>
      {selected && (
        <div>
          <h3>
            {selected.title} · v{selected.version}
          </h3>
          <p>
            {selected.filename} · {selected.status} · {selected.timezone}
          </p>
          {url &&
            (selected.mime === "application/pdf" ? (
              <OriginalPdfPreview
                key={url}
                url={url}
                locale={locale}
                onReady={() => setPreviewLoaded(true)}
                onError={() => setPreviewLoaded(false)}
              />
            ) : (
              <img
                alt="Original supplier document"
                src={url}
                onLoad={() => setPreviewLoaded(true)}
                style={{ width: "100%", maxHeight: 620, objectFit: "contain" }}
              />
            ))}
          {selected.state === "DRAFT" && (
            <>
              <p>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  {t(
                    "I checked the full original file and confirmed this is the correct customer and journey.",
                    "Я проверил оригинал, клиента и поездку.",
                    "Tam orijinal faylı yoxladım; müştəri və səfərin düzgün olduğunu təsdiqləyirəm.",
                  )}
                </label>
              </p>
              <button
                className="ow-outline"
                disabled={busy || !previewLoaded || !checked}
                onClick={() => void action("preview")}
              >
                {t(
                  "Record preview review",
                  "Зафиксировать проверку",
                  "Önbaxış yoxlamasını qeyd et",
                )}
              </button>
              <button
                className="ow-primary"
                disabled={busy || !previewLoaded || !checked || !reviewed}
                onClick={() => void action("publish")}
              >
                {t(
                  "Publish to customer",
                  "Опубликовать клиенту",
                  "Müştəriyə yayımla",
                )}
              </button>
            </>
          )}
          {selected.state === "PUBLISHED" && (
            <button
              className="ow-outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Revoke this document? The customer will see it as invalid.",
                      "Отозвать документ? Клиент увидит, что он недействителен.",
                      "Sənəd geri götürülsün? Müştəri onu etibarsız görəcək.",
                    ),
                  )
                )
                  void action("revoke");
              }}
            >
              {t("Revoke document", "Отозвать документ", "Sənədi geri götür")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
