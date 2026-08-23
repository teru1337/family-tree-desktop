import { useEffect, useMemo, useState } from "react";
import { Info, X } from "@phosphor-icons/react";
import { runBackgroundExport } from "./export-worker-client.js";
import {
  EXPORT_QUALITY,
  PAPER_SIZES,
  buildPdfFromCanvas,
  buildTreeSvg,
  calculatePosterPlan,
  checkExportReadability,
  canvasToBlob,
  canvasToTiff,
  downloadBlob,
  renderTreeImage,
} from "./exporters.js";
import { sanitizeCardFields } from "./person-fields.js";
import { explainUserError } from "./ui-feedback.js";
import { buildTreeLayout } from "./tree-layout.js";

export function ExportModal({ initialFormat = "pdf", people, partnerships, treeStyle, showPhotos, cardFields, onClose, onToast }) {
  const [format, setFormat] = useState(initialFormat);
  const [quality, setQuality] = useState(initialFormat === "print" ? "print" : "print");
  const [pdfMode, setPdfMode] = useState(initialFormat === "print" ? "tiles" : "poster");
  const [paper, setPaper] = useState("a4");
  const [orientation, setOrientation] = useState("landscape");
  const [cardSize, setCardSize] = useState("standard");
  const [spacing, setSpacing] = useState("comfortable");
  const [fontScale, setFontScale] = useState("standard");
  const [connectionDensity, setConnectionDensity] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const layoutOptions = useMemo(() => {
    const cardOptions = { compact: { cardWidth: 190, cardHeight: 92 }, standard: { cardWidth: 220, cardHeight: 102 }, large: { cardWidth: 250, cardHeight: 114 } };
    const spacingOptions = { compact: { columnStep: 280, rowStep: 230, horizontalPadding: 260, verticalPadding: 180 }, comfortable: { columnStep: 350, rowStep: 280, horizontalPadding: 300, verticalPadding: 210 }, spacious: { columnStep: 430, rowStep: 340, horizontalPadding: 340, verticalPadding: 240 } };
    const base = cardOptions[cardSize];
    return { ...base, cardHeight: base.cardHeight + Math.max(0, sanitizeCardFields(cardFields).length - 1) * 14, ...spacingOptions[spacing] };
  }, [cardSize, spacing, cardFields]);
  const layout = useMemo(() => buildTreeLayout(people, partnerships, layoutOptions), [people, partnerships, layoutOptions]);
  const qualityInfo = EXPORT_QUALITY[quality] || EXPORT_QUALITY.print;
  const fontScaleValue = fontScale === "large" ? 1.2 : fontScale === "extra-large" ? 1.35 : 1;
  const connectionGap = connectionDensity === "spacious" ? 44 : 24;
  const pixelWidth = Math.round(layout.width * qualityInfo.scale);
  const pixelHeight = Math.round(layout.height * qualityInfo.scale);
  const tileSize = PAPER_SIZES[paper] || PAPER_SIZES.a4;
  const pageWidth = orientation === "landscape" ? tileSize.height : tileSize.width;
  const pageHeight = orientation === "landscape" ? tileSize.width : tileSize.height;
  const exportMode = format === "print" ? "tiles" : format === "pdf" ? pdfMode : "image";
  const posterPlan = useMemo(() => calculatePosterPlan(layout, { scale: qualityInfo.scale }), [layout, qualityInfo.scale]);
  const readability = useMemo(() => checkExportReadability({ format, mode: exportMode, scale: qualityInfo.scale, fontScale: fontScaleValue, peopleCount: people.length }), [format, exportMode, qualityInfo.scale, fontScaleValue, people.length]);
  const pageCount = exportMode === "poster" ? 1 : Math.ceil(pixelWidth / (pageWidth * 2)) * Math.ceil(pixelHeight / (pageHeight * 2));
  const previewCaption = format === "pdf" && pdfMode === "poster"
    ? "Предпросмотр большого плаката"
    : format === "png"
      ? "Предпросмотр изображения PNG"
      : format === "tiff"
        ? "Предпросмотр изображения TIFF"
        : "Предпросмотр разметки по листам";
  const formatOptions = [
    { value: "pdf", title: "PDF", description: "плакат или листы" },
    { value: "png", title: "PNG", description: "изображение для альбома" },
    { value: "tiff", title: "TIFF", description: "для типографии" },
    { value: "print", title: "Печать по листам", description: "многостраничный PDF" },
  ];

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    const timer = window.setTimeout(() => {
      buildTreeSvg({ people, partnerships, layout, treeStyle, showPhotos, cardFields, fontScale: fontScaleValue, connectionGap })
        .then((svg) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
          setPreviewUrl(objectUrl);
        })
        .catch((error) => {
          if (cancelled) return;
          setPreviewError(explainUserError(error, { action: "Не удалось подготовить предпросмотр", next: "проверьте параметры экспорта и повторите" }));
        })
        .finally(() => {
          if (!cancelled) setPreviewBusy(false);
        });
    }, 0);
    setPreviewUrl("");
    setPreviewBusy(true);
    setPreviewError("");
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [people, partnerships, layout, treeStyle, showPhotos, cardFields, fontScaleValue, connectionGap, previewAttempt]);

  const runExport = async () => {
    setBusy(true);
    setExportProgress("Подготавливаю файл…");
    const baseName = `семейное-древо-${new Date().toISOString().slice(0, 10)}`;
    const createExportInMainThread = async () => {
      const rendered = await renderTreeImage({ people, partnerships, layout, treeStyle, showPhotos, cardFields, scale: qualityInfo.scale, fontScale: fontScaleValue, connectionGap });
      if (format === "png") return { blob: await canvasToBlob(rendered.canvas, "image/png"), fileName: `${baseName}.png`, message: "PNG-файл подготовлен" };
      if (format === "tiff") return { blob: canvasToTiff(rendered.canvas), fileName: `${baseName}.tiff`, message: "TIFF-файл подготовлен" };
      const pdf = await buildPdfFromCanvas(rendered.canvas, { mode: exportMode, paper, orientation, posterPlan });
      return { blob: pdf, fileName: `${baseName}-${exportMode === "poster" ? "плакат" : "печать"}.pdf`, message: exportMode === "poster" ? "PDF-плакат подготовлен" : "PDF для печати подготовлен" };
    };
    try {
      let result;
      try {
        result = await runBackgroundExport({ people, partnerships, layout, treeStyle, showPhotos, cardFields, scale: qualityInfo.scale, fontScale: fontScaleValue, connectionGap, format: format === "print" ? "pdf" : format, mode: exportMode, paper, orientation, posterPlan }, { onProgress: ({ label }) => setExportProgress(label) });
      } catch (error) {
        if (!error.isBackgroundExportError) throw error;
        setExportProgress("Фоновый режим недоступен, готовлю файл…");
        result = await createExportInMainThread();
      }
      downloadBlob(result.blob, result.fileName);
      onToast(result.message);
      onClose();
    } catch (error) {
      onToast(explainUserError(error, { action: "Не удалось подготовить файл", next: "проверьте формат и параметры экспорта, затем повторите" }));
    } finally {
      setBusy(false);
      setExportProgress("");
    }
  };

  return (
    <div className="backup-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="backup-modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="backup-modal-header"><div><span className="eyebrow">Локальный экспорт</span><h2 id="export-modal-title">Экспорт семейного дерева</h2><p>Файл создаётся на этом компьютере из текущего вида дерева.</p></div><button type="button" className="icon-button backup-close" onClick={onClose} aria-label="Закрыть экспорт"><X size={21} /></button></div>
        <div className="export-modal-body">
          <div className="export-setting-group"><span className="field-label">Формат</span><div className="export-format-list">{formatOptions.map((option) => <button type="button" key={option.value} className={`export-choice ${format === option.value ? "selected" : ""}`} onClick={() => { setFormat(option.value); if (option.value === "print") setPdfMode("tiles"); }}><strong>{option.title}</strong><small>{option.description}</small></button>)}</div></div>
          <div className="export-setting-group"><span className="field-label">Качество изображения</span><div className="export-quality-list">{Object.entries(EXPORT_QUALITY).map(([value, info]) => <button type="button" key={value} className={`export-choice export-quality-choice ${quality === value ? "selected" : ""}`} onClick={() => setQuality(value)}><strong>{info.label}</strong><small>{info.description}</small></button>)}</div></div>
          <div className="export-setting-group"><span className="field-label">Оформление карточек и связей</span><div className="export-form-grid"><label className="field"><span>Размер карточек</span><select value={cardSize} onChange={(event) => setCardSize(event.target.value)}><option value="compact">Компактный</option><option value="standard">Стандартный</option><option value="large">Крупный</option></select></label><label className="field"><span>Отступы между поколениями</span><select value={spacing} onChange={(event) => setSpacing(event.target.value)}><option value="compact">Меньше</option><option value="comfortable">Обычные</option><option value="spacious">Больше</option></select></label><label className="field"><span>Размер шрифта</span><select value={fontScale} onChange={(event) => setFontScale(event.target.value)}><option value="standard">Стандартный</option><option value="large">Крупный</option><option value="extra-large">Очень крупный</option></select></label><label className="field"><span>Плотность связей</span><select value={connectionDensity} onChange={(event) => setConnectionDensity(event.target.value)}><option value="normal">Обычная</option><option value="spacious">Свободная</option></select></label></div></div>
          {(format === "pdf" || format === "print") && <div className="export-setting-group"><span className="field-label">Разметка страниц</span>{format === "pdf" && <div className="export-mode-list"><button type="button" className={`export-choice ${pdfMode === "poster" ? "selected" : ""}`} onClick={() => setPdfMode("poster")}><strong>Большой плакат</strong><small>Всё дерево на одном огромном листе</small></button><button type="button" className={`export-choice ${pdfMode === "tiles" ? "selected" : ""}`} onClick={() => setPdfMode("tiles")}><strong>Листы по страницам</strong><small>Разбить дерево на страницы для печати</small></button></div>}<div className="export-form-grid"><label className="field"><span>Размер листа</span><select value={paper} onChange={(event) => setPaper(event.target.value)}><option value="a4">A4</option><option value="a3">A3</option><option value="a2">A2</option></select></label><label className="field"><span>Ориентация</span><select value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="landscape">Альбомная</option><option value="portrait">Книжная</option></select></label></div></div>}
          <div className={`export-readability export-readability-${readability.level}`} role="status"><strong>Читаемость</strong><span>{readability.message}</span></div>
          <div className="export-preview" aria-live="polite"><div className="export-preview-header"><div><span className="field-label">Предпросмотр</span><strong>{previewCaption}</strong></div><span className="export-preview-mode">{exportMode === "poster" ? "Одно полотно" : exportMode === "image" ? "Одно изображение" : `${pageCount} ${pageCount === 1 ? "лист" : pageCount < 5 ? "листа" : "листов"}`}</span></div><div className={`export-preview-stage ${previewBusy ? "is-loading" : ""}`} aria-busy={previewBusy}>{previewBusy && <div className="export-preview-placeholder"><span className="preview-spinner" aria-hidden="true" /><strong>Готовлю предпросмотр…</strong><small>Компоновка дерева появится здесь</small></div>}{!previewBusy && previewError && <div className="export-preview-placeholder"><Info size={25} /><strong>Предпросмотр недоступен</strong><small>{previewError}</small><button type="button" className="button button-secondary preview-retry" onClick={() => setPreviewAttempt((attempt) => attempt + 1)}>Повторить</button></div>}{!previewBusy && !previewError && previewUrl && <img className="export-preview-image" src={previewUrl} alt={`Предпросмотр: ${previewCaption.toLowerCase()}`} />}</div><small className="export-preview-help">Показана вся компоновка дерева. Итоговый файл сохранится с выбранным качеством: {qualityInfo.label.toLowerCase()}.</small></div>
          <div className="export-summary"><div><strong>{pixelWidth.toLocaleString("ru-RU")} × {pixelHeight.toLocaleString("ru-RU")} пикселей</strong><span>Текущее дерево: {people.length} человек · {layout.generations.length} поколения</span>{exportMode === "poster" && <span>Авторазмер плаката: {posterPlan.widthCm} × {posterPlan.heightCm} см · {posterPlan.generations} поколений</span>}</div>{(format === "pdf" || format === "print") && <span>{exportMode === "poster" ? "1 лист-плакат" : `${pageCount} ${pageCount === 1 ? "лист" : pageCount < 5 ? "листа" : "листов"}`}</span>}</div>
          <div className="backup-note"><Info size={16} /> PNG подходит для семейного альбома, TIFF — для типографии, PDF — для домашней печати и большого плаката.</div>
        </div>
        <div className="export-footer"><button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>Отмена</button><button type="button" className="button button-primary" onClick={runExport} disabled={busy}>{busy ? exportProgress || "Подготавливаю…" : "Создать файл"}</button></div>
      </section>
    </div>
  );
}
