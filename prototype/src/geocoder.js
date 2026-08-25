const MAX_ADDRESS_LENGTH = 240;
import { sanitizeShortcutMap } from "./shortcuts.js";

const MAX_COMPONENT_LENGTH = 120;
const MAX_SUGGESTIONS = 5;

export const DEFAULT_GEOCODER_SETTINGS = Object.freeze({
  provider: "yandex",
  endpoint: "https://geocode-maps.yandex.ru/v1/",
  language: "ru_RU",
  cacheTtlMs: 5 * 60 * 1000,
  maxRequestsPerMinute: 12,
  timeoutMs: 10 * 1000,
});

export const GEOCODER_PROVIDERS = Object.freeze([
  { value: "yandex", label: "Яндекс" },
]);

function safeString(value, maxLength = MAX_COMPONENT_LENGTH) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= -180 && number <= 180 ? Number(number.toFixed(7)) : null;
}

function nonEmptyAddressDetails(details) {
  return Object.values(details || {}).some(Boolean);
}

export function normalizePlaceDetails(value) {
  const details = {
    locality: safeString(value?.locality),
    region: safeString(value?.region),
    country: safeString(value?.country),
    latitude: coordinate(value?.latitude),
    longitude: coordinate(value?.longitude),
    provider: safeString(value?.provider, 32),
    selectedAt: safeString(value?.selectedAt, 40),
  };
  return nonEmptyAddressDetails(details) ? details : null;
}

export function sanitizeGeocoderSettings(settings = {}) {
  const provider = GEOCODER_PROVIDERS.some((item) => item.value === settings?.provider) ? settings.provider : DEFAULT_GEOCODER_SETTINGS.provider;
  const cacheTtlMs = Number(settings?.cacheTtlMs);
  const maxRequestsPerMinute = Number(settings?.maxRequestsPerMinute);
  const timeoutMs = Number(settings?.timeoutMs);
  const language = safeString(settings?.language || DEFAULT_GEOCODER_SETTINGS.language, 16) || DEFAULT_GEOCODER_SETTINGS.language;
  const endpoint = Object.prototype.hasOwnProperty.call(settings, "endpoint") ? safeString(settings.endpoint, 500) : DEFAULT_GEOCODER_SETTINGS.endpoint;
  return {
    provider,
    endpoint,
    language,
    cacheTtlMs: Number.isFinite(cacheTtlMs) && cacheTtlMs >= 0 && cacheTtlMs <= 24 * 60 * 60 * 1000 ? Math.round(cacheTtlMs) : DEFAULT_GEOCODER_SETTINGS.cacheTtlMs,
    maxRequestsPerMinute: Number.isInteger(maxRequestsPerMinute) && maxRequestsPerMinute > 0 && maxRequestsPerMinute <= 60 ? maxRequestsPerMinute : DEFAULT_GEOCODER_SETTINGS.maxRequestsPerMinute,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 250 && timeoutMs <= 60 * 1000 ? Math.round(timeoutMs) : DEFAULT_GEOCODER_SETTINGS.timeoutMs,
  };
}

export function sanitizeProjectSettings(settings = {}) {
  const safe = settings && typeof settings === "object" ? { ...settings } : {};
  delete safe.geocoderApiKey;
  safe.shortcuts = sanitizeShortcutMap(settings?.shortcuts);
  return safe;
}

export function parseYandexSuggestions(payload) {
  const members = payload?.response?.GeoObjectCollection?.featureMember;
  if (!Array.isArray(members)) return [];
  return members.map((member, index) => {
    const object = member?.GeoObject || {};
    const metadata = object?.metaDataProperty?.GeocoderMetaData || {};
    const position = safeString(object?.Point?.pos, 64).split(/\s+/).map(Number);
    const components = addressComponents(metadata?.Address, metadata?.AddressDetails);
    const label = safeString(metadata?.Address?.formatted || object?.name || components.address || "", MAX_ADDRESS_LENGTH);
    if (!label) return null;
    return normalizeSuggestion({
      id: safeString(object?.uri || object?.description || `${index}-${label}`, 180),
      label,
      locality: components.locality,
      region: components.region,
      country: components.country,
      latitude: position[1],
      longitude: position[0],
      provider: "yandex",
    });
  }).filter(Boolean).slice(0, MAX_SUGGESTIONS);
}

function addressComponents(address, legacyDetails) {
  const result = { address: "", locality: "", region: "", country: "" };
  const modernComponents = Array.isArray(address?.Components) ? address.Components : [];
  modernComponents.forEach((component) => {
    const kind = safeString(component?.kind, 32).toLowerCase();
    const name = safeString(component?.name);
    if (!name) return;
    if (!result.country && kind === "country") result.country = name;
    if (!result.region && ["province", "area", "region"].includes(kind)) result.region = name;
    if (!result.locality && ["locality", "district"].includes(kind)) result.locality = name;
  });
  result.address = safeString(address?.formatted || address?.text || "", MAX_ADDRESS_LENGTH);
  const visit = (node, level = "") => {
    if (!node || typeof node !== "object") return;
    const addressLine = safeString(node.AddressLine);
    if (addressLine && !result.address) result.address = addressLine;
    if (node.Country) {
      result.country ||= safeString(node.Country.AddressLine || node.Country.CountryName);
      visit(node.Country, "country");
    }
    if (node.AdministrativeArea) {
      result.region ||= safeString(node.AdministrativeArea.AddressLine || node.AdministrativeArea.AdministrativeAreaName);
      visit(node.AdministrativeArea, "region");
    }
    if (node.Locality) {
      result.locality ||= safeString(node.Locality.AddressLine || node.Locality.LocalityName);
      visit(node.Locality, "locality");
    }
    if (node.DependentLocality) visit(node.DependentLocality, level);
    Object.entries(node).forEach(([key, value]) => {
      if (!["Country", "AdministrativeArea", "Locality", "DependentLocality", "AddressLine", "CountryName", "AdministrativeAreaName", "LocalityName"].includes(key)) visit(value, level);
    });
  };
  if (!result.address || !result.locality || !result.region || !result.country) visit(legacyDetails);
  return result;
}

function normalizeSuggestion(value) {
  const details = normalizePlaceDetails(value);
  if (!details) return null;
  return {
    id: safeString(value?.id, 180),
    label: safeString(value?.label || value?.address, MAX_ADDRESS_LENGTH),
    ...details,
  };
}

function cacheKey(provider, query) {
  return `${provider}:${safeString(query, MAX_ADDRESS_LENGTH).toLocaleLowerCase("ru-RU")}`;
}

function cacheGet(cache, key, now, ttl) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(cache, key, value, now, ttl) {
  cache.set(key, { value, expiresAt: now + ttl });
  while (cache.size > 50) cache.delete(cache.keys().next().value);
}

function getRateWindow(rateState, now) {
  if (!rateState || now - rateState.startedAt >= 60 * 1000) return { startedAt: now, count: 0 };
  return rateState;
}

function buildYandexUrl(endpoint, apiKey, query, language) {
  const url = new URL(endpoint);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("geocode", query);
  url.searchParams.set("lang", language);
  url.searchParams.set("format", "json");
  url.searchParams.set("results", String(MAX_SUGGESTIONS));
  return url;
}

function abortError(message, name = "AbortError") {
  const error = new Error(message);
  error.name = name;
  return error;
}

function createRequestController(parentSignal) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let externallyAborted = Boolean(parentSignal?.aborted);
  const abort = () => {
    externallyAborted = true;
    controller?.abort();
  };
  if (externallyAborted) abort();
  else parentSignal?.addEventListener?.("abort", abort, { once: true });
  return {
    signal: controller?.signal || parentSignal,
    wasExternallyAborted: () => externallyAborted,
    abort,
    cleanup: () => parentSignal?.removeEventListener?.("abort", abort),
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs, parentSignal) {
  const requestController = createRequestController(parentSignal);
  if (requestController.wasExternallyAborted()) {
    requestController.cleanup();
    throw abortError("Запрос отменён пользователем.");
  }
  let timedOut = false;
  let timeoutId;
  let cancelExternal;
  const request = Promise.resolve().then(() => fetchImpl(url, { ...options, signal: requestController.signal }));
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      requestController.abort();
      reject(abortError("Истекло время ожидания геокодера.", "TimeoutError"));
    }, timeoutMs);
  });
  const cancellation = parentSignal ? new Promise((_, reject) => {
    cancelExternal = () => reject(abortError("Запрос отменён пользователем."));
    parentSignal.addEventListener?.("abort", cancelExternal, { once: true });
  }) : null;
  try {
    return await Promise.race(cancellation ? [request, timeout, cancellation] : [request, timeout]);
  } catch (error) {
    if (timedOut) throw error;
    if (requestController.wasExternallyAborted()) throw abortError("Запрос отменён пользователем.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener?.("abort", cancelExternal);
    requestController.cleanup();
  }
}

export async function requestAddressSuggestions(query, options = {}) {
  const settings = sanitizeGeocoderSettings(options);
  const normalizedQuery = safeString(query, MAX_ADDRESS_LENGTH);
  const cache = options.cache || new Map();
  const now = Number(options.now?.() ?? Date.now());
  if (normalizedQuery.length < 3) return { status: "short-query", suggestions: [], message: "Введите не меньше трёх знаков." };
  if (!settings.endpoint || !safeString(options.apiKey, 500)) return { status: "disabled", suggestions: [], message: "Сервис не настроен. Адрес можно ввести вручную." };
  const key = cacheKey(settings.provider, normalizedQuery);
  const cached = cacheGet(cache, key, now, settings.cacheTtlMs);
  if (cached) return { status: "cached", suggestions: cached, message: "Подсказки взяты из локального кэша." };
  const windowState = getRateWindow(options.rateState, now);
  if (windowState.count >= settings.maxRequestsPerMinute) return { status: "rate-limited", suggestions: [], message: "Лимит запросов достигнут. Продолжайте ввод вручную или повторите позже." };
  windowState.count += 1;
  if (options.onRateState) options.onRateState(windowState);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return { status: "offline", suggestions: [], message: "Сетевой сервис недоступен. Продолжайте ввод вручную." };
  try {
    const url = buildYandexUrl(settings.endpoint, safeString(options.apiKey, 500), normalizedQuery, settings.language);
    const response = await fetchWithTimeout(fetchImpl, url.toString(), { method: "GET", headers: { Accept: "application/json" } }, settings.timeoutMs, options.signal);
    if (!response?.ok) {
      if (response?.status === 403) return { status: "invalid-key", suggestions: [], message: "Ключ Яндекс Геокодера недействителен. Проверьте ключ или продолжайте ввод вручную." };
      if (response?.status === 429) return { status: "rate-limited", suggestions: [], message: "Яндекс временно ограничил частоту запросов. Продолжайте ввод вручную или повторите позже." };
      throw new Error(`Geocoder response: ${response?.status || "network"}`);
    }
    const suggestions = parseYandexSuggestions(await response.json());
    cacheSet(cache, key, suggestions, now, settings.cacheTtlMs);
    return { status: "ok", suggestions, message: suggestions.length ? "Выберите подходящий адрес." : "Подсказки не найдены; адрес можно ввести вручную." };
  } catch (error) {
    if (error?.name === "TimeoutError") return { status: "timeout", suggestions: [], message: "Геокодер не ответил вовремя. Проверьте сеть или продолжайте ввод вручную." };
    if (error?.name === "AbortError" && options.signal?.aborted) return { status: "aborted", suggestions: [], message: "Поиск адреса отменён." };
    return { status: "offline", suggestions: [], message: "Не удалось получить подсказки. Проверьте сеть или продолжайте ввод вручную." };
  }
}
