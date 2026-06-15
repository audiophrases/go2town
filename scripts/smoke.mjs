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
    fwdHotspots: document.querySelectorAll('.go2-hs-fwd').length,
  })`);

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

  // 5) hold ↑ to drive forward — progress bar should advance over several hops
  const fillBefore = await evalJs(`document.getElementById('hud-fill').style.width`);
  await evalJs(`(()=>{ if(document.activeElement) document.activeElement.blur();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp'})); return true })()`, true);
  await sleep(3000); // several driving hops
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

  const pageErrs = await evalJs(`JSON.stringify(window.__errs||[])`);
  // Ignore the harmless missing-favicon 404.
  const realErrors = errors.filter((e) => !/favicon\.ico/.test(e));
  console.log("pageErrs  :", pageErrs);
  console.log("afterStart:", afterStart);
  console.log("afterName :", afterName);
  console.log("nav step  :", nav, "walked:", walked);
  console.log("errors    :", realErrors.length ? realErrors : "none");
  console.log("warnings  :", warnings.filter((w) => !/favicon/.test(w)).slice(0, 8));

  ws.close();
  const a = JSON.parse(afterStart);
  const b = JSON.parse(afterName);
  // Hard pass: the 360 world renders with no errors. HUD is reported too.
  const ok =
    realErrors.length === 0 &&
    a.startGateHidden &&
    a.pannellum &&
    a.worldCanvas &&
    a.hotspots > 0 &&
    b.hudActive &&
    walked;
  console.log("HUD active:", b.hudActive);
  console.log(ok ? "SMOKE: PASS ✅" : "SMOKE: FAIL ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke error:", e);
  process.exit(2);
});
