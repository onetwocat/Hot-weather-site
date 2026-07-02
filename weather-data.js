/* ============================================================
   WEATHER DATA — mock layer with API hook points
   Uses Open-Meteo for live current readings, with local fallback data.
   ============================================================ */

window.WeatherData = (function () {
  // ---------- City registry: Europe / India / North America ----------
  const CITIES = [
    // EUROPE
    { id: "london",     name: "London",      country: "GB", region: "EU", lat: 51.5,  lon: -0.13 },
    { id: "paris",      name: "Paris",       country: "FR", region: "EU", lat: 48.86, lon: 2.35  },
    { id: "madrid",     name: "Madrid",      country: "ES", region: "EU", lat: 40.42, lon: -3.70 },
    { id: "berlin",     name: "Berlin",      country: "DE", region: "EU", lat: 52.52, lon: 13.40 },
    { id: "rome",       name: "Rome",        country: "IT", region: "EU", lat: 41.90, lon: 12.50 },
    { id: "athens",     name: "Athens",      country: "GR", region: "EU", lat: 37.98, lon: 23.72 },
    { id: "oslo",       name: "Oslo",        country: "NO", region: "EU", lat: 59.91, lon: 10.75 },

    // INDIA
    { id: "delhi",      name: "New Delhi",   country: "IN", region: "IN", lat: 28.61, lon: 77.21 },
    { id: "mumbai",     name: "Mumbai",      country: "IN", region: "IN", lat: 19.08, lon: 72.88 },
    { id: "kolkata",    name: "Kolkata",     country: "IN", region: "IN", lat: 22.57, lon: 88.36 },
    { id: "chennai",    name: "Chennai",     country: "IN", region: "IN", lat: 13.08, lon: 80.27 },
    { id: "jaisalmer",  name: "Jaisalmer",   country: "IN", region: "IN", lat: 26.91, lon: 70.92 },

    // NORTH AMERICA
    { id: "newyork",    name: "New York",    country: "US", region: "NA", lat: 40.71, lon: -74.00 },
    { id: "phoenix",    name: "Phoenix",     country: "US", region: "NA", lat: 33.45, lon: -112.07 },
    { id: "miami",      name: "Miami",       country: "US", region: "NA", lat: 25.76, lon: -80.19 },
    { id: "chicago",    name: "Chicago",     country: "US", region: "NA", lat: 41.88, lon: -87.63 },
    { id: "vancouver",  name: "Vancouver",   country: "CA", region: "NA", lat: 49.28, lon: -123.12 },
    { id: "yellowknife",name: "Yellowknife", country: "CA", region: "NA", lat: 62.45, lon: -114.37 },
    { id: "mexico",     name: "Mexico City", country: "MX", region: "NA", lat: 19.43, lon: -99.13 }
  ];

  // ---------- Hard-coded but realistic readings (late June) ----------
  // temp °C, humidity %, wind km/h, pressure hPa, precip mm, condition tag
  const READINGS = {
    london:     { temp: 19, hum: 68, wind: 14, press: 1014, precip: 0.2, cond: "overcast",   alert: null },
    paris:      { temp: 24, hum: 55, wind: 11, press: 1017, precip: 0.0, cond: "clear",      alert: null },
    madrid:     { temp: 41, hum: 18, wind: 22, press: 1011, precip: 0.0, cond: "heatwave",   alert: "HEAT" },
    berlin:     { temp: 22, hum: 60, wind: 13, press: 1015, precip: 1.2, cond: "showers",    alert: null },
    rome:       { temp: 38, hum: 31, wind: 9,  press: 1012, precip: 0.0, cond: "heatwave",   alert: "HEAT" },
    athens:     { temp: 43, hum: 22, wind: 28, press: 1009, precip: 0.0, cond: "heatwave",   alert: "HEAT" },
    oslo:       { temp: 15, hum: 72, wind: 17, press: 1018, precip: 2.4, cond: "rain",       alert: null },

    delhi:      { temp: 46, hum: 24, wind: 19, press: 998,  precip: 0.0, cond: "heatwave",   alert: "HEAT" },
    mumbai:     { temp: 31, hum: 88, wind: 41, press: 996,  precip: 142, cond: "monsoon",    alert: "FLOOD" },
    kolkata:    { temp: 33, hum: 84, wind: 38, press: 994,  precip: 98,  cond: "monsoon",    alert: "FLOOD" },
    chennai:    { temp: 36, hum: 79, wind: 24, press: 1003, precip: 12,  cond: "humid",      alert: null },
    jaisalmer:  { temp: 48, hum: 9,  wind: 47, press: 995,  precip: 0.0, cond: "duststorm",  alert: "DUST" },

    newyork:    { temp: 28, hum: 64, wind: 16, press: 1013, precip: 0.0, cond: "clear",      alert: null },
    phoenix:    { temp: 47, hum: 8,  wind: 12, press: 1006, precip: 0.0, cond: "heatwave",   alert: "HEAT" },
    miami:      { temp: 32, hum: 81, wind: 52, press: 989,  precip: 84,  cond: "hurricane",  alert: "STORM" },
    chicago:    { temp: 26, hum: 58, wind: 33, press: 1010, precip: 8,   cond: "thunder",    alert: null },
    vancouver:  { temp: 21, hum: 66, wind: 12, press: 1016, precip: 0.4, cond: "cloudy",     alert: null },
    yellowknife:{ temp: -8, hum: 78, wind: 34, press: 1021, precip: 0.0, cond: "snow",       alert: "COLD" },
    mexico:     { temp: 27, hum: 49, wind: 14, press: 1014, precip: 6,   cond: "showers",    alert: null }
  };

  // ---------- Alert metadata ----------
  const ALERT_META = {
    HEAT:  { label: "EXTREME HEAT",     color: "#ff8a3d", short: "HEAT"  },
    FLOOD: { label: "FLOODING",         color: "#5b9eff", short: "FLOOD" },
    STORM: { label: "TROPICAL STORM",   color: "#a855f7", short: "STORM" },
    DUST:  { label: "DUST STORM",       color: "#d4a574", short: "DUST"  },
    COLD:  { label: "EXTREME COLD",     color: "#4dd0e1", short: "COLD"  },
  };

  const CONDITION_LABEL = {
    clear:     "Clear sky",
    overcast:  "Overcast",
    cloudy:    "Partly cloudy",
    showers:   "Light showers",
    rain:      "Steady rain",
    thunder:   "Thunderstorms",
    monsoon:   "Monsoon rains",
    hurricane: "Tropical cyclone",
    heatwave:  "Heatwave",
    duststorm: "Dust storm",
    humid:     "Humid haze",
    snow:      "Snowfall"
  };

  // ---------- Public reader (sync) — swap with async API later ----------
  function getCity(id) {
    const meta = CITIES.find(c => c.id === id);
    const r = READINGS[id];
    if (!meta || !r) return null;
    return {
      ...meta,
      ...r,
      conditionLabel: CONDITION_LABEL[r.cond] || r.cond,
      alertMeta: r.alert ? ALERT_META[r.alert] : null
    };
  }

  function getAll() { return CITIES.map(c => getCity(c.id)); }
  function getByRegion(region) { return getAll().filter(c => c.region === region); }

  const WEATHER_CODE_COND = [
    [0, "clear"], [1, "clear"], [2, "cloudy"], [3, "overcast"],
    [45, "overcast"], [48, "overcast"], [51, "showers"], [53, "showers"], [55, "showers"],
    [61, "rain"], [63, "rain"], [65, "rain"], [71, "snow"], [73, "snow"], [75, "snow"],
    [80, "showers"], [81, "showers"], [82, "rain"], [95, "thunder"], [96, "thunder"], [99, "thunder"]
  ];

  function conditionFromCode(code) {
    const hit = WEATHER_CODE_COND.find(([c]) => c === Number(code));
    return hit ? hit[1] : "cloudy";
  }

  function inferAlert(reading) {
    if (reading.temp >= 40) return "HEAT";
    if (reading.precip >= 50) return "FLOOD";
    if (reading.wind >= 50) return "STORM";
    if (reading.temp <= -5) return "COLD";
    return null;
  }

  async function fetchCityWeather(meta) {
    const params = new URLSearchParams({
      latitude: meta.lat,
      longitude: meta.lon,
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m,pressure_msl,precipitation,weather_code",
      timezone: "auto",
      forecast_days: "1",
      _: String(Date.now())
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
    const json = await res.json();
    const current = json.current || {};
    const reading = {
      temp: Math.round(Number(current.temperature_2m ?? 0)),
      hum: Math.round(Number(current.relative_humidity_2m ?? 0)),
      wind: Math.round(Number(current.wind_speed_10m ?? 0)),
      press: Math.round(Number(current.pressure_msl ?? 0)),
      precip: Number(current.precipitation ?? 0),
      cond: conditionFromCode(current.weather_code),
      observedAt: current.time,
      interval: current.interval,
      isLive: true
    };
    reading.alert = inferAlert(reading);
    return reading;
  }

  async function getCityLive(id) {
    const meta = CITIES.find(c => c.id === id);
    if (!meta) return null;
    try {
      const r = await fetchCityWeather(meta);
      return {
        ...meta,
        ...r,
        conditionLabel: CONDITION_LABEL[r.cond] || r.cond,
        alertMeta: r.alert ? ALERT_META[r.alert] : null
      };
    } catch (err) {
      return { ...getCity(id), isLive: false, liveError: err.message };
    }
  }

  async function getAllLive() {
    return Promise.all(CITIES.map(c => getCityLive(c.id)));
  }

  // ---------- Climate-change historical series (mock but plausible) ----------
  // Global temp anomaly °C vs 1951-1980 baseline
  const TEMP_ANOMALY = [
    {y:1980,v:0.27},{y:1985,v:0.12},{y:1990,v:0.45},{y:1995,v:0.45},
    {y:2000,v:0.42},{y:2005,v:0.69},{y:2010,v:0.72},{y:2015,v:0.90},
    {y:2016,v:1.02},{y:2017,v:0.92},{y:2018,v:0.85},{y:2019,v:0.98},
    {y:2020,v:1.02},{y:2021,v:0.85},{y:2022,v:0.89},{y:2023,v:1.17},
    {y:2024,v:1.28},{y:2025,v:1.31},{y:2026,v:1.36}
  ];

  // Atmospheric CO2 (ppm) — Mauna Loa style
  const CO2 = [
    {y:1980,v:338},{y:1990,v:354},{y:2000,v:369},{y:2010,v:389},
    {y:2015,v:401},{y:2020,v:414},{y:2023,v:421},{y:2024,v:424},
    {y:2025,v:427},{y:2026,v:430}
  ];

  // Arctic sea ice September minimum (million km²)
  const SEA_ICE = [
    {y:1980,v:7.85},{y:1990,v:6.24},{y:2000,v:6.32},{y:2007,v:4.27},
    {y:2012,v:3.39},{y:2016,v:4.14},{y:2020,v:3.74},{y:2023,v:4.23},
    {y:2025,v:3.95},{y:2026,v:3.81}
  ];

  // Recorded billion-dollar weather disasters per year (US, NOAA-style)
  const DISASTERS = [
    {y:2000,v:6},{y:2005,v:9},{y:2010,v:8},{y:2015,v:10},
    {y:2018,v:14},{y:2020,v:22},{y:2021,v:20},{y:2022,v:18},
    {y:2023,v:28},{y:2024,v:24},{y:2025,v:26}
  ];

  // ---------- Knowledge cards ----------
  const KNOWLEDGE = [
    {
      tag: "MECHANISM",
      title: "Why heatwaves are getting longer",
      body: "Persistent high-pressure ridges (\"heat domes\") trap warm air over a region. A warmer baseline atmosphere means each dome starts hotter and lasts days longer than in the 1980s.",
      stat: "+1.4×",
      statLabel: "duration since 1980"
    },
    {
      tag: "DEFINITION",
      title: "What counts as an \"extreme\" event?",
      body: "Meteorologists flag readings beyond the 95th percentile of the local 30-year climate normal. Climate change shifts that whole distribution, so yesterday's rare event becomes today's typical.",
      stat: "95th",
      statLabel: "percentile threshold"
    },
    {
      tag: "MONSOON",
      title: "The Indian monsoon is becoming erratic",
      body: "Total rainfall is roughly stable, but it now arrives in fewer, more intense bursts. Short violent downpours overwhelm drainage faster than long steady rains ever did.",
      stat: "−14d",
      statLabel: "active rain days vs. 1970"
    },
    {
      tag: "CYCLONES",
      title: "Hurricanes intensify faster",
      body: "Warmer sea-surface temperatures act as fuel. Rapid intensification — gaining ≥56 km/h in 24 hours — is now twice as common in the Atlantic basin as it was three decades ago.",
      stat: "2.0×",
      statLabel: "rapid-intensification rate"
    }
  ];

  return {
    CITIES, ALERT_META, CONDITION_LABEL,
    getCity, getAll, getByRegion, getCityLive, getAllLive,
    TEMP_ANOMALY, CO2, SEA_ICE, DISASTERS,
    KNOWLEDGE
  };
})();
