import OriginalPdfPreview from "./original-pdf-preview";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  FileText,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import { api, type Locale } from "./api/client";
import { formatDateTime } from "./dates";
import "./contract-workspace.css";

type Contract = { id: string; version: number; filename: string; state: string; sha256: string; offer_id: string; offer_revision: number; current_offer: boolean; accepted_at?: string | null };
const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
export type ContractState = { id: string; state: string; accepted_at?: string | null; current_offer: boolean };
export default function ContractWorkspace({
  bookingId,
  auth,
  locale,
  onChange,
  onManage,
  children,
}: {
  bookingId: string;
  auth: string;
  locale: Locale;
  onChange?: (c: ContractState | null) => void;
  /** Opens the Booking page; offered once the customer has accepted. */
  onManage?: () => void;
  /** Shown between the progress line and the contract card (the offer summary). */
  children?: ReactNode;
}) {
  const t = (en: string, ru: string, az: string) => locale === "az" ? az : locale === "ru" ? ru : en;
  const [contract, setContract] = useState<Contract | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pdf, setPdf] = useState("");
  const [pdfReady, setPdfReady] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [offerId, setOfferId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const path = "/api/v1/operations/bookings/" + bookingId + "/contract";
  async function load() {
    setOfferId("");
    try { const [document, context] = await Promise.all([api<Contract | null>(path, auth), api<{offerId: string}>(path + "-offer", auth)]); setContract(document); setOfferId(context.offerId); }
    catch { setError(t("Could not load contract.", "Не удалось загрузить договор.", "Müqaviləni yükləmək olmadı.")); }
    finally { setLoaded(true); }
  }
  useEffect(() => { setContract(null); setLoaded(false); setError(""); void load(); }, [bookingId]);
  useEffect(() => { onChange?.(contract); }, [contract?.id, contract?.state, contract?.current_offer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPdfReady(false);
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
  async function generate() {
    setBusy(true); setError("");
    try { setContract(await api<Contract>(path + "/generate", auth, {})); }
    catch { setError(t("Could not create the contract. Check the latest offer and any pending request.", "Не удалось создать договор. Проверьте предложение и запросы.", "Müqavilə yaradılmadı. Cari təklifi və gözləyən sorğuları yoxlayın.")); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!contract) return;
    setBusy(true); setError("");
    try { setContract(await api<Contract>(path + "/" + contract.id + "/send", auth, {})); setShowPdf(false); }
    catch { setError(t("Could not send. Check the latest offer and any pending request.", "Не удалось отправить. Проверьте предложение и запросы.", "Göndərilmədi. Cari təklifi və gözləyən sorğuları yoxlayın.")); }
    finally { setBusy(false); }
  }

  const state = contract?.state;
  const outdated = !!contract && !contract.current_offer;
  const accepted = state === "ACCEPTED" && !outdated;
  const sentToCustomer = (state === "SENT" || state === "ACCEPTED") && !outdated;
  // The progress line: offer sent, contract sent, customer confirmed.
  const stages = [
    { done: true, text: t("Offer sent", "Предложение отправлено", "Təklif göndərildi") },
    { done: sentToCustomer, text: t("Contract sent", "Договор отправлен", "Müqavilə göndərildi") },
    { done: accepted, text: t("Customer confirmed", "Клиент подтвердил", "Müştəri təsdiqlədi") },
  ];
  const currentStage = stages.findIndex((s) => !s.done);
  const pdfOpen = state === "DRAFT" || outdated ? true : showPdf;
  const badge: { tone: string; text: string } = !contract
    ? { tone: "muted", text: t("Not created yet", "Ещё не создан", "Hələ yaradılmayıb") }
    : outdated
      ? { tone: "warn", text: t("Out of date", "Устарел", "Köhnəlib") }
      : state === "DRAFT"
        ? { tone: "warn", text: t("Draft, the customer cannot see it", "Черновик", "Qaralama, müştəri görmür") }
        : state === "SENT"
          ? { tone: "info", text: t("Waiting for the customer", "Ждём клиента", "Müştərini gözləyir") }
          : state === "ACCEPTED"
            ? { tone: "ok", text: t("Accepted", "Принят", "Təsdiqlənib") }
            : { tone: "muted", text: state || "" };

  return <section className="cw">
    <ol className="cw-stages" aria-label={t("Progress", "Ход", "Gedişat")}>
      {stages.map((s, i) => (
        <li key={i} className={(s.done ? "done " : "") + (i === currentStage ? "current" : "")}>
          <b>{s.done ? <Check size={14} /> : i + 1}</b>
          {s.text}
        </li>
      ))}
    </ol>
    {children}
    <div className="cw-card">
      <header>
        <span className="cw-icon"><FileText size={24} aria-hidden="true" /></span>
        <div>
          <h3>{t("Contract", "Договор", "Müqavilə")}</h3>
          <p>
            {accepted && contract?.accepted_at
              ? t("Accepted on ", "Принят: ", "Təsdiqlənib: ") + formatDateTime(contract.accepted_at)
              : !contract
                ? t("Created automatically from the sent offer, in the customer's language.", "Создаётся автоматически по предложению, на языке клиента.", "Göndərilmiş təklifdən müştərinin dilində avtomatik yaranır.")
                : state === "DRAFT"
                  ? t("Read it, then send it to the customer.", "Прочитайте и отправьте клиенту.", "Oxuyun, sonra müştəriyə göndərin.")
                  : ""}
          </p>
        </div>
        <span className={"cw-badge " + badge.tone}>{badge.text}</span>
      </header>
      {error && <p className="ow-error" role="alert">{error}</p>}
      <input ref={fileInput} type="file" hidden accept="application/pdf,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />

      {!loaded && <p className="cw-hint"><Clock size={16} aria-hidden="true" />{t("Loading...", "Загрузка...", "Yüklənir...")}</p>}

      {loaded && !contract && (
        <div className="cw-empty">
          <button className="ow-primary cw-main" disabled={busy || !offerId} onClick={() => void generate()}>
            <FileText size={18} aria-hidden="true" />
            {t("Create the contract", "Создать договор", "Müqaviləni yarat")}
          </button>
          <button className="cw-link" disabled={busy || !offerId} onClick={() => fileInput.current?.click()}>
            <Upload size={15} aria-hidden="true" />
            {t("or upload my own PDF", "или загрузить свой PDF", "və ya öz PDF-imi yükləyim")}
          </button>
        </div>
      )}

      {contract && (
        <>
          <div className="cw-file">
            <FileText size={18} aria-hidden="true" />
            <span>
              <strong>{contract.filename}</strong>
              <small>{t("Version", "Версия", "Versiya")} {contract.version}, {t("offer", "предложение", "təklif")} v{contract.offer_revision}</small>
            </span>
            {!(state === "DRAFT" || outdated) && (
              <button className="cw-toggle" aria-expanded={pdfOpen} onClick={() => setShowPdf(!showPdf)}>
                {pdfOpen ? t("Hide the contract", "Скрыть договор", "Müqaviləni gizlət") : t("View the contract", "Открыть договор", "Müqaviləyə bax")}
                <ChevronDown size={16} aria-hidden="true" className={pdfOpen ? "up" : ""} />
              </button>
            )}
          </div>
          {outdated && (
            <p className="cw-warn" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              {t("The offer changed after this contract was made. Create a new contract from the latest offer.", "Предложение изменилось. Создайте новый договор.", "Bu müqavilədən sonra təklif dəyişib. Son təklifə uyğun yeni müqavilə yaradın.")}
            </p>
          )}
          {pdfOpen && (
            <div className="cw-viewer">
              {pdf ? <OriginalPdfPreview key={pdf} url={pdf} locale={locale} onReady={() => setPdfReady(true)} onError={() => setPdfReady(false)} /> : <p className="cw-hint"><Clock size={16} aria-hidden="true" />{t("Opening the PDF...", "Открываем PDF...", "PDF açılır...")}</p>}
            </div>
          )}

          <div className="cw-actions">
            {outdated && (
              <button className="ow-primary cw-main" disabled={busy || !offerId} onClick={() => void generate()}>
                <RefreshCw size={18} aria-hidden="true" />
                {t("Create from the latest offer", "Создать по последнему предложению", "Son təklifdən yenidən yarat")}
              </button>
            )}
            {!outdated && state === "DRAFT" && (
              <button className="ow-primary cw-main" disabled={busy || !pdf || !pdfReady} onClick={() => void send()}>
                <Send size={18} aria-hidden="true" />
                {t("Send to the customer", "Отправить клиенту", "Müştəriyə göndər")}
              </button>
            )}
            {!outdated && state === "SENT" && (
              <p className="cw-wait"><Clock size={18} aria-hidden="true" />{t("Waiting for the customer to confirm. You will be notified.", "Ждём подтверждения клиента.", "Müştərinin təsdiqi gözlənilir.")}</p>
            )}
            {accepted && onManage && (
              <button className="ow-primary cw-main" onClick={onManage}>
                <CircleCheck size={18} aria-hidden="true" />
                {t("Manage the booking", "Управлять бронированием", "Rezervasiyanı idarə et")}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
            {!accepted && !outdated && (
              <span className="cw-secondary">
                <button className="cw-link" disabled={busy || !offerId} onClick={() => void generate()}>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t("Create again", "Создать заново", "Yenidən yarat")}
                </button>
                <button className="cw-link" disabled={busy || !offerId} onClick={() => fileInput.current?.click()}>
                  <Upload size={15} aria-hidden="true" />
                  {t("Upload my own PDF", "Загрузить свой PDF", "Öz PDF-imi yüklə")}
                </button>
              </span>
            )}
            {outdated && (
              <span className="cw-secondary">
                <button className="cw-link" disabled={busy || !offerId} onClick={() => fileInput.current?.click()}>
                  <Upload size={15} aria-hidden="true" />
                  {t("Upload my own PDF", "Загрузить свой PDF", "Öz PDF-imi yüklə")}
                </button>
              </span>
            )}
          </div>
          {state === "DRAFT" && !outdated && (
            <p className="cw-hint">{!pdfReady ? t("Wait for the contract to open, then send.", "Дождитесь открытия договора.", "Müqavilənin açılmasını gözləyin, sonra göndərin.") : t("The customer is notified when you send it.", "Клиент получит уведомление.", "Göndərəndə müştəriyə bildiriş gedir.")}</p>
          )}
        </>
      )}
    </div>
  </section>;
}
