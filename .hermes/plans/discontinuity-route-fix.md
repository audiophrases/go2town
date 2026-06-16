# Discontinuity Route Fix Implementation Plan

> **For Hermes:** Execute directly in this repo and verify with generated data + browser smoke tests.

**Goal:** Make Street View movement feel like continuous walking by eliminating playable route hops over the natural-distance threshold and making missions target only reachable panos.

**Architecture:** Keep all collected Google Street View fixture images on disk, but make the game-facing generated scene graph segment-aware. `scripts/build_scenes.py` computes natural route segments at a strict max-walk edge, selects a playable segment that can support the active missions, exports continuity metadata, and fails validation if the playable route contains a long hop. Runtime movement uses only adjacent panos inside the same route segment. POI/mission generation is rebuilt against the current scene graph so stale pano IDs cannot silently fall back to unreachable coordinates.

**Tech Stack:** Python generator/validator scripts, static ES modules, Pannellum, Chrome CDP smoke tests.

---

### Task 1: Add segment-aware scene graph generation

**Objective:** Replace far `ROUTE_BRIDGE_MAX_M` route bridges with a hard `MAX_WALK_EDGE_M` split, then export `routeSegment`, `segmentRouteIndex`, and active playable segment metadata.

**Files:**
- Modify: `scripts/build_scenes.py`
- Generated: `public/js/data/comaruga.scenes.generated.js`

**Steps:**
1. Compute consecutive route gaps from manifest order.
2. Split route at gaps above `MAX_WALK_EDGE_M` (60m).
3. Select a playable segment: prefer the segment containing the named mission POI area; otherwise longest segment.
4. Export continuity report: natural threshold, all gaps, segment sizes, playable max edge.
5. Make `--check` fail if playable max edge exceeds threshold.

### Task 2: Fix runtime movement to stay inside the playable segment

**Objective:** Make keyboard/hotspot navigation impossible across disconnected route segments.

**Files:**
- Modify: `public/js/data/comaruga.js`
- Modify: `public/js/core/providers/pano360.js`

**Steps:**
1. Preserve generated `routeSegment`, `segmentRouteIndex`, and `playable` fields in `TOWN.scenes`.
2. Set `TOWN.startScene` to the generated playable start.
3. Update `_routeNeighbor` to only choose adjacent panos in the same route segment, and preferably only playable scenes.
4. Keep local graph links diagnostic-only.

### Task 3: Regenerate POIs against the current graph

**Objective:** Remove stale `nearestPano` IDs and include only POIs whose target pano exists in the active playable segment.

**Files:**
- Modify: `scripts/osm_lookup.py`
- Generated: `public/js/data/comaruga.pois.generated.js`
- Modify: `public/js/data/comaruga.missions.js`

**Steps:**
1. Fix `osm_lookup.py` for the current `build_scenes.load_nodes()` return value.
2. Use `GENERATED.playableSegment` / active nodes when finding nearest panos.
3. Write POIs with pano IDs that exist in generated scenes.
4. Make mission target resolution drop a mission if its pano is not in the generated scene graph instead of falling back to raw coordinates.

### Task 4: Add automated continuity validation

**Objective:** Add a repeatable regression check for route continuity and mission target reachability.

**Files:**
- Create: `scripts/validate_continuity.py`

**Steps:**
1. Parse `public/js/data/comaruga.scenes.generated.js`, `comaruga.pois.generated.js`, and `comaruga.missions.js` mission matches.
2. Assert playable route has zero adjacent hops above threshold.
3. Assert all playable route scenes are one ordered chain.
4. Assert every POI `nearestPano` exists and is playable.
5. Assert required mission matches resolve to POIs with reachable target panos.

### Task 5: Verify end-to-end

**Objective:** Prove the fix by rebuilding generated files and running syntax/smoke checks.

**Commands:**
- `python scripts/build_scenes.py --write --check`
- `python scripts/osm_lookup.py`
- `python scripts/validate_continuity.py`
- `python -m py_compile scripts/build_scenes.py scripts/osm_lookup.py scripts/validate_continuity.py server.py`
- `node --check scripts/smoke.mjs scripts/shot.mjs` (one file at a time if necessary)
- Browser smoke via `server.py` + Chrome CDP if available.

**Expected:** Validation passes with zero long playable hops; mission target IDs are current; browser smoke still advances the HUD with no runtime errors.
