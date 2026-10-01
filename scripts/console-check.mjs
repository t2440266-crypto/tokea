import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await mkdtemp(join(tmpdir(), 'visitday-console-'));
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4173', '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);

const errors = [];
async function waitUrl(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`never up: ${url}`);
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

try {
  await waitUrl(`http://127.0.0.1:${PORT}/json/version`);
  await waitUrl('http://localhost:4173/');
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('http://localhost:4173/?now=09:42')}`, {
      method: 'PUT',
    })
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
    if (data.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${data.params.exceptionDetails.text}`);
    }
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
      errors.push(`log: ${data.params.entry.text}`);
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      errors.push('console.error');
    }
  });
  await rpc(ws, 'Runtime.enable');
  await rpc(ws, 'Log.enable');
  await rpc(ws, 'Page.enable');
  await sleep(4000);
  const hero = await rpc(ws, 'Runtime.evaluate', {
    expression: "document.querySelector('.hero-title')?.textContent ?? 'NO_HERO'",
    returnByValue: true,
  });
  console.log('hero:', hero.result.value);
  console.log('errors:', errors.length === 0 ? 'none' : errors.join(' | '));
  process.exitCode = errors.length === 0 ? 0 : 1;
} finally {
  chrome.kill();
  preview.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true });
}
