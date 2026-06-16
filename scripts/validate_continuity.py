#!/usr/bin/env python3
"""Validate Go2Town Street View route continuity and mission reachability."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCENES_JS = ROOT / "public" / "js" / "data" / "comaruga.scenes.generated.js"
POIS_JS = ROOT / "public" / "js" / "data" / "comaruga.pois.generated.js"
MISSIONS_JS = ROOT / "public" / "js" / "data" / "comaruga.missions.js"


def parse_export(path: Path, name: str):
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"export const {name} = (.*);\s*$", text, re.S)
    if not m:
        raise AssertionError(f"Could not parse export {name} from {path}")
    return json.loads(m.group(1))


def haversine(a, b) -> float:
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a["lat"], a.get("lon", a.get("lng")), b["lat"], b.get("lon", b.get("lng"))])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    generated = parse_export(SCENES_JS, "GENERATED")
    pois = parse_export(POIS_JS, "POIS")
    mission_text = MISSIONS_JS.read_text(encoding="utf-8")
    mission_matches = re.findall(r'match:\s*"([^"]+)"', mission_text)

    scenes = generated["scenes"]
    graph = generated["graph"]
    max_edge = float(graph["maxWalkEdgeM"])
    playable_segment = generated["playableSegment"]
    playable_route = generated["playableRoute"]

    assert playable_route, "playableRoute is empty"
    assert generated["startScene"] == playable_route[0], "startScene must be first playable route pano"

    route_scenes = [scenes[i] for i in playable_route]
    assert all(s["playable"] for s in route_scenes), "playableRoute contains non-playable scene"
    assert {s["routeSegment"] for s in route_scenes} == {playable_segment}, "playableRoute crosses segments"
    assert [s["segmentRouteIndex"] for s in route_scenes] == list(range(len(route_scenes))), "playable route indexes are not contiguous"

    long_edges = []
    for a, b in zip(playable_route, playable_route[1:]):
        d = haversine(scenes[a], scenes[b])
        if d > max_edge + 1e-6:
            long_edges.append((a, b, d))
    assert not long_edges, f"playable route has long edges: {[(a, b, round(d, 1)) for a, b, d in long_edges[:5]]}"

    missing_pois = [p for p in pois if p.get("nearestPano") not in scenes]
    assert not missing_pois, f"POIs reference missing panos: {[p['name'] for p in missing_pois[:5]]}"
    non_playable_pois = [p for p in pois if not scenes[p["nearestPano"]].get("playable")]
    assert not non_playable_pois, f"POIs reference non-playable panos: {[p['name'] for p in non_playable_pois[:5]]}"

    unresolved = []
    for match in mission_matches:
        poi = next((p for p in pois if match.lower() in p["name"].lower()), None)
        if not poi:
            unresolved.append(match)
    assert not unresolved, f"mission matches without POIs: {unresolved}"

    print(json.dumps({
        "ok": True,
        "playable_segment": playable_segment,
        "playable_nodes": len(playable_route),
        "max_walk_edge_m": max_edge,
        "max_playable_route_edge_m": graph["maxPlayableRouteEdgeM"],
        "route_gaps_outside_playable": len(graph["routeGaps"]),
        "pois": len(pois),
        "mission_matches": mission_matches,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
