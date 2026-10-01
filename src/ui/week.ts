import type { AppCtx } from '../app';
import { todayISO } from '../app';
import { applyEdits, generatePlan, isVisitDay, weekStats } from '../schedule';
import type { Plan } from '../schedule';
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

  const days = weekDates
    .filter((ds) => isVisitDay(settings, ds))
    .map((ds) => {
      const edits = ctx.state.persisted.template.days[ds]?.edits;
      const basePlan = generatePlan(settings, ds);
      const plan: Plan =
        edits && Object.keys(edits).length > 0 ? applyEdits(basePlan, edits) : basePlan;
      const logs = ctx.state.persisted.logs.filter((l) => l.date === ds);
      return { date: ds, plan, logs };
    });

  const stats = weekStats(settings, days);

  if (stats.warnings.length > 0) {
    const banner = el('div', { class: 'banner' });
    banner.append(el('p', { class: 'eyebrow', text: 'this week' }));
    for (const w of stats.warnings) banner.append(el('p', { class: 'banner-line', text: w }));
    root.append(banner);
  } else {
    root.append(el('p', { class: 'banner ok', text: 'Coverage on track this week.' }));
  }

  const grid = el('div', { class: 'week-grid' });
  stats.days.forEach((row) => {
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
    card.append(el('p', { class: 'wcard-num mono', text: `${row.doneMin}/${row.plannedMin} min` }));
    grid.append(card);
  });
  root.append(grid);

  root.append(
    el('p', {
      class: 'foot-note',
      text: `Visit window ${fmtClock(settings.visitStart)}–${fmtClock(settings.visitEnd)}. Warning only — nothing is penalized.`,
    }),
  );
}
