import type { AppCtx } from '../app';
import { TITLES } from '../schedule';
import type { BlockKind, Settings } from '../schedule';
import type { Category, Topic } from '../topics';
import { el, parseTime, timeInput } from './dom';
import { CATEGORIES } from './topics';

const DAY_SHORT = ['s', 'm', 't', 'w', 't', 'f', 's'];
const DURATION_FIELDS: { kind: BlockKind; label: string }[] = [
  { kind: 'pushups', label: 'Pushups' },
  { kind: 'smoke', label: 'Smoke' },
  { kind: 'discussion', label: 'Discussion' },
  { kind: 'stories', label: 'Stories' },
  { kind: 'dumbbell', label: 'Dumbbell' },
  { kind: 'lunch', label: 'Food time' },
  { kind: 'parallel', label: 'Parallel vibes' },
  { kind: 'recap', label: 'Recap' },
];

let bankFilter: Category | 'all' = 'all';
let editing: Topic | null = null;
let editError = '';

function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), input);
}

function numInput(
  value: number,
  min: number,
  max: number,
  onSet: (n: number) => void,
): HTMLElement {
  const input = el('input', {
    class: 'input num',
    type: 'number',
    min: String(min),
    max: String(max),
    value: String(value),
  }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const n = Number(input.value);
    if (Number.isFinite(n) && n >= min && n <= max) onSet(Math.round(n));
  });
  return input;
}

function timeField(value: number, onSet: (min: number) => void): HTMLElement {
  const input = el('input', {
    class: 'input',
    type: 'time',
    value: timeInput(value),
  }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const parsed = parseTime(input.value);
    if (parsed !== null) onSet(parsed);
  });
  return input;
}

export function renderSettings(root: HTMLElement, ctx: AppCtx): void {
  const s = ctx.state.persisted.settings;

  root.append(el('p', { class: 'section-label', text: 'visit days' }));
  const days = el('div', { class: 'chips' });
  for (let d = 0; d < 7; d++) {
    const on = s.visitDays.includes(d);
    const chip = el('button', {
      class: `chip${on ? ' on' : ''}`,
      type: 'button',
      text: DAY_SHORT[d],
    });
    chip.addEventListener('click', () => {
      const next = on
        ? s.visitDays.filter((x) => x !== d)
        : [...s.visitDays, d].sort((a, b) => a - b);
      ctx.updateSettings({ visitDays: next });
    });
    days.append(chip);
  }
  root.append(days);

  root.append(el('p', { class: 'section-label', text: 'visit window' }));
  root.append(
    el(
      'div',
      { class: 'row2' },
      field(
        'starts',
        timeField(s.visitStart, (v) => ctx.updateSettings({ visitStart: v })),
      ),
      field(
        'ends',
        timeField(s.visitEnd, (v) => ctx.updateSettings({ visitEnd: v })),
      ),
    ),
  );

  root.append(el('p', { class: 'section-label', text: 'loop order' }));
  root.append(
    el('p', {
      class: 'foot-note',
      text: 'Order of the repeating activity chain on visit days. The loop wraps from the last entry back to the first inside the visit window.',
    }),
  );
  s.cycleOrder.forEach((kind, idx) => {
    const row = el('div', { class: 'lrow static' });
    row.append(el('span', { class: 'lrow-title', text: TITLES[kind] }));
    const tools = el('span', { class: 'order-tools' });
    const up = el('button', {
      class: 'btn btn-small',
      type: 'button',
      text: '↑',
      'aria-label': `Move ${TITLES[kind]} earlier`,
    }) as HTMLButtonElement;
    up.disabled = idx === 0;
    up.addEventListener('click', () => {
      const next = [...s.cycleOrder];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      ctx.updateSettings({ cycleOrder: next });
    });
    const down = el('button', {
      class: 'btn btn-small',
      type: 'button',
      text: '↓',
      'aria-label': `Move ${TITLES[kind]} later`,
    }) as HTMLButtonElement;
    down.disabled = idx === s.cycleOrder.length - 1;
    down.addEventListener('click', () => {
      const next = [...s.cycleOrder];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      ctx.updateSettings({ cycleOrder: next });
    });
    tools.append(up, down);
    row.append(tools);
    root.append(row);
  });

  root.append(el('p', { class: 'section-label', text: 'food time' }));
  root.append(
    el(
      'div',
      { class: 'row2' },
      field(
        'target',
        timeField(s.lunchTarget, (v) => ctx.updateSettings({ lunchTarget: v })),
      ),
      field(
        'window start',
        timeField(s.lunchWindow[0], (v) =>
          ctx.updateSettings({ lunchWindow: [v, s.lunchWindow[1]] }),
        ),
      ),
      field(
        'window end',
        timeField(s.lunchWindow[1], (v) =>
          ctx.updateSettings({ lunchWindow: [s.lunchWindow[0], v] }),
        ),
      ),
    ),
  );

  root.append(el('p', { class: 'section-label', text: 'block durations (min)' }));
  const durs = el('div', { class: 'row2' });
  for (const { kind, label } of DURATION_FIELDS) {
    durs.append(
      field(
        label,
        numInput(s.durations[kind], 1, 480, (n) =>
          ctx.updateSettings({ durations: { [kind]: n } as Partial<Settings['durations']> }),
        ),
      ),
    );
  }
  root.append(durs);

  root.append(el('p', { class: 'section-label', text: 'caps per day' }));
  root.append(
    el(
      'div',
      { class: 'row2' },
      field(
        'smoke max',
        numInput(s.smokeCap, 0, 7, (n) => ctx.updateSettings({ smokeCap: n })),
      ),
      field(
        'parallel max',
        numInput(s.parallelCap, 0, 7, (n) => ctx.updateSettings({ parallelCap: n })),
      ),
    ),
  );

  root.append(el('p', { class: 'section-label', text: 'pushups' }));
  root.append(
    el(
      'div',
      { class: 'row2' },
      field(
        'sets',
        numInput(s.pushups.sets, 1, 20, (n) =>
          ctx.updateSettings({ pushups: { ...s.pushups, sets: n } }),
        ),
      ),
      field(
        'reps',
        numInput(s.pushups.reps, 1, 100, (n) =>
          ctx.updateSettings({ pushups: { ...s.pushups, reps: n } }),
        ),
      ),
    ),
  );

  root.append(el('p', { class: 'section-label', text: 'topics' }));
  root.append(
    field(
      'no-repeat window (days)',
      numInput(s.noRepeatDays, 1, 365, (n) => ctx.updateSettings({ noRepeatDays: n })),
    ),
  );
  const soundRow = el('label', { class: 'check-row' });
  const sound = el('input', { type: 'checkbox' }) as HTMLInputElement;
  sound.checked = s.sound;
  sound.addEventListener('change', () => ctx.updateSettings({ sound: sound.checked }));
  soundRow.append(sound, document.createTextNode('completion sound (off by default)'));
  root.append(soundRow);

  root.append(el('p', { class: 'section-label', text: 'routine editor' }));
  const routine = ctx.state.persisted.routine;
  for (const ex of routine.exercises) {
    const card = el('div', { class: 'ex-card' });
    const name = el('input', { class: 'input', type: 'text', value: ex.name }) as HTMLInputElement;
    name.addEventListener('change', () => {
      ctx.updateRoutine({
        exercises: routine.exercises.map((x) => (x.id === ex.id ? { ...x, name: name.value } : x)),
      });
    });
    card.append(name);
    card.append(
      el(
        'div',
        { class: 'row2' },
        field(
          'sets',
          numInput(ex.sets, 1, 20, (n) =>
            ctx.updateRoutine({
              exercises: routine.exercises.map((x) => (x.id === ex.id ? { ...x, sets: n } : x)),
            }),
          ),
        ),
        field(
          'reps',
          numInput(ex.reps, 1, 100, (n) =>
            ctx.updateRoutine({
              exercises: routine.exercises.map((x) => (x.id === ex.id ? { ...x, reps: n } : x)),
            }),
          ),
        ),
        field(
          'rest (s)',
          numInput(ex.restSec, 0, 600, (n) =>
            ctx.updateRoutine({
              exercises: routine.exercises.map((x) => (x.id === ex.id ? { ...x, restSec: n } : x)),
            }),
          ),
        ),
      ),
    );
    const remove = el('button', {
      class: 'btn btn-small btn-ghost',
      type: 'button',
      text: 'Remove',
    });
    remove.addEventListener('click', () => {
      ctx.updateRoutine({ exercises: routine.exercises.filter((x) => x.id !== ex.id) });
    });
    card.append(remove);
    root.append(card);
  }
  const addEx = el('button', {
    class: 'btn btn-ghost btn-wide',
    type: 'button',
    text: 'Add exercise',
  });
  addEx.addEventListener('click', () => {
    ctx.updateRoutine({
      exercises: [
        ...routine.exercises,
        { id: `ex-${Date.now()}`, name: 'New exercise', sets: 3, reps: 10, restSec: 60 },
      ],
    });
  });
  root.append(addEx);

  root.append(el('p', { class: 'section-label', text: 'topic bank' }));
  root.append(
    el('p', {
      class: 'foot-note',
      text: `${ctx.allTopics().length} topics · editing a seed keeps the original under it`,
    }),
  );
  const chips = el('div', { class: 'chips' });
  const values: (Category | 'all')[] = ['all', ...CATEGORIES];
  for (const value of values) {
    const chip = el('button', {
      class: `chip${bankFilter === value ? ' on' : ''}`,
      type: 'button',
      text: value === 'all' ? 'all' : value.toLowerCase(),
    });
    chip.addEventListener('click', () => {
      bankFilter = value;
      ctx.emit();
    });
    chips.append(chip);
  }
  root.append(chips);

  if (editing) {
    root.append(editForm(ctx));
  } else {
    const list = el('div', { class: 'list' });
    const topics = ctx
      .allTopics()
      .filter((t) => bankFilter === 'all' || t.category === bankFilter)
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const topic of topics) {
      const row = el('button', { class: 'lrow', type: 'button' });
      row.append(el('span', { class: 'lrow-title', text: topic.title }));
      row.append(el('span', { class: 'lrow-meta', text: topic.category.toLowerCase() }));
      row.addEventListener('click', () => {
        editing = { ...topic, prompts: [...topic.prompts] };
        editError = '';
        ctx.emit();
      });
      list.append(row);
    }
    root.append(list);
  }

  root.append(el('p', { class: 'section-label', text: 'data' }));
  const dataRow = el('div', { class: 'actions' });
  const exportBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Export JSON' });
  exportBtn.addEventListener('click', () => ctx.exportData());
  const resetBtn = el('button', {
    class: 'btn btn-ghost',
    type: 'button',
    text: 'Reset everything',
  });
  resetBtn.addEventListener('click', () => {
    if (
      window.confirm(
        'Reset all data? Settings, logs, notes, and custom topics are removed from this device.',
      )
    ) {
      ctx.resetData();
    }
  });
  dataRow.append(exportBtn, resetBtn);
  root.append(dataRow);
}

function editForm(ctx: AppCtx): HTMLElement {
  const topic = editing!;
  const wrap = el('div', { class: 'form card' });
  const title = el('input', {
    class: 'input',
    type: 'text',
    value: topic.title,
  }) as HTMLInputElement;
  const category = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const c of CATEGORIES) {
    const opt = el('option', { value: c, text: c.toLowerCase() }) as HTMLOptionElement;
    if (c === topic.category) opt.selected = true;
    category.append(opt);
  }
  const prompts = el('textarea', { class: 'input', rows: '5' }) as HTMLTextAreaElement;
  prompts.value = topic.prompts.join('\n');
  const closer = el('input', {
    class: 'input',
    type: 'text',
    value: topic.closer,
  }) as HTMLInputElement;
  const save = el('button', {
    class: 'btn btn-primary btn-wide',
    type: 'button',
    text: 'Save topic',
  });
  save.addEventListener('click', () => {
    const lines = prompts.value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!title.value.trim() || lines.length < 1) {
      editError = 'Add a title and at least one prompt.';
      ctx.emit();
      return;
    }
    ctx.upsertTopic({
      id: topic.id,
      title: title.value.trim(),
      category: category.value as Category,
      prompts: lines,
      closer: closer.value.trim() || topic.closer,
    });
    editing = null;
    editError = '';
    ctx.emit();
  });
  const cancel = el('button', { class: 'btn btn-ghost btn-wide', type: 'button', text: 'Cancel' });
  cancel.addEventListener('click', () => {
    editing = null;
    editError = '';
    ctx.emit();
  });
  const isCustom = ctx.state.persisted.topics.custom.some((t) => t.id === topic.id);
  wrap.append(
    el('p', { class: 'eyebrow accent', text: 'edit topic' }),
    title,
    category,
    prompts,
    closer,
    save,
    cancel,
  );
  if (isCustom) {
    const del = el('button', {
      class: 'btn btn-ghost btn-wide',
      type: 'button',
      text: 'Delete topic',
    });
    del.addEventListener('click', () => {
      ctx.deleteTopic(topic.id);
      editing = null;
      ctx.emit();
    });
    wrap.append(del);
  }
  if (editError) wrap.append(el('p', { class: 'error-line', text: editError }));
  return wrap;
}
