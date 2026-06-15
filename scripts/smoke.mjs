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

  const preStart = await evalJs(`JSON.stringify({
    startBtn: !!document.getElementById('start-btn'),
    gameModuleTag: document.querySelectorAll('script[type=module]').length,
  })`);
  console.log("preStart  :", preStart);

  // 1) press start (trusted gesture so audio unlock + init run)
  await evalJs(`document.getElementById('start-btn').click(); true`, true);
  await sleep(2000);
  const mid = await evalJs(`JSON.stringify({
    startGateHidden: document.getElementById('start-gate').classList.contains('hidden'),
    pannellumScript: document.querySelectorAll('script[src*=pannellum]').length,
    windowPannellum: !!window.pannellum,
    worldHTML: document.getElementById('world').className + '|' + document.getElementById('world').innerHTML.slice(0,80),
  })`);
  console.log("mid       :", mid);
  await sleep(3500); // pannellum builds scenes / placeholder panos

  const afterStart = await evalJs(`JSON.stringify({
    pannellum: !!window.pannellum,
    worldCanvas: !!document.querySelector('#world canvas'),
    pnlmContainer: !!document.querySelector('#world .pnlm-container'),
    hotspots: document.querySelectorAll('.pnlm-hotspot.go2-hs').length,
    nameModalOpen: !document.getElementById('name-modal').classList.contains('hidden'),
  })`);

  // 2) enter a name and submit
  await evalJs(`(()=>{
    const i=document.getElementById('name-input'); i.value='Maria';
    document.getElementById('name-form').requestSubmit();
    return true;
  })()`, true);
  await sleep(2500);

  const afterName = await evalJs(`JSON.stringify({
    hudActive: document.getElementById('hud').classList.contains('active'),
    hudIcon: document.getElementById('hud-icon').textContent,
    nameModalHidden: document.getElementById('name-modal').classList.contains('hidden'),
  })`);

  console.log("afterStart:", afterStart);
  console.log("afterName :", afterName);
  console.log("errors    :", errors.length ? errors : "none");
  console.log(
    "warnings  :",
    warnings.filter((w) => !/tts|play\(\)/i.test(w)).slice(0, 8)
  );

  ws.close();
  // Non-zero exit if anything threw or core UI didn't come up.
  const a = JSON.parse(afterStart);
  const b = JSON.parse(afterName);
  const ok =
    errors.length === 0 &&
    a.pannellum &&
    a.worldCanvas &&
    a.hotspots > 0 &&
    b.hudActive;
  console.log(ok ? "SMOKE: PASS ✅" : "SMOKE: FAIL ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke error:", e);
  process.exit(2);
});
