const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const rendererRoot = path.join(projectRoot, "dist", "client");
const sourceRoot = path.join(projectRoot, "public", "instruction");
const fixturePath = path.join(projectRoot, "test-data", "stage-7-synthetic.familytree");
const captureViewport = { width: 1600, height: 900 };
const outputViewport = { width: 1265, height: 712 };
const captureUserData = path.join(os.tmpdir(), "family-tree-instruction-capture");

app.setPath("userData", captureUserData);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const relative = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath).replace(/^\/+/, "");
  const candidate = path.resolve(rendererRoot, relative);
  if (candidate !== rendererRoot && !candidate.startsWith(`${rendererRoot}${path.sep}`)) return null;
  return candidate;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      if (!request.url || request.method !== "GET") {
        response.writeHead(405);
        response.end();
        return;
      }
      let filePath;
      try {
        filePath = safePath(new URL(request.url, "http://127.0.0.1").pathname);
      } catch {
        filePath = null;
      }
      if (!filePath) {
        response.writeHead(403);
        response.end();
        return;
      }
      let servePath = filePath;
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) throw new Error("not a file");
      } catch {
        if (path.extname(filePath)) {
          response.writeHead(404);
          response.end();
          return;
        }
        servePath = path.join(rendererRoot, "index.html");
      }
      response.setHeader("Content-Type", mimeTypes[path.extname(servePath).toLowerCase()] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      const content = await fs.readFile(servePath);
      response.writeHead(200);
      response.end(content);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function waitForLoad(window) {
  return new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run() {
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const { server, port } = await startServer();
  const window = new BrowserWindow({
    show: true,
    width: captureViewport.width,
    height: captureViewport.height,
    useContentSize: true,
    backgroundColor: "#fffdf8",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const workingCopy = JSON.stringify(fixture);
  const backups = JSON.stringify([{ id: "capture-backup", createdAt: "2026-08-23T12:00:00.000Z", reason: "auto", peopleCount: fixture.people.length, payload: fixture }]);
  const setFixture = `localStorage.setItem("familytree-working-copy-v1", ${JSON.stringify(workingCopy)}); localStorage.setItem("familytree-backups-v1", ${JSON.stringify(backups)}); location.reload();`;

  await window.loadURL(`http://127.0.0.1:${port}/`);
  await window.webContents.executeJavaScript(setFixture);
  await waitForLoad(window);
  // Дождаться исчезновения уведомления о восстановлении рабочей копии, чтобы
  // оно не перекрывало элементы на учебных кадрах.
  await sleep(3100);

  const click = async (selector) => {
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
    await sleep(300);
  };
  const clickButtonText = async (text) => {
    await window.webContents.executeJavaScript(`(() => { const target = [...document.querySelectorAll("button")].find((button) => button.textContent.includes(${JSON.stringify(text)})); target?.click(); })()`);
    await sleep(350);
  };
  const capture = async (number) => {
    const visibleState = await window.webContents.executeJavaScript(`({ menu: Boolean(document.querySelector('.main-menu-backdrop')), editor: Boolean(document.querySelector('.editor-content')), backup: Boolean(document.querySelector('#backup-modal-title')), export: Boolean(document.querySelector('#export-modal-title')) })`);
    console.log(`capture ${number}`, JSON.stringify(visibleState));
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: captureViewport.width, height: captureViewport.height });
    const resized = image.resize({ width: outputViewport.width, height: outputViewport.height, quality: "best" });
    await fs.writeFile(path.join(sourceRoot, `source-${number}.jpg`), resized.toJPEG(94));
  };

  await click(".menu-action");
  await capture("01-menu");
  await click('button[aria-label="Закрыть главное меню"]');
  await capture("02-project");
  await click(".add-person-button");
  await capture("03-person");
  await clickButtonText("Отмена");
  await capture("04-tree");
  await click('.search-wrap input');
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('.search-wrap input'); if (!input) return; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "Орлов"); input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(500);
  await capture("05-search");
  await click(".relationship-manage-button");
  await capture("06-relationships");
  await clickButtonText("Отмена");
  await click(".more-button");
  await clickButtonText("Резервные копии");
  await capture("07-backups");
  await click('button[aria-label="Закрыть резервные копии"]');
  await clickButtonText("Экспорт");
  await capture("08-export-settings");

  window.destroy();
  server.close();
  app.quit();
}

app.on("window-all-closed", (event) => event.preventDefault());
app.whenReady().then(run).catch((error) => {
  console.error("Не удалось снять скриншоты инструкции:", error);
  app.exit(1);
});
