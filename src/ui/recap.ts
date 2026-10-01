import type { AppCtx } from '../app';
import { applyEdits, generatePlan } from '../schedule';
import type { BlockKind, Plan } from '../schedule';
import { el } from './dom';

const DAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function renderRecap(root: HTMLElement, ctx: AppCtx): void {
  const date = ctx.state.recapDate ?? ctx.state.date;
  const settings = ctx.state.persisted.settings;
  const edits = ctx.state.persisted.template.days[date]?.edits;
  const basePlan = generatePlan(settings, date);
  const plan: Plan = edits && Object.keys(edits).length > 0 ? applyEdits(basePlan, edits) : basePlan;
  const logs = ctx.state.persisted.logs.filter((l) => l.date === date);

  const doneIds = new Set(logs.filter((l) => l.outcome === 'done').map((l) => l.blockId));
  const skippedIds = new Set(logs.filter((l) => l.outcome === 'skipped').map((l) => l.blockId));
  const plannedMin = plan.blocks.reduce((sum, b) => sum + b.duration, 0);
  const completedMin = plan.blocks.filter((b) => doneIds.has(b.id)).reduce((sum, b) => sum + b.duration, 0);
  const pct = plannedMin > 0 ? Math.round((completedMin / plannedMin) * 100) : 0;

  const d = new Date(`${date}T00:00:00`);
  const head = el('div', { class: 'recap-head' });
  head.append(el('p', { class: 'eyebrow', text: date === ctx.state.date ? 'today' : 'day recap' }));
  head.append(el('p', { class: 'hero-title', text: `${DAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}` }));
  if (ctx.state.recapDate) {
    const back = el('button', { class: 'btn btn-small btn-ghost', type: 'button', text: 'Show today' });
    back.addEventListener('click', () => {
      ctx.state.recapDate = null;
      ctx.emit();
    });
    head.append(back);
  }
  root.append(head);

  const minutesByKind = new Map<BlockKind, number>();
  for (const block of plan.blocks) {
    if (!doneIds.has(block.id)) continue;
    minutesByKind.set(block.kind, (minutesByKind.get(block.kind) ?? 0) + block.duration);
  }

  root.append(el('p', { class: 'section-label', text: 'blocks' }));
  const list = el('div', { class: 'list' });
  for (const block of plan.blocks) {
    const status = doneIds.has(block.id) ? 'done' : skippedIds.has(block.id) ? 'skipped' : 'planned';
    const row = el('div', { class: 'lrow static' });
    row.append(el('span', { class: 'lrow-title', text: block.title }));
    row.append(el('span', { class: `lrow-meta ${status === 'done' ? 'is-done' : ''}`, text: status }));
    list.append(row);
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
      root.append(el('div', { class: 'lrow static' }, el('span', { class: 'lrow-title', text: topic.title })));
    }
  }

  root.append(el('p', { class: 'section-label', text: 'day note' }));
  const note = el('textarea', { class: 'input', rows: '3', placeholder: 'Anything worth remembering from this day' }) as HTMLTextAreaElement;
  note.value = date === ctx.state.date ? ctx.dayNote() : (ctx.state.persisted.template.days[date]?.note ?? '');
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
      text: `score = completed planned minutes ÷ planned minutes = ${completedMin} ÷ ${plannedMin}`,
    }),
  );
  root.append(score);

  const dates = [...new Set([...ctx.state.persisted.logs.map((l) => l.date), ...Object.keys(ctx.state.persisted.template.days)])]
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
