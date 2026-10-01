import type { AppCtx } from '../app';
import { chainSchedule } from '../cycle';
import { TITLES } from '../schedule';
import type { BlockKind } from '../schedule';
import { el } from './dom';

const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function renderRecap(root: HTMLElement, ctx: AppCtx): void {
  const date = ctx.state.recapDate ?? ctx.state.date;
  const settings = ctx.state.persisted.settings;
  const logs = ctx.state.persisted.logs.filter((l) => l.date === date);
  const sched = chainSchedule(settings, date);

  const plannedMin = sched.reduce((sum, o) => sum + (o.end - o.start) / 60000, 0);
  const completedMin = logs
    .filter((l) => l.outcome === 'done')
    .reduce((sum, l) => sum + settings.durations[l.kind], 0);
  const pct = plannedMin > 0 ? Math.round((completedMin / plannedMin) * 100) : 0;

  const d = new Date(`${date}T00:00:00`);
  const head = el('div', { class: 'recap-head' });
  head.append(el('p', { class: 'eyebrow', text: date === ctx.state.date ? 'today' : 'day recap' }));
  head.append(
    el('p', {
      class: 'hero-title',
      text: `${DAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`,
    }),
  );
  if (ctx.state.recapDate) {
    const back = el('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      text: 'Show today',
    });
    back.addEventListener('click', () => {
      ctx.state.recapDate = null;
      ctx.emit();
    });
    head.append(back);
  }
  root.append(head);

  const minutesByKind = new Map<BlockKind, number>();
  for (const log of logs) {
    if (log.outcome !== 'done') continue;
    minutesByKind.set(log.kind, (minutesByKind.get(log.kind) ?? 0) + settings.durations[log.kind]);
  }

  root.append(el('p', { class: 'section-label', text: 'activities' }));
  const list = el('div', { class: 'list' });
  for (const occ of sched) {
    const row = logs.find((l) => l.cycleIndex === occ.cycleIndex && l.kind === occ.kind);
    const status =
      row?.outcome === 'done'
        ? 'done'
        : row?.outcome === 'x'
          ? 'x'
          : row?.outcome === 'skipped'
            ? 'skipped'
            : 'pending';
    const cycleTag = occ.cycleIndex > 1 ? ` · c${occ.cycleIndex}` : '';
    const line = el('div', { class: 'lrow static' });
    line.append(el('span', { class: 'lrow-title', text: `${TITLES[occ.kind]}${cycleTag}` }));
    line.append(
      el('span', { class: `lrow-meta ${status === 'done' ? 'is-done' : ''}`, text: status }),
    );
    list.append(line);
  }
  if (sched.length === 0) {
    list.append(
      el(
        'div',
        { class: 'lrow static' },
        el('span', { class: 'lrow-meta', text: 'not a Tokea Day' }),
      ),
    );
  }
  root.append(list);

  if (minutesByKind.size > 0) {
    root.append(el('p', { class: 'section-label', text: 'minutes per interest' }));
    const mins = el('div', { class: 'min-grid' });
    for (const [kind, min] of minutesByKind) {
      mins.append(
        el(
          'div',
          { class: 'min-cell' },
          el('span', { class: 'mono min-num', text: String(min) }),
          el('span', { class: 'min-label', text: kind }),
        ),
      );
    }
    root.append(mins);
  }

  const topicEntries = ctx.state.persisted.topicHistory.filter((h) => h.date === date);
  if (topicEntries.length > 0) {
    const last = topicEntries[topicEntries.length - 1];
    const topic = ctx.topicById(last.topicId);
    if (topic) {
      root.append(el('p', { class: 'section-label', text: 'topic drawn' }));
      root.append(
        el('div', { class: 'lrow static' }, el('span', { class: 'lrow-title', text: topic.title })),
      );
    }
  }

  root.append(el('p', { class: 'section-label', text: 'day note' }));
  const note = el('textarea', {
    class: 'input',
    rows: '3',
    placeholder: 'Anything worth remembering from this day',
  }) as HTMLTextAreaElement;
  note.value =
    date === ctx.state.date ? ctx.dayNote() : (ctx.state.persisted.template.days[date]?.note ?? '');
  note.addEventListener('change', () => {
    if (date === ctx.state.date) ctx.setDayNote(note.value);
    else {
      const entry = (ctx.state.persisted.template.days[date] ??= { edits: {}, dirty: false });
      entry.note = note.value;
      ctx.emit();
    }
  });
  root.append(note);

  const score = el('div', { class: 'score' });
  score.append(el('p', { class: 'eyebrow', text: 'score' }));
  score.append(el('p', { class: 'score-num mono', text: `${pct}%` }));
  score.append(
    el('p', {
      class: 'score-formula mono',
      text: `score = completed minutes ÷ scheduled minutes = ${Math.round(completedMin)} ÷ ${Math.round(plannedMin)}`,
    }),
  );
  root.append(score);

  const dates = [
    ...new Set([
      ...ctx.state.persisted.logs.map((l) => l.date),
      ...Object.keys(ctx.state.persisted.template.days),
    ]),
  ]
    .filter((ds) => ds <= ctx.state.date)
    .sort()
    .reverse()
    .slice(0, 14);
  if (dates.length > 0) {
    root.append(el('p', { class: 'section-label', text: 'past days' }));
    const past = el('div', { class: 'list' });
    for (const ds of dates) {
      const row = el('button', { class: 'lrow', type: 'button' });
      const dd = new Date(`${ds}T00:00:00`);
      row.append(el('span', { class: 'lrow-title', text: `${DAY_SHORT[dd.getDay()]} ${ds}` }));
      const dayLogs = ctx.state.persisted.logs.filter((l) => l.date === ds && l.outcome === 'done');
      row.append(el('span', { class: 'lrow-meta mono', text: `${dayLogs.length} done` }));
      row.addEventListener('click', () => {
        ctx.state.recapDate = ds;
        ctx.emit();
        window.scrollTo({ top: 0 });
      });
      past.append(row);
    }
    root.append(past);
  }
}
