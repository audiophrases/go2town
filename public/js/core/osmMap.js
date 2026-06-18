// ---------------------------------------------------------------------------
// osmMap.js — small interactive OpenStreetMap corner map.
//
// This deliberately does NOT render our generated POI list. The map view is the
// OpenStreetMap export itself, so shop/place labels come from OSM's live map
// data instead of project-side guessed POIs. A transparent click layer converts
// a tap/click into lat/lng, then snaps the player to the nearest playable pano.
// ---------------------------------------------------------------------------

import { CONFIG } from "../config.js";

const DEFAULT_CENTER = { lat: 41.1810, lng: 1.5260, heading: 0 };
const EARTH_R = 6378137;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const clampLat = (lat) => Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));

function mercY(lat) {
  const r = toRad(clampLat(lat));
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

function unMercY(y) {
  return toDeg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function boundsFor(pos, expanded) {
  const lat = Number(pos?.lat ?? DEFAULT_CENTER.lat);
  const lng = Number(pos?.lng ?? DEFAULT_CENTER.lng);
  // OSM export iframe uses bbox, not zoom. These spans keep the player marker
  // centered while leaving enough context to read nearby OSM place labels.
  const halfLat = expanded ? 0.006 : 0.0022;
  const halfLng = expanded ? 0.008 : 0.0032;
  return {
    south: lat - halfLat,
    north: lat + halfLat,
    west: lng - halfLng,
    east: lng + halfLng,
  };
}

function mapUrl(pos, expanded) {
  const lat = Number(pos?.lat ?? DEFAULT_CENTER.lat);
  const lng = Number(pos?.lng ?? DEFAULT_CENTER.lng);
  const b = boundsFor(pos, expanded);
  const bbox = [b.west, b.south, b.east, b.north]
    .map((n) => n.toFixed(6))
    .join("%2C");
  const marker = `${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

function openUrl(pos) {
  const lat = Number(pos?.lat ?? DEFAULT_CENTER.lat).toFixed(6);
  const lng = Number(pos?.lng ?? DEFAULT_CENTER.lng).toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

function pointToLatLng(x, y, rect, bounds) {
  const xRatio = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
  const yRatio = Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
  const lng = bounds.west + (bounds.east - bounds.west) * xRatio;
  const northY = mercY(bounds.north);
  const southY = mercY(bounds.south);
  const lat = unMercY(northY + (southY - northY) * yRatio);
  return { lat, lng };
}

function latLngToPoint(pos, rect, bounds) {
  const xRatio = (pos.lng - bounds.west) / (bounds.east - bounds.west || 1);
  const northY = mercY(bounds.north);
  const southY = mercY(bounds.south);
  const yRatio = (mercY(pos.lat) - northY) / (southY - northY || 1);
  return {
    x: Math.max(0, Math.min(rect.width, xRatio * rect.width)),
    y: Math.max(0, Math.min(rect.height, yRatio * rect.height)),
  };
}

export function mountOsmMap({ shell, frame, marker, dropLayer, status, toggleBtn, expandBtn, openLink }) {
  if (!shell || !frame || !marker || !toggleBtn || !expandBtn || !openLink) {
    return { attach() {} };
  }

  const cfg = CONFIG.osmMap || {};
  let collapsed = !!cfg.collapsed;
  let expanded = !!cfg.expanded;
  let latest = DEFAULT_CENTER;
  let rendered = null;
  let renderedExpanded = expanded;
  let renderedBounds = boundsFor(DEFAULT_CENTER, expanded);
  let renderTimer = null;
  let worldRef = null;
  let flashTimer = null;

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function applyChrome() {
    shell.classList.toggle("collapsed", collapsed);
    shell.classList.toggle("expanded", expanded && !collapsed);
    toggleBtn.textContent = collapsed ? "🗺️" : "–";
    toggleBtn.title = collapsed ? "show OpenStreetMap" : "hide OpenStreetMap";
    expandBtn.textContent = expanded ? "↘" : "⛶";
    expandBtn.title = expanded ? "shrink map" : "expand map";
  }

  function render(force = false) {
    if (collapsed || !latest) return;
    const minMeters = cfg.updateMinMeters ?? 12;
    const moved = distanceMeters(rendered, latest) >= minMeters;
    const sizeChanged = renderedExpanded !== expanded;
    if (!force && !moved && !sizeChanged) return;
    rendered = { ...latest };
    renderedExpanded = expanded;
    renderedBounds = boundsFor(latest, expanded);
    frame.src = mapUrl(latest, expanded);
    openLink.href = openUrl(latest);
  }

  function scheduleRender(force = false) {
    if (collapsed) return;
    if (force) {
      clearTimeout(renderTimer);
      renderTimer = null;
      render(true);
      return;
    }
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render(false);
    }, cfg.updateMinMs ?? 1000);
  }

  function updateMarkerHeading() {
    const heading = Number(latest?.heading || 0);
    marker.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
  }

  function flashDrop() {
    shell.classList.remove("osm-dropped");
    // Force style recalc so repeated clicks replay the animation.
    void shell.offsetWidth;
    shell.classList.add("osm-dropped");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => shell.classList.remove("osm-dropped"), 700);
  }

  async function dropAt(pos) {
    if (!worldRef || typeof worldRef.jumpToNearest !== "function") {
      setStatus("map drop needs pano world");
      return null;
    }
    setStatus("finding nearest pano…");
    const jumped = await Promise.resolve(worldRef.jumpToNearest(pos, { playableOnly: true }));
    if (!jumped) {
      setStatus("no nearby pano found");
      return null;
    }
    latest = { lat: jumped.lat, lng: jumped.lng, heading: jumped.heading ?? latest.heading ?? 0 };
    updateMarkerHeading();
    scheduleRender(true);
    flashDrop();
    const meters = Number.isFinite(jumped.distance) ? ` · ${Math.round(jumped.distance)} m` : "";
    setStatus(`jumped to pano${meters}`);
    return jumped;
  }

  function handleDropClick(e) {
    if (collapsed || !dropLayer) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = dropLayer.getBoundingClientRect();
    const hasPointer = Number.isFinite(e.clientX) && Number.isFinite(e.clientY) && (e.clientX || e.clientY);
    const x = hasPointer ? e.clientX - rect.left : rect.width / 2;
    const y = hasPointer ? e.clientY - rect.top : rect.height / 2;
    dropLayer.style.setProperty("--tap-x", `${Math.max(0, Math.min(rect.width, x))}px`);
    dropLayer.style.setProperty("--tap-y", `${Math.max(0, Math.min(rect.height, y))}px`);
    const pos = pointToLatLng(x, y, rect, renderedBounds);
    void dropAt(pos);
  }

  toggleBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    applyChrome();
    if (!collapsed) scheduleRender(true);
  });

  expandBtn.addEventListener("click", () => {
    expanded = !expanded;
    applyChrome();
    scheduleRender(true);
  });

  dropLayer?.addEventListener("click", handleDropClick);

  applyChrome();
  if (!collapsed) render(true);

  const api = {
    attach(world) {
      if (!world) return;
      worldRef = world;
      if (world.position) {
        latest = { ...world.position, heading: world.heading || 0 };
        updateMarkerHeading();
        scheduleRender(true);
      }
      world.onMove((pos) => {
        latest = pos;
        updateMarkerHeading();
        scheduleRender(false);
      });
    },
    dropAt,
    _debugPointFor(pos) {
      const rect = dropLayer?.getBoundingClientRect?.() || { width: 1, height: 1 };
      return latLngToPoint(pos, rect, renderedBounds);
    },
    _debugLatest() {
      return { latest, rendered, renderedBounds, collapsed, expanded };
    },
  };

  shell.__go2townOsmMap = api;
  setStatus("tap map: jump to pano");
  return api;
}
