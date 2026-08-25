import { useEffect, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
import { DEFAULT_GEOCODER_SETTINGS, requestAddressSuggestions } from "./geocoder.js";

let sessionApiKey = "";

export function AddressField({ draft, errors, onChange, geocoderConfig }) {
  const [suggestions, setSuggestions] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map());
  const rateStateRef = useRef({ startedAt: 0, count: 0 });
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
    requestControllerRef.current?.abort();
  }, []);
  const cancelSearch = () => {
    requestIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
  };
  const updatePlace = (value) => {
    cancelSearch();
    onChange({ ...draft, place: value, placeDetails: null });
    setSuggestions([]);
    setMessage("");
  };
  const search = async () => {
    cancelSearch();
    const requestId = requestIdRef.current;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    requestControllerRef.current = controller;
    setLoading(true);
    try {
      if (!sessionApiKey && typeof window !== "undefined") sessionApiKey = String(window.prompt("Введите API-ключ Яндекс Геокодера. Ключ будет храниться только до закрытия приложения.") || "").trim();
      if (!sessionApiKey) {
        if (mountedRef.current && requestId === requestIdRef.current) setMessage("Ключ не введён. Адрес можно продолжить вводить вручную.");
        return;
      }
      const result = await requestAddressSuggestions(draft.place, {
        endpoint: DEFAULT_GEOCODER_SETTINGS.endpoint,
        ...geocoderConfig,
        apiKey: geocoderConfig?.apiKey || sessionApiKey,
        cache: cacheRef.current,
        rateState: rateStateRef.current,
        onRateState: (state) => { rateStateRef.current = state; },
        signal: controller?.signal,
        fetchImpl: typeof window !== "undefined" && typeof window.fetch === "function" ? window.fetch.bind(window) : undefined,
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (result.status !== "aborted") setSuggestions(result.suggestions || []);
      if (result.status !== "aborted") setMessage(result.message || "");
    } catch {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setSuggestions([]);
        setMessage("Не удалось получить подсказки. Адрес можно продолжить вводить вручную.");
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        requestControllerRef.current = null;
      }
    }
  };
  const choose = (suggestion) => {
    onChange({ ...draft, place: suggestion.label, placeDetails: { locality: suggestion.locality, region: suggestion.region, country: suggestion.country, latitude: suggestion.latitude, longitude: suggestion.longitude, provider: suggestion.provider, selectedAt: new Date().toISOString() } });
    setSuggestions([]);
    setMessage("Адрес выбран и сохранён вместе со структурированными данными.");
  };
  return <div className={`field field-full address-field ${errors?.place ? "has-error" : ""}`}><span>Место рождения <em>необязательно</em></span><div className="address-input-row"><div className="input-with-icon"><MapPin size={17} /><input value={draft.place || ""} onChange={(event) => updatePlace(event.target.value)} placeholder="Город, область или страна" aria-invalid={Boolean(errors?.place)} /></div><button type="button" className="button button-secondary address-search-button" onClick={search} disabled={loading || String(draft.place || "").trim().length < 3}>{loading ? "Ищем…" : "Найти адрес"}</button></div>{errors?.place && <small className="field-error">{errors.place}</small>}{message && <small className="field-hint address-status" role="status">{message}</small>}{suggestions.length > 0 && <div className="address-suggestions" role="listbox" aria-label="Подсказки адресов">{suggestions.map((suggestion) => <button type="button" key={suggestion.id || suggestion.label} role="option" className="address-suggestion" onClick={() => choose(suggestion)}><strong>{suggestion.label}</strong><small>{[suggestion.locality, suggestion.region, suggestion.country].filter(Boolean).join(" · ") || "Адрес провайдера"}</small></button>)}</div>}</div>;
}
