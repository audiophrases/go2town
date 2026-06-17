// ---------------------------------------------------------------------------
// admin.js — hidden route-bookmarking mode.
//
// Enter name "q23r-" to open this panel instead of the learner mission flow.
// Bookmarks are stored in localStorage and exported as JSON for implementation
// into future mission destinations and 2D mini subgame rooms.
// ---------------------------------------------------------------------------

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
        row.innerHTML = `
          <div class="admin-bookmark-main">
            <strong>${b.icon || "📍"} ${b.label || b.id}</strong>
            <span>${b.sceneId || "no-scene"} · ${b.lat}, ${b.lng}</span>
            <em>${b.subgame === "none" ? "mission only" : `AR portal: ${b.subgame || "future-room"}`}</em>
          </div>
          <button class="admin-mini-btn" data-remove="${index}" title="remove bookmark">×</button>
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
      purpose: "go2town admin bookmarks for future mission destinations and 2D mini subgame rooms",
      bookmarks,
      missionDraft: missionCode(bookmarks),
    };
    if (exportBox) exportBox.value = JSON.stringify(payload, null, 2);
    if (typeof worldRef?.setPortals === "function") {
      worldRef.setPortals(bookmarks.filter(isPortalBookmark));
    }
  }

  function addBookmark() {
    const snap = currentSnapshot(worldRef);
    if (snap.lat == null || snap.lng == null) {
      setStatus("world position is not ready yet");
      return;
    }
    const label = labelInput?.value?.trim() || `spot ${bookmarks.length + 1}`;
    const id = `${safeId(label)}-${String(bookmarks.length + 1).padStart(2, "0")}`;
    const bookmark = {
      id,
      label,
      icon: iconInput?.value?.trim() || "📍",
      subgame: subgameSelect?.value || "future-room",
      kind: (subgameSelect?.value || "future-room") === "none" ? "bookmark" : "portal",
      notes: notesInput?.value?.trim() || "",
      createdAt: new Date().toISOString(),
      ...snap,
    };
    bookmarks.push(bookmark);
    if (labelInput) labelInput.value = "";
    if (notesInput) notesInput.value = "";
    render();
    setStatus(`${isPortalBookmark(bookmark) ? "portal placed" : "bookmarked"}: ${bookmark.label}`);
  }

  addBtn?.addEventListener("click", addBookmark);
  copyBtn?.addEventListener("click", copyExport);
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
      setStatus("admin mode: walk to a spot, label it, then bookmark it");
      window.go2townAdmin = {
        addBookmark,
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
