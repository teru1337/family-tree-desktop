const fs = require("node:fs");
const path = require("node:path");

const RECOVERABLE_FILE_ERRORS = new Set(["EACCES", "EBUSY", "EISDIR", "ENODEV", "ENOENT", "ENOTDIR", "EPERM", "EROFS"]);

function isRecoverableFileError(error) {
  return RECOVERABLE_FILE_ERRORS.has(String(error?.code || ""));
}

async function atomicWriteTextFile(filePath, content) {
  const absolutePath = path.resolve(String(filePath));
  const directory = path.dirname(absolutePath);
  const baseName = path.basename(absolutePath);
  const temporaryPath = path.join(directory, `.${baseName}.${process.pid}.${Date.now()}.tmp`);
  const backupPath = `${absolutePath}.backup`;
  let replacedExisting = false;

  try {
    const existing = await fs.promises.stat(absolutePath);
    replacedExisting = existing.isFile();
    if (!replacedExisting) throw Object.assign(new Error("Целевой путь не является файлом."), { code: "EISDIR" });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  try {
    await fs.promises.writeFile(temporaryPath, content, "utf8");
    const verifiedContent = await fs.promises.readFile(temporaryPath, "utf8");
    if (verifiedContent !== content) throw new Error("Проверка временного файла сохранения не пройдена.");
    if (replacedExisting) await fs.promises.copyFile(absolutePath, backupPath);
    await fs.promises.rename(temporaryPath, absolutePath);
    return { filePath: absolutePath, backupPath: replacedExisting ? backupPath : "", replacedExisting };
  } catch (error) {
    try { await fs.promises.unlink(temporaryPath); } catch { /* временный файл уже отсутствует */ }
    throw error;
  }
}

module.exports = { atomicWriteTextFile, isRecoverableFileError };
