#!/usr/bin/env python3
"""Pull REAL street/POI data for the captured area from OpenStreetMap.

- reverse-geocodes the start & station panos (street names) via Nominatim
- finds real railway stations + named shops/amenities via Overpass
- reports each POI's distance to the nearest captured pano (= reachable in-game)

Free, no API key, ODbL data. Polite: one Overpass call, two Nominatim calls.
"""
from __future__ import annotations

import importlib.util
import json
import math
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

# Windows consoles default to cp1252; force UTF-8 so accents/✓ print.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bs", ROOT / "scripts" / "build_scenes.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

UA = "go2town-dev/1.0 (educational ESL game; contact local)"


def http(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def nominatim_reverse(lat, lon):
    q = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 18})
    try:
        d = json.loads(http("https://nominatim.openstreetmap.org/reverse?" + q,
                             headers={"User-Agent": UA}))
        a = d.get("address", {})
        road = a.get("road") or a.get("pedestrian") or a.get("footway") or "?"
        return f"{road} — {a.get('suburb') or a.get('neighbourhood') or ''} {a.get('town') or a.get('village') or a.get('city') or ''}".strip()
    except Exception as e:
        return f"(reverse failed: {e})"


def overpass(bbox):
    s, w, n, e = bbox
    q = f"""[out:json][timeout:40];
(
  nwr["railway"="station"]({s},{w},{n},{e});
  nwr["railway"="halt"]({s},{w},{n},{e});
  nwr["shop"]({s},{w},{n},{e});
  nwr["amenity"~"^(pharmacy|cafe|restaurant|bar|bank|fuel|post_office|hospital|clinic|doctors|school|townhall|marketplace|ice_cream|fast_food)$"]({s},{w},{n},{e});
);
out center tags;"""
    body = urllib.parse.urlencode({"data": q}).encode()
    return json.loads(http("https://overpass-api.de/api/interpreter", data=body,
                           headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"}))


def main():
    nodes = bs.load_nodes()
    ids = list(nodes)
    pts = [(nodes[i]["lat"], nodes[i]["lon"]) for i in ids]
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    bbox = (min(lats) - 0.002, min(lons) - 0.002, max(lats) + 0.002, max(lons) + 0.002)

    def nearest_pano(lat, lon):
        best, bd = None, 1e9
        for i, (a, b) in zip(ids, pts):
            d = bs.haversine((lat, lon), (a, b))
            if d < bd:
                bd, best = d, i
        return best, bd

    # Which panos did the build script choose?
    start = bs.nearest_node(nodes, bs.SEAFRONT)
    station_guess = bs.nearest_node(nodes, bs.STATION)
    print("== Reverse geocode (Nominatim) ==")
    print(f"start pano  {start[:8]}…  @ {nodes[start]['lat']:.5f},{nodes[start]['lon']:.5f}")
    print("   street:", nominatim_reverse(nodes[start]["lat"], nodes[start]["lon"]))
    time.sleep(1.1)
    print(f"my station guess pano {station_guess[:8]}…")
    print("   street:", nominatim_reverse(nodes[station_guess]["lat"], nodes[station_guess]["lon"]))

    print("\n== Overpass POIs in capture bbox ==")
    data = overpass(bbox)
    stations, pois = [], []
    for el in data.get("elements", []):
        t = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        name = t.get("name", "")
        if t.get("railway") in ("station", "halt"):
            kind = "railway:" + t["railway"]
            # node coords are exact; way/relation use bbox-centre (approximate!)
            exact = el.get("type") == "node"
            stations.append((name or "(unnamed)", kind, lat, lon, el.get("type"), exact))
        else:
            kind = ("shop:" + t["shop"]) if "shop" in t else ("amenity:" + t.get("amenity", "?"))
            if name:
                pois.append((name, kind, lat, lon))

    print(f"\n-- Railway stations/halts found: {len(stations)} --")
    for name, kind, lat, lon, etype, exact in stations:
        pid, d = nearest_pano(lat, lon)
        loc = "exact node" if exact else f"{etype} centre ~approx"
        print(f"  {name:30s} {kind:14s} {lat:.5f},{lon:.5f}  [{loc}]  nearest pano {d:5.0f} m ({pid[:8]}…)")
        time.sleep(1.1)
        print("     reverse:", nominatim_reverse(lat, lon))

    # Named POIs reachable from a pano (<= 70 m), sorted by reachability.
    reach = []
    for name, kind, lat, lon in pois:
        pid, d = nearest_pano(lat, lon)
        reach.append((d, name, kind, lat, lon, pid))
    reach.sort()
    print(f"\n-- Named shops/services: {len(pois)} total; nearest to a pano: --")
    for d, name, kind, lat, lon, pid in reach[:25]:
        flag = "✓reachable" if d <= 70 else ""
        print(f"  {d:5.0f} m  {kind:18s} {name[:34]:34s} {flag}")

    # Persist the reachable ones (≤70 m) for building real missions later.
    out = ROOT / "public" / "js" / "data" / "comaruga.pois.generated.js"
    payload = [
        {"name": name, "kind": kind, "lat": round(lat, 7), "lng": round(lon, 7),
         "nearestPano": pid, "distM": round(d)}
        for d, name, kind, lat, lon, pid in reach if d <= 70
    ]
    out.write_text(
        "// AUTO-GENERATED by scripts/osm_lookup.py — real OpenStreetMap POIs (ODbL).\n"
        "// © OpenStreetMap contributors. Named shops/services within 70 m of a pano.\n"
        "export const POIS = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"\nwrote {out.relative_to(ROOT)}  ({len(payload)} reachable POIs)")


if __name__ == "__main__":
    main()
