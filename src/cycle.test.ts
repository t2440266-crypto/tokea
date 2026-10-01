import { describe, expect, test } from 'vitest';
import { chainSchedule, occurrenceAt, promptTimes, windowBounds } from './cycle';
import type { ChainOccurrence } from './cycle';
import { defaultSettings } from './schedule';
import type { Settings } from './schedule';

const DATE = '2026-10-01';

function s(): Settings {
  return defaultSettings();
}

function at(h: number, m = 0): number {
  return new Date(
    `${DATE}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
  ).getTime();
}

describe('windowBounds', () => {
  test('returns local window for a visit day', () => {
    const bounds = windowBounds(s(), DATE);
    expect(bounds?.start).toBe(at(9));
    expect(bounds?.end).toBe(at(21));
  });

  test('returns null on a non visit day', () => {
    const custom = s();
    custom.visitDays = [1, 2, 3, 4, 5];
    expect(windowBounds(custom, '2026-10-04')).toBeNull();
  });

  test('window ending before start crosses midnight', () => {
    const settings = s();
    settings.visitStart = 22 * 60;
    settings.visitEnd = 2 * 60;
    const bounds = windowBounds(settings, DATE);
    expect(bounds?.end).toBeGreaterThan(bounds!.start);
  });
});

describe('chainSchedule', () => {
  test('chain starts at window start and chains durations in cycleOrder', () => {
    const occ = chainSchedule(s(), DATE);
    expect(occ[0].kind).toBe('pushups');
    expect(occ[0].start).toBe(at(9));
    expect(occ[0].end).toBe(at(9, 10));
    expect(occ[1].kind).toBe('smoke');
    expect(occ[1].start).toBe(at(9, 10));
    expect(occ[0].cycleIndex).toBe(1);
  });

  test('food time sits where cycleOrder puts it (after dumbbell by default)', () => {
    const occ = chainSchedule(s(), DATE);
    const firstCycle = occ.filter((o) => o.cycleIndex === 1).map((o) => o.kind);
    const foodIdx = firstCycle.indexOf('lunch');
    expect(foodIdx).toBeGreaterThan(firstCycle.indexOf('dumbbell'));
    expect(foodIdx).toBeGreaterThan(-1);
  });

  test('wraps back to pushups with cycleIndex incrementing', () => {
    const occ = chainSchedule(s(), DATE);
    const secondCycle = occ.filter((o) => o.cycleIndex === 2);
    expect(secondCycle[0]?.kind).toBe('pushups');
    const chainMinutes =
      s().template.reduce((sum, k) => sum + s().durations[k], 0) + s().durations.lunch;
    void chainMinutes;
    const firstOfCycle2 = occ.find((o) => o.cycleIndex === 2);
    expect(firstOfCycle2?.start).toBeGreaterThan(occ[0].start);
  });

  test('no occurrence starts at or after the window end; one may straddle it', () => {
    const bounds = windowBounds(s(), DATE)!;
    const occ = chainSchedule(s(), DATE);
    expect(occ.every((o) => o.start < bounds.end)).toBe(true);
    expect(occ.some((o) => o.end > bounds.end)).toBe(true);
    expect(occ.every((o) => o.start >= bounds.start)).toBe(true);
  });

  test('empty schedule on a non visit day', () => {
    const custom = s();
    custom.visitDays = [1, 2, 3, 4, 5];
    expect(chainSchedule(custom, '2026-10-04')).toHaveLength(0);
  });

  test('custom cycleOrder drives the chain order [covers AC-1]', () => {
    const settings = s();
    settings.cycleOrder = ['discussion', 'lunch', 'pushups'];
    const occ = chainSchedule(settings, DATE);
    expect(occ[0].kind).toBe('discussion');
    expect(occ[1].kind).toBe('lunch');
    expect(occ[2].kind).toBe('pushups');
    expect(occ[3].kind).toBe('discussion');
    expect(occ[3].cycleIndex).toBe(2);
  });

  test('cross midnight window schedules past midnight [covers AC-10]', () => {
    const settings = s();
    settings.visitStart = 22 * 60;
    settings.visitEnd = 2 * 60;
    const bounds = windowBounds(settings, DATE)!;
    const occ = chainSchedule(settings, DATE);
    expect(occ.length).toBeGreaterThan(0);
    expect(occ.some((o) => o.end > bounds.end - 60 * 60000)).toBe(true);
    expect(occ.every((o) => o.start < bounds.end)).toBe(true);
  });

  test('occurrence keys are unique per date, cycle, kind', () => {
    const occ = chainSchedule(s(), DATE);
    const keys = occ.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('occurrenceAt', () => {
  const occ: ChainOccurrence[] = [
    { kind: 'pushups', cycleIndex: 1, key: 'd:1:pushups', start: at(9), end: at(9, 10) },
    { kind: 'smoke', cycleIndex: 1, key: 'd:1:smoke', start: at(9, 10), end: at(9, 30) },
  ];

  test('half open intervals: start inclusive, end exclusive', () => {
    expect(occurrenceAt(occ, at(9))?.kind).toBe('pushups');
    expect(occurrenceAt(occ, at(9, 9))?.kind).toBe('pushups');
    expect(occurrenceAt(occ, at(9, 10))?.kind).toBe('smoke');
    expect(occurrenceAt(occ, at(9, 30))).toBeNull();
    expect(occurrenceAt(occ, at(8))).toBeNull();
  });
});

describe('promptTimes', () => {
  function occWith(kind: ChainOccurrence['kind'], start: number, end: number): ChainOccurrence {
    return { kind, cycleIndex: 1, key: `k:${kind}`, start, end };
  }

  test('long activity prompts at end minus 10 and times out at end minus 5', () => {
    const t = promptTimes(occWith('discussion', at(9), at(9, 45)));
    expect(t.openAt).toBe(at(9, 35));
    expect(t.closeAt).toBe(at(9, 40));
  });

  test('activity as short as its lead clamps open to start', () => {
    const t = promptTimes(occWith('pushups', at(9), at(9, 10)));
    expect(t.openAt).toBe(at(9));
    expect(t.closeAt).toBe(at(9, 5));
  });

  test('activities of five minutes or less use the whole window and book at end', () => {
    const t = promptTimes(occWith('recap', at(9), at(9, 5)));
    expect(t.openAt).toBe(at(9));
    expect(t.closeAt).toBe(at(9, 5));
    const t2 = promptTimes(occWith('recap', at(9), at(9, 3)));
    expect(t2.openAt).toBe(at(9));
    expect(t2.closeAt).toBe(at(9, 3));
  });
});
