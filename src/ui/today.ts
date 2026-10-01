import type { AppCtx } from '../app';
import { currentBlock, isVisitDay } from '../schedule';
import { beep, el, fmtClock, fmtRemaining, haptic } from './dom';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

let expandedId: string | null = null;
let skipPromptFor: string | null = null;

const LIFT_MS = 350;
const SLOP_PX = 10;

interface Gesture {
  pointerId: number;
  row: HTMLElement;
  list: HTMLElement;
  startX: number;
  startY: number;
  timer: number;
  lifted: boolean;
  onMove: ((e: PointerEvent) => void) | null;
  onUp: ((e: PointerEvent) => void) | null;
  onCancel?: () => void;
}

let gesture: Gesture | null = null;
let suppressClick = false;

function abandonGesture(): void {
  if (!gesture) return;
  window.clearTimeout(gesture.timer);
  if (gesture.lifted) {
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 350);
  }
  if (gesture.onMove) window.removeEventListener('pointermove', gesture.onMove);
  if (gesture.onUp) window.removeEventListener('pointerup', gesture.onUp);
  if (gesture.onCancel) window.removeEventListener('pointercancel', gesture.onCancel);
  gesture.list.classList.remove('lifting');
  gesture.row.classList.remove('lifted');
  gesture = null;
}

function cleanupGesture(write: boolean, ctx: AppCtx): void {
  if (!gesture) return;
  const g = gesture;
  window.clearTimeout(g.timer);
  if (g.onMove) window.removeEventListener('pointermove', g.onMove);
  if (g.onUp) window.removeEventListener('pointerup', g.onUp);
  if (g.onCancel) window.removeEventListener('pointercancel', g.onCancel);
  try {
    g.row.releasePointerCapture(g.pointerId);
  } catch {
    /* capture already released */
  }
  let order: string[] = [];
  if (g.lifted) {
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 350);
    g.list.classList.remove('lifting');
    order = [...g.list.querySelectorAll<HTMLElement>('[data-block-id]')].map(
      (el) => el.dataset.blockId!,
    );
  }
  g.row.classList.remove('lifted');
  gesture = null;
  if (g.lifted && write) ctx.applyOrder(order);
  else ctx.emit();
}

function moveGap(g: Gesture, clientY: number): void {
  const rows = [...g.list.querySelectorAll<HTMLElement>('.prow')].filter((r) => r !== g.row);
  let before: ChildNode | null = null;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      before = row;
      break;
    }
  }
  g.list.insertBefore(g.row, before);
}

function onPointerDown(e: PointerEvent, list: HTMLElement, ctx: AppCtx): void {
  if (gesture || e.button !== 0) return;
  if ((e.target as HTMLElement).closest('.rowtools')) return;
  const row = (e.target as HTMLElement).closest<HTMLElement>('.prow');
  if (!row) return;
  const g: Gesture = {
    pointerId: e.pointerId,
    row,
    list,
    startX: e.clientX,
    startY: e.clientY,
    timer: 0,
    lifted: false,
    onMove: null,
    onUp: null,
  };
  g.timer = window.setTimeout(() => {
    if (gesture !== g) return;
    g.lifted = true;
    row.classList.add('lifted');
    list.classList.add('lifting');
    try {
      row.setPointerCapture(g.pointerId);
    } catch {
      /* capture unsupported */
    }
    g.onMove = (ev: PointerEvent) => {
      if (gesture !== g || ev.pointerId !== g.pointerId) return;
      if (!g.lifted) return;
      ev.preventDefault();
      moveGap(g, ev.clientY);
    };
    g.onUp = (ev: PointerEvent) => {
      if (gesture !== g || ev.pointerId !== g.pointerId) return;
      cleanupGesture(true, ctx);
    };
    const onCancel = () => {
      if (gesture !== g) return;
      cleanupGesture(false, ctx);
    };
    g.onCancel = onCancel;
    window.addEventListener('pointermove', g.onMove, { passive: false });
    window.addEventListener('pointerup', g.onUp);
    window.addEventListener('pointercancel', onCancel);
  }, LIFT_MS);

  const preMove = (ev: PointerEvent) => {
    if (gesture !== g || g.lifted) return;
    const dx = Math.abs(ev.clientX - g.startX);
    const dy = Math.abs(ev.clientY - g.startY);
    if (dx > SLOP_PX || dy > SLOP_PX) {
      window.clearTimeout(g.timer);
      window.removeEventListener('pointermove', preMove);
    }
  };
  const preUp = () => {
    if (gesture !== g) return;
    window.clearTimeout(g.timer);
    window.removeEventListener('pointermove', preMove);
    window.removeEventListener('pointerup', preUp);
    if (!g.lifted) gesture = null;
  };
  window.addEventListener('pointermove', preMove);
  window.addEventListener('pointerup', preUp);
  gesture = g;
}

export function renderToday(root: HTMLElement, ctx: AppCtx): void {
  abandonGesture();
  const settings = ctx.state.persisted.settings;
  const visit = isVisitDay(settings, ctx.state.date);
  const dayName = DAYS[new Date(`${ctx.state.date}T00:00:00`).getDay()];

  root.append(
    el('p', {
      class: 'dayline',
      text: visit ? `visit day · ${dayName}` : `not a visit day · ${dayName}`,
    }),
  );

  const hero = el('div', { class: 'hero' });
  if (!visit) {
    hero.append(
      el('p', { class: 'hero-title', text: 'No visit today.' }),
      el('p', { class: 'hero-sub', text: 'The plan runs on visit days only.' }),
    );
    const open = el('button', {
      class: 'btn btn-primary btn-wide',
      type: 'button',
      text: 'Open topics',
    });
    open.addEventListener('click', () => ctx.setView('topics'));
    hero.append(open);
    root.append(hero);
    return;
  }

  const plan = ctx.plan();
  const done = new Set(ctx.doneIds());
  const { current, next, remaining } = currentBlock(plan, ctx.state.now, ctx.doneIds());

  if (current) {
    const started = ctx.state.started[current.id] === true;
    hero.append(el('p', { class: 'eyebrow accent', text: 'now' }));
    hero.append(el('p', { class: 'hero-title', text: current.title }));

    const ringWrap = el('div', { class: 'ring-wrap' });
    const dur = current.duration || 1;
    const c = 2 * Math.PI * 54;
    ringWrap.innerHTML = `
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="54"></circle>
        <circle class="ring-fill" cx="60" cy="60" r="54" data-ring
          stroke-dasharray="${c.toFixed(1)}"
          stroke-dashoffset="${(c * (1 - Math.min(1, Math.max(0, remaining / dur)))).toFixed(1)}"></circle>
      </svg>
      <span class="ring-num mono" data-remaining data-dur="${dur}">${fmtRemaining(remaining)}</span>`;
    hero.append(ringWrap);

    const actions = el('div', { class: 'actions' });
    if (!started) {
      const start = el('button', {
        class: 'btn btn-primary btn-wide',
        type: 'button',
        text: 'Start',
      });
      start.addEventListener('click', () => ctx.startBlock(current.id));
      actions.append(start);
    } else {
      const doneBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Done' });
      doneBtn.addEventListener('click', () => {
        haptic();
        if (ctx.state.persisted.settings.sound) beep();
        ctx.logOutcome(current.id, 'done');
      });
      const skipBtn = el('button', { class: 'btn', type: 'button', text: 'Skip' });
      skipBtn.addEventListener('click', () => {
        skipPromptFor = current.id;
        ctx.logOutcome(current.id, 'skipped');
      });
      const plus = el('button', { class: 'btn', type: 'button', text: '+5' });
      plus.addEventListener('click', () => ctx.extendBlock(current.id));
      actions.append(doneBtn, skipBtn, plus);
    }
    hero.append(actions);

    if (skipPromptFor) {
      const input = el('input', {
        class: 'input',
        type: 'text',
        placeholder: 'Note (optional)',
      }) as HTMLInputElement;
      const save = el('button', { class: 'btn btn-small', type: 'button', text: 'Save' });
      const dismiss = el('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        text: 'Dismiss',
      });
      const target = skipPromptFor;
      save.addEventListener('click', () => {
        ctx.setLogNote(target, input.value.trim());
        skipPromptFor = null;
        ctx.emit();
      });
      dismiss.addEventListener('click', () => {
        skipPromptFor = null;
        ctx.emit();
      });
      hero.append(el('div', { class: 'skip-note' }, input, save, dismiss));
    }
  } else if (next) {
    const until = Math.max(0, Math.ceil(next.start - ctx.state.now));
    hero.append(el('p', { class: 'eyebrow', text: 'up next' }));
    hero.append(el('p', { class: 'hero-title', text: next.title }));
    hero.append(
      el('p', {
        class: 'hero-sub mono',
        'data-until': String(next.start),
        text: `${fmtClock(next.start)} · in ${until} min`,
      }),
    );
  } else {
    hero.append(el('p', { class: 'hero-title', text: 'Plan finished for today.' }));
    hero.append(el('p', { class: 'hero-sub', text: 'Everything scheduled has run its clock.' }));
    const recap = el('button', {
      class: 'btn btn-primary btn-wide',
      type: 'button',
      text: 'Open recap',
    });
    recap.addEventListener('click', () => ctx.setView('recap'));
    hero.append(recap);
  }
  root.append(hero);

  const topic = ctx.state.activeTopicId ? ctx.topicById(ctx.state.activeTopicId) : undefined;
  if (topic) {
    const peek = el('button', { class: 'peek', type: 'button' });
    peek.append(el('span', { class: 'eyebrow', text: 'topic of the day' }));
    peek.append(el('span', { class: 'peek-title', text: topic.title }));
    peek.addEventListener('click', () => ctx.setView('topics'));
    root.append(peek);
  }

  if (next) {
    root.append(
      el(
        'div',
        { class: 'next-strip' },
        el('span', { class: 'eyebrow', text: 'next' }),
        el('span', { class: 'mono', text: fmtClock(next.start) }),
        el('span', { text: next.title }),
      ),
    );
  }

  const timeline = el('div', { class: 'timeline' });
  for (const block of plan.blocks) {
    const state = done.has(block.id)
      ? 'done'
      : current && current.id === block.id
        ? 'now'
        : 'future';
    const seg = el(
      'div',
      { class: `seg seg-${state}`, style: `flex-grow:${block.duration};` },
      el('span', { class: 'mono seg-time', text: fmtClock(block.start) }),
      el('span', { class: 'seg-title', text: block.title }),
    );
    seg.title = `${block.title} ${fmtClock(block.start)}`;
    timeline.append(seg);
  }
  root.append(timeline);

  const resolved = plan.blocks.filter((b) => done.has(b.id)).length;
  root.append(
    el('p', { class: 'progress mono', text: `plan · ${resolved} of ${plan.blocks.length} blocks` }),
  );

  const list = el('div', { class: 'planlist' });
  for (const block of plan.blocks) {
    const logged = done.has(block.id);
    const isNow = current !== null && current.id === block.id;
    const row = el('div', {
      class: `prow${expandedId === block.id ? ' open' : ''}`,
      'data-block-id': block.id,
    });
    const head = el('button', { class: 'prow-head', type: 'button' });
    head.append(el('span', { class: 'mono prow-time', text: fmtClock(block.start) }));
    head.append(el('span', { class: 'prow-title', text: block.title }));
    head.append(
      el('span', {
        class: `prow-status ${logged ? 'is-done' : isNow ? 'is-now' : ''}`,
        text: logged ? 'done' : isNow ? 'now' : `${block.duration}m`,
      }),
    );
    head.addEventListener('click', () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      expandedId = expandedId === block.id ? null : block.id;
      ctx.emit();
    });
    row.append(head);
    if (expandedId === block.id) {
      const tools = el('div', { class: 'rowtools' });
      const earlier = el('button', { class: 'btn btn-small', type: 'button', text: 'Earlier' });
      earlier.addEventListener('click', () => ctx.moveBlock(block.id, -1));
      const later = el('button', { class: 'btn btn-small', type: 'button', text: 'Later' });
      later.addEventListener('click', () => ctx.moveBlock(block.id, 1));
      const plus = el('button', { class: 'btn btn-small', type: 'button', text: '+5 min' });
      plus.addEventListener('click', () => ctx.extendBlock(block.id));
      tools.append(earlier, later, plus);
      if (!logged) {
        const doneBtn = el('button', { class: 'btn btn-small', type: 'button', text: 'Done' });
        doneBtn.addEventListener('click', () => {
          haptic();
          if (ctx.state.persisted.settings.sound) beep();
          ctx.logOutcome(block.id, 'done');
        });
        const skipBtn = el('button', { class: 'btn btn-small', type: 'button', text: 'Skip' });
        skipBtn.addEventListener('click', () => {
          skipPromptFor = block.id;
          ctx.logOutcome(block.id, 'skipped');
        });
        tools.append(doneBtn, skipBtn);
      }
      row.append(tools);
    }
    list.append(row);
  }
  list.addEventListener('pointerdown', (e) => onPointerDown(e, list, ctx));
  list.addEventListener(
    'touchmove',
    (e) => {
      if (gesture?.lifted) e.preventDefault();
    },
    { passive: false },
  );
  root.append(list);

  if (plan.unscheduled.length > 0) {
    root.append(el('p', { class: 'section-label', text: 'not scheduled' }));
    const extra = el('div', { class: 'planlist' });
    for (const item of plan.unscheduled) {
      extra.append(
        el(
          'div',
          { class: 'prow' },
          el(
            'div',
            { class: 'prow-head static' },
            el('span', { class: 'mono prow-time', text: '--:--' }),
            el('span', { class: 'prow-title', text: item.title }),
            el('span', { class: 'prow-status', text: `${item.duration}m` }),
          ),
        ),
      );
    }
    root.append(extra);
  }

  if (ctx.isDirty()) {
    const regen = el('button', {
      class: 'btn btn-ghost btn-wide regen',
      type: 'button',
      text: 'Regenerate plan',
    });
    regen.addEventListener('click', () => {
      if (window.confirm('Regenerate plan? Manual edits for today are removed.')) ctx.regenDay();
    });
    root.append(regen);
  }
}

export function tickToday(ctx: AppCtx): void {
  const { current, next, remaining } = currentBlock(ctx.plan(), ctx.state.now, ctx.doneIds());
  const remainingEl = document.querySelector<HTMLElement>('[data-remaining]');
  if (remainingEl && current) {
    const dur = Number(remainingEl.dataset.dur) || current.duration || 1;
    remainingEl.textContent = fmtRemaining(remaining);
    const ring = document.querySelector<SVGCircleElement>('[data-ring]');
    if (ring) {
      const c = 2 * Math.PI * 54;
      const frac = Math.min(1, Math.max(0, remaining / dur));
      ring.setAttribute('stroke-dashoffset', (c * (1 - frac)).toFixed(1));
    }
  }
  const until = document.querySelector<HTMLElement>('[data-until]');
  if (until && next && !current) {
    const mins = Math.max(0, Math.ceil(next.start - ctx.state.now));
    until.textContent = `${fmtClock(next.start)} · in ${mins} min`;
  }
}
