import { useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
import { requestAddressSuggestions } from "./geocoder.js";

let sessionApiKey = "";

export function AddressField({ draft, errors, onChange, geocoderConfig }) {
  const [suggestions, setSuggestions] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map());
  const rateStateRef = useRef({ startedAt: 0, count: 0 });
  const updatePlace = (value) => {
    onChange({ ...draft, place: value, placeDetails: null });
    setSuggestions([]);
    setMessage("");
  };
  const search = async () => {
    setLoading(true);
    if (!sessionApiKey && typeof window !== "undefined") sessionApiKey = String(window.prompt("Введите API-ключ Яндекс Геокодера. Ключ будет храниться только до закрытия приложения.") || "").trim();
    if (!sessionApiKey) {
      setMessage("Ключ не введён. Адрес можно продолжить вводить вручную.");
      setLoading(false);
      return;
    }
    const result = await requestAddressSuggestions(draft.place, {
      endpoint: "https://geocode-maps.yandex.ru/1.x/",
      ...geocoderConfig,
      apiKey: geocoderConfig?.apiKey || sessionApiKey,
      cache: cacheRef.current,
      rateState: rateStateRef.current,
      onRateState: (state) => { rateStateRef.current = state; },
      fetchImpl: typeof window !== "undefined" && typeof window.fetch === "function" ? window.fetch.bind(window) : undefined,
    });
    setSuggestions(result.suggestions || []);
    setMessage(result.message || "");
    setLoading(false);
  };
  const choose = (suggestion) => {
    onChange({ ...draft, place: suggestion.label, placeDetails: { locality: suggestion.locality, region: suggestion.region, country: suggestion.country, latitude: suggestion.latitude, longitude: suggestion.longitude, provider: suggestion.provider, selectedAt: new Date().toISOString() } });
    setSuggestions([]);
    setMessage("Адрес выбран и сохранён вместе со структурированными данными.");
  };
  return <div className={`field field-full address-field ${errors?.place ? "has-error" : ""}`}><span>Место рождения <em>необязательно</em></span><div className="address-input-row"><div className="input-with-icon"><MapPin size={17} /><input value={draft.place || ""} onChange={(event) => updatePlace(event.target.value)} placeholder="Город, область или страна" aria-invalid={Boolean(errors?.place)} /></div><button type="button" className="button button-secondary address-search-button" onClick={search} disabled={loading || String(draft.place || "").trim().length < 3}>{loading ? "Ищем…" : "Найти адрес"}</button></div>{errors?.place && <small className="field-error">{errors.place}</small>}{message && <small className="field-hint address-status" role="status">{message}</small>}{suggestions.length > 0 && <div className="address-suggestions" role="listbox" aria-label="Подсказки адресов">{suggestions.map((suggestion) => <button type="button" key={suggestion.id || suggestion.label} role="option" className="address-suggestion" onClick={() => choose(suggestion)}><strong>{suggestion.label}</strong><small>{[suggestion.locality, suggestion.region, suggestion.country].filter(Boolean).join(" · ") || "Адрес провайдера"}</small></button>)}</div>}</div>;
}
