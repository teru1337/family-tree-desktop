const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { atomicWriteTextFile, isRecoverableFileError } = require("./file-io.cjs");

const APP_ID = "ru.teru1337.familytree";
const RELEASES_URL = "https://github.com/teru1337/family-tree-desktop/releases";
const rendererRoot = path.resolve(__dirname, "..", "dist", "client");
let mainWindow = null;
let staticServer = null;
let currentUpdateVersion = "";
let downloadedUpdateVersion = "";
let updateCheckPromise = null;
let updateDownloadPromise = null;
const safeModeRequested = process.argv.some((argument) => ["--safe-mode", "--software-rendering"].includes(argument)) || process.env.FAMILY_TREE_SOFTWARE_RENDERING === "1";
if (safeModeRequested) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("use-gl", "swiftshader");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeFilePath(urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(rendererRoot, relativePath);
  const normalizedRoot = rendererRoot.toLowerCase();
  const normalizedCandidate = candidate.toLowerCase();
  if (normalizedCandidate !== normalizedRoot && !normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) return null;
  return candidate;
}

function startRendererServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (!request.url || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }

      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const filePath = safeFilePath(requestUrl.pathname);
      if (!filePath) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const servePath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : (extension ? null : path.join(rendererRoot, "index.html"));
      if (!servePath) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const contentType = mimeTypes[path.extname(servePath).toLowerCase()] || "application/octet-stream";
      response.setHeader("Content-Type", contentType);
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "HEAD") {
        response.writeHead(200);
        response.end();
        return;
      }
      const stream = fs.createReadStream(servePath);
      stream.on("error", () => {
        if (!response.headersSent) response.writeHead(500);
        response.end("Unable to read file");
      });
      stream.pipe(response);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function sendUpdateStatus(state, details = {}) {
  mainWindow?.webContents.send("family-tree-update-status", {
    state,
    currentVersion: app.getVersion(),
    ...details,
  });
}

function describeUpdateError(error) {
  return String(error?.message || error || "Неизвестная ошибка проверки обновлений")
    .replace(/https?:\/\/[^\s)]+/g, "ссылка на сервер обновлений");
}

function getAppIconPath() {
  const packagedIcon = path.join(process.resourcesPath, "family-circle.ico");
  const developmentIcon = path.join(__dirname, "..", "build-resources", "family-circle.ico");
  return fs.existsSync(packagedIcon) ? packagedIcon : developmentIcon;
}

function configureUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking"));
  autoUpdater.on("update-available", (info) => {
    currentUpdateVersion = info.version;
    downloadedUpdateVersion = "";
    sendUpdateStatus("available", {
      version: info.version,
      releaseDate: info.releaseDate || "",
    });
    void downloadUpdateInBackground();
  });
  autoUpdater.on("update-not-available", () => sendUpdateStatus("not-available"));
  autoUpdater.on("download-progress", (progress) => sendUpdateStatus("downloading", {
    version: currentUpdateVersion,
    percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
  }));
  autoUpdater.on("update-downloaded", (info) => {
    downloadedUpdateVersion = info.version;
    updateDownloadPromise = null;
    sendUpdateStatus("downloaded", { version: info.version });
  });
  autoUpdater.on("error", (error) => sendUpdateStatus("error", {
    message: describeUpdateError(error),
  }));
}

async function downloadUpdateInBackground() {
  if (downloadedUpdateVersion || updateDownloadPromise) return updateDownloadPromise;
  updateDownloadPromise = autoUpdater.downloadUpdate()
    .catch((error) => {
      const message = describeUpdateError(error);
      sendUpdateStatus("error", { message });
      return null;
    })
    .finally(() => {
      updateDownloadPromise = null;
    });
  return updateDownloadPromise;
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateStatus("unsupported");
    return { state: "unsupported", currentVersion: app.getVersion() };
  }
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = (async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { state: "checking", currentVersion: app.getVersion() };
    } catch (error) {
      const message = describeUpdateError(error);
      sendUpdateStatus("error", { message });
      return { state: "error", currentVersion: app.getVersion(), message };
    } finally {
      updateCheckPromise = null;
    }
  })();
  return updateCheckPromise;
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    sendUpdateStatus("unsupported");
    return { state: "unsupported", currentVersion: app.getVersion() };
  }
  if (downloadedUpdateVersion) return { state: "downloaded", version: downloadedUpdateVersion, currentVersion: app.getVersion() };
  if (!currentUpdateVersion) {
    const message = "Сначала проверьте наличие новой версии.";
    sendUpdateStatus("error", { message });
    return { state: "error", currentVersion: app.getVersion(), message };
  }
  try {
    await downloadUpdateInBackground();
    if (!downloadedUpdateVersion) {
      const message = "Не удалось завершить загрузку обновления.";
      return { state: "error", currentVersion: app.getVersion(), message };
    }
    return { state: "downloaded", version: downloadedUpdateVersion, currentVersion: app.getVersion() };
  } catch (error) {
    const message = describeUpdateError(error);
    return { state: "error", currentVersion: app.getVersion(), message };
  }
}

function installDownloadedUpdate() {
  if (!downloadedUpdateVersion) {
    const message = "Обновление ещё не загружено. Дождитесь завершения скачивания.";
    sendUpdateStatus("error", { message });
    return { state: "error", currentVersion: app.getVersion(), message };
  }
  autoUpdater.quitAndInstall(true, true);
  return { state: "installing", version: downloadedUpdateVersion, currentVersion: app.getVersion() };
}

function createWindow(port) {
  const appIconPath = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: false,
    fullscreen: true,
    fullscreenable: true,
    backgroundColor: "#f7f5ee",
    autoHideMenuBar: true,
    title: "Семейное древо",
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (process.platform === "win32") mainWindow.setIcon(appIconPath);
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.once("did-finish-load", () => {
    if (safeModeRequested && !mainWindow.isVisible()) mainWindow.show();
    if (app.isPackaged) setTimeout(() => checkForUpdates(), 1200);
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  if (safeModeRequested) mainWindow.show();
}

if (process.platform === "win32") app.setAppUserModelId(APP_ID);

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    configureUpdater();
    staticServer = await startRendererServer();
    createWindow(staticServer.port);
  }).catch((error) => {
    console.error("Не удалось запустить приложение:", error);
    app.quit();
  });

  ipcMain.on("family-tree-close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("family-tree-version", () => app.getVersion());
  ipcMain.handle("family-tree-runtime-status", () => ({ safeMode: safeModeRequested }));
  ipcMain.handle("family-tree-open-project-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Открыть семейное древо",
      defaultPath: app.getPath("documents"),
      properties: ["openFile"],
      filters: [
        { name: "Файл семейного древа", extensions: ["familytree", "json"] },
        { name: "Все файлы", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      text: await fs.promises.readFile(filePath, "utf8"),
    };
  });
  ipcMain.handle("family-tree-save-project-file", async (_event, request = {}) => {
    const isArchive = request.kind === "archive";
    const suggestedName = path.basename(String(request.suggestedName || "семейное-древо.familytree"));
    let filePath = String(request.filePath || "");
    if (!path.isAbsolute(filePath)) filePath = "";
    if (!filePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: isArchive ? "Сохранить архив семейных материалов" : "Сохранить семейное древо",
        defaultPath: path.join(app.getPath("documents"), suggestedName),
        filters: [
          { name: isArchive ? "Архив семейных материалов" : "Файл семейного древа", extensions: [isArchive ? "familyarchive" : "familytree"] },
          { name: "Все файлы", extensions: ["*"] },
        ],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }
    try {
      const result = await atomicWriteTextFile(filePath, JSON.stringify(request.payload || {}, null, 2));
      return { canceled: false, ...result };
    } catch (error) {
      if (request.filePath && isRecoverableFileError(error)) {
        return { canceled: false, needsSaveAs: true, errorCode: error.code || "FILE_ACCESS", errorMessage: error.message || "Недоступно" };
      }
      throw error;
    }
  });
  ipcMain.handle("family-tree-update-check", () => checkForUpdates());
  ipcMain.handle("family-tree-update-download", () => downloadUpdate());
  ipcMain.handle("family-tree-update-install", () => installDownloadedUpdate());
  ipcMain.handle("family-tree-open-releases", async () => {
    await shell.openExternal(RELEASES_URL);
    return true;
  });

  app.on("before-quit", () => {
    staticServer?.server.close();
  });
  app.on("window-all-closed", () => app.quit());
}
