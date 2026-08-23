export function runBackgroundExport(payload, { onProgress } = {}) {
  if (typeof Worker === "undefined") {
    const error = new Error("Фоновый экспорт недоступен в этом режиме.");
    error.isBackgroundExportError = true;
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./export-worker.js", import.meta.url), { type: "module" });
    const finish = (callback, value) => {
      worker.terminate();
      callback(value);
    };
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === "progress") {
        onProgress?.(message);
        return;
      }
      if (message.type === "done") finish(resolve, { blob: message.blob });
      if (message.type === "error") {
        const error = new Error(message.message || "Фоновый экспорт не выполнен.");
        error.isBackgroundExportError = true;
        finish(reject, error);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Фоновый экспорт недоступен.");
      error.isBackgroundExportError = true;
      finish(reject, error);
    };
    worker.postMessage(payload);
  });
}
