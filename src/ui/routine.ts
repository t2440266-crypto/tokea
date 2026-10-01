import type { AppCtx } from '../app';
import { beep, el, fmtRemaining, haptic } from './dom';

let checks: Record<string, boolean[]> = {};
let pushIndex = 0;
let restUntil = 0;
let restTimer: number | null = null;
let restFinished = false;

export function renderRoutine(root: HTMLElement, ctx: AppCtx): (() => void) | void {
  const routine = ctx.state.persisted.routine;
  const plan = ctx.plan();
  const logged = new Set(ctx.doneIds());

  root.append(el('p', { class: 'section-label', text: 'dumbbell day' }));
  if (routine.exercises.length === 0) {
    root.append(
      el('div', { class: 'empty' },
        el('p', { class: 'hero-title', text: 'No exercises yet.' }),
        el('p', { class: 'hero-sub', text: 'Add the routine in settings.' }),
      ),
    );
  }

  for (const ex of routine.exercises) {
    if (!checks[ex.id] || checks[ex.id].length !== ex.sets) {
      checks[ex.id] = Array.from({ length: ex.sets }, (_, i) => checks[ex.id]?.[i] ?? false);
    }
    const card = el('div', { class: 'ex-card' });
    card.append(el('p', { class: 'ex-name', text: ex.name }));
    card.append(el('p', { class: 'ex-meta mono', text: `${ex.sets} × ${ex.reps} · rest ${ex.restSec}s` }));
    const sets = el('div', { class: 'set-row' });
    checks[ex.id].forEach((done, i) => {
      const dot = el('button', {
        class: `set-dot${done ? ' on' : ''}`,
        type: 'button',
        'aria-label': `Set ${i + 1}`,
        text: String(i + 1),
      });
      dot.addEventListener('click', () => {
        checks[ex.id][i] = !checks[ex.id][i];
        if (checks[ex.id][i] && ex.restSec > 0) startRest(ex.restSec, ex.name);
        if (routine.exercises.every((e) => checks[e.id]?.every(Boolean))) {
          if (!logged.has('dumbbell') && plan.blocks.some((b) => b.kind === 'dumbbell')) {
            haptic();
            ctx.logOutcome('dumbbell', 'done');
            return;
          }
        }
        ctx.emit();
      });
      sets.append(dot);
    });
    card.append(sets);
    root.append(card);
  }

  const restBox = el('div', { class: `rest${restUntil > Date.now() ? ' on' : ''}` });
  if (restUntil > Date.now()) {
    const remain = (restUntil - Date.now()) / 1000;
    restBox.append(el('p', { class: 'eyebrow', text: 'rest' }));
    restBox.append(el('p', { class: 'rest-num mono', 'data-rest': '', text: fmtRemaining(remain / 60) }));
    const skip = el('button', { class: 'btn btn-small', type: 'button', text: 'Skip rest' });
    skip.addEventListener('click', () => {
      restUntil = 0;
      stopRestTimer();
      ctx.emit();
    });
    restBox.append(skip);
  } else if (restFinished) {
    restBox.append(el('p', { class: 'rest-num mono', text: 'rest done' }));
    restFinished = false;
  }
  root.append(restBox);

  const push = ctx.state.persisted.settings.pushups;
  const pushCard = el('div', { class: 'ex-card' });
  pushCard.append(el('p', { class: 'ex-name', text: 'Pushups' }));
  pushCard.append(el('p', { class: 'ex-meta mono', text: `set ${Math.min(pushIndex + 1, push.sets)} of ${push.sets} · ${push.reps} reps` }));
  const complete = el('button', {
    class: 'btn btn-primary',
    type: 'button',
    text: pushIndex >= push.sets ? 'All sets done' : 'Complete set',
  }) as HTMLButtonElement;
  complete.disabled = pushIndex >= push.sets;
  complete.addEventListener('click', () => {
    pushIndex += 1;
    haptic();
    if (pushIndex >= push.sets) {
      if (!logged.has('pushups') && plan.blocks.some((b) => b.kind === 'pushups')) {
        ctx.logOutcome('pushups', 'done');
        pushIndex = 0;
        return;
      }
      pushIndex = 0;
    } else {
      startRest(60, 'Pushups');
    }
    ctx.emit();
  });
  pushCard.append(complete);
  root.append(pushCard);

  const reset = el('button', { class: 'btn btn-ghost btn-wide', type: 'button', text: 'Reset checks' });
  reset.addEventListener('click', () => {
    checks = {};
    pushIndex = 0;
    restUntil = 0;
    stopRestTimer();
    ctx.emit();
  });
  root.append(reset);

  startRestTicker(ctx);
  return () => stopRestTimer();
}

function startRest(sec: number, _label: string): void {
  restUntil = Date.now() + sec * 1000;
  restFinished = false;
}

function stopRestTimer(): void {
  if (restTimer !== null) {
    window.clearInterval(restTimer);
    restTimer = null;
  }
}

function startRestTicker(ctx: AppCtx): void {
  stopRestTimer();
  if (restUntil <= Date.now()) return;
  restTimer = window.setInterval(() => {
    const box = document.querySelector<HTMLElement>('[data-rest]');
    if (restUntil <= Date.now()) {
      stopRestTimer();
      restUntil = 0;
      restFinished = true;
      haptic();
      if (ctx.state.persisted.settings.sound) beep();
      ctx.emit();
      return;
    }
    if (box) {
      box.textContent = fmtRemaining((restUntil - Date.now()) / 1000 / 60);
    }
  }, 500);
}
