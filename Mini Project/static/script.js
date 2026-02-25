// ── MAP SETUP ──
const map = L.map("map").setView([10.5907, 76.2086], 15);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ── STATE ──
let marker        = null;
let buildingLayer = null;
let routeLayer    = null;
let fromMarker    = null;
let toMarker      = null;
let travelMode    = "driving";
let pendingDestLat = null;
let pendingDestLon = null;
let pendingDestLabel = null;

// ── LOCATE ──
function locate() {
  navigator.geolocation.getCurrentPosition(p => {
    setCenter(p.coords.latitude, p.coords.longitude);
  }, () => alert("Location access denied."));
}

function setCenter(lat, lng) {
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lng]).addTo(map);
  map.setView([lat, lng], 16);
}

// ── TRAVEL MODE ──
function setMode(mode) {
  travelMode = mode;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("mode-" + mode).classList.add("active");
}

// ── TOP SEARCH BAR ──
function searchPlace() {
  const q = document.getElementById("search").value.trim();
  if (!q) return;

  if (q.toUpperCase().startsWith("DAL-")) {
    resolveLocation(q).then(loc => {
      if (loc.error) { alert(loc.error); return; }
      flyToBuilding(loc);
    });
  } else {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)},Thrissur&limit=1`)
      .then(r => r.json())
      .then(d => { if (d.length) setCenter(+d[0].lat, +d[0].lon); });
  }
}

// ── RESOLVE ANY LOCATION (place name, building code, "my location") ──
async function resolveLocation(query) {
  const q = query.trim();
  if (!q) return { error: "Empty input" };

  if (q.toLowerCase() === "my location" || q.toLowerCase() === "current location") {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, label: "My Location" }),
        () => resolve({ error: "Could not get your location. Please allow location access." })
      );
    });
  }

  const res = await fetch("/resolve-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });
  return res.json();
}

// ── FLY TO BUILDING (from code search or map click result) ──
function flyToBuilding(loc) {
  map.setView([loc.lat, loc.lon], 18);

  if (buildingLayer) map.removeLayer(buildingLayer);
  if (loc.polygon) {
    const polygon = loc.polygon.map(p => [p.lat, p.lon]);
    buildingLayer = L.polygon(polygon, {
      color: "#2FAE9E", weight: 3, fillOpacity: 0.35
    }).addTo(map);
  }

  if (marker) map.removeLayer(marker);
  marker = L.marker([loc.lat, loc.lon]).addTo(map);

  pendingDestLat   = loc.lat;
  pendingDestLon   = loc.lon;
  pendingDestLabel = loc.label || loc.building_code || "Destination";

  document.getElementById("code").innerText = loc.building_code || loc.label || "Found";
  document.getElementById("btn-open-directions").style.display = "inline-block";
  document.getElementById("info").style.bottom = "0";
}

// ── MAP CLICK → GET BUILDING CODE ──
map.on("click", e => {
  fetch("/building-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng })
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      document.getElementById("code").innerText = data.error;
      document.getElementById("btn-open-directions").style.display = "none";
      document.getElementById("info").style.bottom = "0";
      if (buildingLayer) map.removeLayer(buildingLayer);
      return;
    }

    document.getElementById("code").innerText = data.building_code;
    document.getElementById("btn-open-directions").style.display = "inline-block";
    document.getElementById("info").style.bottom = "0";

    if (buildingLayer) map.removeLayer(buildingLayer);
    const polygon = data.polygon.map(p => [p.lat, p.lon]);
    buildingLayer = L.polygon(polygon, {
      color: "#2FAE9E", weight: 3, fillOpacity: 0.35
    }).addTo(map);

    const destLat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
    const destLon = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
    pendingDestLat   = destLat;
    pendingDestLon   = destLon;
    pendingDestLabel = data.building_code;
  });
});

// ── OPEN DIRECTIONS PANEL (pre-fill "To" with current building) ──
function openDirectionsTo() {
  if (pendingDestLabel) {
    document.getElementById("input-to").value = pendingDestLabel;
  }
  document.getElementById("input-from").value = "My Location";
  document.getElementById("dir-panel").classList.add("open");
  document.getElementById("info").style.bottom = "-260px";
}

// ── CLOSE DIRECTIONS PANEL ──
function closeDirections() {
  document.getElementById("dir-panel").classList.remove("open");
}

// ── SWAP FROM / TO ──
function swapLocations() {
  const fromInput = document.getElementById("input-from");
  const toInput   = document.getElementById("input-to");
  const tmp = fromInput.value;
  fromInput.value = toInput.value;
  toInput.value   = tmp;
}

// ── GET ROUTE ──
async function getRoute() {
  const fromVal = document.getElementById("input-from").value.trim();
  const toVal   = document.getElementById("input-to").value.trim();

  if (!fromVal || !toVal) {
    showStatus("Please enter both From and To locations.");
    return;
  }

  showLoading(true);
  hideStatus();
  hideResults();

  const [fromLoc, toLoc] = await Promise.all([
    resolveLocation(fromVal),
    resolveLocation(toVal)
  ]);

  if (fromLoc.error) { showLoading(false); showStatus(fromLoc.error); return; }
  if (toLoc.error)   { showLoading(false); showStatus(toLoc.error);   return; }

  // Place markers
  if (fromMarker) map.removeLayer(fromMarker);
  if (toMarker)   map.removeLayer(toMarker);
  fromMarker = L.marker([fromLoc.lat, fromLoc.lon], {
    icon: L.divIcon({ className:'', html:'<div style="background:#2FAE9E;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">A</div>', iconSize:[28,28], iconAnchor:[14,14] })
  }).addTo(map).bindTooltip("From: " + fromVal, {permanent:false});

  toMarker = L.marker([toLoc.lat, toLoc.lon], {
    icon: L.divIcon({ className:'', html:'<div style="background:#e74c3c;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">B</div>', iconSize:[28,28], iconAnchor:[14,14] })
  }).addTo(map).bindTooltip("To: " + toVal, {permanent:false});

  // Highlight destination building polygon if available
  if (buildingLayer) map.removeLayer(buildingLayer);
  if (toLoc.polygon) {
    const poly = toLoc.polygon.map(p => [p.lat, p.lon]);
    buildingLayer = L.polygon(poly, { color:"#e74c3c", weight:3, fillOpacity:0.25 }).addTo(map);
  }

  // OSRM request
  const profile = travelMode === "walking" ? "foot" : "car";
  const osrmBase = travelMode === "walking"
    ? "https://router.project-osrm.org/route/v1/foot"
    : "https://router.project-osrm.org/route/v1/driving";

  const url = `${osrmBase}/${fromLoc.lon},${fromLoc.lat};${toLoc.lon},${toLoc.lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    showLoading(false);

    if (!data.routes || data.routes.length === 0) {
      showStatus("No route found between these locations.");
      return;
    }

    const route = data.routes[0];
    const leg   = route.legs[0];

    // Draw route
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, {
      style: { color:"#2FAE9E", weight:5, opacity:0.9 }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding:[60, 60] });

    // Summary
    const distKm  = (route.distance / 1000).toFixed(1);
    const durMin  = Math.ceil(route.duration / 60);
    const durText = durMin >= 60
      ? `${Math.floor(durMin/60)}h ${durMin%60}min`
      : `${durMin} min`;

    document.getElementById("summary-time").innerText = durText;
    document.getElementById("summary-dist").innerText = `${distKm} km · ${travelMode === "walking" ? "Walking" : "Driving"}`;
    document.getElementById("route-summary").style.display = "block";

    // Turn-by-turn steps
    const stepsList = document.getElementById("steps-list");
    stepsList.innerHTML = "";
    const allSteps = leg.steps || [];

    allSteps.forEach((step, i) => {
      const icon  = getManeuverIcon(step.maneuver ? step.maneuver.type : "");
      const dist  = step.distance >= 1000
        ? (step.distance/1000).toFixed(1) + " km"
        : Math.round(step.distance) + " m";
      const name  = step.name || "";
      const instr = formatInstruction(step.maneuver, name, i, allSteps.length);

      const li = document.createElement("li");
      li.innerHTML = `
        <div class="step-icon">${icon}</div>
        <div>
          <div>${instr}</div>
          <div class="step-dist">${dist}</div>
        </div>`;
      stepsList.appendChild(li);
    });

    stepsList.style.display = "block";
    document.getElementById("btn-clear-route").style.display = "block";

  } catch (e) {
    showLoading(false);
    showStatus("Routing service error. Please try again.");
  }
}

// ── CLEAR ROUTE ──
function clearRoute() {
  if (routeLayer)   { map.removeLayer(routeLayer);   routeLayer   = null; }
  if (fromMarker)   { map.removeLayer(fromMarker);   fromMarker   = null; }
  if (toMarker)     { map.removeLayer(toMarker);     toMarker     = null; }
  hideResults();
  document.getElementById("btn-clear-route").style.display = "none";
}

// ── HELPERS ──
function showLoading(v) {
  document.getElementById("dir-loading").style.display = v ? "block" : "none";
}
function showStatus(msg) {
  const el = document.getElementById("dir-status");
  el.innerText = msg;
  el.style.display = "block";
}
function hideStatus() {
  document.getElementById("dir-status").style.display = "none";
}
function hideResults() {
  document.getElementById("route-summary").style.display = "none";
  document.getElementById("steps-list").style.display = "none";
  document.getElementById("steps-list").innerHTML = "";
}

function getManeuverIcon(type) {
  const icons = {
    "turn":           "↩",
    "new name":       "➡",
    "depart":         "🚩",
    "arrive":         "🏁",
    "merge":          "⤵",
    "on ramp":        "⬆",
    "off ramp":       "⬇",
    "fork":           "⑂",
    "end of road":    "⛔",
    "roundabout":     "🔄",
    "rotary":         "🔄",
    "roundabout turn":"🔄",
    "exit roundabout":"↪",
    "notification":   "ℹ",
  };
  return icons[type] || "➡";
}

function formatInstruction(maneuver, name, index, total) {
  if (!maneuver) return name || "Continue";
  const type      = maneuver.type || "";
  const modifier  = maneuver.modifier || "";
  const roadName  = name ? `onto <b>${name}</b>` : "";

  if (index === 0)         return `Start ${roadName || "your journey"}`;
  if (index === total - 1) return `Arrive at your destination`;

  const dirMap = { left:"left", right:"right", straight:"straight", "slight left":"slightly left", "slight right":"slightly right", "sharp left":"sharp left", "sharp right":"sharp right" };
  const dir = dirMap[modifier] || modifier;

  if (type === "turn")        return `Turn ${dir} ${roadName}`.trim();
  if (type === "roundabout")  return `Enter roundabout ${roadName}`.trim();
  if (type === "exit roundabout") return `Exit roundabout ${roadName}`.trim();
  if (type === "merge")       return `Merge ${dir} ${roadName}`.trim();
  if (type === "fork")        return `Keep ${dir} ${roadName}`.trim();
  if (type === "new name")    return `Continue ${roadName || "ahead"}`;
  return `Continue ${roadName || "ahead"}`;
}