// Headless smoke test: drives the real game in Chrome via CDP (no deps).
// Usage: node scripts/smoke.mjs <baseUrl> <cdpPort>
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv[2] || "http://127.0.0.1:8082/";
const PORT = process.argv[3] || "9222";
const CDP = `http://127.0.0.1:${PORT}`;

const errors = [];
const warnings = [];

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* chrome not up yet */
    }
    await sleep(250);
  }
  throw new Error("No CDP page target found");
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => pending.set(id, res));
}

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
    if (m.method === "Runtime.exceptionThrown") {
      const e = m.params.exceptionDetails;
      errors.push(e.exception?.description || e.text || "exception");
    }
    if (m.method === "Runtime.consoleAPICalled") {
      const txt = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (m.params.type === "error") errors.push(txt);
      else if (m.params.type === "warning") warnings.push(txt);
    }
    if (m.method === "Log.entryAdded") {
      const e = m.params.entry;
      const line = `[${e.source}/${e.level}] ${e.text}${e.url ? " @ " + e.url : ""}`;
      if (e.level === "error") errors.push(line);
      else warnings.push(line);
    }
  };

  await send(ws, "Runtime.enable");
  await send(ws, "Log.enable");
  await send(ws, "Page.enable");
  await send(ws, "Page.navigate", { url: BASE });
  await sleep(3500); // load modules + vendored pannellum

  const evalJs = (expression, userGesture = false) =>
    send(ws, "Runtime.evaluate", {
      expression,
      returnByValue: true,
      userGesture,
      awaitPromise: true,
    }).then((r) => r?.result?.value);

  await evalJs(`(()=>{
    window.__errs=[];
    addEventListener('error', e => window.__errs.push('err: '+(e.message||e.error)));
    addEventListener('unhandledrejection', e => window.__errs.push('rej: '+((e.reason&&e.reason.stack)||e.reason)));
    return true;
  })()`);

  const preStart = await evalJs(`JSON.stringify({
    startBtn: !!document.getElementById('start-btn'),
    gameTitle: document.querySelector('.game-title')?.textContent.trim() || '',
    editionTitle: document.querySelector('.edition-title')?.textContent.trim() || '',
    gameModuleTag: document.querySelectorAll('script[type=module]').length,
    devPanelHidden: document.getElementById('dev-panel').classList.contains('hidden'),
    readyState: document.readyState,
  })`);
  console.log("preStart  :", preStart);

  // Poll an expression until it returns truthy (or timeout). Returns the value.
  const pollUntil = async (expr, timeoutMs, stepMs = 400) => {
    const t0 = Date.now();
    let v;
    do {
      v = await evalJs(expr);
      if (v) return v;
      await sleep(stepMs);
    } while (Date.now() - t0 < timeoutMs);
    return v;
  };

  // 1) press start (trusted gesture so audio unlock + init run)
  await evalJs(`document.getElementById('start-btn').click(); true`, true);

  // 2) wait for the 360 world + walking hotspots to render
  await pollUntil(`document.querySelectorAll('.go2-hs').length`, 15000);
  const afterStart = await evalJs(`JSON.stringify({
    startGateHidden: document.getElementById('start-gate').classList.contains('hidden'),
    pannellum: !!window.pannellum,
    worldCanvas: !!document.querySelector('#world canvas'),
    worldIsPnlm: document.getElementById('world').classList.contains('pnlm-container'),
    hotspots: document.querySelectorAll('.go2-hs').length,
    stepHotspots: document.querySelectorAll('.go2-hs-step').length,
    legacyArrowHotspots: document.querySelectorAll('.go2-hs-next,.go2-hs-prev,.go2-hs-fwd,.go2-hs-back').length,
    walkButtonRemoved: !document.getElementById('walk-btn'),
    osmMap: !!document.getElementById('osm-map'),
    osmFrameSrc: document.getElementById('osm-frame')?.src || '',
    osmOpenHref: document.getElementById('osm-open')?.href || '',
    osmDropLayer: !!document.getElementById('osm-drop-layer'),
    osmDropStatus: document.getElementById('osm-drop-status')?.textContent || '',
    osmCollapsed: document.getElementById('osm-map')?.classList.contains('collapsed'),
  })`);

  const osmUi = await evalJs(`(()=>{
    const map=document.getElementById('osm-map');
    document.getElementById('osm-expand').click();
    const expanded=map.classList.contains('expanded');
    document.getElementById('osm-toggle').click();
    const collapsed=map.classList.contains('collapsed');
    document.getElementById('osm-toggle').click();
    const restored=!map.classList.contains('collapsed');
    return JSON.stringify({expanded, collapsed, restored});
  })()`);

  const osmDrop = await evalJs(`(async()=>{
    const { world } = await import('./js/core/world.js');
    const mapApi = document.getElementById('osm-map').__go2townOsmMap;
    const layer = document.getElementById('osm-drop-layer');
    const before = world._currentScene;
    const next = world._routeNeighbor(before, 1);
    if (!mapApi || !layer || !next) return JSON.stringify({ok:false, reason:'missing-map-or-next', before, next});
    const target = world.scenes[next];
    const pt = mapApi._debugPointFor(target);
    const rect = layer.getBoundingClientRect();
    layer.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + pt.x,
      clientY: rect.top + pt.y,
    }));
    await new Promise(r => setTimeout(r, 900));
    const after = world._currentScene;
    const status = document.getElementById('osm-drop-status')?.textContent || '';
    return JSON.stringify({
      ok: after === next && /jumped to pano/.test(status),
      before,
      target: next,
      after,
      status,
      pointInLayer: pt.x >= 0 && pt.x <= rect.width && pt.y >= 0 && pt.y <= rect.height,
    });
  })()`);
  const osmDropObj = JSON.parse(osmDrop);

  // 3) wait for the greeting to open the name modal, then submit a name
  await pollUntil(
    `!document.getElementById('name-modal').classList.contains('hidden')`,
    20000
  );
  await evalJs(`(()=>{
    const i=document.getElementById('name-input'); i.value='Maria';
    document.getElementById('name-form').requestSubmit();
    return true;
  })()`, true);

  // 4) HUD activates after welcome + mission lines finish playing
  await pollUntil(`document.getElementById('hud').classList.contains('active')`, 25000);
  const afterName = await evalJs(`JSON.stringify({
    hudActive: document.getElementById('hud').classList.contains('active'),
    hudIcon: document.getElementById('hud-icon').textContent,
    nameModalHidden: document.getElementById('name-modal').classList.contains('hidden'),
  })`);

  // 5) Directional movement should obey the camera, not a fixed route marker.
  // First step away from the start so both previous and next neighbours exist.
  const fillBefore = await evalJs(`document.getElementById('hud-fill').style.width`);
  await evalJs(`(()=>{ if(document.activeElement) document.activeElement.blur();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp'})); return true })()`, true);
  await sleep(1200);
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp'})); true`);
  await sleep(500);

  const directional = await evalJs(`(async()=>{
    const { world } = await import('./js/core/world.js');
    const opts = world._routeOptions(world._currentScene);
    const prev = opts.find(o => o.routeDir < 0);
    const next = opts.find(o => o.routeDir > 0);
    const yawFor = (heading) => ((heading - (world._currentNorthOffset || 0) + 540) % 360) - 180;
    if (!prev || !next) return JSON.stringify({ok:false, reason:'need-middle-scene', scene:world._currentScene, opts});
    world.viewer.setYaw(yawFor(prev.heading), false);
    await new Promise(r => requestAnimationFrame(r));
    const wTowardPrev = world._routeNeighborForView(world._currentScene, 1);
    const sAwayFromPrev = world._routeNeighborForView(world._currentScene, -1);
    world.viewer.setYaw(yawFor(next.heading), false);
    await new Promise(r => requestAnimationFrame(r));
    const wTowardNext = world._routeNeighborForView(world._currentScene, 1);
    return JSON.stringify({
      ok: wTowardPrev === prev.sceneId && sAwayFromPrev === next.sceneId && wTowardNext === next.sceneId,
      scene: world._currentScene,
      prev: prev.sceneId,
      next: next.sceneId,
      wTowardPrev,
      sAwayFromPrev,
      wTowardNext,
    });
  })()`);
  const dirObj = JSON.parse(directional);

  // Continue holding ↑ while facing the next pano — progress bar should advance.
  await evalJs(`(()=>{ if(document.activeElement) document.activeElement.blur();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp'})); return true })()`, true);
  await sleep(2200); // several driving hops
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp'})); true`);
  await sleep(500);
  const nav = await evalJs(`JSON.stringify({
    fillBefore: ${JSON.stringify(fillBefore || "0%")},
    fillAfter: document.getElementById('hud-fill').style.width,
    hotspots: document.querySelectorAll('.go2-hs').length,
  })`);
  const navObj = JSON.parse(nav);
  const walked =
    parseFloat(navObj.fillAfter) > parseFloat(navObj.fillBefore) && navObj.hotspots > 0;

  // 6) Hidden admin route-bookmarking session: name q23r- opens the admin panel
  // instead of the learner mission loop, and can save/export current pano spots.
  await send(ws, "Page.navigate", { url: BASE });
  await sleep(3500);
  await evalJs(`(()=>{
    localStorage.removeItem('go2town.name');
    localStorage.removeItem('go2town.admin.bookmarks.v1');
    window.__errs=[];
    addEventListener('error', e => window.__errs.push('err: '+(e.message||e.error)));
    addEventListener('unhandledrejection', e => window.__errs.push('rej: '+((e.reason&&e.reason.stack)||e.reason)));
    return true;
  })()`);
  await evalJs(`document.getElementById('start-btn').click(); true`, true);
  await pollUntil(`document.querySelectorAll('.go2-hs').length`, 15000);
  await pollUntil(`!document.getElementById('name-modal').classList.contains('hidden')`, 20000);
  const adminFlow = await evalJs(`(()=>{
    const name=document.getElementById('name-input');
    name.value='q23r-';
    document.getElementById('name-form').requestSubmit();
    const label=document.getElementById('admin-label'); label.value='test ice cream corner';
    document.getElementById('admin-icon').value='🍦';
    document.getElementById('admin-subgame').value='iceCream';
    document.getElementById('admin-notes').value='admin smoke test spot';
    document.getElementById('admin-add').click();
    const exportObj=JSON.parse(document.getElementById('admin-export').value);
    const first=exportObj.bookmarks[0] || {};
    return JSON.stringify({
      adminVisible: !document.getElementById('admin-panel').classList.contains('hidden'),
      adminMode: document.body.classList.contains('admin-mode'),
      hudHidden: getComputedStyle(document.getElementById('hud')).display === 'none',
      nameModalHidden: document.getElementById('name-modal').classList.contains('hidden'),
      bookmarkCount: exportObj.bookmarks.length,
      hasMissionDraft: /test ice cream corner/.test(exportObj.missionDraft || ''),
      firstHasScene: !!first.sceneId,
      firstHasLatLng: Number.isFinite(first.lat) && Number.isFinite(first.lng),
      firstSubgame: first.subgame,
      firstKind: first.kind,
      portalHotspots: document.querySelectorAll('.go2-portal').length,
      portalLabel: document.querySelector('.go2-portal-label')?.textContent || '',
      storedCount: JSON.parse(localStorage.getItem('go2town.admin.bookmarks.v1') || '[]').length,
    });
  })()`, true);
  const adminObj = JSON.parse(adminFlow);

  const pageErrs = await evalJs(`JSON.stringify(window.__errs||[])`);
  // Ignore the harmless missing-favicon 404.
  const realErrors = errors.filter((e) => !/favicon\.ico/.test(e));
  console.log("pageErrs  :", pageErrs);
  console.log("afterStart:", afterStart);
  console.log("osm ui    :", osmUi);
  console.log("osm drop  :", osmDrop);
  console.log("afterName :", afterName);
  console.log("direction :", directional);
  console.log("nav step  :", nav, "walked:", walked);
  console.log("admin    :", adminFlow);
  console.log("errors    :", realErrors.length ? realErrors : "none");
  console.log("warnings  :", warnings.filter((w) => !/favicon/.test(w)).slice(0, 8));

  ws.close();
  const p = JSON.parse(preStart);
  const a = JSON.parse(afterStart);
  const osm = JSON.parse(osmUi);
  const b = JSON.parse(afterName);
  // Hard pass: the 360 world renders with no errors. HUD is reported too.
  const ok =
    realErrors.length === 0 &&
    p.gameTitle === "Go2Town" &&
    p.editionTitle === "Coma-ruga edition" &&
    a.startGateHidden &&
    a.pannellum &&
    a.worldCanvas &&
    a.hotspots > 0 &&
    a.stepHotspots > 0 &&
    a.legacyArrowHotspots === 0 &&
    a.walkButtonRemoved &&
    a.osmMap &&
    /openstreetmap\.org\/export\/embed/.test(a.osmFrameSrc) &&
    /openstreetmap\.org/.test(a.osmOpenHref) &&
    a.osmCollapsed === false &&
    osm.expanded &&
    osm.collapsed &&
    osm.restored &&
    osmDropObj.ok &&
    osmDropObj.pointInLayer &&
    b.hudActive &&
    dirObj.ok &&
    walked &&
    adminObj.adminVisible &&
    adminObj.adminMode &&
    adminObj.hudHidden &&
    adminObj.nameModalHidden &&
    adminObj.bookmarkCount === 1 &&
    adminObj.storedCount === 1 &&
    adminObj.hasMissionDraft &&
    adminObj.firstHasScene &&
    adminObj.firstHasLatLng &&
    adminObj.firstSubgame === "iceCream" &&
    adminObj.firstKind === "portal" &&
    adminObj.portalHotspots >= 1 &&
    adminObj.portalLabel === "test ice cream corner";
  console.log("HUD active:", b.hudActive);
  console.log(ok ? "SMOKE: PASS ✅" : "SMOKE: FAIL ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke error:", e);
  process.exit(2);
});
