const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "public", "branding", "family-circle.svg");
const pngPath = path.join(root, "public", "branding", "family-circle.png");
const icoPath = path.join(root, "build-resources", "family-circle.ico");
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = [];
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size === 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function renderLogo() {
  app.on("window-all-closed", (event) => event.preventDefault());
  await app.whenReady();
  const svg = await fs.readFile(sourcePath, "utf8");
  const preview = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    useContentSize: true,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    webPreferences: { offscreen: true, sandbox: true },
  });
  const html = `<!doctype html><html><head><style>html,body{width:1024px;height:1024px;margin:0;overflow:hidden;background:transparent}svg{display:block;width:1024px;height:1024px}</style></head><body>${svg}</body></html>`;
  await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await preview.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const image = await preview.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  if (image.isEmpty()) throw new Error("Не удалось отрендерить SVG логотипа.");

  await fs.writeFile(pngPath, image.resize({ width: 1024, height: 1024, quality: "best" }).toPNG());
  const icoImages = iconSizes.map((size) => ({ size, data: image.resize({ width: size, height: size, quality: "best" }).toPNG() }));
  await fs.writeFile(icoPath, createIco(icoImages));
  preview.destroy();
  console.log(`Brand assets ready: ${pngPath} and ${icoPath}`);
  app.quit();
}

renderLogo().catch((error) => {
  console.error("Не удалось подготовить брендовые изображения:", error);
  app.exit(1);
});
