const map = L.map('map').setView([10.59,76.21],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let centerLat, centerLng;
let centerMarker, radiusCircle, routingControl;
let selectedDestination = null;
let currentPlace = null;

const radiusSlider = document.getElementById("radius");
const radiusValue = document.getElementById("radiusValue");
const modeSelect = document.getElementById("mode");

radiusValue.innerText = radiusSlider.value;

// ---------- STORAGE ----------
let history = JSON.parse(localStorage.getItem("history") || "[]");
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

// ---------- CENTER ----------
function setCenter(lat, lng, label) {
  centerLat = lat;
  centerLng = lng;
  currentPlace = { name: label, lat, lng };

  map.setView([lat, lng], 16);

  if (centerMarker) map.removeLayer(centerMarker);
  centerMarker = L.marker([lat, lng]).addTo(map).bindPopup(label).openPopup();

  loadBuildings();
}

// ---------- AUTO LOCATE ----------
function autoLocate() {
  navigator.geolocation.getCurrentPosition(
    pos => setCenter(pos.coords.latitude, pos.coords.longitude, "Your Location"),
    () => alert("Location access denied"),
    { enableHighAccuracy: true }
  );
}
document.getElementById("autoLocateBtn").onclick = autoLocate;
autoLocate();

// ---------- MAP CLICK ----------
map.on("click", e => setCenter(e.latlng.lat, e.latlng.lng, "Selected Location"));

// ---------- BUILDINGS ----------
function loadBuildings() {
  if (!centerLat) return;

  if (radiusCircle) map.removeLayer(radiusCircle);
  radiusCircle = L.circle([centerLat, centerLng], {
    radius: +radiusSlider.value
  }).addTo(map);

  fetch("/nearby-buildings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: centerLat, lng: centerLng, radius: +radiusSlider.value })
  })
  .then(r => r.json())
  .then(buildings => {
    buildings.forEach(b => {
      L.marker([b.lat, b.lng]).addTo(map)
        .bindPopup(`
          <b>${b.code}</b><br/>
          <button onclick="routeTo(${b.lat},${b.lng})">Route</button>
        `);
    });
  });
}

// ---------- ROUTING ----------
function routeTo(lat, lng) {
  selectedDestination = { lat, lng };
  drawRoute();
}

function drawRoute() {
  if (!selectedDestination) return;

  if (routingControl) map.removeControl(routingControl);

  routingControl = L.Routing.control({
    waypoints: [
      L.latLng(centerLat, centerLng),
      L.latLng(selectedDestination.lat, selectedDestination.lng)
    ],
    router: L.Routing.osrmv1({
      serviceUrl: `https://router.project-osrm.org/route/v1/${modeSelect.value}`
    }),
    addWaypoints: false,
    show: false
  })
  .on("routesfound", e => {
    const r = e.routes[0];
    document.getElementById("distance").innerText =
      (r.summary.totalDistance / 1000).toFixed(2) + " km";
    document.getElementById("time").innerText =
      Math.round(r.summary.totalTime / 60) + " min";
    showInstructions(r.instructions);
  })
  .addTo(map);
}

modeSelect.onchange = drawRoute;

// ---------- INSTRUCTIONS + VOICE ----------
function showInstructions(steps) {
  const list = document.getElementById("instructions");
  list.innerHTML = "";
  steps.forEach(s => {
    const li = document.createElement("li");
    li.innerText = s.text;
    list.appendChild(li);
    speechSynthesis.speak(new SpeechSynthesisUtterance(s.text));
  });
}

// ---------- SEARCH ----------
function geocode(q, cb) {
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(d => {
      if (d.length) {
        saveHistory(q);
        cb(+d[0].lat, +d[0].lon);
      } else alert("Place not found");
    });
}

function searchPlace() {
  geocode(document.getElementById("placeSearch").value,
    (lat,lng)=>setCenter(lat,lng,"Searched Place"));
}

function searchRoute() {
  const to = document.getElementById("toSearch").value;
  const from = document.getElementById("fromSearch").value;

  geocode(to,(tlat,tlng)=>{
    if(from){
      geocode(from,(flat,flng)=>{
        setCenter(flat,flng,"Route Start");
        routeTo(tlat,tlng);
      });
    } else routeTo(tlat,tlng);
  });
}

// ---------- FAVORITES ----------
document.getElementById("addFavoriteBtn").onclick = function () {
  if (!currentPlace) return alert("No place selected");
  favorites.push(currentPlace);
  localStorage.setItem("favorites", JSON.stringify(favorites));
  renderFavorites();
};

function renderFavorites() {
  const ul = document.getElementById("favorites");
  ul.innerHTML = "";
  favorites.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `${f.name} <button onclick="setCenter(${f.lat},${f.lng},'Favorite')">Go</button>`;
    ul.appendChild(li);
  });
}
renderFavorites();

// ---------- HISTORY ----------
function saveHistory(q) {
  if (!history.includes(q)) {
    history.unshift(q);
    history = history.slice(0,5);
    localStorage.setItem("history", JSON.stringify(history));
    renderHistory();
  }
}

function renderHistory() {
  const ul = document.getElementById("history");
  ul.innerHTML = "";
  history.forEach(h => {
    const li = document.createElement("li");
    li.innerText = h;
    ul.appendChild(li);
  });
}
renderHistory();

// ---------- CLEAR ----------
function clearRoute() {
  if (routingControl) map.removeControl(routingControl);
  document.getElementById("instructions").innerHTML = "";
  document.getElementById("distance").innerText = "-";
  document.getElementById("time").innerText = "-";
}
