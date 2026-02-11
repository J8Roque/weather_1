// ===== CONFIG =====
const RAINVIEWER_API_KEY = "e359f2fe3f42e04fad954528feb67b37"; // TODO: replace
const RAINVIEWER_API_URL = "https://api.rainviewer.com/public/weather-maps.json";
// SkyScan Radar
// Radar: RainViewer Weather Maps API (public JSON + tiles)
// Forecast: Open-Meteo daily forecast (no API key)

const STATE = {
  theme: "dark",
  units: "us", // "us" => °F, "metric" => °C
  isPlaying: false,
  playTimer: null,
  frames: [],
  frameIndex: 0,
  radarLayer: null,
  radarHost: "https://tilecache.rainviewer.com",
  radarPath: null,
  lastLocationLabel: "Map center",
  lastLatLng: { lat: 38.58, lon: -121.49 }
};

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

function debounce(fn, ms){
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function formatLocalDate(tsSeconds){
  const d = new Date(tsSeconds * 1000);
  return d.toLocaleString(undefined, { weekday:"short", hour:"2-digit", minute:"2-digit", month:"short", day:"numeric" });
}

function formatDayISO(iso){
  const d = new Date(iso);
  return {
    dow: d.toLocaleDateString(undefined, { weekday:"short" }),
    date: d.toLocaleDateString(undefined, { month:"short", day:"numeric" })
  };
}

// Basic WMO weather_code -> icon + label
// (Good enough to show rain/sun/cloud/snow clearly on mobile.)
function wmoToIcon(code){
  if (code === 0) return { icon: "☀", label: "Clear" };
  if (code === 1 || code === 2) return { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫", label: "Fog" };

  // Drizzle / rain
  if ([51,53,55,56,57].includes(code)) return { icon: "🌦", label: "Drizzle" };
  if ([61,63,65,66,67].includes(code)) return { icon: "🌧", label: "Rain" };

  // Snow
  if ([71,73,75,77].includes(code)) return { icon: "❄", label: "Snow" };

  // Showers / thunder
  if ([80,81,82].includes(code)) return { icon: "🌧", label: "Showers" };
  if ([95,96,99].includes(code)) return { icon: "⛈", label: "Thunder" };

  return { icon: "🌡", label: `Code ${code}` };
}

function tempUnitLabel(){
  return STATE.units === "metric" ? "°C" : "°F";
}

// ---------- Theme ----------
function loadTheme(){
  const saved = localStorage.getItem("skyscan_theme");
  if (saved === "dark" || saved === "light") {
    STATE.theme = saved;
  } else {
    STATE.theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.setAttribute("data-theme", STATE.theme);
  $("theme-icon").textContent = STATE.theme === "dark" ? "☾" : "☀";
}

function toggleTheme(){
  STATE.theme = STATE.theme === "dark" ? "light" : "dark";
  localStorage.setItem("skyscan_theme", STATE.theme);
  document.documentElement.setAttribute("data-theme", STATE.theme);
  $("theme-icon").textContent = STATE.theme === "dark" ? "☾" : "☀";
}

// ---------- Units ----------
function loadUnits(){
  const saved = localStorage.getItem("skyscan_units");
  if (saved === "us" || saved === "metric") STATE.units = saved;
  $("units").value = STATE.units;
}

function setUnits(units){
  STATE.units = units;
  localStorage.setItem("skyscan_units", units);
  refreshForecast();
}

// ---------- Map ----------
const map = L.map("map", { zoomControl: true, minZoom: 3, maxZoom: 18 })
  .setView([STATE.lastLatLng.lat, STATE.lastLatLng.lon], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ---------- Radar (RainViewer) ----------
async function loadRadarFrames(){
  try {
    $("status-pill").textContent = "Loading radar…";

    const resp = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if (!resp.ok) throw new Error(`RainViewer error: ${resp.status}`);

    const data = await resp.json();

    STATE.radarHost = data.host || "https://tilecache.rainviewer.com";
    const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
    const now = data?.radar?.now ? [data.radar.now] : [];
    const future = Array.isArray(data?.radar?.future) ? data.radar.future : [];

    STATE.frames = [...past, ...now, ...future].filter(f => f && typeof f.time === "number" && typeof f.path === "string");

    if (!STATE.frames.length) {
      $("status-pill").textContent = "Radar unavailable";
      return;
    }

    // Default: latest available frame
    STATE.frameIndex = STATE.frames.length - 1;

    const slider = $("time-slider");
    slider.min = "0";
    slider.max = String(STATE.frames.length - 1);
    slider.value = String(STATE.frameIndex);

    setRadarFrame(STATE.frameIndex, true);
    $("status-pill").textContent = "Radar ready";
  } catch (e) {
    console.error(e);
    $("status-pill").textContent = "Radar failed to load";
  }
}

function tileUrlForFrame(frame){
  // RainViewer gives a "host" and a per-frame "path" like "/v2/radar/<time>"
  // Standard x/y/z tile pattern for Leaflet:
  // <host><path>/256/{z}/{x}/{y}/2/1_1.png
  return `${STATE.radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function setRadarFrame(index, forceNewLayer=false){
  if (!STATE.frames.length) return;
  const i = clamp(index, 0, STATE.frames.length - 1);
  STATE.frameIndex = i;

  const frame = STATE.frames[i];
  const url = tileUrlForFrame(frame);

  if (!STATE.radarLayer || forceNewLayer) {
    if (STATE.radarLayer) map.removeLayer(STATE.radarLayer);
    STATE.radarLayer = L.tileLayer(url, { opacity: parseFloat($("opacity-slider").value), zIndex: 250 });
    STATE.radarLayer.addTo(map);
  } else {
    STATE.radarLayer.setUrl(url);
  }

  $("frame-pill").textContent = `Frame: ${formatLocalDate(frame.time)}`;
  $("time-label").textContent = `${formatLocalDate(frame.time)} (${i+1}/${STATE.frames.length})`;
  $("time-slider").value = String(i);
}

function stepFrame(delta){
  if (!STATE.frames.length) return;
  let next = STATE.frameIndex + delta;
  if (next < 0) next = STATE.frames.length - 1;
  if (next >= STATE.frames.length) next = 0;
  setRadarFrame(next);
}

function stopPlayback(){
  STATE.isPlaying = false;
  $("play-pause").textContent = "Play";
  if (STATE.playTimer) clearInterval(STATE.playTimer);
  STATE.playTimer = null;
}

function startPlayback(){
  if (!STATE.frames.length) return;
  STATE.isPlaying = true;
  $("play-pause").textContent = "Pause";

  const speed = parseInt($("speed").value, 10);
  if (STATE.playTimer) clearInterval(STATE.playTimer);
  STATE.playTimer = setInterval(() => stepFrame(1), speed);
}

// ---------- Forecast (Open-Meteo) ----------
async function fetchForecast(lat, lon){
  const isMetric = STATE.units === "metric";
  const tempUnit = isMetric ? "celsius" : "fahrenheit";
  const windUnit = isMetric ? "kmh" : "mph";

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", tempUnit);
  url.searchParams.set("wind_speed_unit", windUnit);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Open-Meteo error: ${resp.status}`);
  return resp.json();
}

function renderForecast(model){
  const daily = model?.daily;
  if (!daily?.time?.length) {
    $("forecast").innerHTML = "";
    $("forecast-status").textContent = "No forecast";
    return;
  }

  const days = daily.time.map((t, idx) => ({
    time: t,
    code: daily.weather_code?.[idx],
    tmax: daily.temperature_2m_max?.[idx],
    tmin: daily.temperature_2m_min?.[idx],
    pop: daily.precipitation_probability_max?.[idx]
  }));

  $("forecast-status").textContent = "Updated";
  $("forecast-subtitle").textContent = `${STATE.lastLocationLabel} • Units: ${tempUnitLabel()}`;

  const html = days.map((d) => {
    const { dow, date } = formatDayISO(d.time);
    const wx = wmoToIcon(d.code);
    const pop = (typeof d.pop === "number") ? d.pop : null;
    const wet = pop !== null && pop >= 50;

    return `
      <div class="card">
        <div class="dow">${dow}</div>
        <div class="date">${date}</div>
        <div class="icon" title="${wx.label}">${wx.icon}</div>
        <div class="temps">
          <span>${Math.round(d.tmax)}${tempUnitLabel()}</span>
          <span style="color: var(--muted)">${Math.round(d.tmin)}${tempUnitLabel()}</span>
        </div>
        <div class="meta">
          ${wx.label}
          ${pop !== null ? ` • <span class="${wet ? "badge-wet" : ""}">${pop}% precip</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  $("forecast").innerHTML = html;
}

async function refreshForecast(){
  try {
    $("forecast-status").textContent = "Loading…";
    const { lat, lon } = STATE.lastLatLng;
    const data = await fetchForecast(lat, lon);
    renderForecast(data);
  } catch (e) {
    console.error(e);
    $("forecast-status").textContent = "Forecast failed";
  }
}

// ---------- Search (Nominatim) ----------
async function geocode(query){
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");

  const resp = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });
  if (!resp.ok) throw new Error(`Geocode error: ${resp.status}`);
  return resp.json();
}

function showSearchResults(list){
  const box = $("search-results");
  if (!list.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.hidden = false;
  box.innerHTML = list.map((r, idx) => {
    const name = r.display_name;
    return `<button type="button" data-idx="${idx}">${name}</button>`;
  }).join("");

  box.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      const r = list[idx];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);
      const label = r.display_name.split(",").slice(0, 2).join(",").trim();

      $("search-results").hidden = true;
      $("place-input").value = label;

      STATE.lastLatLng = { lat, lon };
      STATE.lastLocationLabel = label;

      map.setView([lat, lon], 9);
      refreshForecast();
    });
  });
}

// ---------- UI wiring ----------
$("theme-toggle").addEventListener("click", toggleTheme);

$("opacity-slider").addEventListener("input", () => {
  if (STATE.radarLayer) STATE.radarLayer.setOpacity(parseFloat($("opacity-slider").value));
});

$("time-slider").addEventListener("input", () => {
  stopPlayback();
  setRadarFrame(parseInt($("time-slider").value, 10));
});

$("prev-frame").addEventListener("click", () => { stopPlayback(); stepFrame(-1); });
$("next-frame").addEventListener("click", () => { stopPlayback(); stepFrame(1); });

$("play-pause").addEventListener("click", () => {
  if (STATE.isPlaying) stopPlayback();
  else startPlayback();
});

$("speed").addEventListener("change", () => {
  if (STATE.isPlaying) startPlayback();
});

$("units").addEventListener("change", (e) => setUnits(e.target.value));

$("refresh-forecast").addEventListener("click", refreshForecast);

// Mobile controls drawer
$("controls-fab").addEventListener("click", () => {
  $("controls").classList.toggle("open");
});

// Locate
$("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      STATE.lastLatLng = { lat, lon };
      STATE.lastLocationLabel = "Your location";

      map.setView([lat, lon], 9);
      refreshForecast();

      // Add a subtle marker (one-time; remove previous if any)
      if (STATE.userMarker) map.removeLayer(STATE.userMarker);
      STATE.userMarker = L.circleMarker([lat, lon], {
        radius: 6,
        weight: 2,
        color: "#36c2ff",
        fillColor: "#36c2ff",
        fillOpacity: 0.9
      }).addTo(map);
    },
    (err) => console.error(err),
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

// Search submit
$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("place-input").value.trim();
  if (!q) return;

  try {
    const results = await geocode(q);
    showSearchResults(results);
  } catch (err) {
    console.error(err);
  }
});

// Hide search results when clicking away
document.addEventListener("click", (e) => {
  const box = $("search-results");
  if (!box || box.hidden) return;
  if (!box.contains(e.target) && e.target !== $("place-input")) {
    box.hidden = true;
  }
});

// Map-driven forecast updates (debounced)
const onMapMove = debounce(() => {
  const c = map.getCenter();
  STATE.lastLatLng = { lat: c.lat, lon: c.lng };
  STATE.lastLocationLabel = "Map center";
  refreshForecast();
}, 900);

map.on("moveend", onMapMove);

// ---------- Boot ----------
(function init(){
  loadTheme();
  loadUnits();
  loadRadarFrames();
  refreshForecast();
})();
