import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";
import type { PartnerService } from "./office-management";
export default function PartnerPicker({
  auth,
  locale: l,
  serviceKey,
  currency,
  date,
  onSelect,
}: {
  auth: string;
  locale: Locale;
  serviceKey: string;
  currency: string;
  date: string;
  onSelect: (service: PartnerService) => void;
}) {
  const t = (en: string, ru: string, az: string) =>
    l === "az" ? az : l === "ru" ? ru : en;
  const [services, setServices] = useState<PartnerService[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    api<{ services: PartnerService[] }>("/api/v1/operations/partners", auth)
      .then((x) => setServices(x.services))
      .catch(() => setError(true));
  }, [auth]);
  const candidates = services.filter(
    (x) =>
      x.service_key === serviceKey &&
      x.currency === currency &&
      x.active &&
      x.partner_active &&
      x.capacity > 0 &&
      String(x.available_from).slice(0, 10) <= date &&
      String(x.available_to).slice(0, 10) >= date,
  );
  return (
    <label>
      {t(
        "Use partner catalogue",
        "Выбрать из каталога партнёров",
        "Partnyor kataloqundan seç",
      )}
      <select
        value=""
        onChange={(e) => {
          const s = candidates.find((x) => x.id === e.target.value);
          if (s) onSelect(s);
        }}
      >
        <option value="">
          {t("Select service…", "Выберите услугу…", "Xidmət seçin…")}
        </option>
        {candidates.map((x) => (
          <option value={x.id} key={x.id}>
            {x.partner_name} · {x.name} · {(x.price_minor / 100).toFixed(2)}{" "}
            {x.currency}
          </option>
        ))}
      </select>
      <small>
        {error
          ? t(
              "Catalogue could not load. Manual entry is available.",
              "Каталог недоступен. Введите вручную.",
              "Kataloq yüklənmədi. Manual daxil etmək olar.",
            )
          : t(
              "Matches the start date and currency. Confirm the full stay, capacity and supplier before sending.",
              "Совпадают дата начала и валюта. Подтвердите весь срок и вместимость.",
              "Başlama tarixi və valyuta uyğundur. Göndərməzdən əvvəl bütün müddəti, tutumu və təchizatçını yoxlayın.",
            )}
      </small>
    </label>
  );
}
