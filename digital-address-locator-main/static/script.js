// Thrissur district bounds
const thrissurBounds = [
    [10.25, 75.90],
    [10.85, 76.60]
];

// Initialize map ONLY inside Thrissur
const map = L.map('map', {
    maxBounds: thrissurBounds,
    maxBoundsViscosity: 1.0
});

// Start focused on Thrissur
map.fitBounds(thrissurBounds);

// Tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let marker = null;
let buildingLayer = null;

// ================= AUTO LOCATE (FIXED) =================
document.getElementById("locate-btn").onclick = function () {
    map.locate({
        setView: true,
        maxZoom: 17,
        enableHighAccuracy: true
    });
};

map.on('locationfound', function (e) {
    if (marker) map.removeLayer(marker);
    marker = L.marker(e.latlng)
        .addTo(map)
        .bindPopup("You are here")
        .openPopup();
});

map.on('locationerror', function () {
    alert("Location access denied or unavailable");
});

// ================= SEARCH (NOMINATIM) =================
document.getElementById("search-btn").onclick = function () {
    const q = document.getElementById("search-input").value;
    if (!q) return;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}, Thrissur`)
        .then(res => res.json())
        .then(results => {
            if (results.length === 0) {
                alert("Location not found");
                return;
            }

            const lat = parseFloat(results[0].lat);
            const lon = parseFloat(results[0].lon);

            map.setView([lat, lon], 17);

            if (marker) map.removeLayer(marker);
            marker = L.marker([lat, lon]).addTo(map);
        });
};

// ================= BUILDING CLICK =================
map.on('click', function (e) {

    if (marker) map.removeLayer(marker);
    marker = L.marker(e.latlng).addTo(map);

    fetch('/building-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: e.latlng.lat,
            lng: e.latlng.lng
        })
    })
        .then(res => res.json())
        .then(data => {
            const output = document.getElementById("output");

            if (data.error) {
                output.innerHTML = `<i>${data.error}</i>`;
                if (buildingLayer) map.removeLayer(buildingLayer);
                return;
            }

            if (buildingLayer) map.removeLayer(buildingLayer);

            const polygon = data.polygon.map(p => [p.lat, p.lon]);

            buildingLayer = L.polygon(polygon, {
                color: "#d93025",
                weight: 3,
                fillOpacity: 0.35
            }).addTo(map);

            output.innerHTML = `
            <b>Building Code</b>
            <div class="code">${data.building_code}</div>
        `;
        });
});
