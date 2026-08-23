#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "dist", "client", "assets");
const maxMainBundleBytes = 500_000;
const mainBundles = readdirSync(assets)
  .filter((name) => /^index-[^/]+\.js$/.test(name))
  .map((name) => ({ name, size: statSync(path.join(assets, name)).size }))
  .sort((first, second) => second.size - first.size);

if (!mainBundles.length) throw new Error("Не найден основной JS-бандл renderer-приложения.");

const mainBundle = mainBundles[0];
if (mainBundle.size > maxMainBundleBytes) {
  throw new Error(`Основной JS-бандл слишком большой: ${mainBundle.name} — ${mainBundle.size} байт, лимит — ${maxMainBundleBytes} байт.`);
}

console.log(`Bundle budget ok: ${mainBundle.name} — ${mainBundle.size} / ${maxMainBundleBytes} байт`);
