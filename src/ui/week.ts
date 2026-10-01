import type { AppCtx } from '../app';
import { todayISO } from '../app';
import { chainSchedule, sessionsForDate } from '../cycle';
import { generatePlan, isVisitDay, weekStats } from '../schedule';
import '../theme-layout.css';
import { el, fmtClock } from './dom';

const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function renderWeek(root: HTMLElement, ctx: AppCtx): void {
  const settings = ctx.state.persisted.settings;
  const base = new Date(`${ctx.state.date}T00:00:00`);
  const mondayOffset = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - mondayOffset);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(todayISO(d));
  }

  const rows = weekDates
    .filter((ds) => isVisitDay(settings, ds))
    .map((ds) => {
      const sched = chainSchedule(
        settings,
        ds,
        sessionsForDate(ctx.state.persisted.fineSessions, ds),
      );
      const logs = ctx.state.persisted.logs.filter((l) => l.date === ds);
      const plannedMin = sched.reduce((sum, o) => sum + (o.end - o.start) / 60000, 0);
      const doneMin = logs
        .filter((l) => l.outcome === 'done')
        .reduce((sum, l) => sum + settings.durations[l.kind], 0);
      const plan = generatePlan(settings, ds);
      return { date: ds, plan, logs, plannedMin, doneMin };
    });

  const stats = weekStats(
    settings,
    rows.map((r) => ({ date: r.date, plan: r.plan, logs: r.logs })),
  );
  const warnings = stats.warnings.filter((w) => !w.startsWith('Recap'));

  const totalPlanned = rows.reduce((sum, r) => sum + r.plannedMin, 0);
  const totalDone = rows.reduce((sum, r) => sum + r.doneMin, 0);
  const pct = totalPlanned > 0 ? Math.min(100, Math.round((totalDone / totalPlanned) * 100)) : 0;
  const dial = el('div', { class: 'wsum-dial', style: `--p:${pct};` });
  dial.append(el('span', { class: 'wsum-pct', text: `${pct}%` }));
  root.append(
    el(
      'div',
      { class: 'wsum' },
      dial,
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'this week' }),
        el('p', { class: 'wsum-title', text: `${Math.round(totalDone)} min done` }),
        el('p', {
          class: 'wsum-sub mono',
          text: `of ${Math.round(totalPlanned)} planned · ${rows.length} Tokea Days`,
        }),
      ),
    ),
  );

  if (warnings.length > 0) {
    const banner = el('div', { class: 'banner' });
    banner.append(el('p', { class: 'eyebrow', text: 'heads up' }));
    for (const w of warnings) banner.append(el('p', { class: 'banner-line', text: w }));
    root.append(banner);
  } else {
    root.append(el('p', { class: 'banner ok', text: 'Coverage on track this week.' }));
  }

  const grid = el('div', { class: 'week-grid' });
  rows.forEach((row) => {
    const d = new Date(`${row.date}T00:00:00`);
    const ratio = row.plannedMin > 0 ? Math.min(1, row.doneMin / row.plannedMin) : 0;
    const isToday = row.date === ctx.state.date;
    const card = el('div', { class: `wcard${isToday ? ' today' : ''}` });
    card.append(
      el('p', {
        class: 'wcard-day',
        text: `${DAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`,
      }),
    );
    const bar = el('div', { class: 'bar' });
    const fill = el('div', { class: 'bar-fill', style: `width:${(ratio * 100).toFixed(1)}%` });
    bar.append(fill);
    card.append(bar);
    card.append(
      el('p', {
        class: 'wcard-num mono',
        text: `${Math.round(row.doneMin)}/${Math.round(row.plannedMin)} min`,
      }),
    );
    grid.append(card);
  });
  root.append(grid);

  root.append(
    el('p', {
      class: 'foot-note',
      text: `Loop window ${fmtClock(settings.visitStart)}–${fmtClock(settings.visitEnd)}. Warning only — nothing is penalized.`,
    }),
  );
}
