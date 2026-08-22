const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const APP_ID = "ru.teru1337.familytree";
const rendererRoot = path.resolve(__dirname, "..", "dist", "client");
let mainWindow = null;
let staticServer = null;

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

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#f7f5ee",
    autoHideMenuBar: true,
    title: "Семейное древо",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

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
    app.setAppUserModelId(APP_ID);
    staticServer = await startRendererServer();
    createWindow(staticServer.port);
  }).catch((error) => {
    console.error("Не удалось запустить приложение:", error);
    app.quit();
  });

  ipcMain.on("family-tree-close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  app.on("before-quit", () => {
    staticServer?.server.close();
  });
  app.on("window-all-closed", () => app.quit());
}
