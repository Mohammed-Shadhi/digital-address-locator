// Initialize map (VAST location as default)
const map = L.map('map').setView([10.5907, 76.2086], 16);

// OpenStreetMap tiles (FREE)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let marker;

map.on('click', function (e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Replace marker
    if (marker) {
        map.removeLayer(marker);
    }
    marker = L.marker([lat, lng]).addTo(map);

    // Send coordinates to backend
    fetch('/generate-code', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            lat: lat,
            lng: lng
        })
    })
    .then(res => res.json())
    .then(data => {
        // Handle all possible backend responses
        if (data.building_code) {
            document.getElementById("code").innerText = data.building_code;
        } else if (data.error) {
            document.getElementById("code").innerText = "No building detected";
        } else {
            document.getElementById("code").innerText = "Unknown response";
        }
    })
    .catch(err => {
        console.error("Request failed:", err);
        document.getElementById("code").innerText = "Server error";
    });
});
