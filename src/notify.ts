import { TITLES } from './schedule';
import type { ChainOccurrence, FineSession } from './cycle';

const askedThisSession = new Set<string>();

export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export async function requestNotifyPermission(): Promise<void> {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* permission prompt dismissed */
  }
}

export function markPermissionAsked(tag: string): boolean {
  if (askedThisSession.has(tag)) return true;
  askedThisSession.add(tag);
  return false;
}

function fmt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function viaServiceWorker(payload: Record<string, unknown>): boolean {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return false;
  controller.postMessage(payload);
  return true;
}

function plain(tag: string, title: string, body: string): void {
  try {
    new Notification(title, { body, tag });
  } catch {
    /* constructor unavailable (android chrome) */
  }
}

export function notifyStart(occ: ChainOccurrence): void {
  if (!canNotify()) return;
  const tag = `start:${occ.key}`;
  const title = TITLES[occ.kind];
  const body = `${Math.round((occ.end - occ.start) / 60000)} min · until ${fmt(occ.end)}`;
  const shown = viaServiceWorker({
    type: 'notify',
    tag,
    title,
    body,
    data: { kind: 'start' },
  });
  if (!shown) plain(tag, title, body);
}

export function notifyPrompt(occ: ChainOccurrence): void {
  if (!canNotify()) return;
  const tag = `prompt:${occ.key}`;
  const title = `${TITLES[occ.kind]} ends in 10 min`;
  const body = `Tick if it is done, X if it is not · until ${fmt(occ.end)}`;
  const shown = viaServiceWorker({
    type: 'notify',
    tag,
    title,
    body,
    data: { kind: 'prompt', key: occ.key },
    actions: [
      { action: 'tick', title: 'Done' },
      { action: 'x', title: 'Not done' },
    ],
  });
  if (!shown) plain(tag, title, body);
}

export function notifySessionStart(session: FineSession): void {
  if (!canNotify()) return;
  const tag = `fine-session:${session.id}`;
  const title = TITLES[session.kind];
  const body = `Paying the fine · time-count until ${fmt(session.endsAt)}`;
  const shown = viaServiceWorker({
    type: 'notify',
    tag,
    title,
    body,
    data: { kind: 'fine-session', key: session.id },
  });
  if (!shown) plain(tag, title, body);
}

export function notifyFinePrompt(session: FineSession): void {
  if (!canNotify()) return;
  const tag = `fine-prompt:${session.id}`;
  const title = `${TITLES[session.kind]} payment ends soon`;
  const body = `Confirm before ${fmt(session.endsAt)} · until then`;
  const shown = viaServiceWorker({
    type: 'notify',
    tag,
    title,
    body,
    data: { kind: 'fine-prompt', key: session.id },
    actions: [
      { action: 'paid', title: 'The activity done and Fine Paid' },
      { action: 'notdone', title: 'Not done' },
    ],
  });
  if (!shown) plain(tag, title, body);
}

export function closeNotify(tag: string): void {
  const controller = navigator.serviceWorker?.controller;
  if (controller) controller.postMessage({ type: 'close', tag });
}
