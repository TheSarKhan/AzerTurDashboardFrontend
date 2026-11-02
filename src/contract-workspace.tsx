import { useEffect, useState } from "react";
import { api, type Locale } from "./api/client";

type Contract = { id: string; version: number; filename: string; state: string; sha256: string; offer_id: string; offer_revision: number; current_offer: boolean };
const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
export default function ContractWorkspace({ bookingId, auth, locale }: { bookingId: string; auth: string; locale: Locale }) {
  const t = (en: string, ru: string, az: string) => locale === "az" ? az : locale === "ru" ? ru : en;
  const [contract, setContract] = useState<Contract | null>(null);
  const [pdf, setPdf] = useState("");
  const [offerId, setOfferId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = "/api/v1/operations/bookings/" + bookingId + "/contract";
  async function load() {
    setOfferId("");
    try { const [document, context] = await Promise.all([api<Contract | null>(path, auth), api<{offerId: string}>(path + "-offer", auth)]); setContract(document); setOfferId(context.offerId); }
    catch { setError(t("Could not load contract.", "Не удалось загрузить договор.", "Müqaviləni yükləmək olmadı.")); }
  }
  useEffect(() => { setContract(null); setError(""); void load(); }, [bookingId]);
  useEffect(() => {
    if (!contract) { setPdf(""); return; }
    const abort = new AbortController();
    let url = "";
    fetch(base + path + "/" + contract.id + "/pdf", { headers: {Authorization: auth}, signal: abort.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw Error(); return r.blob(); })
      .then(blob => { if (abort.signal.aborted) return; url = URL.createObjectURL(blob); setPdf(url); })
      .catch(() => { if (!abort.signal.aborted) setError(t("Could not preview PDF.", "Не удалось открыть PDF.", "PDF-ə baxmaq olmadı.")); });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); setPdf(""); };
  }, [contract?.id, auth, bookingId]);
  async function upload(file: File) {
    if (file.size > 5_000_000) { setError(t("Maximum PDF size is 5 MB.", "Максимальный размер PDF — 5 МБ.", "PDF maksimum 5 MB ola bilər.")); return; }
    setBusy(true); setError("");
    const data = new FormData(); data.append("file", file); data.append("offerId", offerId);
    try {
      const response = await fetch(base + path, { method: "POST", headers: {Authorization: auth}, body: data });
      if (!response.ok) throw Error();
      setContract(await response.json());
    } catch { setError(t("Upload failed. Check the PDF and current offer.", "Не удалось загрузить PDF. Проверьте предложение.", "Yüklənmədi. PDF-i və cari təklifi yoxlayın.")); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!contract) return;
    setBusy(true); setError("");
    try { setContract(await api<Contract>(path + "/" + contract.id + "/send", auth, {})); }
    catch { setError(t("Could not send. Check the latest offer and any pending request.", "Не удалось отправить. Проверьте предложение и запросы.", "Göndərilmədi. Cari təklifi və gözləyən sorğuları yoxlayın.")); }
    finally { setBusy(false); }
  }
  return <section className="ow-contract">
    <h2>{t("Contract", "Договор", "Müqavilə")}</h2>
    <button className="ow-outline" disabled={busy} onClick={() => { setError(""); void load(); }}>{t("Refresh contract", "Обновить договор", "Müqaviləni yenilə")}</button>
    <p>{t("Upload the PDF for the latest sent offer. Review it before sending.", "Загрузите PDF для последнего предложения и проверьте перед отправкой.", "Son göndərilmiş təklifə aid PDF-i yükləyin və göndərməzdən əvvəl yoxlayın.")}</p>
    <label className="ow-outline">{t("Choose PDF", "Выбрать PDF", "PDF seç")} <input type="file" accept="application/pdf,.pdf" disabled={busy || !offerId} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f); e.currentTarget.value=""; }} /></label>
    {error && <p className="ow-error" role="alert">{error}</p>}
    {contract && <div><p><strong>{contract.filename}</strong> · v{contract.version} · {contract.state} · {t("Offer", "Предложение", "Təklif")} v{contract.offer_revision}</p>
      {pdf && <iframe title={t("Contract PDF preview","Просмотр PDF","Müqaviləyə baxış")} src={pdf} style={{width:"100%",height:520,border:"1px solid #ddd"}} />}
      {!contract.current_offer && <p className="ow-error">{t("The offer changed. Upload a new contract for the latest offer.", "Предложение изменилось. Загрузите новый договор.", "Təklif dəyişib. Son təklifə uyğun yeni müqavilə yükləyin.")}</p>}
      {contract.state === "DRAFT" && <p><button className="ow-primary" disabled={busy || !pdf || !contract.current_offer} onClick={() => void send()}>{t("Send contract","Отправить договор","Müqaviləni göndər")}</button></p>}
      {contract.current_offer && contract.state === "SENT" && <p>{t("Waiting for customer confirmation.","Ожидает подтверждения клиента.","Müştərinin təsdiqi gözlənilir.")}</p>}
      {contract.current_offer && contract.state === "ACCEPTED" && <p>{t("Confirmed by customer.","Подтверждено клиентом.","Müştəri təsdiqləyib.")}</p>}
    </div>}
  </section>;
}
