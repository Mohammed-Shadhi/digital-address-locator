from flask import Flask, request, jsonify, render_template
import requests
import hashlib
import math
import sqlite3

app = Flask(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DB_NAME = "buildings.db"

# ---------------- DATABASE ----------------

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS buildings (
            osm_id INTEGER PRIMARY KEY,
            building_code TEXT
        )
    """)
    conn.commit()
    conn.close()

def get_saved_code(osm_id):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT building_code FROM buildings WHERE osm_id = ?", (osm_id,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else None

def save_code(osm_id, code):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute(
        "INSERT OR IGNORE INTO buildings (osm_id, building_code) VALUES (?, ?)",
        (osm_id, code)
    )
    conn.commit()
    conn.close()

# ---------------- HELPER FUNCTIONS ----------------

def centroid(geometry):
    lat = sum(p["lat"] for p in geometry) / len(geometry)
    lon = sum(p["lon"] for p in geometry) / len(geometry)
    return lat, lon

def distance(c1, c2):
    return math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2) * 111000

def get_buildings(lat, lon, radius=200):
    query = f"""
    [out:json];
    way(around:{radius},{lat},{lon})["building"];
    out geom;
    """
    r = requests.post(OVERPASS_URL, data=query, timeout=20)
    return r.json().get("elements", [])

# ---------------- ROUTES ----------------

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/building-code", methods=["POST"])
def building_code():
    data = request.get_json(force=True)
    lat = float(data["lat"])
    lon = float(data["lng"])

    buildings = get_buildings(lat, lon)
    if not buildings:
        return jsonify({"error": "No buildings found"})

    nearest = None
    min_dist = float("inf")

    for b in buildings:
        c = centroid(b["geometry"])
        d = distance((lat, lon), c)
        if d < min_dist:
            min_dist = d
            nearest = b

    if min_dist > 25:
        return jsonify({"error": "Click inside a building"})

    osm_id = nearest["id"]

    saved_code = get_saved_code(osm_id)
    if saved_code:
        return jsonify({
            "building_code": saved_code,
            "polygon": nearest["geometry"]
        })

    unique = hashlib.sha256(f"OSM-{osm_id}".encode()).hexdigest()[:8].upper()
    building_code = f"DAL-THR-{unique}"

    save_code(osm_id, building_code)

    return jsonify({
        "building_code": building_code,
        "polygon": nearest["geometry"]
    })

# ---------------- LOOKUP BY BUILDING CODE ----------------

@app.route("/lookup-code", methods=["POST"])
def lookup_code():
    data = request.get_json(force=True)
    code = data["code"].strip().upper()

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT osm_id FROM buildings WHERE building_code = ?", (code,))
    row = c.fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "Building code not found"})

    osm_id = row[0]

    query = f"""
    [out:json];
    way({osm_id});
    out geom;
    """
    r = requests.post(OVERPASS_URL, data=query, timeout=20)
    elements = r.json().get("elements", [])

    if not elements:
        return jsonify({"error": "Building geometry not available"})

    building = elements[0]
    lat, lon = centroid(building["geometry"])

    return jsonify({
        "lat": lat,
        "lon": lon,
        "polygon": building["geometry"],
        "building_code": code
    })

# ---------------- RESOLVE LOCATION (place name / building code / current location) ----------------

@app.route("/resolve-location", methods=["POST"])
def resolve_location():
    data = request.get_json(force=True)
    query = data.get("query", "").strip()

    # Building code
    if query.upper().startswith("DAL-"):
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT osm_id FROM buildings WHERE building_code = ?", (query.upper(),))
        row = c.fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Building code not found"})
        osm_id = row[0]
        oq = f"[out:json];way({osm_id});out geom;"
        r = requests.post(OVERPASS_URL, data=oq, timeout=20)
        elements = r.json().get("elements", [])
        if not elements:
            return jsonify({"error": "Building geometry not available"})
        building = elements[0]
        lat, lon = centroid(building["geometry"])
        return jsonify({"lat": lat, "lon": lon, "label": query.upper(), "polygon": building["geometry"]})

    # Place name via Nominatim
    nom = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"format": "json", "q": f"{query}, Thrissur", "limit": 1},
        headers={"User-Agent": "DigitalAddressLocator/1.0"},
        timeout=10
    )
    results = nom.json()
    if not results:
        return jsonify({"error": f'Place "{query}" not found'})
    place = results[0]
    return jsonify({"lat": float(place["lat"]), "lon": float(place["lon"]), "label": place.get("display_name", query)})


if __name__ == "__main__":
    init_db()
    app.run(debug=True)