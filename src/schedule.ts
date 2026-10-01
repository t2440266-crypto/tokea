export type BlockKind =
  'pushups' | 'smoke' | 'discussion' | 'stories' | 'dumbbell' | 'lunch' | 'parallel' | 'recap';

export interface Block {
  id: string;
  kind: BlockKind;
  title: string;
  start: number;
  duration: number;
  anchored: boolean;
}

export interface Plan {
  date: string;
  blocks: Block[];
  unscheduled: { kind: BlockKind; title: string; duration: number }[];
}

export interface DayEdits {
  starts?: Record<string, number>;
  durations?: Record<string, number>;
  order?: string[];
}

export interface Settings {
  visitDays: number[];
  visitStart: number;
  visitEnd: number;
  durations: Record<BlockKind, number>;
  smokeCap: number;
  parallelCap: number;
  lunchTarget: number;
  lunchWindow: [number, number];
  template: BlockKind[];
  cycleOrder: BlockKind[];
  noRepeatDays: number;
  pushups: { sets: number; reps: number };
  sound: boolean;
}

export interface LogEntry {
  date: string;
  blockId: string;
  kind: BlockKind;
  plannedStart: number;
  outcome: 'done' | 'skipped' | 'x';
  cycleIndex: number;
  auto?: boolean;
  corrected?: boolean;
  note?: string;
}

export const TITLES: Record<BlockKind, string> = {
  pushups: 'Pushups',
  smoke: 'Smoke',
  discussion: 'Discussion (deep)',
  stories: 'Stories',
  dumbbell: 'DIY dumbbell',
  lunch: 'Food time',
  parallel: 'Parallel vibes',
  recap: 'Recap',
};

export function defaultSettings(): Settings {
  return {
    visitDays: [1, 2, 3, 4, 5],
    visitStart: 9 * 60,
    visitEnd: 21 * 60,
    durations: {
      pushups: 10,
      smoke: 20,
      discussion: 45,
      stories: 30,
      dumbbell: 40,
      lunch: 90,
      parallel: 90,
      recap: 5,
    },
    smokeCap: 1,
    parallelCap: 1,
    lunchTarget: 13 * 60,
    lunchWindow: [12 * 60 + 30, 14 * 60],
    template: ['pushups', 'smoke', 'discussion', 'stories', 'dumbbell', 'parallel'],
    cycleOrder: ['pushups', 'smoke', 'discussion', 'stories', 'dumbbell', 'lunch', 'parallel'],
    noRepeatDays: 30,
    pushups: { sets: 3, reps: 15 },
    sound: false,
  };
}

function capOf(settings: Settings, kind: BlockKind): number {
  if (kind === 'smoke') return settings.smokeCap;
  if (kind === 'parallel') return settings.parallelCap;
  return Infinity;
}

function freeGaps(windowStart: number, windowEnd: number, blocks: Block[]): [number, number][] {
  const occupied = blocks
    .map((b): [number, number] => [b.start, b.start + b.duration])
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = windowStart;
  for (const [s, e] of occupied) {
    if (e <= windowStart || s >= windowEnd) continue;
    const ss = Math.max(s, windowStart);
    const ee = Math.min(e, windowEnd);
    if (ss > cursor) gaps.push([cursor, ss]);
    cursor = Math.max(cursor, ee);
  }
  if (cursor < windowEnd) gaps.push([cursor, windowEnd]);
  return gaps;
}

export function generatePlan(settings: Settings, date: string): Plan {
  const anchors: Block[] = [];
  const unscheduled: Plan['unscheduled'] = [];
  const { visitStart, visitEnd, durations } = settings;
  const windowLen = visitEnd - visitStart;

  const recapDur = durations.recap;
  if (recapDur <= windowLen) {
    anchors.push({
      id: 'recap',
      kind: 'recap',
      title: TITLES.recap,
      start: visitEnd - recapDur,
      duration: recapDur,
      anchored: true,
    });
  } else {
    unscheduled.push({ kind: 'recap', title: TITLES.recap, duration: recapDur });
  }

  const lunchDur = durations.lunch;
  if (lunchDur <= windowLen) {
    const lo = Math.max(visitStart, settings.lunchWindow[0]);
    const hi = Math.min(settings.lunchWindow[1], visitEnd - lunchDur);
    const start =
      lo <= hi
        ? Math.min(Math.max(settings.lunchTarget, lo), hi)
        : Math.min(Math.max(settings.lunchTarget, visitStart), visitEnd - lunchDur);
    anchors.push({
      id: 'lunch',
      kind: 'lunch',
      title: TITLES.lunch,
      start,
      duration: lunchDur,
      anchored: true,
    });
  } else {
    unscheduled.push({ kind: 'lunch', title: TITLES.lunch, duration: lunchDur });
  }

  const placed: Block[] = [];
  const seen: Record<string, number> = {};
  for (const kind of settings.template) {
    const dur = durations[kind];
    seen[kind] = (seen[kind] ?? 0) + 1;
    if (seen[kind] > capOf(settings, kind)) {
      unscheduled.push({ kind, title: TITLES[kind], duration: dur });
      continue;
    }
    const all = [...anchors, ...placed];
    const gap = freeGaps(visitStart, visitEnd, all).find(([s, e]) => e - s >= dur);
    if (!gap) {
      unscheduled.push({ kind, title: TITLES[kind], duration: dur });
      continue;
    }
    placed.push({
      id: seen[kind] === 1 ? kind : `${kind}#${seen[kind]}`,
      kind,
      title: TITLES[kind],
      start: gap[0],
      duration: dur,
      anchored: false,
    });
  }

  const blocks = [...anchors, ...placed].sort((a, b) => a.start - b.start);
  return { date, blocks, unscheduled };
}

export function applyEdits(plan: Plan, edits: DayEdits): Plan {
  let blocks = plan.blocks.map((b) => ({
    ...b,
    start: edits.starts?.[b.id] ?? b.start,
    duration: edits.durations?.[b.id] ?? b.duration,
  }));
  if (edits.order) {
    const map = new Map(blocks.map((b) => [b.id, b]));
    const ordered: Block[] = [];
    for (const id of edits.order) {
      const block = map.get(id);
      if (block) ordered.push(block);
    }
    const seenIds = new Set(ordered.map((b) => b.id));
    blocks = [...ordered, ...blocks.filter((b) => !seenIds.has(b.id))];
  } else {
    blocks = [...blocks].sort((a, b) => a.start - b.start);
  }
  return { ...plan, blocks };
}

export function currentBlock(
  plan: Plan,
  now: number,
  doneIds: string[] = [],
): { current: Block | null; next: Block | null; remaining: number } {
  const active = plan.blocks.filter((b) => !doneIds.includes(b.id));
  const current = active.find((b) => now >= b.start && now < b.start + b.duration) ?? null;
  let next: Block | null;
  if (current) {
    next =
      active
        .filter((b) => b.id !== current.id && b.start + b.duration > now)
        .sort((a, b) => a.start - b.start)[0] ?? null;
  } else {
    next = active.filter((b) => now < b.start).sort((a, b) => a.start - b.start)[0] ?? null;
  }
  const remaining = current ? current.start + current.duration - now : 0;
  return { current, next, remaining };
}

export function isVisitDay(settings: Settings, date: string): boolean {
  const day = new Date(`${date}T00:00:00`).getDay();
  return settings.visitDays.includes(day);
}

export function weekStats(
  _settings: Settings,
  days: { date: string; plan: Plan; logs: LogEntry[] }[],
): {
  days: {
    date: string;
    plannedMin: number;
    doneMin: number;
    exercise: boolean;
    discussion: boolean;
    lunch: boolean;
    recap: boolean;
  }[];
  warnings: string[];
} {
  const rows = days.map((d) => {
    const doneIds = new Set(d.logs.filter((l) => l.outcome === 'done').map((l) => l.blockId));
    const kinds = new Set(d.logs.filter((l) => l.outcome === 'done').map((l) => l.kind));
    return {
      date: d.date,
      plannedMin: d.plan.blocks.reduce((sum, b) => sum + b.duration, 0),
      doneMin: d.plan.blocks
        .filter((b) => doneIds.has(b.id))
        .reduce((sum, b) => sum + b.duration, 0),
      exercise: kinds.has('pushups') || kinds.has('dumbbell'),
      discussion: kinds.has('discussion'),
      lunch: kinds.has('lunch'),
      recap: kinds.has('recap'),
    };
  });
  const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const warnings: string[] = [];
  const exercise = n((r) => r.exercise);
  const discussion = n((r) => r.discussion);
  const lunch = n((r) => r.lunch);
  const recap = n((r) => r.recap);
  if (exercise < 3) warnings.push(`Exercise ${exercise}/3 days this week`);
  if (discussion < 3) warnings.push(`Discussion ${discussion}/3 days this week`);
  if (lunch < 3) warnings.push(`Lunch ${lunch}/3 days this week`);
  if (recap < rows.length) warnings.push(`Recap ${recap}/${rows.length} visit days this week`);
  return { days: rows, warnings };
}
