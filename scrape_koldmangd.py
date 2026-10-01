import json
import time
import csv
from pathlib import Path

import requests

import shlex

BASE_URL = "https://www.solstaskaret.se/skridskonet/koldmangd"

CURL_FILE = Path("curl.txt")

CORE_URL = f"{BASE_URL}/corestations_ajax.php"
WATERS_URL = f"{BASE_URL}/map_getWaters_ajax.php"

OUT_DIR = Path("isradar_koldmangd")
OUT_DIR.mkdir(exist_ok=True)

REQUEST_DELAY = 1.0

def load_auth_from_curl():
    text = CURL_FILE.read_text(encoding="utf-8")

    text = text.replace("\\\r\n", " ")
    text = text.replace("\\\n", " ")

    args = shlex.split(text)

    headers = {}
    cookies = None

    i = 0
    while i < len(args):
        arg = args[i]

        if arg == "curl":
            i += 1
            continue

        if arg in ("-H", "--header"):
            header = args[i + 1]
            key, value = header.split(":", 1)
            headers[key.strip()] = value.strip()
            i += 2
            continue

        if arg in ("-b", "--cookie"):
            cookies = args[i + 1]
            i += 2
            continue

        i += 1

    if cookies:
        headers["Cookie"] = cookies

    return headers


AUTH_HEADERS = load_auth_from_curl()


def get_json(url, params=None):
    r = requests.get(
        url,
        params=params,
        timeout=60,
        headers=AUTH_HEADERS,
    )

    r.raise_for_status()

    data = r.json()

    if isinstance(data, dict) and data.get("status") == "error":
        raise RuntimeError(
            f"Servern svarade med fel: {data.get('error')}"
        )

    return data


def load_core_stations():
    data = get_json(CORE_URL)

    stations = []

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})

        if not props.get("haswaters"):
            continue

        coords = geom.get("coordinates", [None, None])

        stations.append({
            "measurepoint": props.get("measurepoint"),
            "name": props.get("namn"),
            "lon": coords[0],
            "lat": coords[1],
        })

    return stations


def load_waters_for_station(station):
    measurepoint = station["measurepoint"]

    print(
        f"Hämtar {station['name']} "
        f"(measurepoint={measurepoint})..."
    )

    data = get_json(
        WATERS_URL,
        params={"measurepoint": measurepoint}
    )

    raw_file = OUT_DIR / f"waters_{measurepoint}.geojson"

    with open(raw_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    return data


def extract_unique_waters(stations):
    waters = {}
    geometry_by_id = {}
    point_by_id = {}

    conflicts_found = 0

    for i, station in enumerate(stations, start=1):
        print(f"[{i}/{len(stations)}] {station['name']}")

        data = load_waters_for_station(station)

        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})

            objektid = props.get("objektid")

            if objektid is None:
                continue

            if objektid in waters:
                existing = waters[objektid]

                conflicts = []

                if existing["name"] != props.get("vattenkartnamn"):
                    conflicts.append("name")

                if existing["km"] != props.get("km"):
                    conflicts.append("km")

                if existing["measurepoint"] != props.get("measurepoint"):
                    conflicts.append("measurepoint")

                if conflicts:
                    conflicts_found += 1
                    print(
                        f"VARNING: objektid {objektid} skiljer sig i "
                        f"{', '.join(conflicts)}"
                    )

            else:
                waters[objektid] = {
                    "objektid": objektid,
                    "name": props.get("vattenkartnamn"),
                    "km": props.get("km"),
                    "measurepoint": props.get("measurepoint"),
                    "station_name": station["name"],
                    "station_lat": station["lat"],
                    "station_lon": station["lon"],
                }

            geom_type = geom.get("type")

            if geom_type in ("Polygon", "MultiPolygon"):
                geometry_by_id[objektid] = geom

            elif geom_type == "Point":
                point_by_id[objektid] = geom.get("coordinates")

        if i < len(stations):
            time.sleep(REQUEST_DELAY)

    return waters, geometry_by_id, point_by_id, conflicts_found


def save_stations(stations):
    path = OUT_DIR / "stations.csv"

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["measurepoint", "name", "lat", "lon"]
        )
        writer.writeheader()
        writer.writerows(stations)


def save_waters_csv(waters, geometry_by_id, point_by_id):
    path = OUT_DIR / "waters.csv"

    fieldnames = [
        "objektid",
        "name",
        "km",
        "measurepoint",
        "station_name",
        "station_lat",
        "station_lon",
        "point_lon",
        "point_lat",
        "has_polygon",
    ]

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for objektid, water in sorted(waters.items()):
            point = point_by_id.get(objektid)
            row = water.copy()

            row["point_lon"] = point[0] if point else None
            row["point_lat"] = point[1] if point else None
            row["has_polygon"] = objektid in geometry_by_id

            writer.writerow(row)


def save_unique_geojson(waters, geometry_by_id):
    features = []

    for objektid, water in waters.items():
        geom = geometry_by_id.get(objektid)

        if not geom:
            continue

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "objektid": water["objektid"],
                "vattenkartnamn": water["name"],
                "km": water["km"],
                "measurepoint": water["measurepoint"],
                "station_name": water["station_name"],
            },
        })

    output = {
        "type": "FeatureCollection",
        "features": features,
    }

    path = OUT_DIR / "waters_unique.geojson"

    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)


def print_summary(stations, waters, geometry_by_id, conflicts_found):
    kms = [
        w["km"]
        for w in waters.values()
        if isinstance(w.get("km"), (int, float))
    ]

    print()
    print("===== RESULTAT =====")
    print(f"Stationer med vatten: {len(stations)}")
    print(f"Unika vatten: {len(waters)}")
    print(f"Vatten med polygon: {len(geometry_by_id)}")
    print(f"Konflikter: {conflicts_found}")

    if kms:
        print(f"Lägsta KM: {min(kms)}")
        print(f"Högsta KM: {max(kms)}")


def main():
    print("Hämtar core-stationer...")

    stations = load_core_stations()

    print(
        f"Hittade {len(stations)} stationer "
        f"med haswaters=true."
    )

    save_stations(stations)

    waters, geometry_by_id, point_by_id, conflicts_found = (
        extract_unique_waters(stations)
    )

    save_waters_csv(
        waters,
        geometry_by_id,
        point_by_id
    )

    save_unique_geojson(
        waters,
        geometry_by_id
    )

    print_summary(
        stations,
        waters,
        geometry_by_id,
        conflicts_found
    )

    print()
    print(f"Filer sparade i: {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()