import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Locale } from "./api/client";
export default function OriginalPdfPreview({
  url,
  locale,
  onReady,
  onError,
}: {
  url: string;
  locale: Locale;
  onReady?: () => void;
  onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null),
    callbacks = useRef({ onReady, onError });
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(true),
    [failed, setFailed] = useState(false);
  const t = (en: string, ru: string, az: string) =>
    locale === "az" ? az : locale === "ru" ? ru : en;
  useEffect(() => {
    callbacks.current = { onReady, onError };
  }, [onReady, onError]);
  useEffect(() => {
    let active = true,
      task:
        ReturnType<(typeof import("pdfjs-dist"))["getDocument"]> | undefined;
    void import("pdfjs-dist")
      .then((lib) => {
        if (!active) return;
        lib.GlobalWorkerOptions.workerSrc = workerUrl;
        task = lib.getDocument({ url, enableXfa: false });
        return task.promise;
      })
      .then((pdf) => {
        if (active && pdf) {
          setDoc(pdf);
          setPage(1);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          callbacks.current.onError?.();
        }
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let active = true,
      render:
        | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
        | undefined;
    void doc
      .getPage(page)
      .then((pdfPage) => {
        if (!active || !canvas.current) return;
        setBusy(true);
        const el = canvas.current,
          width = Math.min(el.parentElement?.clientWidth || 500, 1000),
          base = pdfPage.getViewport({ scale: 1 }),
          view = pdfPage.getViewport({ scale: width / base.width }),
          ratio = Math.min(window.devicePixelRatio || 1, 2);
        el.width = view.width * ratio;
        el.height = view.height * ratio;
        el.style.width = "100%";
        el.style.height = view.height + "px";
        render = pdfPage.render({
          canvas: el,
          viewport: view,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        return render.promise;
      })
      .then(() => {
        if (active) {
          setBusy(false);
          callbacks.current.onReady?.();
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          callbacks.current.onError?.();
        }
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [doc, page]);
  return (
    <div
      style={{
        border: "1px solid #d7ddd7",
        background: "#fff",
        margin: "16px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
        }}
      >
        <button
          type="button"
          disabled={busy || page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {t("Previous page", "Предыдущая страница", "Əvvəlki səhifə")}
        </button>
        <span>
          {doc
            ? `${page} / ${doc.numPages}`
            : t("Loading PDF…", "Загрузка PDF…", "PDF yüklənir…")}
        </span>
        <button
          type="button"
          disabled={busy || !doc || page >= doc.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("Next page", "Следующая страница", "Növbəti səhifə")}
        </button>
      </div>
      {failed && (
        <p role="alert">
          {t(
            "Could not render PDF. Refresh the document.",
            "PDF не отображён. Обновите документ.",
            "PDF göstərilmədi. Sənədi yeniləyin.",
          )}
        </p>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={t(
          "Original PDF page",
          "Оригинальная страница PDF",
          "Orijinal PDF səhifəsi",
        )}
      />
    </div>
  );
}
