import { describe, expect, test } from 'vitest';
import {
  applyEdits,
  currentBlock,
  defaultSettings,
  generatePlan,
  isVisitDay,
  weekStats,
} from './schedule';
import type { Plan, Settings } from './schedule';

const s = (): Settings => defaultSettings();

function overlaps(a: { start: number; duration: number }, b: { start: number; duration: number }): boolean {
  return a.start < b.start + b.duration && b.start < a.start + a.duration;
}

describe('generatePlan', () => {
  test('lunch pins at 13:00 and recap pins at window end', () => {
    const settings = s();
    const plan = generatePlan(settings, '2026-09-30');
    const lunch = plan.blocks.find((b) => b.kind === 'lunch');
    const recap = plan.blocks.find((b) => b.kind === 'recap');
    expect(lunch?.start).toBe(13 * 60);
    expect(lunch?.anchored).toBe(true);
    expect(recap?.start).toBe(settings.visitEnd - settings.durations.recap);
    expect(recap?.anchored).toBe(true);
  });

  test('every flexible block of a normal day is scheduled', () => {
    const plan = generatePlan(s(), '2026-09-30');
    expect(plan.unscheduled).toHaveLength(0);
    for (const kind of ['pushups', 'smoke', 'discussion', 'stories', 'dumbbell', 'parallel']) {
      expect(plan.blocks.some((b) => b.kind === kind)).toBe(true);
    }
  });

  test('no two blocks overlap and all sit inside the visit window', () => {
    const settings = s();
    const plan = generatePlan(settings, '2026-09-30');
    const sorted = [...plan.blocks].sort((a, b) => a.start - b.start);
    for (const block of sorted) {
      expect(block.start).toBeGreaterThanOrEqual(settings.visitStart);
      expect(block.start + block.duration).toBeLessThanOrEqual(settings.visitEnd);
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(overlaps(sorted[i], sorted[i + 1])).toBe(false);
    }
  });

  test('smoke beyond cap lands in unscheduled, not in the plan', () => {
    const settings = s();
    settings.template = [...settings.template, 'smoke'];
    settings.smokeCap = 1;
    const plan = generatePlan(settings, '2026-09-30');
    expect(plan.blocks.filter((b) => b.kind === 'smoke')).toHaveLength(1);
    expect(plan.unscheduled.filter((u) => u.kind === 'smoke')).toHaveLength(1);
  });

  test('parallel beyond cap lands in unscheduled', () => {
    const settings = s();
    settings.template = [...settings.template, 'parallel'];
    settings.parallelCap = 1;
    const plan = generatePlan(settings, '2026-09-30');
    expect(plan.blocks.filter((b) => b.kind === 'parallel')).toHaveLength(1);
    expect(plan.unscheduled.filter((u) => u.kind === 'parallel')).toHaveLength(1);
  });

  test('reordered template places the new first flexible block at window start', () => {
    const settings = s();
    settings.template = ['discussion', 'pushups', 'smoke', 'stories', 'dumbbell', 'parallel'];
    const plan = generatePlan(settings, '2026-09-30');
    const firstFlexible = plan.blocks.filter((b) => !b.anchored)[0];
    expect(firstFlexible?.kind).toBe('discussion');
    expect(firstFlexible?.start).toBe(settings.visitStart);
    expect(plan.unscheduled).toHaveLength(0);
  });

  test('blocks that cannot fit the window surface as unscheduled', () => {
    const settings = s();
    settings.durations.discussion = 180;
    settings.durations.stories = 180;
    settings.durations.dumbbell = 180;
    settings.durations.parallel = 180;
    const plan = generatePlan(settings, '2026-09-30');
    expect(plan.unscheduled.length).toBeGreaterThan(0);
    const scheduled = plan.blocks.filter((b) => !b.anchored).length;
    const flexible = settings.template.length;
    expect(scheduled + plan.unscheduled.filter((u) => u.kind !== 'lunch' && u.kind !== 'recap').length).toBe(flexible);
  });
});

describe('applyEdits', () => {
  test('order decides the sequence while starts still shift times [pin: spec 0002]', () => {
    const plan = generatePlan(s(), '2026-09-30');
    const ids = [...plan.blocks].sort((a, b) => a.start - b.start).map((b) => b.id);
    const swapped = [ids[1], ids[0], ...ids.slice(2)];
    const edited = applyEdits(plan, { starts: { [ids[0]]: 100 }, order: swapped });
    expect(edited.blocks.map((b) => b.id)).toEqual(swapped);
    expect(edited.blocks.find((b) => b.id === ids[0])?.start).toBe(100);
  });

  test('edited start and duration win over generated values', () => {
    const plan = generatePlan(s(), '2026-09-30');
    const edited = applyEdits(plan, {
      starts: { discussion: 15 * 60 },
      durations: { smoke: 25 },
    });
    expect(edited.blocks.find((b) => b.kind === 'discussion')?.start).toBe(15 * 60);
    expect(edited.blocks.find((b) => b.kind === 'smoke')?.duration).toBe(25);
    const untouched = edited.blocks.find((b) => b.kind === 'pushups');
    const original = plan.blocks.find((b) => b.kind === 'pushups');
    expect(untouched?.start).toBe(original?.start);
  });

  test('order edit reorders blocks', () => {
    const plan = generatePlan(s(), '2026-09-30');
    const ids = plan.blocks.map((b) => b.id);
    const swapped = [...ids];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const edited = applyEdits(plan, { order: swapped });
    expect(edited.blocks.map((b) => b.id)).toEqual(swapped);
  });
});

describe('currentBlock', () => {
  const plan: Plan = {
    date: '2026-09-30',
    blocks: [
      { id: 'a', kind: 'discussion', title: 'Discussion (deep)', start: 600, duration: 45, anchored: false },
      { id: 'b', kind: 'lunch', title: 'Lunch out', start: 660, duration: 90, anchored: true },
      { id: 'c', kind: 'parallel', title: 'Parallel vibes', start: 780, duration: 90, anchored: false },
    ],
    unscheduled: [],
  };

  test('returns current block, next block, remaining minutes at faked clock', () => {
    const now = 610;
    const res = currentBlock(plan, now);
    expect(res.current?.id).toBe('a');
    expect(res.next?.id).toBe('b');
    expect(res.remaining).toBe(35);
  });

  test('before any block starts, current is null and next is first', () => {
    const res = currentBlock(plan, 300);
    expect(res.current).toBeNull();
    expect(res.next?.id).toBe('a');
  });

  test('after the last block, current and next are null', () => {
    const res = currentBlock(plan, 2000);
    expect(res.current).toBeNull();
    expect(res.next).toBeNull();
  });

  test('done blocks are skipped when listed', () => {
    const res = currentBlock(plan, 610, ['a']);
    expect(res.current).toBeNull();
    expect(res.next?.id).toBe('b');
  });
});

describe('isVisitDay', () => {
  test('Wednesday is a default visit day, Saturday is not', () => {
    expect(isVisitDay(s(), '2026-09-30')).toBe(true);
    expect(isVisitDay(s(), '2026-10-03')).toBe(false);
  });
});

describe('weekStats', () => {
  test('warns when exercise coverage under 3 days', () => {
    const settings = s();
    const days = ['2026-09-28', '2026-09-29'].map((date) => {
      const plan = generatePlan(settings, date);
      return {
        date,
        plan,
        logs: plan.blocks
          .filter((b) => b.kind === 'pushups' || b.kind === 'dumbbell' || b.kind === 'lunch' || b.kind === 'discussion' || b.kind === 'recap')
          .map((b) => ({ date, blockId: b.id, kind: b.kind, outcome: 'done' as const, plannedStart: b.start })),
      };
    });
    const stats = weekStats(settings, days);
    expect(stats.days).toHaveLength(2);
    expect(stats.warnings.some((w) => w.toLowerCase().includes('exercise'))).toBe(true);
  });
});
