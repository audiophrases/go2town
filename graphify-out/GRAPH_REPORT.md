# Graph Report - .  (2026-06-22)

## Corpus Check
- Corpus is ~19,164 words - fits in a single context window. You may not need a graph.

## Summary
- 255 nodes · 447 edges · 13 communities (7 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.91)
- Token cost: 33,658 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Pannellum 360 Viewer API|Pannellum 360 Viewer API]]
- [[_COMMUNITY_World Providers & Geo Math|World Providers & Geo Math]]
- [[_COMMUNITY_Game Bootstrap, Admin & Mission Data|Game Bootstrap, Admin & Mission Data]]
- [[_COMMUNITY_Google Street View World & AR|Google Street View World & AR]]
- [[_COMMUNITY_Coco Narrator, TTS & Story Content|Coco Narrator, TTS & Story Content]]
- [[_COMMUNITY_Pano360 World Navigation|Pano360 World Navigation]]
- [[_COMMUNITY_HTML UI Shell & Scene Imagery Docs|HTML UI Shell & Scene Imagery Docs]]
- [[_COMMUNITY_Vocabulary Learn Engine|Vocabulary Learn Engine]]
- [[_COMMUNITY_Story Dialogue Engine|Story Dialogue Engine]]
- [[_COMMUNITY_Mission Engine|Mission Engine]]
- [[_COMMUNITY_Comaruga POI Data|Comaruga POI Data]]

## God Nodes (most connected - your core abstractions)
1. `Ba()` - 49 edges
2. `GoogleWorld` - 26 edges
3. `Pano360World` - 25 edges
4. `haversine()` - 12 edges
5. `bearing()` - 12 edges
6. `LearnEngine` - 12 edges
7. `Story` - 12 edges
8. `Speaker` - 10 edges
9. `Coco` - 9 edges
10. `WorldBase` - 9 edges

## Surprising Connections (you probably didn't know these)
- `World Panorama Container` --shares_data_with--> `Google Street View Fixture Cubemaps`  [INFERRED]
  index.html → img/scenes/README.md
- `Admin Bookmark Panel` --implements--> `q23r- Hidden Admin Bookmark Mode`  [INFERRED]
  index.html → img/scenes/README.md
- `installDemoBackdrop()` --calls--> `bearing()`  [EXTRACTED]
  public/js/core/providers/demo.js → public/js/core/geo.js
- `runMissions()` --calls--> `hasSubgame()`  [EXTRACTED]
  public/js/game.js → public/js/core/subgames.js
- `runMissions()` --calls--> `launchSubgame()`  [EXTRACTED]
  public/js/game.js → public/js/core/subgames.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Player Onboarding Flow (gate, name, narrator)** — public_index_start_gate, public_index_name_modal, public_index_coco_narrator [INFERRED 0.85]
- **Panorama Imagery Sourcing Strategy** — scenes_readme_owned_360_photos, scenes_readme_street_view_fixture_cubemaps, scenes_readme_placeholder_panoramas [INFERRED 0.85]

## Communities (13 total, 6 thin omitted)

### Community 1 - "World Providers & Geo Math"
Cohesion: 0.09
Nodes (21): bearing(), destination(), haversine(), toDeg(), toRad(), missions, world, WorldBase (+13 more)

### Community 2 - "Game Bootstrap, Admin & Mission Data"
Cohesion: 0.09
Nodes (22): currentSnapshot(), isAdminName(), mountAdmin(), readAdminBookmarks(), readAdminPortals(), readBookmarks(), rounded(), sceneMeta() (+14 more)

### Community 3 - "Google Street View World & AR"
Cohesion: 0.16
Nodes (4): getPanorama(), GoogleWorld, loadGoogleMaps(), normHeading()

### Community 4 - "Coco Narrator, TTS & Story Content"
Cohesion: 0.13
Nodes (8): learn, Coco, SCRIPT, Speaker, STORY, VOICES, VOCAB, CONFIG

### Community 6 - "HTML UI Shell & Scene Imagery Docs"
Cohesion: 0.12
Nodes (18): Admin Bookmark Panel, Coco Narrator Avatar, Debug Dev Panel and Caption, Game Bootstrap (game.js module), Vocabulary Learn Stars, Icon-Only Mission HUD, Name Entry Modal, Start Gate Audio Unlock (+10 more)

## Knowledge Gaps
- **14 isolated node(s):** `learn`, `CUBE_HEADINGS`, `registry`, `scenes`, `DEFS` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GoogleWorld` connect `Google Street View World & AR` to `World Providers & Geo Math`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `Pano360World` connect `Pano360 World Navigation` to `World Providers & Geo Math`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `LearnEngine` connect `Vocabulary Learn Engine` to `Coco Narrator, TTS & Story Content`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `learn`, `CUBE_HEADINGS`, `registry` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pannellum 360 Viewer API` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `World Providers & Geo Math` be split into smaller, more focused modules?**
  _Cohesion score 0.09358974358974359 - nodes in this community are weakly interconnected._
- **Should `Game Bootstrap, Admin & Mission Data` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._