import { describe, expect, test } from 'vitest';
import {
  chainSchedule,
  engineEffNow,
  occurrenceAt,
  promptTimes,
  sessionsForDate,
  windowBounds,
} from './cycle';
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

describe('penalty adjusted schedule [spec 0004]', () => {
  const session = (startedAt: number, endsAt: number) => ({ startedAt, endsAt });

  test('occurrence overlapping a session gains 25 minutes and later starts shift [covers AC-5]', () => {
    const settings = s();
    const sessions = [session(at(9, 5), at(9, 15))];
    const occ = chainSchedule(settings, DATE, sessions);
    expect(occ[0].kind).toBe('pushups');
    expect(occ[0].end - occ[0].start).toBe(35 * 60000);
    expect(occ[0].end).toBe(at(9, 35));
    expect(occ[1].kind).toBe('smoke');
    expect(occ[1].start).toBe(at(9, 35));
  });

  test('two overlapping sessions stack to plus 50 [covers AC-5]', () => {
    const settings = s();
    const sessions = [session(at(9, 5), at(9, 15)), session(at(9, 7), at(9, 12))];
    const occ = chainSchedule(settings, DATE, sessions);
    expect(occ[0].end - occ[0].start).toBe(60 * 60000);
    expect(occ[1].start).toBe(at(10));
  });

  test('session outside the window changes nothing [covers AC-5]', () => {
    const base = chainSchedule(s(), DATE);
    const withFar = chainSchedule(s(), DATE, [session(at(22), at(23))]);
    expect(withFar.map((o) => o.start)).toEqual(base.map((o) => o.start));
    expect(withFar.map((o) => o.end)).toEqual(base.map((o) => o.end));
  });

  test('no sessions keeps spec 0003 output identical', () => {
    const base = chainSchedule(s(), DATE);
    const none = chainSchedule(s(), DATE, []);
    expect(none).toEqual(base);
  });

  test('sessionsForDate keeps only sessions started on that date [covers AC-5]', () => {
    const sameDay = {
      id: 'a',
      kind: 'pushups' as const,
      cycleIndex: 1,
      startedAt: at(9),
      endsAt: at(9, 10),
      status: 'running' as const,
    };
    const otherDay = {
      id: 'b',
      kind: 'smoke' as const,
      cycleIndex: 1,
      startedAt: at(9) + 86400000,
      endsAt: at(9, 10) + 86400000,
      status: 'paid' as const,
    };
    expect(sessionsForDate([sameDay, otherDay], DATE)).toHaveLength(1);
    expect(sessionsForDate([sameDay, otherDay], DATE)[0].id).toBe('a');
    expect(sessionsForDate([sameDay, otherDay], '2026-10-02')).toHaveLength(1);
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

describe('anchor [spec 0005]', () => {
  test('cursor starts at anchorMs, not window start [covers AC-2]', () => {
    const bounds = windowBounds(s(), DATE)!;
    const anchor = bounds.start + 3 * 3600000;
    const occ = chainSchedule(s(), DATE, [], anchor);
    expect(occ[0].start).toBe(anchor);
    expect(occ[0].kind).toBe(s().cycleOrder[0]);
  });

  test('anchor before visitStart starts immediately [covers AC-8]', () => {
    const bounds = windowBounds(s(), DATE)!;
    const anchor = bounds.start - 90 * 60000;
    const occ = chainSchedule(s(), DATE, [], anchor);
    expect(occ[0].start).toBe(anchor);
  });

  test('anchor at or past window end yields empty chain [covers AC-6]', () => {
    const bounds = windowBounds(s(), DATE)!;
    expect(chainSchedule(s(), DATE, [], bounds.end)).toHaveLength(0);
    expect(chainSchedule(s(), DATE, [], bounds.end + 60000)).toHaveLength(0);
  });

  test('non visit day stays empty with an anchor [covers AC-6]', () => {
    const custom = s();
    custom.visitDays = [1, 2, 3, 4, 5];
    expect(chainSchedule(custom, '2026-10-04', [], 1760000000000)).toHaveLength(0);
  });
});

describe('engineEffNow [spec 0005]', () => {
  const wall = 1760000000000;

  test('no entry returns wall time', () => {
    expect(engineEffNow(null, wall, 0)).toBe(wall);
  });

  test('OFF holds the frozen base [covers AC-3]', () => {
    const entry = { on: false, anchorMs: wall, baseEffMs: wall - 600000, resumeWallMs: wall };
    expect(engineEffNow(entry, wall + 999999, 0)).toBe(wall - 600000);
  });

  test('ON advances with wall from resume [covers AC-4]', () => {
    const entry = { on: true, anchorMs: wall, baseEffMs: wall - 600000, resumeWallMs: wall };
    expect(engineEffNow(entry, wall + 300000, wall - 600000)).toBe(wall - 300000);
  });

  test('never rewinds below last seen or base [covers AC-4]', () => {
    const entry = { on: true, anchorMs: wall, baseEffMs: wall, resumeWallMs: wall + 5000 };
    const last = wall + 10000;
    expect(engineEffNow(entry, wall, last)).toBe(last);
    expect(engineEffNow(entry, wall, 0)).toBe(wall);
  });
});
