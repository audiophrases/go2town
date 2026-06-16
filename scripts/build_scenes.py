#!/usr/bin/env python3
"""Build the go2town 360 scene graph from the active Street View fixture manifest.

Each unique pano in street-view-imagery/manifest.json becomes one scene. The
manifest order is the capture route order, but the playable route is split at
coverage gaps above MAX_WALK_EDGE_M so the runtime can never walk across a
teleport-length bridge.

Usage:
    python scripts/build_scenes.py            # analyse + print a report
    python scripts/build_scenes.py --write    # also write the generated JS
    python scripts/build_scenes.py --check    # fail if playable continuity is bad
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
IMAGERY_ROOT = ROOT / "street-view-imagery"
MANIFEST = IMAGERY_ROOT / "manifest.json"
OUT_JS = ROOT / "public" / "js" / "data" / "comaruga.scenes.generated.js"
CAPTURES_DIR = IMAGERY_ROOT / "captures"
CUBE_HEADINGS = ("h000", "h090", "h180", "h270")
# Keep only natural-feeling walking hops in the playable route. The current
# Coma-ruga fixture has official Google coverage gaps elsewhere; those segments
# remain in diagnostics but are not part of the active mission path.
MAX_WALK_EDGE_M = 60.0
LOCAL_LINK_RADIUS_M = 45.0
MAX_LOCAL_LINKS = 4

# Mission-area anchors used only to pick the best continuous segment when the
# manifest contains several disconnected route fragments. The actual mission POIs
# still come from OSM in scripts/osm_lookup.py.
MISSION_AREA_ANCHORS = [
    (41.1811240, 1.5265659),  # La Jijonenca
    (41.1815342, 1.5293219),  # Pizza Metro
    (41.1829589, 1.5356363),  # Kibón
    (41.1831868, 1.5367754),  # Forn de pa Sant Francesc
]
STATION = (41.17365, 1.50995)


def haversine(a, b) -> float:
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _pano_id(capture):
    pano = capture.get("pano_id")
    if pano:
        return pano
    cid = capture.get("id", "")
    parts = cid.split(":")
    return parts[1] if len(parts) >= 2 else cid


def has_complete_cube(pano_id: str) -> bool:
    """True when all four side-view capture images exist for a pano."""
    return all((CAPTURES_DIR / f"google_{pano_id}_{heading}" / "image.jpg").is_file() for heading in CUBE_HEADINGS)


def load_nodes():
    """Read unique panos from the active manifest, preserving manifest order."""
    if not MANIFEST.exists():
        raise SystemExit(f"Missing fixture manifest: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    nodes = {}
    order = []
    for cap in manifest.get("captures", []):
        pano = _pano_id(cap)
        lat = cap.get("lat")
        lon = cap.get("lon", cap.get("lng"))
        if not pano or lat is None or lon is None:
            continue
        if pano not in nodes:
            nodes[pano] = {"id": pano, "lat": float(lat), "lon": float(lon), "routeIndex": len(order)}
            order.append(pano)
    if not nodes:
        raise SystemExit(f"No usable captures in {MANIFEST}")
    return nodes, order, manifest


def split_route(nodes, order, max_edge_m=MAX_WALK_EDGE_M):
    """Split manifest route order into natural continuous segments."""
    segments = []
    gaps = []
    current = []
    for idx, pano in enumerate(order):
        if idx:
            prev = order[idx - 1]
            d = haversine((nodes[prev]["lat"], nodes[prev]["lon"]), (nodes[pano]["lat"], nodes[pano]["lon"]))
            if d > max_edge_m:
                gaps.append({"fromIndex": idx - 1, "toIndex": idx, "from": prev, "to": pano, "metres": d})
                segments.append(current)
                current = []
        current.append(pano)
    if current:
        segments.append(current)
    for seg_id, segment in enumerate(segments):
        for seg_idx, pano in enumerate(segment):
            nodes[pano]["routeSegment"] = seg_id
            nodes[pano]["segmentRouteIndex"] = seg_idx
    return segments, gaps


def _nearest_distance(nodes, ids: Iterable[str], target):
    return min(haversine((nodes[i]["lat"], nodes[i]["lon"]), target) for i in ids)


def select_playable_segment(nodes, segments):
    """Choose the continuous segment that best covers the intended mission area."""
    best_seg = 0
    best_score = None
    for seg_id, ids in enumerate(segments):
        if not ids:
            continue
        anchor_distances = [_nearest_distance(nodes, ids, a) for a in MISSION_AREA_ANCHORS]
        covered = sum(1 for d in anchor_distances if d <= 180.0)
        close = sum(1 for d in anchor_distances if d <= 80.0)
        avg = sum(anchor_distances) / len(anchor_distances)
        score = (covered, close, -avg, len(ids))
        if best_score is None or score > best_score:
            best_score = score
            best_seg = seg_id
    for seg_id, ids in enumerate(segments):
        for pano in ids:
            nodes[pano]["playable"] = seg_id == best_seg
    return best_seg


def add_edge(links, a, b):
    if a == b:
        return
    if b not in links[a]:
        links[a].append(b)
    if a not in links[b]:
        links[b].append(a)


def build_links(nodes, order):
    links = {i: [] for i in nodes}

    # 1) Adjacent route links only inside natural continuous segments.
    for a, b in zip(order, order[1:]):
        if nodes[a].get("routeSegment") == nodes[b].get("routeSegment"):
            add_edge(links, a, b)

    # 2) Add short local links for diagnostics/intersections, never across gaps.
    for i in order:
        a = (nodes[i]["lat"], nodes[i]["lon"])
        dists = []
        for j in order:
            if i == j or nodes[i].get("routeSegment") != nodes[j].get("routeSegment"):
                continue
            d = haversine(a, (nodes[j]["lat"], nodes[j]["lon"]))
            if d <= LOCAL_LINK_RADIUS_M:
                dists.append((d, j))
        dists.sort()
        for _, j in dists[:MAX_LOCAL_LINKS]:
            add_edge(links, i, j)

    for i in order:
        a = (nodes[i]["lat"], nodes[i]["lon"])
        links[i].sort(key=lambda j: haversine(a, (nodes[j]["lat"], nodes[j]["lon"])))
    return links


def nearest_node(nodes, target, candidates=None):
    ids = list(candidates) if candidates is not None else list(nodes)
    return min(ids, key=lambda i: haversine((nodes[i]["lat"], nodes[i]["lon"]), target))


def component_sizes(nodes, links):
    seen = set()
    sizes = []
    for start in nodes:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        size = 0
        while stack:
            cur = stack.pop()
            size += 1
            for nxt in links[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def edge_lengths(nodes, links):
    lengths = []
    seen = set()
    for i, outs in links.items():
        for j in outs:
            k = tuple(sorted((i, j)))
            if k in seen:
                continue
            seen.add(k)
            lengths.append(haversine((nodes[i]["lat"], nodes[i]["lon"]), (nodes[j]["lat"], nodes[j]["lon"])))
    return sorted(lengths)


def route_edge_lengths(nodes, ids):
    return [
        haversine((nodes[a]["lat"], nodes[a]["lon"]), (nodes[b]["lat"], nodes[b]["lon"]))
        for a, b in zip(ids, ids[1:])
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true", help="fail if the playable route violates continuity")
    args = ap.parse_args()

    nodes, order, manifest = load_nodes()
    segments, gaps = split_route(nodes, order)
    playable_segment = select_playable_segment(nodes, segments)
    playable_route = segments[playable_segment]
    links = build_links(nodes, order)

    lats = [n["lat"] for n in nodes.values()]
    lons = [n["lon"] for n in nodes.values()]
    print(f"dataset: {manifest.get('dataset', 'unknown')}")
    print(f"nodes: {len(nodes)}")
    print(f"bbox lat {min(lats):.5f}..{max(lats):.5f}  lon {min(lons):.5f}..{max(lons):.5f}")

    degs = [len(v) for v in links.values()]
    print(f"links/node: min {min(degs)} max {max(degs)} avg {sum(degs)/len(degs):.1f}")
    lengths = edge_lengths(nodes, links)
    if lengths:
        print(
            "edge metres: "
            f"min {lengths[0]:.1f} median {lengths[len(lengths)//2]:.1f} "
            f"p90 {lengths[int(len(lengths)*0.9)]:.1f} max {lengths[-1]:.1f}"
        )
    comps = component_sizes(nodes, links)
    print(f"components: {comps[:8]}{' ...' if len(comps) > 8 else ''}")
    print(f"route gaps > {MAX_WALK_EDGE_M:.0f} m: {len(gaps)}")
    for gap in sorted(gaps, key=lambda g: g["metres"], reverse=True)[:8]:
        print(f"  gap {gap['fromIndex']}→{gap['toIndex']}: {gap['metres']:.1f} m")

    playable_lengths = route_edge_lengths(nodes, playable_route)
    max_playable = max(playable_lengths) if playable_lengths else 0.0
    print(
        f"playable segment: {playable_segment}  nodes: {len(playable_route)}  "
        f"route max edge: {max_playable:.1f} m"
    )
    print(f"playable start {playable_route[0]}  end {playable_route[-1]}")

    start = playable_route[0]
    station = nearest_node(nodes, STATION, playable_route)
    print(f"start node {start}  (first playable pano)")
    print(f"station-nearest playable node {station}")

    if args.check and max_playable > MAX_WALK_EDGE_M + 1e-6:
        raise SystemExit(
            f"Playable route has a {max_playable:.1f} m hop, above {MAX_WALK_EDGE_M:.1f} m"
        )

    if args.write:
        scenes = {}
        cube_count = 0
        for i in order:
            n = nodes[i]
            has_cube = has_complete_cube(i)
            if has_cube:
                cube_count += 1
            scenes[i] = {
                "lat": round(n["lat"], 7),
                "lon": round(n["lon"], 7),
                "routeIndex": n["routeIndex"],
                "routeSegment": n["routeSegment"],
                "segmentRouteIndex": n["segmentRouteIndex"],
                "playable": bool(n.get("playable")),
                "links": links[i],
                "cube": has_cube,
            }
        payload = {
            "sourceDataset": manifest.get("dataset"),
            "startScene": start,
            "stationScene": station,
            "stationLat": round(nodes[station]["lat"], 7),
            "stationLng": round(nodes[station]["lon"], 7),
            "playableSegment": playable_segment,
            "playableRoute": playable_route,
            "graph": {
                "maxWalkEdgeM": MAX_WALK_EDGE_M,
                "localLinkRadiusM": LOCAL_LINK_RADIUS_M,
                "nodes": len(scenes),
                "cubeScenes": cube_count,
                "placeholderScenes": len(scenes) - cube_count,
                "components": comps,
                "segments": [
                    {"id": i, "nodes": len(seg), "startIndex": nodes[seg[0]]["routeIndex"], "endIndex": nodes[seg[-1]]["routeIndex"]}
                    for i, seg in enumerate(segments)
                ],
                "routeGaps": [
                    {**gap, "metres": round(gap["metres"], 1)}
                    for gap in gaps
                ],
                "maxEdgeM": round(lengths[-1], 1) if lengths else 0,
                "maxPlayableRouteEdgeM": round(max_playable, 1),
            },
            "scenes": scenes,
        }
        OUT_JS.write_text(
            "// AUTO-GENERATED by scripts/build_scenes.py — do not edit by hand.\n"
            "// 360 scene graph reconstructed from street-view-imagery/manifest.json.\n"
            "// Runtime movement uses only adjacent panos inside the selected continuous playable segment.\n"
            "export const GENERATED = " + json.dumps(payload, indent=1) + ";\n",
            encoding="utf-8",
        )
        print(f"wrote {OUT_JS.relative_to(ROOT)}  ({len(scenes)} scenes, {cube_count} with complete cubemaps)")


if __name__ == "__main__":
    main()
