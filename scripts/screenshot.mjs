import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:4173';
const SHOTS = [
  { name: 'today', url: `${BASE}/?now=09:42` },
  { name: 'topics', url: `${BASE}/?view=topics` },
  { name: 'routine', url: `${BASE}/?view=routine` },
  { name: 'week', url: `${BASE}/?view=week` },
  { name: 'settings', url: `${BASE}/?view=settings` },
  { name: 'recap', url: `${BASE}/?view=recap` },
];

const profile = await mkdtemp(join(tmpdir(), 'visitday-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});
async function waitForPreview() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://localhost:4173/');
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('preview never came up');
}
await waitForPreview();
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=375,812',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForChrome() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('chrome devtools never came up');
}

let msgId = 0;
const pending = new Map();

function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function once(ws, method, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === method) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(data.params);
      }
    };
    ws.addEventListener('message', handler);
  });
}

try {
  await waitForChrome();
  for (const shot of SHOTS) {
    const target = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(shot.url)}`, { method: 'PUT' })
    ).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    });
    await rpc(ws, 'Page.enable');
    await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(1800);
    const probe = await rpc(ws, 'Runtime.evaluate', {
      expression: "document.querySelector('.hdr-title')?.textContent + ' | ' + location.search",
    });
    const shotResult = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
    await writeFile(join('evidence', `${shot.name}.png`), Buffer.from(shotResult.data, 'base64'));
    console.log(shot.name, 'ok —', probe.result.value);

    async function tap(expr) {
      const box = await rpc(ws, 'Runtime.evaluate', {
        expression: `(() => { const b = document.querySelector(${JSON.stringify(expr)}).getBoundingClientRect(); return JSON.stringify({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); })()`,
        returnByValue: true,
      });
      const { x, y } = JSON.parse(box.result.value);
      await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }

    if (shot.name === 'today') {
      await tap('.actions .btn');
      await sleep(300);
      const afterStart = await rpc(ws, 'Runtime.evaluate', {
        expression: "[...document.querySelectorAll('.actions .btn')].map((b) => b.textContent).join(',')",
        returnByValue: true,
      });
      console.log('today actions after Start —', afterStart.result.value);
    }
    if (shot.name === 'routine') {
      await tap('.set-dot');
      await sleep(700);
      const restProbe = await rpc(ws, 'Runtime.evaluate', {
        expression: "document.querySelector('.rest.on') ? document.querySelector('[data-rest]')?.textContent : 'NO_REST'",
        returnByValue: true,
      });
      console.log('rest timer after set tap —', restProbe.result.value);
    }
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  }

  // offline proof: first load done, kill server, reload from service-worker cache
  preview.kill();
  await sleep(500);
  const offTarget = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${BASE}/?view=today&now=09:42`)}`, {
      method: 'PUT',
    })
  ).json();
  const offWs = new WebSocket(offTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    offWs.addEventListener('open', resolve, { once: true });
    offWs.addEventListener('error', reject, { once: true });
  });
  offWs.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  });
  await rpc(offWs, 'Page.enable');
  await rpc(offWs, 'Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await sleep(2500);
  await rpc(offWs, 'Page.reload');
  await sleep(2500);
  const offlineProbe = await rpc(offWs, 'Runtime.evaluate', {
    expression:
      "navigator.onLine + '|' + (document.querySelector('.hero') ? document.querySelector('.hero-title')?.textContent : 'NO_HERO') + '|' + (document.querySelector('[data-remaining]')?.textContent ?? 'NO_RING')",
    returnByValue: true,
  });
  const offShot = await rpc(offWs, 'Page.captureScreenshot', { format: 'png' });
  await writeFile(join('evidence', 'offline-today.png'), Buffer.from(offShot.data, 'base64'));
  console.log('offline reload —', offlineProbe.result.value);
  offWs.close();
} finally {
  chrome.kill();
  preview.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
