// Live Google Street View smoke test via Chrome DevTools Protocol.
// Usage: node scripts/smoke_live_google.mjs <baseUrl> <cdpPort>
// Does not print or require the Google Maps API key; it only checks that the
// local /api/maps-config endpoint supplies one and that the browser reaches the
// live Google provider instead of legacy fixtures.
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8082/';
const PORT = process.argv[3] || '9222';
const CDP = `http://127.0.0.1:${PORT}`;
const errors = [];
const warnings = [];

async function getPageTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`${CDP}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Chrome not ready yet.
    }
    await sleep(250);
  }
  throw new Error('No CDP page target found');
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function main() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const e = m.params.exceptionDetails;
      errors.push(e.exception?.description || e.text || 'exception');
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (m.params.type === 'error') errors.push(txt);
      else if (m.params.type === 'warning') warnings.push(txt);
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      const line = `[${e.source}/${e.level}] ${e.text}${e.url ? ' @ ' + e.url : ''}`;
      if (e.level === 'error') errors.push(line);
      else warnings.push(line);
    }
  };

  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Page.navigate', { url: BASE });
  await sleep(1800);

  const evalJs = (expression, userGesture = false) =>
    send(ws, 'Runtime.evaluate', {
      expression,
      returnByValue: true,
      userGesture,
      awaitPromise: true,
    }).then((r) => r?.result?.value);

  const configState = JSON.parse(await evalJs(`(async()=>{
    const r = await fetch('/api/maps-config', { cache: 'no-store' });
    const cfg = await r.json();
    return JSON.stringify({ ok:r.ok, hasKey:!!cfg.googleMapsApiKey, keyLen:String(cfg.googleMapsApiKey||'').length, source:cfg.source });
  })()`));
  if (!configState.ok || !configState.hasKey) throw new Error(`missing runtime maps key: ${JSON.stringify(configState)}`);

  await evalJs(`document.getElementById('start-btn').click(); true`, true);

  async function poll(expr, timeoutMs = 35000, stepMs = 500) {
    const t0 = Date.now();
    let value;
    do {
      value = await evalJs(expr);
      if (value) return value;
      await sleep(stepMs);
    } while (Date.now() - t0 < timeoutMs);
    return value;
  }

  await poll(`document.querySelector('.go2-ar-layer') && window.google?.maps?.StreetViewPanorama`, 45000);
  const state = JSON.parse(await evalJs(`(async()=>{
    const { world } = await import('./js/core/world.js');
    const positionReady = Number.isFinite(world.position?.lat) && Number.isFinite(world.position?.lng);
    const links = world.panorama?.getLinks?.() || [];
    world.setGoal?.({ lat: (world.position?.lat || 41.18) + 0.001, lng: (world.position?.lng || 1.52) + 0.001, icon: '🍦' });
    await new Promise(r => setTimeout(r, 200));
    world.setPortals?.([{ id:'smoke-live-portal', label:'smoke portal', icon:'🚪', subgame:'future-room', lat:world.position.lat, lng:world.position.lng }]);
    await new Promise(r => setTimeout(r, 200));
    return JSON.stringify({
      mode: world.mode,
      hasPanorama: !!world.panorama,
      positionReady,
      arLayer: !!document.querySelector('.go2-ar-layer'),
      arTarget: !!document.querySelector('.go2-ar-target:not(.hidden)'),
      arTargetMeters: document.querySelector('.go2-ar-target')?.dataset.meters || '',
      arPortal: !!document.querySelector('.go2-ar-portal'),
      links: links.length,
      googleLoaded: !!window.google?.maps?.StreetViewPanorama,
      demoFallback: !!document.querySelector('.demo-world'),
    });
  })()`));

  const realErrors = errors.filter((e) => !/favicon\.ico/.test(e));
  console.log('mapsConfig:', { ...configState, keyLen: configState.keyLen });
  console.log('liveState :', state);
  console.log('warnings  :', warnings.filter((w) => !/favicon/.test(w)).slice(0, 8));
  console.log('errors    :', realErrors.length ? realErrors : 'none');
  ws.close();

  if (realErrors.length) throw new Error(`browser errors: ${realErrors.join(' | ')}`);
  if (state.mode !== 'google' || !state.hasPanorama || !state.positionReady || !state.arLayer || !state.arTarget || !state.arPortal || !state.googleLoaded || state.demoFallback) {
    throw new Error(`live Google smoke failed: ${JSON.stringify(state)}`);
  }
  console.log('live-google browser smoke ok');
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
