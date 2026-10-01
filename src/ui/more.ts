import type { AppCtx } from '../app';
import '../theme-layout.css';
import { el } from './dom';

const ICON_ATTRS =
  'viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  recap: `<svg ${ICON_ATTRS}><path d="M5 20V11M12 20V5M19 20v-7"/></svg>`,
  settings: `<svg ${ICON_ATTRS}><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>`,
  mark: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1c1206" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>`,
};

function menuRow(icon: string, title: string, meta: string, onOpen: () => void): HTMLElement {
  const row = el('button', { class: 'lrow', type: 'button' });
  const tile = el('span', { class: 'lrow-icon' });
  tile.innerHTML = icon;
  row.append(
    tile,
    el(
      'span',
      { class: 'lrow-text' },
      el('span', { class: 'lrow-title', text: title }),
      el('span', { class: 'lrow-meta', text: meta }),
    ),
  );
  row.addEventListener('click', onOpen);
  return row;
}

export function renderMore(root: HTMLElement, ctx: AppCtx): void {
  const mark = el('span', { class: 'brand-mark' });
  mark.innerHTML = ICONS.mark;
  root.append(
    el(
      'div',
      { class: 'brand-card' },
      mark,
      el(
        'div',
        {},
        el('p', { class: 'brand-name', text: 'tokea' }),
        el('p', { class: 'brand-sub', text: 'Your day runs itself.' }),
      ),
    ),
  );

  const daysLogged = new Set(ctx.state.persisted.logs.map((l) => l.date)).size;
  const stat = (num: number, label: string): HTMLElement =>
    el(
      'div',
      { class: 'brand-stat' },
      el('span', { class: 'brand-stat-num', text: String(num) }),
      el('span', { class: 'brand-stat-label', text: label }),
    );
  root.append(
    el(
      'div',
      { class: 'brand-stats' },
      stat(daysLogged, 'days logged'),
      stat(ctx.allTopics().length, 'topics'),
    ),
  );

  const menu = el('div', { class: 'list menu' });
  menu.append(
    menuRow(ICONS.recap, 'Recap', 'day summaries and score', () => ctx.setView('recap')),
    menuRow(ICONS.settings, 'Settings', 'days, window, caps, routine, topics', () =>
      ctx.setView('settings'),
    ),
  );
  root.append(menu);
  root.append(
    el('p', { class: 'foot-note', text: 'Tokea System · everything stays on this device' }),
  );
}
