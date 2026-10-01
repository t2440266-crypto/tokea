import type { AppCtx } from '../app';
import { el } from './dom';

export function renderMore(root: HTMLElement, ctx: AppCtx): void {
  const menu = el('div', { class: 'list menu' });
  const recap = el('button', { class: 'lrow', type: 'button' });
  recap.append(el('span', { class: 'lrow-title', text: 'Recap' }));
  recap.append(el('span', { class: 'lrow-meta', text: 'day summaries and score' }));
  recap.addEventListener('click', () => ctx.setView('recap'));
  const settings = el('button', { class: 'lrow', type: 'button' });
  settings.append(el('span', { class: 'lrow-title', text: 'Settings' }));
  settings.append(el('span', { class: 'lrow-meta', text: 'days, window, caps, routine, topics' }));
  settings.addEventListener('click', () => ctx.setView('settings'));
  menu.append(recap, settings);
  root.append(menu);
  root.append(
    el('p', { class: 'foot-note', text: 'Visit Day Driver · everything stays on this device' }),
  );
}
