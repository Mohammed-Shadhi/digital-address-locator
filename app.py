from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/nearby-buildings", methods=["POST"])
def nearby_buildings():
    data = request.get_json(force=True)
    lat = float(data["lat"])
    lng = float(data["lng"])
    radius = int(data["radius"])

    query = f"""
    [out:json];
    (
      way(around:{radius},{lat},{lng})["building"];
      relation(around:{radius},{lat},{lng})["building"];
    );
    out center;
    """

    response = requests.post(OVERPASS_URL, data=query, timeout=30)
    osm_data = response.json()

    buildings = []
    for el in osm_data.get("elements", []):
        if "center" in el:
            buildings.append({
                "code": f"BLD-{el['id']}",
                "lat": el["center"]["lat"],
                "lng": el["center"]["lon"]
            })

    return jsonify(buildings)

if __name__ == "__main__":
    app.run(debug=True)
