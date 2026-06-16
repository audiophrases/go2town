#!/usr/bin/env python3
"""Pull REAL street/POI data for the selected playable route from OpenStreetMap.

- reverse-geocodes the playable start & station-ish panos via Nominatim
- finds named shops/amenities via Overpass
- writes POIs whose nearest pano is inside the vetted continuous playable segment

Free, no API key, ODbL data. If Overpass is unavailable, the script falls back to
recomputing distances from the existing generated POI file so stale pano IDs can
still be repaired offline.
"""
from __future__ import annotations

import importlib.util
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "js" / "data" / "comaruga.pois.generated.js"
spec = importlib.util.spec_from_file_location("bs", ROOT / "scripts" / "build_scenes.py")
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

UA = "go2town-dev/1.0 (educational ESL game; contact local)"
POI_REACH_M = 80.0


def http(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def nominatim_reverse(lat, lon):
    q = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 18})
    try:
        d = json.loads(http("https://nominatim.openstreetmap.org/reverse?" + q, headers={"User-Agent": UA}))
        a = d.get("address", {})
        road = a.get("road") or a.get("pedestrian") or a.get("footway") or "?"
        town = a.get("suburb") or a.get("neighbourhood") or a.get("town") or a.get("village") or a.get("city") or ""
        return f"{road} — {town}".strip()
    except Exception as e:
        return f"(reverse failed: {e})"


def overpass(bbox):
    s, w, n, e = bbox
    q = f"""[out:json][timeout:40];
(
  nwr["shop"]({s},{w},{n},{e});
  nwr["amenity"~"^(pharmacy|cafe|restaurant|bar|bank|post_office|marketplace|ice_cream|fast_food)$"]({s},{w},{n},{e});
);
out center tags;"""
    body = urllib.parse.urlencode({"data": q}).encode()
    return json.loads(
        http(
            "https://overpass-api.de/api/interpreter",
            data=body,
            headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"},
        )
    )


def load_existing_pois():
    if not OUT.exists():
        return []
    text = OUT.read_text(encoding="utf-8")
    m = re.search(r"export const POIS = (\[.*\]);\s*$", text, re.S)
    if not m:
        return []
    raw = json.loads(m.group(1))
    return [(p["name"], p.get("kind", "?"), p["lat"], p["lng"]) for p in raw]


def collect_live_pois(bbox):
    data = overpass(bbox)
    pois = []
    seen = set()
    for el in data.get("elements", []):
        t = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        name = (t.get("name") or "").strip()
        if lat is None or lon is None or not name:
            continue
        kind = ("shop:" + t["shop"]) if "shop" in t else ("amenity:" + t.get("amenity", "?"))
        key = (name.casefold(), kind, round(float(lat), 6), round(float(lon), 6))
        if key not in seen:
            seen.add(key)
            pois.append((name, kind, float(lat), float(lon)))
    return pois


def main():
    nodes, order, _manifest = bs.load_nodes()
    segments, _gaps = bs.split_route(nodes, order)
    playable_segment = bs.select_playable_segment(nodes, segments)
    ids = list(segments[playable_segment])
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

    start = ids[0]
    station_guess = bs.nearest_node(nodes, bs.STATION, ids)
    print("== Reverse geocode (Nominatim) ==")
    print(f"playable start pano {start[:8]}… @ {nodes[start]['lat']:.5f},{nodes[start]['lon']:.5f}")
    print("   street:", nominatim_reverse(nodes[start]["lat"], nodes[start]["lon"]))
    time.sleep(1.1)
    print(f"station-nearest playable pano {station_guess[:8]}…")
    print("   street:", nominatim_reverse(nodes[station_guess]["lat"], nodes[station_guess]["lon"]))

    print("\n== Overpass POIs near playable capture bbox ==")
    try:
        pois = collect_live_pois(bbox)
        source = "Overpass"
    except Exception as e:
        print(f"Overpass failed ({e}); falling back to existing generated POI names/coords.")
        pois = load_existing_pois()
        source = "existing generated POIs"

    reach = []
    for name, kind, lat, lon in pois:
        pid, d = nearest_pano(lat, lon)
        reach.append((d, name, kind, lat, lon, pid))
    reach.sort()
    print(f"\n-- Named shops/services from {source}: {len(pois)} total; nearest to playable route: --")
    for d, name, kind, lat, lon, pid in reach[:25]:
        flag = "✓mission-safe" if d <= POI_REACH_M else ""
        print(f"  {d:5.0f} m  {kind:18s} {name[:34]:34s} {flag}")

    payload = [
        {
            "name": name,
            "kind": kind,
            "lat": round(lat, 7),
            "lng": round(lon, 7),
            "nearestPano": pid,
            "distM": round(d),
        }
        for d, name, kind, lat, lon, pid in reach
        if d <= POI_REACH_M
    ]
    OUT.write_text(
        "// AUTO-GENERATED by scripts/osm_lookup.py — real OpenStreetMap POIs (ODbL).\n"
        "// © OpenStreetMap contributors. Named shops/services within 80 m of the playable pano route.\n"
        "export const POIS = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"\nwrote {OUT.relative_to(ROOT)}  ({len(payload)} playable POIs)")


if __name__ == "__main__":
    main()
