function person(id, name, year, { parentIds = [], childIds = [], partnerIds = [], gender = "", place = "г. Тестовый", occupation = "" } = {}) {
  return {
    id,
    name,
    shortName: name,
    year: String(year),
    datePrecision: "year",
    place,
    occupation,
    biography: "Обезличенная запись для проверки плотной раскладки.",
    image: "",
    gender,
    parentIds,
    parentLinks: parentIds.map((parentId) => ({ personId: parentId, type: "biological" })),
    partnerIds,
    childIds,
    siblingIds: [],
    siblingLinks: [],
    maidenName: gender === "female" ? "Предыдущая Фамилия" : "",
  };
}

export const densePeople = [
  person("g0a", "Александр Константинович Северный", 1930, { childIds: ["g1a", "g1b"], partnerIds: ["g0b"], gender: "male", occupation: "Инженер-конструктор" }),
  person("g0b", "Елизавета Константиновна Северная", 1933, { childIds: ["g1a", "g1b"], partnerIds: ["g0a"], gender: "female" }),
  person("g0c", "Борис Николаевич Восточный", 1928, { childIds: ["g1c", "g1d"], partnerIds: ["g0d"], gender: "male" }),
  person("g0d", "Маргарита Николаевна Восточная", 1932, { childIds: ["g1c", "g1d"], partnerIds: ["g0c"], gender: "female" }),

  person("g1a", "Алексей Александрович Северный", 1952, { parentIds: ["g0a", "g0b"], childIds: ["g2a", "g2b", "g2c"], partnerIds: ["g1c"], gender: "male", occupation: "Главный архитектор" }),
  person("g1b", "Надежда Александровна Северная", 1956, { parentIds: ["g0a", "g0b"], childIds: ["g2d"], partnerIds: ["g1d"], gender: "female", occupation: "Библиотекарь" }),
  person("g1c", "Ксения Борисовна Восточная", 1954, { parentIds: ["g0c", "g0d"], childIds: ["g2a", "g2b", "g2c"], partnerIds: ["g1a"], gender: "female", occupation: "Редактор исторических архивов" }),
  person("g1d", "Дмитрий Борисович Восточный", 1958, { parentIds: ["g0c", "g0d"], childIds: ["g2d"], partnerIds: ["g1b"], gender: "male" }),

  person("g2a", "Владимир Алексеевич Северо-Восточный", 1978, { parentIds: ["g1a", "g1c"], childIds: ["g3a", "g3b"], partnerIds: ["g2e"], gender: "male", occupation: "Руководитель проектного отдела" }),
  person("g2b", "Екатерина Алексеевна Северо-Восточная", 1981, { parentIds: ["g1a", "g1c"], childIds: ["g3c"], partnerIds: ["g2f"], gender: "female", occupation: "Исследовательница семейной истории" }),
  person("g2c", "Максим Алексеевич Северный", 1986, { parentIds: ["g1a", "g1c"], childIds: [], partnerIds: [], gender: "male" }),
  person("g2d", "Ольга Дмитриевна Восточная", 1983, { parentIds: ["g1b", "g1d"], childIds: ["g3d", "g3e"], partnerIds: [], gender: "female", occupation: "Учитель русского языка" }),
  person("g2e", "Ирина Сергеевна Долгополова", 1980, { childIds: ["g3a", "g3b"], partnerIds: ["g2a"], gender: "female" }),
  person("g2f", "Сергей Петрович Долгополов", 1982, { childIds: ["g3c"], partnerIds: ["g2b"], gender: "male" }),

  person("g3a", "Артём Владимирович Северо-Восточный", 2004, { parentIds: ["g2a", "g2e"], childIds: [], partnerIds: [], gender: "male", place: "г. Тестовый, Центральный район" }),
  person("g3b", "Наталья Владимировна Северо-Восточная", 2007, { parentIds: ["g2a", "g2e"], childIds: [], partnerIds: [], gender: "female", place: "г. Тестовый, Центральный район" }),
  person("g3c", "Михаил Сергеевич Долгополов", 2010, { parentIds: ["g2b", "g2f"], childIds: [], partnerIds: [], gender: "male", place: "г. Тестовый, Северо-Западный район" }),
  person("g3d", "Софья Ольговна Восточная", 2009, { parentIds: ["g2d"], childIds: [], partnerIds: [], gender: "female" }),
  person("g3e", "Тимофей Ольгович Восточный", 2013, { parentIds: ["g2d"], childIds: [], partnerIds: [], gender: "male" }),
];

export const densePartnerships = [
  { id: "p-g0ab", personIds: ["g0a", "g0b"], type: "marriage", status: "active" },
  { id: "p-g0cd", personIds: ["g0c", "g0d"], type: "marriage", status: "active" },
  { id: "p-g1ac", personIds: ["g1a", "g1c"], type: "marriage", status: "active" },
  { id: "p-g1bd", personIds: ["g1b", "g1d"], type: "partnership", status: "active" },
  { id: "p-g2ae", personIds: ["g2a", "g2e"], type: "marriage", status: "active" },
  { id: "p-g2bf", personIds: ["g2b", "g2f"], type: "engagement", status: "active" },
];

export const denseFixture = { people: densePeople, partnerships: densePartnerships, selectedId: "g2b" };
