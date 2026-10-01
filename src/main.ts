import { createApp, minutesNow, todayISO } from './app';
import type { View } from './app';
import { occurrenceAt, promptTimes } from './cycle';
import type { ChainOccurrence } from './cycle';
import { TITLES, isVisitDay } from './schedule';
import type { BlockKind } from './schedule';
import { closeNotify, notifyPrompt, notifyStart, requestNotifyPermission } from './notify';
import { beep, el, fmtHMS, haptic } from './ui/dom';
import { renderMore } from './ui/more';
import { renderRecap } from './ui/recap';
import { renderRoutine } from './ui/routine';
import { renderSettings } from './ui/settings';
import { renderToday, tickToday } from './ui/today';
import { renderTopics } from './ui/topics';
import { renderWeek } from './ui/week';

const TITLES_BY_VIEW: Record<View, string> = {
  today: '',
  topics: 'topics',
  routine: 'routine',
  week: 'week',
  more: 'more',
  recap: 'recap',
  settings: 'settings',
};

const params = new URLSearchParams(window.location.search);
const viewParam = params.get('view');
const nowMatch = /^(\d{1,2}):(\d{2})$/.exec(params.get('now') ?? '');
const nowOverride = nowMatch ? Number(nowMatch[1]) * 60 + Number(nowMatch[2]) : null;
const bootDate = todayISO();
const bootNowMs =
  nowOverride === null
    ? Date.now()
    : new Date(`${bootDate}T00:00:00`).getTime() + nowOverride * 60000;

const ctx = createApp(localStorage, { nowMs: bootNowMs });

if (viewParam && Object.hasOwn(TITLES_BY_VIEW, viewParam)) ctx.state.view = viewParam as View;

function currentNowMs(): number {
  if (nowOverride === null) return Date.now();
  return new Date(`${ctx.state.date}T00:00:00`).getTime() + nowOverride * 60000;
}
if (nowOverride !== null) ctx.state.now = nowOverride;

const header = document.querySelector<HTMLElement>('header.hdr')!;
const viewEl = document.querySelector<HTMLElement>('main.view')!;
const nav = document.querySelector<HTMLElement>('nav.tabs')!;
nav.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.tab;
    if (view) ctx.setView(view as View);
  });
});

const appRoot = document.getElementById('app')!;
const banner = el('div', { class: 'prompt-banner', hidden: true });
appRoot.append(banner);

const notified = new Set<string>();
let lastStartKey: string | null = null;
let promptKey: string | null = null;

function parseKey(key: string): { kind: BlockKind; cycleIndex: number } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  return { cycleIndex: Number(parts[1]), kind: parts[2] as BlockKind };
}

function isResolved(cycleIndex: number, kind: BlockKind): boolean {
  return ctx.todayLogs().some((l) => l.cycleIndex === cycleIndex && l.kind === kind);
}

function clearPrompt(): void {
  if (promptKey) closeNotify(`prompt:${promptKey}`);
  promptKey = null;
  banner.hidden = true;
  banner.innerHTML = '';
}

function renderBanner(occ: ChainOccurrence): void {
  banner.innerHTML = '';
  const card = el('div', { class: 'banner-card' });
  card.append(el('p', { class: 'eyebrow accent', text: 'verify now' }));
  card.append(
    el('p', {
      class: 'banner-title',
      text: `${TITLES[occ.kind]} · until ${new Date(occ.end).getHours()}:${String(new Date(occ.end).getMinutes()).padStart(2, '0')}`,
    }),
  );
  const row = el('div', { class: 'actions' });
  const tick = el('button', { class: 'btn btn-primary', type: 'button', text: 'Tick · done' });
  tick.addEventListener('click', () => {
    haptic();
    if (ctx.state.persisted.settings.sound) beep();
    ctx.markVerified(occ, 'tick');
    clearPrompt();
  });
  const miss = el('button', { class: 'btn', type: 'button', text: 'X · not done' });
  miss.addEventListener('click', () => {
    haptic();
    ctx.markVerified(occ, 'x');
    clearPrompt();
  });
  row.append(tick, miss);
  card.append(row);
  banner.append(card);
  banner.hidden = false;
}

function runtimeTick(): void {
  const nowMs = ctx.state.nowMs;
  const sched = ctx.schedule();
  const cur = occurrenceAt(sched, nowMs);
  const silent = nowOverride !== null;

  if (cur) {
    if (cur.key !== lastStartKey) {
      lastStartKey = cur.key;
      if (!notified.has(cur.key)) {
        notified.add(cur.key);
        if (!silent) notifyStart(cur);
      }
    }
    const resolved = isResolved(cur.cycleIndex, cur.kind);
    const { openAt, closeAt } = promptTimes(cur);

    if (promptKey && promptKey !== cur.key) {
      const prev = parseKey(promptKey);
      if (prev && !isResolved(prev.cycleIndex, prev.kind)) {
        ctx.markVerified(prev, 'x', { auto: true });
      }
      clearPrompt();
    }
    if (!resolved && nowMs >= closeAt) {
      if (promptKey === cur.key) clearPrompt();
      ctx.markVerified(cur, 'x', { auto: true });
    } else if (!resolved && nowMs >= openAt) {
      if (promptKey !== cur.key) {
        promptKey = cur.key;
        if (!silent) notifyPrompt(cur);
        renderBanner(cur);
      }
    } else if (promptKey === cur.key) {
      clearPrompt();
    }
    return;
  }

  if (promptKey) {
    const prev = parseKey(promptKey);
    const occLeft = sched.find((o) => o.key === promptKey);
    if (!prev || !occLeft || occLeft.end <= nowMs) {
      if (prev && !isResolved(prev.cycleIndex, prev.kind)) {
        ctx.markVerified(prev, 'x', { auto: true });
      }
      clearPrompt();
    }
  }
}

if (isVisitDay(ctx.state.persisted.settings, ctx.state.date)) {
  void requestNotifyPermission();
}

navigator.serviceWorker?.addEventListener?.('message', (event: MessageEvent) => {
  const data = event.data as { type?: string; action?: string; key?: string } | null;
  if (!data || data.type !== 'verify' || !data.key || !data.action) return;
  const parsed = parseKey(data.key);
  if (!parsed) return;
  ctx.markVerified(parsed, data.action === 'tick' ? 'tick' : 'x');
  haptic();
  if (ctx.state.persisted.settings.sound) beep();
  clearPrompt();
});

let cleanup: (() => void) | void;
let booted = false;

function render(): void {
  cleanup?.();
  viewEl.innerHTML = '';
  const titleEl = header.querySelector<HTMLElement>('[data-view-title]')!;
  titleEl.textContent = TITLES_BY_VIEW[ctx.state.view];
  viewEl.classList.add('enter');
  switch (ctx.state.view) {
    case 'today':
      renderToday(viewEl, ctx);
      break;
    case 'topics':
      renderTopics(viewEl, ctx);
      break;
    case 'routine':
      cleanup = renderRoutine(viewEl, ctx);
      break;
    case 'week':
      renderWeek(viewEl, ctx);
      break;
    case 'more':
      renderMore(viewEl, ctx);
      break;
    case 'recap':
      renderRecap(viewEl, ctx);
      break;
    case 'settings':
      renderSettings(viewEl, ctx);
      break;
  }
  nav.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === ctx.state.view);
  });
  const clock = header.querySelector<HTMLElement>('[data-clock]')!;
  clock.textContent = fmtHMS();
  if (!booted) {
    booted = true;
    window.requestAnimationFrame(() => viewEl.classList.remove('enter'));
  }
}

ctx.ensureDailyDraw();
ctx.subscribe(render);
render();

window.setInterval(() => {
  if (nowOverride === null) {
    ctx.state.now = minutesNow();
    ctx.state.nowMs = Date.now();
  } else {
    ctx.state.nowMs = currentNowMs();
  }
  const today = todayISO();
  if (today !== ctx.state.date) {
    window.location.reload();
    return;
  }
  const clock = header.querySelector<HTMLElement>('[data-clock]')!;
  clock.textContent =
    nowOverride !== null
      ? `${String(Math.floor(nowOverride / 60)).padStart(2, '0')}:${String(nowOverride % 60).padStart(2, '0')}:00`
      : fmtHMS();
  runtimeTick();
  if (ctx.state.view === 'today') tickToday(ctx);
}, 1000);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell unavailable; app still runs from cache-less network */
    });
  });
}
