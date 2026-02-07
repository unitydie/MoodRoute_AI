function normalizeCityKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NORWAY_CITY_KNOWLEDGE = [
  {
    city: "Hamar",
    county: "Innlandet",
    aliases: ["hamar"],
    places: [
      { name: "Domkirkeodden", kind: "open-air museum and cathedral ruins" },
      { name: "Mjosa lakeside promenade", kind: "waterfront walking route" },
      { name: "Koigen", kind: "lakefront park and event space" },
      { name: "Ankerskogen", kind: "recreation and wellness complex" },
      { name: "Hamar kulturhus", kind: "culture house and performance venue" }
    ]
  },
  {
    city: "Oslo",
    county: "Oslo",
    aliases: ["oslo"],
    places: [
      { name: "Akershus Fortress", kind: "historic fortress area" },
      { name: "Oslo Opera House", kind: "waterfront architecture landmark" },
      { name: "Vigeland Park", kind: "sculpture park" },
      { name: "Aker Brygge", kind: "harbor promenade and cafes" },
      { name: "Ekebergparken", kind: "hillside sculpture park and viewpoints" }
    ]
  },
  {
    city: "Bergen",
    county: "Vestland",
    aliases: ["bergen"],
    places: [
      { name: "Bryggen", kind: "historic hanseatic wharf district" },
      { name: "Floyen", kind: "hill viewpoint and walking zone" },
      { name: "Fish Market", kind: "central harbor market area" },
      { name: "Nordnes Park", kind: "coastal neighborhood park" },
      { name: "KODE museums area", kind: "art and culture district" }
    ]
  },
  {
    city: "Trondheim",
    county: "Trondelag",
    aliases: ["trondheim"],
    places: [
      { name: "Nidaros Cathedral", kind: "major gothic cathedral" },
      { name: "Bakklandet", kind: "historic riverside neighborhood" },
      { name: "Kristiansten Fortress", kind: "hilltop fortress viewpoint" },
      { name: "Nidelva riverside paths", kind: "walkable river loop" },
      { name: "Rockheim district", kind: "music museum and harbor area" }
    ]
  },
  {
    city: "Stavanger",
    county: "Rogaland",
    aliases: ["stavanger"],
    places: [
      { name: "Gamle Stavanger", kind: "old town with wooden houses" },
      { name: "Ovre Holmegate", kind: "colorful street and cafes" },
      { name: "Vagen harbor", kind: "waterfront walk zone" },
      { name: "Mosvatnet", kind: "urban lake loop" },
      { name: "Norwegian Petroleum Museum", kind: "harbor museum stop" }
    ]
  },
  {
    city: "Tromso",
    county: "Troms",
    aliases: ["tromso", "tromsoe"],
    places: [
      { name: "Arctic Cathedral", kind: "iconic modern church" },
      { name: "Fjellheisen cable car area", kind: "panoramic viewpoint" },
      { name: "Polaria", kind: "arctic-themed science center" },
      { name: "Telegrafbukta", kind: "coastal beach and walking area" },
      { name: "Prestvannet", kind: "nature reserve loop" }
    ]
  },
  {
    city: "Kristiansand",
    county: "Agder",
    aliases: ["kristiansand"],
    places: [
      { name: "Posebyen", kind: "old wooden-house quarter" },
      { name: "Bystranda", kind: "city beach promenade" },
      { name: "Fiskebrygga", kind: "harbor food and walk zone" },
      { name: "Ravnedalen Park", kind: "green valley park" },
      { name: "Odderoya", kind: "coastal peninsula with trails" }
    ]
  },
  {
    city: "Alesund",
    county: "More og Romsdal",
    aliases: ["alesund", "aalesund"],
    places: [
      { name: "Aksla viewpoint", kind: "city panorama point" },
      { name: "Brosundet", kind: "canal and art nouveau facades" },
      { name: "Jugendstilsenteret", kind: "art nouveau museum area" },
      { name: "Atlanterhavsparken", kind: "aquarium and coastal zone" },
      { name: "Molja lighthouse area", kind: "harbor walk landmark" }
    ]
  },
  {
    city: "Drammen",
    county: "Buskerud",
    aliases: ["drammen"],
    places: [
      { name: "Ypsilon bridge", kind: "modern pedestrian bridge" },
      { name: "Bragernes Torg", kind: "city square and cafe area" },
      { name: "Spiralen viewpoint", kind: "hill route with views" },
      { name: "Drammenselva promenade", kind: "riverfront walking line" },
      { name: "Papirbredden", kind: "riverside culture and campus zone" }
    ]
  },
  {
    city: "Fredrikstad",
    county: "Ostfold",
    aliases: ["fredrikstad"],
    places: [
      { name: "Gamlebyen", kind: "fortified old town" },
      { name: "Isegran", kind: "historic island fort area" },
      { name: "Glomma riverside", kind: "waterfront path network" },
      { name: "Voldportbroa area", kind: "old-town access bridge zone" },
      { name: "Stortorvet", kind: "central square and social hub" }
    ]
  },
  {
    city: "Lillehammer",
    county: "Innlandet",
    aliases: ["lillehammer"],
    places: [
      { name: "Maihaugen", kind: "open-air museum and heritage park" },
      { name: "Storgata", kind: "pedestrian main street" },
      { name: "Lysgardsbakken", kind: "olympic ski jump viewpoint" },
      { name: "Mesna riverside trails", kind: "calmer walking paths" },
      { name: "Sondre Park", kind: "central green city stop" }
    ]
  },
  {
    city: "Bodo",
    county: "Nordland",
    aliases: ["bodo", "boedo"],
    places: [
      { name: "Stormen Library district", kind: "waterfront culture quarter" },
      { name: "Bodo harbor promenade", kind: "sea-facing route" },
      { name: "Norwegian Aviation Museum", kind: "specialty museum" },
      { name: "Rensasen Park", kind: "central hill park" },
      { name: "Moloen", kind: "breakwater walk with sea views" }
    ]
  }
];

const aliasIndex = new Map();
for (const city of NORWAY_CITY_KNOWLEDGE) {
  for (const alias of city.aliases) {
    aliasIndex.set(normalizeCityKey(alias), city);
  }
}

function findNorwayCityKnowledge(cityName) {
  if (!cityName) {
    return null;
  }
  const key = normalizeCityKey(cityName);
  if (!key) {
    return null;
  }

  if (aliasIndex.has(key)) {
    return aliasIndex.get(key);
  }

  for (const city of NORWAY_CITY_KNOWLEDGE) {
    const cityKey = normalizeCityKey(city.city);
    if (key === cityKey || key.startsWith(`${cityKey} `)) {
      return city;
    }
  }
  return null;
}

module.exports = {
  NORWAY_CITY_KNOWLEDGE,
  normalizeCityKey,
  findNorwayCityKnowledge
};
