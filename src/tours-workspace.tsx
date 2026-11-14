import { useState } from "react";
import { Plus, X } from "lucide-react";
import { api, type Locale, type Tour } from "./api/client";
import "./tours-workspace.css";

const IMAGES = ["mountains", "sheki", "gabala", "baku"] as const;

type Form = {
  titleEn: string;
  titleAz: string;
  titleRu: string;
  region: string;
  days: string;
  fromPriceEur: string;
  image: (typeof IMAGES)[number];
};
const empty: Form = {
  titleEn: "",
  titleAz: "",
  titleRu: "",
  region: "",
  days: "1",
  fromPriceEur: "",
  image: "mountains",
};

/** The journey catalogue with a form for adding a new journey. */
export function ToursWorkspace({
  auth,
  locale,
  tours,
  onCreated,
}: {
  auth: string;
  locale: Locale;
  tours: Tour[];
  onCreated: (tour: Tour) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  const [open, setOpen] = useState(false),
    [form, setForm] = useState<Form>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const imageNames: Record<string, string> = {
    mountains: t("Mountains", "Горы", "Dağlar"),
    sheki: t("Sheki", "Шеки", "Şəki"),
    gabala: t("Gabala", "Габала", "Qəbələ"),
    baku: t("Baku", "Баку", "Bakı"),
  };
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const title = (x: Tour) =>
    locale === "az" ? x.titleAz : locale === "ru" ? x.titleRu : x.titleEn;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const created = await api<Tour>("/api/v1/operations/tours", auth, {
        titleEn: form.titleEn.trim(),
        titleAz: form.titleAz.trim(),
        titleRu: form.titleRu.trim(),
        region: form.region.trim(),
        days: Number(form.days),
        fromPriceEur: Number(form.fromPriceEur),
        image: form.image,
      });
      onCreated(created);
      setDone(title(created) || created.titleEn);
      setForm(empty);
      setOpen(false);
    } catch {
      setError(
        t(
          "The journey could not be added. Check the fields and try again.",
          "Не удалось добавить поездку. Проверьте поля и повторите.",
          "Tur əlavə olunmadı. Sahələri yoxlayıb yenidən cəhd edin.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="tw">
      <div className="tw-bar">
        <p>
          {t(
            `${tours.length} journeys in the catalogue`,
            `Поездок в каталоге: ${tours.length}`,
            `Kataloqda ${tours.length} tur var`,
          )}
        </p>
        <button className="tw-add" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={16} /> : <Plus size={16} />}
          {open
            ? t("Cancel", "Отмена", "Ləğv et")
            : t("New journey", "Новая поездка", "Yeni tur")}
        </button>
      </div>
      {done && (
        <p role="status" className="tw-done">
          {t(
            `“${done}” was added.`,
            `«${done}» добавлена.`,
            `“${done}” əlavə olundu.`,
          )}
        </p>
      )}
      {open && (
        <form className="tw-form" onSubmit={submit}>
          <label>
            {t("Title (English)", "Название (English)", "Ad (ingiliscə)")}
            <input
              required
              maxLength={160}
              value={form.titleEn}
              onChange={(e) => set("titleEn", e.target.value)}
            />
          </label>
          <label>
            {t(
              "Title (Azerbaijani)",
              "Название (азербайджанский)",
              "Ad (azərbaycanca)",
            )}
            <input
              maxLength={160}
              value={form.titleAz}
              onChange={(e) => set("titleAz", e.target.value)}
              placeholder={t("Optional", "Необязательно", "İstəyə bağlı")}
            />
          </label>
          <label>
            {t("Title (Russian)", "Название (русский)", "Ad (rusca)")}
            <input
              maxLength={160}
              value={form.titleRu}
              onChange={(e) => set("titleRu", e.target.value)}
              placeholder={t("Optional", "Необязательно", "İstəyə bağlı")}
            />
          </label>
          <label>
            {t("Region", "Регион", "Bölgə")}
            <input
              required
              maxLength={160}
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              placeholder={t(
                "Quba, Khinalug",
                "Куба, Хыналыг",
                "Quba, Xınalıq",
              )}
            />
          </label>
          <label>
            {t("Days", "Дней", "Gün sayı")}
            <input
              required
              type="number"
              min={1}
              max={14}
              value={form.days}
              onChange={(e) => set("days", e.target.value)}
            />
          </label>
          <label>
            {t(
              "From price per person (EUR)",
              "Цена от, на человека (EUR)",
              "Başlayan qiymət, nəfər başına (EUR)",
            )}
            <input
              required
              type="number"
              min={1}
              max={100000}
              value={form.fromPriceEur}
              onChange={(e) => set("fromPriceEur", e.target.value)}
            />
          </label>
          <label>
            {t("Photo", "Фото", "Şəkil")}
            <select
              value={form.image}
              onChange={(e) => set("image", e.target.value as Form["image"])}
            >
              {IMAGES.map((k) => (
                <option key={k} value={k}>
                  {imageNames[k]}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="error tw-error">
              {error}
            </p>
          )}
          <div className="tw-actions">
            <button type="submit" disabled={busy}>
              {busy
                ? t("Saving…", "Сохранение…", "Saxlanılır…")
                : t("Add journey", "Добавить поездку", "Turu əlavə et")}
            </button>
          </div>
        </form>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Journey", "Поездка", "Səfər")}</th>
              <th>{t("Region", "Регион", "Bölgə")}</th>
              <th>{t("Duration", "Длительность", "Müddət")}</th>
              <th>
                {t("From / person", "От / чел.", "Başlayan qiymət / nəfər")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tours.map((tour) => (
              <tr key={tour.slug}>
                <td>
                  {title(tour)}
                  <small>{tour.slug}</small>
                </td>
                <td>{tour.region}</td>
                <td>
                  {tour.days} {t("days", "дн.", "gün")}
                </td>
                <td>€{tour.fromPriceEur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
