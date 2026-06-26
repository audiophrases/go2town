// ---------------------------------------------------------------------------
// admin.js — hidden spot-pinning mode.
//
// Enter name "q23r-" to open this panel instead of the learner game. The town
// minimap becomes clickable: click anywhere to drop a pin, choose its type
// (home, school, pizza, …), and save it. Pins are stored in localStorage and
// exported as JSON — they show up as live missions for the player immediately,
// and the JSON gets baked into data/comaruga.spots.js.
//
// A "portal" type is also offered for the older 2D-room idea (rendered as an AR
// gate in the world). Everything else is a map "spot" mission.
// ---------------------------------------------------------------------------

import { minimap } from "./minimap.js";
import { getMissionType } from "./missionTypes.js";

const STORE_KEY = "go2town.admin.bookmarks.v1";
const ADMIN_NAME = "q23r-";

const safeId = (value) =>
  String(value || "spot")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "spot";

function readBookmarks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isPortalBookmark(bookmark) {
  return bookmark && bookmark.subgame !== "none";
}

export function readAdminBookmarks() {
  return readBookmarks();
}

export function readAdminPortals() {
  return readBookmarks().filter(isPortalBookmark);
}

/** Admin-pinned map spots, in the shape the free-roam mission board expects. */
export function readAdminSpots() {
  return readBookmarks()
    .filter((b) => b && b.kind === "spot" && Number.isFinite(b.lat) && Number.isFinite(b.lng))
    .map((b) => ({
      id: b.id,
      type: b.type || "generic",
      label: b.label || b.id,
      icon: b.icon,
      lat: b.lat,
      lng: b.lng,
    }));
}

function writeBookmarks(bookmarks) {
  localStorage.setItem(STORE_KEY, JSON.stringify(bookmarks, null, 2));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function sceneMeta(world) {
  const sceneId = world?._currentScene || null;
  const scene = sceneId && world?.scenes ? world.scenes[sceneId] : null;
  let view = {};
  try {
    if (world?.viewer) {
      view = {
        yaw: Number(world.viewer.getYaw().toFixed(2)),
        pitch: Number(world.viewer.getPitch().toFixed(2)),
        hfov: Number(world.viewer.getHfov().toFixed(2)),
      };
    }
  } catch {
    view = {};
  }
  return {
    sceneId,
    routeIndex: scene?.routeIndex ?? null,
    routeSegment: scene?.routeSegment ?? null,
    segmentRouteIndex: scene?.segmentRouteIndex ?? null,
    playable: scene?.playable ?? null,
    view,
  };
}

function rounded(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function currentSnapshot(world) {
  const meta = sceneMeta(world);
  const position = world?.position || {};
  const lat = rounded(position.lat, 7);
  const lng = rounded(position.lng, 7);
  return {
    lat,
    lng,
    heading: rounded(world?.heading || 0, 1),
    ...meta,
    osmUrl:
      lat != null && lng != null
        ? `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=19/${lat.toFixed(6)}/${lng.toFixed(6)}`
        : "",
  };
}

// A snapshot for a pin dropped on the minimap (lat/lng known, no Street View
// pano under it). Mirrors currentSnapshot's shape so render/export stay uniform.
function pinSnapshot(lat, lng) {
  const rlat = rounded(lat, 7);
  const rlng = rounded(lng, 7);
  return {
    lat: rlat,
    lng: rlng,
    heading: null,
    sceneId: null,
    routeIndex: null,
    routeSegment: null,
    segmentRouteIndex: null,
    playable: null,
    view: {},
    osmUrl:
      rlat != null && rlng != null
        ? `https://www.openstreetmap.org/?mlat=${rlat.toFixed(6)}&mlon=${rlng.toFixed(6)}#map=19/${rlat.toFixed(6)}/${rlng.toFixed(6)}`
        : "",
  };
}

// The spots array, ready to paste into data/comaruga.spots.js.
function spotsExport(bookmarks) {
  return bookmarks
    .filter((b) => b.kind === "spot")
    .map((b) => ({ id: b.id, type: b.type || "generic", label: b.label, icon: b.icon, lat: b.lat, lng: b.lng }));
}

function missionCode(bookmarks) {
  return bookmarks
    .map((b) => {
      const id = safeId(b.id || b.label);
      const icon = b.icon || "📍";
      const subgame = b.subgame === "none" ? null : b.subgame || null;
      return `{
  id: ${JSON.stringify(id)},
  icon: ${JSON.stringify(icon)},
  target: { lat: ${b.lat}, lng: ${b.lng}, sceneId: ${JSON.stringify(b.sceneId)} },
  subgame: ${subgame ? JSON.stringify(subgame) : "null"},
  mission: () => ${JSON.stringify(`Let's go to ${b.label || id}. Follow my arrow!`)},
  arrival: (name) => \`Great! You found ${b.label || id}, ${"${name}"}!\`,
}`;
    })
    .join(",\n");
}

export function isAdminName(name) {
  return String(name || "").trim() === ADMIN_NAME;
}

export function mountAdmin({ panel, status, list, exportBox, labelInput, iconInput, subgameSelect, notesInput, addBtn, copyBtn, downloadBtn, clearBtn }) {
  if (!panel) return { start() {} };

  let worldRef = null;
  let bookmarks = readBookmarks();
  let pendingPin = null; // {lat,lng} dropped on the minimap, waiting to be saved

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  async function copyExport() {
    const text = exportBox?.value || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied export to clipboard");
    } catch {
      exportBox?.focus();
      exportBox?.select();
      setStatus("select + copy the export text");
    }
  }

  function render() {
    writeBookmarks(bookmarks);
    if (list) {
      list.innerHTML = "";
      bookmarks.forEach((b, index) => {
        const row = document.createElement("div");
        row.className = "admin-bookmark-row";
        const kindLabel =
          b.kind === "spot" ? `spot: ${b.type || "generic"}` : `AR portal: ${b.subgame || "future-room"}`;
        row.innerHTML = `
          <div class="admin-bookmark-main">
            <strong>${b.icon || "📍"} ${b.label || b.id}</strong>
            <span>${b.lat}, ${b.lng}</span>
            <em>${kindLabel}</em>
          </div>
          <button class="admin-mini-btn" data-remove="${index}" title="remove pin">×</button>
        `;
        list.appendChild(row);
      });
      list.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          bookmarks.splice(Number(btn.dataset.remove), 1);
          render();
          setStatus("bookmark removed");
        });
      });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      purpose: "go2town admin pins — map spot missions (+ optional 2D-room portals)",
      bookmarks,
      spots: spotsExport(bookmarks),
      missionDraft: missionCode(bookmarks),
    };
    if (exportBox) exportBox.value = JSON.stringify(payload, null, 2);
    if (typeof worldRef?.setPortals === "function") {
      worldRef.setPortals(bookmarks.filter(isPortalBookmark));
    }
  }

  function addBookmark() {
    // Position comes from the minimap pin if one's been dropped; otherwise fall
    // back to wherever the admin is standing in Street View.
    const snap = pendingPin ? pinSnapshot(pendingPin.lat, pendingPin.lng) : currentSnapshot(worldRef);
    if (snap.lat == null || snap.lng == null) {
      setStatus("click the map to drop a pin first");
      return;
    }

    const choice = subgameSelect?.value || "home";
    const isPortal = choice === "portal-room";
    const type = isPortal ? null : choice;
    const typeMeta = type ? getMissionType(type) : null;

    const label = labelInput?.value?.trim() || (type || `spot ${bookmarks.length + 1}`);
    const id = `${safeId(label)}-${String(bookmarks.length + 1).padStart(2, "0")}`;
    const icon = iconInput?.value?.trim() || (isPortal ? "🚪" : typeMeta.icon);
    const bookmark = {
      id,
      label,
      icon,
      type, // mission type for spots; null for portals
      subgame: isPortal ? "future-room" : "none",
      kind: isPortal ? "portal" : "spot",
      notes: notesInput?.value?.trim() || "",
      createdAt: new Date().toISOString(),
      ...snap,
    };
    bookmarks.push(bookmark);
    if (labelInput) labelInput.value = "";
    if (notesInput) notesInput.value = "";
    pendingPin = null;
    minimap.clearPending();
    render();
    setStatus(`${isPortal ? "portal placed" : `pinned ${type}`}: ${bookmark.label}`);
  }

  addBtn?.addEventListener("click", addBookmark);
  copyBtn?.addEventListener("click", copyExport);

  // The minimap tells us where the admin clicked; remember it for the next save.
  window.addEventListener("go2town:minimap-pin", (e) => {
    const d = e.detail || {};
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
    pendingPin = { lat: d.lat, lng: d.lng };
    setStatus(`pin ready: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)} — pick a type and save`);
  });
  downloadBtn?.addEventListener("click", () => {
    downloadJson("go2town-admin-bookmarks.json", JSON.parse(exportBox.value || "{}"));
    setStatus("downloaded bookmarks JSON");
  });
  clearBtn?.addEventListener("click", () => {
    bookmarks = [];
    render();
    setStatus("all bookmarks cleared");
  });

  return {
    start(world) {
      worldRef = world;
      // Re-read on activation so tests/tools can clear or seed localStorage
      // before entering q23r- without stale module-load state coming back.
      bookmarks = readBookmarks();
      panel.classList.remove("hidden");
      document.body.classList.add("admin-mode");
      render();
      setStatus("admin mode: click the map to drop a pin, pick a type, save");
      window.go2townAdmin = {
        addBookmark,
        // Drop a pin programmatically (tools/tests) without clicking the map.
        pinAt: (lat, lng) => {
          pendingPin = { lat, lng };
          setStatus(`pin ready: ${lat}, ${lng}`);
        },
        getBookmarks: () => [...bookmarks],
        export: () => JSON.parse(exportBox?.value || "{}"),
        clear: () => {
          bookmarks = [];
          render();
        },
      };
    },
  };
}
