// ===== CONFIG =====
const RAINVIEWER_API_KEY = "YOUR_RAINVIEWER_API_KEY_HERE"; // TODO: replace
const RAINVIEWER_API_URL = "https://api.rainviewer.com/public/weather-maps.json";

// ===== MAP INIT =====
const map = L.map("map", {
  zoomControl: true,
  minZoom: 3,
  maxZoom: 18
}).setView([38.58, -121.49], 7); // Center near Sacramento

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Radar state
let radarFrames = []; // list of frames (past+now+future)
let radarPosition = 0; // index in frames
let radarLayer = null;

// UI elements
const opacitySlider = document.getElementById("opacity-slider");
const timeSlider = document.getElementById("time-slider");
const timeLabel = document.getElementById("time-label");
const locateBtn = document.getElementById("locate-btn");
const prevBtn = document.getElementById("prev-frame");
const nextBtn = document.getElementById("next-frame");
const playPauseBtn = document.getElementById("play-pause");

let isPlaying = false;
let playInterval = null;

// ===== RainViewer integration =====

// Fetch frames list from RainViewer
async function loadRainViewerFrames() {
  if (!RAINVIEWER_API_KEY || RAINVIEWER_API_KEY === "YOUR_RAINVIEWER_API_KEY_HERE") {
    console.warn("RainViewer API key is not set.");
    if (timeLabel) {
      timeLabel.textContent = "Add your RainViewer API key in app.js";
    }
    return;
  }

  try {
    const url = `${RAINVIEWER_API_URL}?apiKey=${encodeURIComponent(RAINVIEWER_API_KEY)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RainViewer API error: ${response.status}`);
    }

    const data = await response.json();
    // According to RainViewer docs, we use data.radar.past + data.radar.now + data.radar.future
    const past = data.radar && Array.isArray(data.radar.past) ? data.radar.past : [];
    const now = data.radar && data.radar.now ? [data.radar.now] : [];
    const future = data.radar && Array.isArray(data.radar.future) ? data.radar.future : [];

    radarFrames = [...past, ...now, ...future];

    if (!radarFrames.length) {
      if (timeLabel) timeLabel.textContent = "No radar frames available.";
      return;
    }

    radarPosition = radarFrames.length - 1; // last frame = latest
    if (timeSlider) {
      timeSlider.min = 0;
      timeSlider.max = radarFrames.length - 1;
      timeSlider.value = radarPosition;
    }

    changeRadarFrame(radarPosition, true);
  } catch (err) {
    console.error(err);
    if (timeLabel) {
      timeLabel.textContent = "Failed to load radar data.";
    }
  }
}

// Build tile URL for a given frame
function getFrameTileUrl(frame) {
  // Typical RainViewer tile format from their examples
  // https://tilecache.rainviewer.com/v2/radar/{time}/{z}/{x}/{y}/2/1_1.png
  return `https://tilecache.rainviewer.com/v2/radar/${frame.time}/256/{z}/{x}/{y}/2/1_1.png`;
}

// Set radar layer to given frame index
function changeRadarFrame(position, forceReload = false) {
  if (!radarFrames.length || position < 0 || position >= radarFrames.length) {
    return;
  }

  radarPosition = position;
  const frame = radarFrames[radarPosition];

  const tileUrl = getFrameTileUrl(frame);

  if (!radarLayer || forceReload) {
    if (radarLayer) {
      map.removeLayer(radarLayer);
    }
    radarLayer = L.tileLayer(tileUrl, {
      opacity: opacitySlider ? parseFloat(opacitySlider.value) : 0.8,
      zIndex: 100
    }).addTo(map);
  } else {
    radarLayer.setUrl(tileUrl);
  }

  if (timeSlider && parseInt(timeSlider.value, 10) !== radarPosition) {
    timeSlider.value = radarPosition;
  }

  if (timeLabel) {
    const date = new Date(frame.time * 1000);
    timeLabel.textContent = `Frame: ${date.toLocaleString()}`;
  }
}

// ===== UI WIRING =====

// Opacity
if (opacitySlider) {
  opacitySlider.addEventListener("input", () => {
    const value = parseFloat(opacitySlider.value);
    if (radarLayer) {
      radarLayer.setOpacity(value);
    }
  });
}

// Geolocation
if (locateBtn) {
  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 9);
        L.circleMarker([latitude, longitude], {
          radius: 6,
          color: "#36c2ff",
          fillColor: "#36c2ff",
          fillOpacity: 0.9
        }).addTo(map);
      },
      (err) => {
        console.error(err);
        alert("Could not get your location.");
      }
    );
  });
}

// Time slider
if (timeSlider) {
  timeSlider.addEventListener("input", () => {
    const idx = parseInt(timeSlider.value, 10);
    changeRadarFrame(idx);
  });
}

// Frame step helpers
function stepFrame(delta) {
  if (!radarFrames.length) return;
  const min = 0;
  const max = radarFrames.length - 1;
  let next = radarPosition + delta;
  if (next < min) next = max;
  if (next > max) next = min;
  changeRadarFrame(next);
}

if (prevBtn) {
  prevBtn.addEventListener("click", () => stepFrame(-1));
}

if (nextBtn) {
  nextBtn.addEventListener("click", () => stepFrame(1));
}

// Animation
if (playPauseBtn) {
  playPauseBtn.addEventListener("click", () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? "Pause" : "Play";

    if (isPlaying) {
      playInterval = setInterval(() => {
        stepFrame(1);
      }, 600);
    } else if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  });
}

// Initial load
loadRainViewerFrames();
