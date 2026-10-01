import type { AppCtx } from '../app';
import type { Category, Topic } from '../topics';
import { el, haptic } from './dom';

export const CATEGORIES: Category[] = [
  'Modern',
  'Power',
  'Manipulation',
  'Government',
  'Relationships',
  'Health',
  'Time Management',
  'Philosophy',
  'Systems',
  'General',
  'Stories',
];

let showAdd = false;
let addError = '';

export function renderTopics(root: HTMLElement, ctx: AppCtx): void {
  const chips = el('div', { class: 'chips' });
  const filterValues: (Category | 'all')[] = ['all', ...CATEGORIES];
  for (const value of filterValues) {
    const chip = el('button', {
      class: `chip${ctx.state.topicFilter === value ? ' on' : ''}`,
      type: 'button',
      text: value === 'all' ? 'all' : value.toLowerCase(),
    });
    chip.addEventListener('click', () => {
      ctx.state.topicFilter = value;
      ctx.emit();
    });
    chips.append(chip);
  }
  root.append(chips);

  const controls = el('div', { class: 'draw-row' });
  const drawBtn = el('button', { class: 'btn btn-primary btn-wide', type: 'button', text: 'Draw a topic' });
  drawBtn.addEventListener('click', () => {
    haptic();
    ctx.drawNow();
  });
  controls.append(drawBtn);
  root.append(controls);

  const repeatRow = el('label', { class: 'check-row' });
  const repeat = el('input', { type: 'checkbox' }) as HTMLInputElement;
  repeat.checked = ctx.state.allowRepeats;
  repeat.addEventListener('change', () => {
    ctx.state.allowRepeats = repeat.checked;
    ctx.emit();
  });
  repeatRow.append(repeat, document.createTextNode('allow repeats inside the no-repeat window'));
  root.append(repeatRow);

  const active = ctx.state.activeTopicId ? ctx.topicById(ctx.state.activeTopicId) : null;
  if (active) {
    root.append(topicCard(active, ctx));
  } else {
    const empty = el('div', { class: 'empty' });
    empty.append(
      el('p', { class: 'hero-title', text: 'Nothing drawn yet.' }),
      el('p', { class: 'hero-sub', text: 'Draw a topic to give the discussion slot a subject.' }),
    );
    root.append(empty);
  }

  const saved = ctx.state.persisted.savedTopicIds
    .map((id) => ctx.topicById(id))
    .filter((t): t is Topic => Boolean(t));
  if (saved.length > 0) {
    root.append(el('p', { class: 'section-label', text: 'saved for later' }));
    const list = el('div', { class: 'list' });
    for (const topic of saved) {
      const row = el('button', { class: 'lrow', type: 'button' });
      row.append(el('span', { class: 'lrow-title', text: topic.title }));
      row.append(el('span', { class: 'lrow-meta', text: topic.category.toLowerCase() }));
      row.addEventListener('click', () => ctx.topicDiscuss(topic.id));
      list.append(row);
    }
    root.append(list);
  }

  const history = ctx.state.persisted.topicHistory.slice(-10).reverse();
  if (history.length > 0) {
    root.append(el('p', { class: 'section-label', text: 'recent draws' }));
    const list = el('div', { class: 'list' });
    for (const entry of history) {
      const topic = ctx.topicById(entry.topicId);
      if (!topic) continue;
      const row = el('button', { class: 'lrow', type: 'button' });
      row.append(el('span', { class: 'lrow-title', text: topic.title }));
      row.append(el('span', { class: 'lrow-meta mono', text: entry.date }));
      row.addEventListener('click', () => ctx.topicDiscuss(topic.id));
      list.append(row);
    }
    root.append(list);
  }

  root.append(el('p', { class: 'section-label', text: 'add your own' }));
  const toggle = el('button', {
    class: 'btn btn-ghost btn-wide',
    type: 'button',
    text: showAdd ? 'Close form' : 'Add custom topic',
  });
  toggle.addEventListener('click', () => {
    showAdd = !showAdd;
    addError = '';
    ctx.emit();
  });
  root.append(toggle);

  if (showAdd) {
    const title = el('input', { class: 'input', type: 'text', placeholder: 'Title' }) as HTMLInputElement;
    const category = el('select', { class: 'input' }) as HTMLSelectElement;
    for (const c of CATEGORIES) {
      const opt = el('option', { value: c, text: c.toLowerCase() });
      category.append(opt);
    }
    const prompts = el('textarea', {
      class: 'input',
      rows: '4',
      placeholder: 'One prompt per line (3–5 prompts)',
    }) as HTMLTextAreaElement;
    const closer = el('input', { class: 'input', type: 'text', placeholder: 'Closer question' }) as HTMLInputElement;
    const save = el('button', { class: 'btn btn-primary btn-wide', type: 'button', text: 'Save topic' });
    save.addEventListener('click', () => {
      const lines = prompts.value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!title.value.trim() || lines.length < 1) {
        addError = 'Add a title and at least one prompt.';
        ctx.emit();
        return;
      }
      const topic: Topic = {
        id: `c-${Date.now()}`,
        title: title.value.trim(),
        category: category.value as Category,
        prompts: lines,
        closer: closer.value.trim() || 'What stays with you from this one?',
      };
      ctx.upsertTopic(topic);
      showAdd = false;
      addError = '';
      ctx.state.activeTopicId = topic.id;
      ctx.emit();
    });
    root.append(el('div', { class: 'form' }, title, category, prompts, closer, save));
    if (addError) root.append(el('p', { class: 'error-line', text: addError }));
  }
}

function topicCard(topic: Topic, ctx: AppCtx): HTMLElement {
  const card = el('div', { class: 'topic-card' });
  card.append(el('p', { class: 'eyebrow accent', text: topic.category.toLowerCase() }));
  card.append(el('p', { class: 'hero-title', text: topic.title }));
  const prompts = el('ul', { class: 'prompts' });
  for (const p of topic.prompts) prompts.append(el('li', { text: p }));
  card.append(prompts);
  card.append(el('p', { class: 'closer', text: topic.closer }));

  const row = el('div', { class: 'actions' });
  const discuss = el('button', { class: 'btn btn-primary', type: 'button', text: 'Discuss now' });
  discuss.addEventListener('click', () => {
    ctx.topicDiscuss(topic.id);
    ctx.setView('today');
  });
  const done = el('button', { class: 'btn', type: 'button', text: 'Done' });
  done.addEventListener('click', () => {
    haptic();
    ctx.topicDone(topic.id);
  });
  const saved = ctx.state.persisted.savedTopicIds.includes(topic.id);
  const save = el('button', { class: 'btn', type: 'button', text: saved ? 'Saved' : 'Save for later' });
  save.addEventListener('click', () => ctx.topicSave(topic.id));
  row.append(discuss, done, save);
  card.append(row);
  return card;
}
