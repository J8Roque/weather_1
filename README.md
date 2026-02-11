# SkyScan Radar

SkyScan Radar is a responsive, web-based weather radar viewer built with plain JavaScript, Leaflet, and the RainViewer Weather Maps API. It runs completely in the browser and works on both desktop and mobile.

## Features

- Interactive radar map with pan and zoom
- Past, current, and future radar frames (where available)
- Play/pause animation controls
- Time slider with human-readable timestamp
- Radar opacity control
- "Use my location" button to center the map on the user
- Responsive layout:
  - Side control panel on desktop
  - Stacked controls below the map on mobile

## Tech stack

- HTML, CSS, JavaScript (no build step)
- [Leaflet](https://leafletjs.com) for interactive maps
- [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) for radar tiles

## Getting started

1. **Clone this repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   cd YOUR_REPO_NAME
Updated 2/11/2026

# SkyScan Radar

A responsive **web + mobile** weather app with animated radar and a 7-day forecast.

## Features
- Animated radar timeline (play/pause, previous/next, speed control)
- Radar opacity slider
- Search places (city/ZIP/place) + “Locate me”
- 7-day forecast with clear rain/sun icons, highs/lows, and precip probability
- Dark/Light mode toggle (saved to localStorage)
- Mobile-first controls drawer (bottom sheet)

## Built with
- Leaflet (interactive maps)
- RainViewer Weather Maps API (radar frames + tiles)
- Open-Meteo Forecast API (daily forecast, no key required)

## Run locally
Use a local server:

```bash
python -m http.server 8000
# open http://localhost:8000
