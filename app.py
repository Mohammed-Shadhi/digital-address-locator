from flask import Flask, request, jsonify, render_template
import hashlib
import requests

app = Flask(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/generate-code", methods=["POST"])
def generate_code():
    data = request.get_json(force=True)
    lat = data["lat"]
    lng = data["lng"]

    # Overpass query: find building at point
    query = f"""
    [out:json];
    way(around:5,{lat},{lng})["building"];
    out ids;
    """

    response = requests.post(OVERPASS_URL, data=query).json()
    elements = response.get("elements", [])

    if not elements:
        return jsonify({"error": "No building found"}), 404

    building_id = elements[0]["id"]

    # Stable building identity
    building_code = hashlib.sha256(
        f"OSM-{building_id}".encode()
    ).hexdigest()[:10].upper()

    return jsonify({
        "building_code": building_code,
        "osm_building_id": building_id
    })

if __name__ == "__main__":
    app.run(debug=True)
