import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizePlaceDetails, parseYandexSuggestions, requestAddressSuggestions } from "../src/geocoder.js";
import { createProjectPayload, serializeProject } from "../src/storage.js";
import { filterPeople } from "../src/search.js";

const yandexResponse = {
  response: {
    GeoObjectCollection: {
      featureMember: [{
        GeoObject: {
          uri: "ymapsbm1://geo/1",
          name: "Кемерово",
          Point: { pos: "86.087314 55.354968" },
          metaDataProperty: {
            GeocoderMetaData: {
              Address: { formatted: "Россия, Кемеровская область, Кемерово" },
              AddressDetails: { Country: { AddressLine: "Россия", CountryName: "Россия", AdministrativeArea: { AddressLine: "Кемеровская область", AdministrativeAreaName: "Кемеровская область", Locality: { AddressLine: "Кемерово", LocalityName: "Кемерово" } } } },
            },
          },
        },
      }],
    },
  },
};

test("normalizes structured place details and rejects invalid coordinates", () => {
  assert.deepEqual(normalizePlaceDetails({ locality: " Кемерово ", region: "Кемеровская область", country: "Россия", latitude: "55.354968", longitude: "86.087314", provider: "yandex" }), {
    locality: "Кемерово", region: "Кемеровская область", country: "Россия", latitude: 55.354968, longitude: 86.087314, provider: "yandex", selectedAt: "",
  });
  assert.equal(normalizePlaceDetails({ latitude: 500, longitude: -500 }), null);
});

test("parses Yandex response into provider-independent suggestions", () => {
  assert.deepEqual(parseYandexSuggestions(yandexResponse), [{
    id: "ymapsbm1://geo/1", label: "Россия, Кемеровская область, Кемерово", locality: "Кемерово", region: "Кемеровская область", country: "Россия", latitude: 55.354968, longitude: 86.087314, provider: "yandex", selectedAt: "",
  }]);
});

test("does not call the network until endpoint and API key are configured", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => yandexResponse }; };
  const disabled = await requestAddressSuggestions("Кемерово", { endpoint: "", apiKey: "key", fetchImpl });
  const missingKey = await requestAddressSuggestions("Кемерово", { endpoint: "https://example.test/geocode", apiKey: "", fetchImpl });
  assert.equal(disabled.status, "disabled");
  assert.equal(missingKey.status, "disabled");
  assert.equal(calls, 0);
});

test("uses explicit search, cache and rate limit while keeping offline fallback", async () => {
  let calls = 0;
  let now = 1000;
  const cache = new Map();
  let rateState = { startedAt: 0, count: 0 };
  const fetchImpl = async (url) => {
    calls += 1;
    assert.match(url, /apikey=secret/);
    assert.match(url, /geocode=%D0%9A%D0%B5%D0%BC%D0%B5%D1%80%D0%BE%D0%B2%D0%BE/);
    return { ok: true, json: async () => yandexResponse };
  };
  const options = { endpoint: "https://example.test/geocode", apiKey: "secret", fetchImpl, cache, now: () => now, maxRequestsPerMinute: 1, rateState, onRateState: (next) => { rateState = next; } };
  const first = await requestAddressSuggestions("Кемерово", options);
  const second = await requestAddressSuggestions("Кемерово", options);
  const third = await requestAddressSuggestions("Новосибирск", options);
  assert.equal(first.status, "ok");
  assert.equal(second.status, "cached");
  assert.equal(third.status, "rate-limited");
  assert.equal(calls, 1);
  now += 61 * 1000;
  const offline = await requestAddressSuggestions("Новосибирск", { ...options, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(offline.status, "offline");
  assert.equal(offline.suggestions.length, 0);
});

test("persists selected structured address but never persists the API key", () => {
  const payload = createProjectPayload([{ id: "person-1", name: "Иван", place: "Россия, Кемерово", placeDetails: { locality: "Кемерово", region: "Кемеровская область", country: "Россия", latitude: 55.354968, longitude: 86.087314, provider: "yandex", selectedAt: "2026-08-25T00:00:00.000Z" } }], { settings: { provider: "yandex", endpoint: "https://example.test", geocoderApiKey: "do-not-save" } }, []);
  const persisted = JSON.parse(serializeProject(payload));
  assert.deepEqual(persisted.people[0].placeDetails.locality, "Кемерово");
  assert.equal(persisted.project.settings.geocoderApiKey, undefined);
  assert.equal(JSON.stringify(persisted).includes("do-not-save"), false);
});

test("searches people by structured locality and region", () => {
  const people = [{ id: "person-1", name: "Иван", place: "", placeDetails: { locality: "Кемерово", region: "Кемеровская область" }, parentIds: [], childIds: [], partnerIds: [], siblingIds: [] }];
  assert.equal(filterPeople(people, [], {}, "Кемеровская область", undefined, 12).length, 1);
});

test("wires explicit address search and session-only key into the UI", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /AddressField/);
  const addressField = await readFile(new URL("../src/AddressField.jsx", import.meta.url), "utf8");
  assert.match(addressField, /Найти адрес/);
  assert.match(addressField, /requestAddressSuggestions/);
  assert.match(addressField, /Ключ будет храниться только до закрытия приложения/);
});

console.log("Stage 56 P8 address geocoder ok: explicit search, Yandex adapter, cache, rate limit, offline fallback and secret-safe persistence");
