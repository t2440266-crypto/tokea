import { createApp, minutesNow, todayISO } from './app';
import type { View } from './app';
import { occurrenceAt, promptTimes } from './cycle';
import type { ChainOccurrence, FineSession } from './cycle';
import { TITLES, isVisitDay } from './schedule';
import type { BlockKind } from './schedule';
import {
  closeNotify,
  notifyFinePrompt,
  notifyPrompt,
  notifySessionStart,
  notifyStart,
  requestNotifyPermission,
} from './notify';
import { beep, el, fmtHMS, haptic } from './ui/dom';
import { renderMore } from './ui/more';
import { renderRecap } from './ui/recap';
import { renderRoutine } from './ui/routine';
import { renderSettings } from './ui/settings';
import { FINE_TAUNT, PAY_CONFIRM_COPY, renderToday, tickToday } from './ui/today';
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
const payOverlay = el('div', { class: 'pay-overlay', hidden: true });
appRoot.append(payOverlay);

const notified = new Set<string>();
let lastStartKey: string | null = null;
let promptKey: string | null = null;
let sessionPromptId: string | null = null;

function parseKey(key: string): { kind: BlockKind; cycleIndex: number } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  return { cycleIndex: Number(parts[1]), kind: parts[2] as BlockKind };
}

function isResolved(cycleIndex: number, kind: BlockKind): boolean {
  return ctx.todayLogs().some((l) => l.cycleIndex === cycleIndex && l.kind === kind);
}

function fmtClockMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function syncBannerVisibility(): void {
  const empty = banner.querySelectorAll('.banner-card').length === 0;
  banner.hidden = empty;
}

function clearChainPrompt(): void {
  if (promptKey) closeNotify(`prompt:${promptKey}`);
  promptKey = null;
  const card = banner.querySelector('.chain-card');
  card?.remove();
  syncBannerVisibility();
}

function renderChainBanner(occ: ChainOccurrence): void {
  banner.querySelector('.chain-card')?.remove();
  const card = el('div', { class: 'banner-card chain-card' });
  card.append(el('p', { class: 'eyebrow accent', text: 'verify now' }));
  card.append(
    el('p', {
      class: 'banner-title',
      text: `${TITLES[occ.kind]} · until ${fmtClockMs(occ.end)}`,
    }),
  );
  const row = el('div', { class: 'actions' });
  const done = el('button', { class: 'btn btn-primary', type: 'button', text: 'Tick · done' });
  done.addEventListener('click', () => {
    haptic();
    if (ctx.state.persisted.settings.sound) beep();
    ctx.markVerified(occ, 'tick');
    clearChainPrompt();
  });
  const miss = el('button', { class: 'btn', type: 'button', text: 'X · not done' });
  miss.addEventListener('click', () => {
    haptic();
    ctx.markVerified(occ, 'x');
    clearChainPrompt();
  });
  row.append(done, miss);
  card.append(row);
  banner.prepend(card);
  syncBannerVisibility();
}

function clearSessionPrompt(): void {
  if (sessionPromptId) closeNotify(`fine-prompt:${sessionPromptId}`);
  sessionPromptId = null;
  banner.querySelector('.session-card')?.remove();
  syncBannerVisibility();
}

function renderSessionBanner(session: FineSession): void {
  banner.querySelector('.session-card')?.remove();
  const card = el('div', { class: 'banner-card session-card' });
  card.append(el('p', { class: 'eyebrow accent', text: 'confirm payment' }));
  card.append(
    el('p', {
      class: 'banner-title',
      text: `${TITLES[session.kind]} · until ${fmtClockMs(session.endsAt)}`,
    }),
  );
  card.append(el('p', { class: 'taunt', text: FINE_TAUNT }));
  const row = el('div', { class: 'actions' });
  const paid = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    text: 'The activity done and Fine Paid',
  });
  paid.addEventListener('click', () => {
    haptic();
    if (ctx.state.persisted.settings.sound) beep();
    ctx.answerSession(session.id, 'paid');
    clearSessionPrompt();
  });
  const notDone = el('button', { class: 'btn', type: 'button', text: 'Not done' });
  notDone.addEventListener('click', () => {
    haptic();
    ctx.answerSession(session.id, 'notdone');
    clearSessionPrompt();
  });
  row.append(paid, notDone);
  card.append(row);
  banner.prepend(card);
  syncBannerVisibility();
}

function syncPayConfirm(): void {
  const ask = ctx.state.payConfirm;
  payOverlay.innerHTML = '';
  if (!ask) {
    payOverlay.hidden = true;
    return;
  }
  const card = el('div', { class: 'banner-card' });
  card.append(el('p', { class: 'eyebrow accent', text: 'fine to pay' }));
  card.append(el('p', { class: 'pay-copy', text: PAY_CONFIRM_COPY }));
  const row = el('div', { class: 'actions' });
  const pay = el('button', {
    class: 'btn btn-primary btn-wide',
    type: 'button',
    text: 'Pay fine and start the time-count',
  });
  pay.addEventListener('click', () => {
    const session = ctx.startFineSession(ask.kind, ask.cycleIndex);
    if (session) {
      haptic();
      notifySessionStart(session);
    }
    ctx.dismissPayFine();
  });
  const cancel = el('button', { class: 'btn btn-ghost btn-wide', type: 'button', text: 'Cancel' });
  cancel.addEventListener('click', () => ctx.dismissPayFine());
  row.append(pay);
  card.append(row);
  card.append(cancel);
  payOverlay.append(card);
  payOverlay.hidden = false;
}

function runtimeTick(): void {
  const engine = ctx.engineDay();
  if (!engine?.on) {
    if (promptKey) clearChainPrompt();
    if (sessionPromptId) clearSessionPrompt();
    return;
  }
  const nowMs = ctx.state.nowMs;
  ctx.expireSessions();

  const session = ctx.activeSession();
  if (!session && sessionPromptId) clearSessionPrompt();
  if (session) {
    const openAt = Math.max(session.startedAt, session.endsAt - 10 * 60000);
    if (nowMs >= session.endsAt) {
      if (sessionPromptId === session.id) clearSessionPrompt();
    } else if (nowMs >= openAt && sessionPromptId !== session.id) {
      sessionPromptId = session.id;
      if (nowOverride === null) notifyFinePrompt(session);
      renderSessionBanner(session);
    }
  }

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
      clearChainPrompt();
    }
    if (!resolved && nowMs >= closeAt) {
      if (promptKey === cur.key) clearChainPrompt();
      ctx.markVerified(cur, 'x', { auto: true });
    } else if (!resolved && nowMs >= openAt) {
      if (promptKey !== cur.key) {
        promptKey = cur.key;
        if (!silent) notifyPrompt(cur);
        renderChainBanner(cur);
      }
    } else if (promptKey === cur.key) {
      clearChainPrompt();
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
      clearChainPrompt();
    }
  }
}

if (isVisitDay(ctx.state.persisted.settings, ctx.state.date) && ctx.engineDay()?.on) {
  void requestNotifyPermission();
}

navigator.serviceWorker?.addEventListener?.('message', (event: MessageEvent) => {
  const data = event.data as { type?: string; action?: string; key?: string } | null;
  if (!data || data.type !== 'verify' || !data.key || !data.action) return;
  if (data.action === 'paid' || data.action === 'notdone') {
    ctx.answerSession(data.key, data.action);
    haptic();
    if (ctx.state.persisted.settings.sound) beep();
    clearSessionPrompt();
    return;
  }
  const parsed = parseKey(data.key);
  if (!parsed) return;
  ctx.markVerified(parsed, data.action === 'tick' ? 'tick' : 'x');
  haptic();
  if (ctx.state.persisted.settings.sound) beep();
  clearChainPrompt();
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
  syncPayConfirm();
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
  const wallMs = nowOverride === null ? Date.now() : currentNowMs();
  ctx.tickClock(wallMs);
  if (nowOverride === null) {
    ctx.state.now = minutesNow();
  } else {
    ctx.state.now = nowOverride;
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
}, 250);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell unavailable; app still runs from cache-less network */
    });
  });
}
