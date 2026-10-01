import type { AppCtx } from '../app';
import { TITLES, isVisitDay } from '../schedule';
import type { BlockKind, LogEntry } from '../schedule';
import { occurrenceAt, windowBounds } from '../cycle';
import type { ChainOccurrence } from '../cycle';
import { el, fmtRemaining, haptic } from './dom';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const PAY_CONFIRM_COPY =
  "It looks like you want to pay the fine you penalized for missing this previous activity from the previous cycle, press 'Pay fine and start the time-count to pay this specific exact activity only";

export const FINE_TAUNT =
  'That is your dumb foolish fault and I will not have sympathy or mercy on you while paying the fines. Finish paying the fines while the daily activities run — they add +25 minutes for every daily activity running while you pay.';

function fmtMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fineBadge(fines: Record<string, number>, kind: BlockKind): string | null {
  const owed = fines[kind] ?? 0;
  if (owed <= 0) return null;
  return owed === 1 ? '1 fine to pay' : `fines ${owed}`;
}

function rowFor(logs: LogEntry[], cycleIndex: number, kind: BlockKind): LogEntry | undefined {
  return logs.find((l) => l.cycleIndex === cycleIndex && l.kind === kind);
}

export function renderToday(root: HTMLElement, ctx: AppCtx): void {
  const settings = ctx.state.persisted.settings;
  const visit = isVisitDay(settings, ctx.state.date);
  const dayName = DAYS[new Date(`${ctx.state.date}T00:00:00`).getDay()];

  root.append(
    el('p', {
      class: 'dayline',
      text: visit ? `Tokea Day · ${dayName}` : `not a Tokea Day · ${dayName}`,
    }),
  );

  const hero = el('div', { class: 'hero' });
  if (!visit) {
    hero.append(
      el('p', { class: 'hero-title', text: 'No Tokea Day today.' }),
      el('p', { class: 'hero-sub', text: 'The loop runs on Tokea Days only.' }),
    );
    const open = el('button', {
      class: 'btn btn-primary btn-wide',
      type: 'button',
      text: 'Open topics',
    });
    open.addEventListener('click', () => ctx.setView('topics'));
    hero.append(open);
    root.append(hero);
    return;
  }

  const sched = ctx.schedule();
  const nowMs = ctx.state.nowMs;
  const bounds = windowBounds(settings, ctx.state.date);
  const current = occurrenceAt(sched, nowMs);
  const logs = ctx.todayLogs();
  const fines = ctx.fines();
  const session = ctx.activeSession();

  if (session) {
    hero.append(el('p', { class: 'eyebrow accent', text: 'paying fine' }));
    hero.append(el('p', { class: 'hero-title', text: TITLES[session.kind] }));
    const remaining = (session.endsAt - nowMs) / 60000;
    const dur = (session.endsAt - session.startedAt) / 60000;
    const c = 2 * Math.PI * 54;
    const ringWrap = el('div', { class: 'ring-wrap' });
    ringWrap.innerHTML = `
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="54"></circle>
        <circle class="ring-fill" cx="60" cy="60" r="54" data-ring
          stroke-dasharray="${c.toFixed(1)}"
          stroke-dashoffset="${(c * (1 - Math.min(1, Math.max(0, remaining / dur)))).toFixed(1)}"></circle>
      </svg>
      <span class="ring-num mono" data-remaining data-end="${session.endsAt}" data-dur="${dur}">${fmtRemaining(remaining)}</span>`;
    hero.append(ringWrap);
    hero.append(
      el('p', {
        class: 'hero-sub mono',
        text: `time-count · until ${fmtMs(session.endsAt)} · ${Math.round(dur)} min`,
      }),
    );
    hero.append(el('p', { class: 'taunt', text: FINE_TAUNT }));
    root.append(hero);
    appendTail(ctx, sched, logs, fines, current, nowMs, root);
    return;
  }

  if (bounds && nowMs < bounds.start && !current) {
    const first = sched[0];
    hero.append(el('p', { class: 'eyebrow', text: 'up next' }));
    if (first) {
      hero.append(el('p', { class: 'hero-title', text: TITLES[first.kind] }));
      hero.append(
        el('p', {
          class: 'hero-sub mono',
          text: `window opens ${fmtMs(bounds.start)} · loop starts in ${Math.max(0, Math.ceil((bounds.start - nowMs) / 60000))} min`,
        }),
      );
    }
    root.append(hero);
    appendTail(ctx, sched, logs, fines, current, nowMs, root);
    return;
  }

  if (current) {
    const cycleLabel = current.cycleIndex > 1 ? ` · cycle ${current.cycleIndex}` : '';
    hero.append(el('p', { class: 'eyebrow accent', text: `now${cycleLabel}` }));
    hero.append(el('p', { class: 'hero-title', text: TITLES[current.kind] }));

    const remaining = (current.end - nowMs) / 60000;
    const dur = (current.end - current.start) / 60000;
    const c = 2 * Math.PI * 54;
    const ringWrap = el('div', { class: 'ring-wrap' });
    ringWrap.innerHTML = `
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="54"></circle>
        <circle class="ring-fill" cx="60" cy="60" r="54" data-ring
          stroke-dasharray="${c.toFixed(1)}"
          stroke-dashoffset="${(c * (1 - Math.min(1, Math.max(0, remaining / dur)))).toFixed(1)}"></circle>
      </svg>
      <span class="ring-num mono" data-remaining data-end="${current.end}" data-dur="${dur}">${fmtRemaining(remaining)}</span>`;
    hero.append(ringWrap);
    hero.append(
      el('p', {
        class: 'hero-sub mono',
        text: `until ${fmtMs(current.end)} · ${Math.round(dur)} min`,
      }),
    );
    root.append(hero);
  } else {
    hero.append(el('p', { class: 'eyebrow', text: 'loop paused' }));
    hero.append(el('p', { class: 'hero-title', text: 'Tokea window closed.' }));
    hero.append(
      el('p', { class: 'hero-sub', text: 'The loop starts again when the Tokea window opens.' }),
    );
    const recap = el('button', {
      class: 'btn btn-primary btn-wide',
      type: 'button',
      text: 'Open recap',
    });
    recap.addEventListener('click', () => ctx.setView('recap'));
    hero.append(recap);
    root.append(hero);
  }

  appendTail(ctx, sched, logs, fines, current, nowMs, root);
}

function appendTail(
  ctx: AppCtx,
  sched: ChainOccurrence[],
  logs: LogEntry[],
  fines: Record<string, number>,
  current: ChainOccurrence | null,
  nowMs: number,
  root: HTMLElement,
): void {
  const topic = ctx.state.activeTopicId ? ctx.topicById(ctx.state.activeTopicId) : undefined;
  if (topic) {
    const peek = el('button', { class: 'peek', type: 'button' });
    peek.append(el('span', { class: 'eyebrow', text: 'topic of the day' }));
    peek.append(el('span', { class: 'peek-title', text: topic.title }));
    peek.addEventListener('click', () => ctx.setView('topics'));
    root.append(peek);
  }

  const next = sched.find((o) => o.start > nowMs);
  if (next) {
    root.append(
      el(
        'div',
        { class: 'next-strip' },
        el('span', { class: 'eyebrow', text: 'next' }),
        el('span', { class: 'mono', text: fmtMs(next.start) }),
        el('span', { text: TITLES[next.kind] }),
        el('span', { class: 'mono dim', text: `until ${fmtMs(next.end)}` }),
      ),
    );
  }

  const timeline = el('div', { class: 'timeline' });
  for (const occ of sched) {
    const row = rowFor(logs, occ.cycleIndex, occ.kind);
    const state =
      row?.outcome === 'done'
        ? 'done'
        : row?.outcome === 'x'
          ? 'miss'
          : current?.key === occ.key
            ? 'now'
            : 'future';
    const seg = el(
      'div',
      { class: `seg seg-${state}`, style: `flex-grow:${(occ.end - occ.start) / 60000};` },
      el('span', { class: 'mono seg-time', text: fmtMs(occ.start) }),
      el('span', { class: 'seg-title', text: TITLES[occ.kind] }),
    );
    seg.title = `${TITLES[occ.kind]} until ${fmtMs(occ.end)}`;
    timeline.append(seg);
  }
  root.append(timeline);

  const verified = sched.filter((o) => rowFor(logs, o.cycleIndex, o.kind)).length;
  root.append(
    el('p', { class: 'progress mono', text: `verified ${verified} of ${sched.length} today` }),
  );

  const nextUnpaid = new Map<BlockKind, string>();
  for (const o of sched) {
    if (o.end < nowMs) continue;
    if (rowFor(logs, o.cycleIndex, o.kind)) continue;
    if ((fines[o.kind] ?? 0) > 0 && !nextUnpaid.has(o.kind)) nextUnpaid.set(o.kind, o.key);
  }

  const list = el('div', { class: 'planlist' });
  for (const occ of sched) {
    const row = rowFor(logs, occ.cycleIndex, occ.kind);
    const badge = nextUnpaid.get(occ.kind) === occ.key ? fineBadge(fines, occ.kind) : null;
    const cycleTag = occ.cycleIndex > 1 ? ` · c${occ.cycleIndex}` : '';
    let status = fmtMs(occ.end);
    let statusClass = '';
    if (row?.outcome === 'done') {
      status = 'done';
      statusClass = 'is-done';
    } else if (row?.outcome === 'x') {
      status = 'x';
      statusClass = 'is-miss';
    } else if (current?.key === occ.key) {
      status = 'running';
      statusClass = 'is-now';
    }
    const prow = el('div', { class: 'prow' });
    const head = el(row?.outcome === 'x' ? 'button' : 'div', {
      class: 'prow-head static',
      type: row?.outcome === 'x' ? 'button' : undefined,
    });
    head.append(el('span', { class: 'mono prow-time', text: fmtMs(occ.start) }));
    head.append(el('span', { class: 'prow-title', text: `${TITLES[occ.kind]}${cycleTag}` }));
    head.append(el('span', { class: `prow-status ${statusClass}`, text: status }));
    if (row?.outcome === 'x') {
      head.classList.add('correctable');
      head.title =
        (fines[occ.kind] ?? 0) > 0
          ? 'Pay the fine for this missed activity'
          : 'Tap to correct this X for today';
      head.addEventListener('click', () => {
        if ((fines[occ.kind] ?? 0) > 0) {
          ctx.askPayFine(occ.kind, occ.cycleIndex);
          return;
        }
        if (
          window.confirm(
            `Mark ${TITLES[occ.kind]} (cycle ${occ.cycleIndex}) as done instead? The fine comes off.`,
          )
        ) {
          haptic();
          ctx.markVerified(occ, 'tick', { correction: true });
        }
      });
    }
    prow.append(head);
    if (badge) {
      prow.append(el('span', { class: 'fine-badge', text: badge }));
    }
    list.append(prow);
  }
  root.append(list);
}

export function tickToday(ctx: AppCtx): void {
  const nowMs = ctx.state.nowMs;
  const session = ctx.activeSession();
  const current = session ? null : occurrenceAt(ctx.schedule(), nowMs);
  const targetEnd = session ? session.endsAt : current ? current.end : null;
  const remainingEl = document.querySelector<HTMLElement>('[data-remaining]');
  if (remainingEl && targetEnd !== null) {
    const dur = Number(remainingEl.dataset.dur) || 1;
    const remaining = (targetEnd - nowMs) / 60000;
    remainingEl.textContent = fmtRemaining(remaining);
    const ring = document.querySelector<SVGCircleElement>('[data-ring]');
    if (ring) {
      const c = 2 * Math.PI * 54;
      const frac = Math.min(1, Math.max(0, remaining / dur));
      ring.setAttribute('stroke-dashoffset', (c * (1 - frac)).toFixed(1));
    }
  }
}
