import { createApp, minutesNow, todayISO } from './app';
import type { View } from './app';
import { fmtHMS } from './ui/dom';
import { renderMore } from './ui/more';
import { renderRecap } from './ui/recap';
import { renderRoutine } from './ui/routine';
import { renderSettings } from './ui/settings';
import { renderToday, tickToday } from './ui/today';
import { renderTopics } from './ui/topics';
import { renderWeek } from './ui/week';

const TITLES: Record<View, string> = {
  today: '',
  topics: 'topics',
  routine: 'routine',
  week: 'week',
  more: 'more',
  recap: 'recap',
  settings: 'settings',
};

const ctx = createApp(localStorage);

const params = new URLSearchParams(window.location.search);
const viewParam = params.get('view');
if (viewParam && Object.hasOwn(TITLES, viewParam)) ctx.state.view = viewParam as View;
const nowMatch = /^(\d{1,2}):(\d{2})$/.exec(params.get('now') ?? '');
const nowOverride = nowMatch ? Number(nowMatch[1]) * 60 + Number(nowMatch[2]) : null;
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

let cleanup: (() => void) | void;
let booted = false;

function render(): void {
  cleanup?.();
  viewEl.innerHTML = '';
  const titleEl = header.querySelector<HTMLElement>('[data-view-title]')!;
  titleEl.textContent = TITLES[ctx.state.view];
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
  if (nowOverride === null) ctx.state.now = minutesNow();
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
  if (ctx.state.view === 'today') tickToday(ctx);
}, 1000);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell unavailable; app still runs from cache-less network */
    });
  });
}
