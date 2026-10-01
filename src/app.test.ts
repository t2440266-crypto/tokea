import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, todayISO } from './app';
import { windowBounds } from './cycle';
import { STORAGE_KEY, defaultPersisted, loadState, saveState } from './store';
import type { StorageLike } from './store';

function memStorage(initial?: Record<string, string>): StorageLike {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

function seeded(entry: object): StorageLike {
  const state = defaultPersisted();
  state.template.days[todayISO()] = entry as (typeof state.template.days)[string];
  const storage = memStorage();
  saveState(storage, state);
  return storage;
}

describe('startBlock', () => {
  test('persists startedId for today under daydriver:v1 [covers AC-1]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    expect(loadState(storage).template.days[todayISO()]?.startedId).toBe('pushups');
    expect(app.state.started['pushups']).toBe(true);
  });

  test('single active: starting another block overwrites the flag [covers AC-3]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.startBlock('smoke');
    expect(loadState(storage).template.days[todayISO()]?.startedId).toBe('smoke');
    expect(Object.keys(app.state.started)).toEqual(['smoke']);
  });

  test('unknown block id is a no-op', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('ghost');
    expect(loadState(storage).template.days[todayISO()]).toBeUndefined();
    expect(Object.keys(app.state.started)).toHaveLength(0);
  });
});

describe('logOutcome', () => {
  test('done on the started block clears startedId [covers AC-2]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.logOutcome('pushups', 'done');
    expect(loadState(storage).template.days[todayISO()]?.startedId).toBeUndefined();
    expect(app.state.started['pushups']).toBeUndefined();
  });

  test('logging a different block leaves the started flag alone', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.logOutcome('smoke', 'skipped');
    expect(loadState(storage).template.days[todayISO()]?.startedId).toBe('pushups');
    expect(app.state.started['pushups']).toBe(true);
  });
});

describe('hydrate on createApp', () => {
  test('restores started state from storage for a block in the plan [covers AC-1]', () => {
    const app = createApp(seeded({ edits: {}, dirty: false, startedId: 'pushups' }));
    expect(app.state.started['pushups']).toBe(true);
  });

  test('stale id not in plan is ignored but retained in storage [covers AC-5]', () => {
    const storage = seeded({ edits: {}, dirty: false, startedId: 'ghost' });
    const app = createApp(storage);
    expect(app.state.started['ghost']).toBeUndefined();
    expect(loadState(storage).template.days[todayISO()]?.startedId).toBe('ghost');
  });

  test('another date flag never seeds todays state [covers AC-4]', () => {
    const state = defaultPersisted();
    state.template.days['2020-01-01'] = { edits: {}, dirty: false, startedId: 'pushups' };
    const storage = memStorage();
    saveState(storage, state);
    const app = createApp(storage);
    expect(Object.keys(app.state.started)).toHaveLength(0);
  });

  test('legacy save without the field loads as not started [covers AC-6]', () => {
    const app = createApp(seeded({ edits: {}, dirty: false }));
    expect(Object.keys(app.state.started)).toHaveLength(0);
  });

  test('key constant stays daydriver:v1', () => {
    expect(STORAGE_KEY).toBe('daydriver:v1');
  });
});

describe('applyOrder [spec 0002]', () => {
  function reversedEffective(app: ReturnType<typeof createApp>): string[] {
    return [...app.plan().blocks]
      .sort((a, b) => a.start - b.start)
      .map((b) => b.id)
      .reverse();
  }

  test('writes full id sequence, clears legacy starts, marks dirty [covers AC-3]', () => {
    const state = defaultPersisted();
    state.template.days[todayISO()] = {
      edits: { starts: { pushups: 600 } },
      dirty: true,
    };
    const storage = memStorage();
    saveState(storage, state);
    const app = createApp(storage);
    const target = reversedEffective(app);
    app.applyOrder(target);
    const day = loadState(storage).template.days[todayISO()];
    expect(day?.edits.order).toEqual(target);
    expect(day?.edits.starts).toBeUndefined();
    expect(day?.dirty).toBe(true);
    expect(app.plan().blocks.map((b) => b.id)).toEqual(target);
  });

  test('unchanged normalized sequence writes nothing [covers AC-4]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    const effective = [...app.plan().blocks].sort((a, b) => a.start - b.start).map((b) => b.id);
    app.applyOrder(effective);
    expect(loadState(storage).template.days[todayISO()]).toBeUndefined();
    expect(app.state.persisted.template.days[todayISO()]).toBeUndefined();
  });

  test('stale ids are dropped and missing ids appended before the no-op check [covers AC-4]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    const effective = [...app.plan().blocks].sort((a, b) => a.start - b.start).map((b) => b.id);
    app.applyOrder(['ghost-id', ...effective.slice(0, -1)]);
    expect(loadState(storage).template.days[todayISO()]).toBeUndefined();
  });

  test('reorder leaves started flag and logs untouched [covers AC-5, AC-7]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.logOutcome('smoke', 'skipped');
    app.applyOrder(reversedEffective(app));
    const persisted = loadState(storage);
    expect(persisted.template.days[todayISO()]?.startedId).toBe('pushups');
    expect(persisted.logs.some((l) => l.blockId === 'smoke' && l.outcome === 'skipped')).toBe(true);
  });
});

describe('moveBlock on order [spec 0002]', () => {
  test('materializes order and double swap restores the original sequence [covers AC-6]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    const original = [...app.plan().blocks].sort((a, b) => a.start - b.start).map((b) => b.id);
    const firstId = original[0];
    app.moveBlock(firstId, 1);
    const afterFirst = app.plan().blocks.map((b) => b.id);
    expect(afterFirst[1]).toBe(firstId);
    expect(loadState(storage).template.days[todayISO()]?.edits.order).toBeDefined();
    app.moveBlock(firstId, -1);
    expect(app.plan().blocks.map((b) => b.id)).toEqual(original);
  });

  test('edge row move writes nothing [covers AC-6]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    const firstId = [...app.plan().blocks].sort((a, b) => a.start - b.start)[0].id;
    app.moveBlock(firstId, -1);
    expect(loadState(storage).template.days[todayISO()]).toBeUndefined();
  });

  test('regenerate clears order edits but keeps the started flag [covers AC-7]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    const reversed = [...app.plan().blocks].map((b) => b.id).reverse();
    app.applyOrder(reversed);
    app.regenDay();
    const day = loadState(storage).template.days[todayISO()];
    expect(day?.edits.order).toBeUndefined();
    expect(day?.dirty).toBe(false);
    expect(day?.startedId).toBe('pushups');
  });
});

describe('DayEntry merge invariant', () => {
  test('extendBlock keeps startedId while changing duration [covers invariant: merge writes]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.extendBlock('pushups');
    const day = loadState(storage).template.days[todayISO()];
    expect(day?.startedId).toBe('pushups');
    expect(day?.edits.durations?.pushups).toBe(15);
  });

  test('setDayNote keeps startedId [covers invariant: merge writes]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.setDayNote('good session');
    const day = loadState(storage).template.days[todayISO()];
    expect(day?.startedId).toBe('pushups');
    expect(day?.note).toBe('good session');
  });

  test('regenerate plan keeps startedId [covers AC-2 exclusion: never cleared by regenerate]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.startBlock('pushups');
    app.extendBlock('pushups');
    app.regenDay();
    const day = loadState(storage).template.days[todayISO()];
    expect(day?.startedId).toBe('pushups');
    expect(Object.keys(day?.edits ?? {})).toHaveLength(0);
  });
});

describe('markVerified [spec 0003]', () => {
  const occ = { kind: 'pushups' as const, cycleIndex: 99 };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T07:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('tick books done and pays one owed fine [covers AC-6]', () => {
    const state = defaultPersisted();
    state.fines = { pushups: 2 };
    const storage = memStorage();
    saveState(storage, state);
    const app = createApp(storage);
    app.markVerified(occ, 'tick');
    const row = loadState(storage).logs.find((l) => l.cycleIndex === 99);
    expect(row?.outcome).toBe('done');
    expect(row?.auto).toBeUndefined();
    expect(loadState(storage).fines.pushups).toBe(1);
  });

  test('x books a fine and never pays [covers AC-6]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.markVerified(occ, 'x');
    const row = loadState(storage).logs.find((l) => l.cycleIndex === 99);
    expect(row?.outcome).toBe('x');
    expect(row?.auto).toBeUndefined();
    expect(loadState(storage).fines.pushups).toBe(1);
  });

  test('timeout booking marks auto true [covers AC-5]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.markVerified({ kind: 'smoke', cycleIndex: 98 }, 'x', { auto: true });
    const row = loadState(storage).logs.find((l) => l.cycleIndex === 98);
    expect(row?.outcome).toBe('x');
    expect(row?.auto).toBe(true);
  });

  test('duplicate verify for the same occurrence is a no-op [covers AC-9]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.markVerified(occ, 'x');
    app.markVerified(occ, 'tick');
    const rows = loadState(storage).logs.filter((l) => l.cycleIndex === 99);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('x');
  });

  test('same day correction flips x to done and removes one fine [covers AC-6]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.markVerified(occ, 'x');
    expect(loadState(storage).fines.pushups).toBe(1);
    app.markVerified(occ, 'tick', { correction: true });
    const row = loadState(storage).logs.find((l) => l.cycleIndex === 99);
    expect(row?.outcome).toBe('done');
    expect(row?.corrected).toBe(true);
    expect(loadState(storage).fines.pushups ?? 0).toBe(0);
  });

  test('fines never go negative and a second correction is a no-op [covers AC-6]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.markVerified({ kind: 'smoke', cycleIndex: 97 }, 'tick');
    expect(loadState(storage).fines.smoke ?? 0).toBe(0);
    app.markVerified({ kind: 'stories', cycleIndex: 96 }, 'x');
    app.markVerified({ kind: 'stories', cycleIndex: 96 }, 'tick', { correction: true });
    app.markVerified({ kind: 'stories', cycleIndex: 96 }, 'tick', { correction: true });
    expect(loadState(storage).fines.stories ?? 0).toBe(0);
    expect(loadState(storage).logs.filter((l) => l.cycleIndex === 96)).toHaveLength(1);
  });
});

describe('fine sessions [spec 0004]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T07:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('start creates a running session with endsAt from the activity duration [covers AC-2]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    const session = app.startFineSession('pushups', 97);
    expect(session).not.toBeNull();
    expect(session!.status).toBe('running');
    expect(session!.id.length).toBeGreaterThan(8);
    expect(session!.endsAt - session!.startedAt).toBe(10 * 60000);
    expect(loadState(storage).fineSessions).toHaveLength(1);
  });

  test('second start is a no-op while one is running [covers AC-7]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    app.startFineSession('pushups', 97);
    app.startFineSession('smoke', 97);
    expect(loadState(storage).fineSessions).toHaveLength(1);
  });

  test('paid flips the row, clears one fine, marks paid [covers AC-3]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    app.markVerified({ kind: 'pushups', cycleIndex: 97 }, 'x');
    expect(loadState(storage).fines.pushups).toBe(1);
    const session = app.startFineSession('pushups', 97)!;
    app.answerSession(session.id, 'paid');
    const row = loadState(storage).logs.find((l) => l.cycleIndex === 97);
    expect(row?.outcome).toBe('done');
    expect(row?.corrected).toBe(true);
    expect(loadState(storage).fines.pushups ?? 0).toBe(0);
    expect(loadState(storage).fineSessions[0].status).toBe('paid');
  });

  test('paid with no row still marks paid and floors the ledger [covers AC-3]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    const session = app.startFineSession('stories', 96)!;
    app.answerSession(session.id, 'paid');
    expect(loadState(storage).fineSessions[0].status).toBe('paid');
    expect(loadState(storage).fines.stories ?? 0).toBe(0);
  });

  test('notdone expires the session and keeps the fine [covers AC-4]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    app.markVerified({ kind: 'smoke', cycleIndex: 95 }, 'x');
    const session = app.startFineSession('smoke', 95)!;
    app.answerSession(session.id, 'notdone');
    expect(loadState(storage).fineSessions[0].status).toBe('expired');
    expect(loadState(storage).fines.smoke).toBe(1);
  });

  test('answer at or past endsAt is rejected [covers AC-4]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    app.markVerified({ kind: 'pushups', cycleIndex: 94 }, 'x');
    const session = app.startFineSession('pushups', 94)!;
    vi.setSystemTime(new Date(session.endsAt + 1000));
    app.state.nowMs = Date.now();
    app.answerSession(session.id, 'paid');
    expect(loadState(storage).fineSessions[0].status).toBe('running');
    expect(loadState(storage).fines.pushups).toBe(1);
  });

  test('expireSessions expires at endsAt; reconcile does the same on boot [covers AC-4, AC-7]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    const session = app.startFineSession('pushups', 93)!;
    vi.setSystemTime(new Date(session.endsAt + 1000));
    app.state.nowMs = Date.now();
    app.expireSessions();
    expect(loadState(storage).fineSessions[0].status).toBe('expired');

    const seeded = defaultPersisted();
    seeded.fineSessions.push({
      id: 'stale-1',
      kind: 'pushups',
      cycleIndex: 92,
      startedAt: Date.now() - 60 * 60000,
      endsAt: Date.now() - 30 * 60000,
      status: 'running',
    });
    const storage2 = memStorage();
    saveState(storage2, seeded);
    createApp(storage2);
    expect(loadState(storage2).fineSessions[0].status).toBe('expired');
  });
});

describe('reconcile [spec 0003]', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('books x with auto for every ended unverified activity, once [covers AC-9]', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    const seededState = defaultPersisted();
    const bounds = windowBounds(seededState.settings, todayISO());
    seededState.engine[todayISO()] = {
      on: true,
      anchorMs: bounds!.start,
      baseEffMs: Date.now(),
      resumeWallMs: Date.now(),
    };
    const storage = memStorage();
    saveState(storage, seededState);
    const app = createApp(storage);
    const ended = loadState(storage).logs.filter((l) => l.auto === true && l.outcome === 'x');
    expect(ended.length).toBeGreaterThan(0);
    expect(ended.some((l) => l.kind === 'pushups' && l.cycleIndex === 1)).toBe(true);
    expect(loadState(storage).fines.pushups).toBeGreaterThan(0);
    const countBefore = loadState(storage).logs.length;
    app.reconcile();
    expect(loadState(storage).logs.length).toBe(countBefore);
  });

  test('does nothing on a non visit day [covers AC-10]', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00'));
    const state = defaultPersisted();
    state.settings.visitDays = [2, 3, 4, 5, 6];
    const storage = memStorage();
    saveState(storage, state);
    createApp(storage);
    expect(loadState(storage).logs.filter((l) => l.auto === true)).toHaveLength(0);
  });
});

describe('engine on off [spec 0005]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T07:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('fresh day: no entry, empty schedule, reconcile books nothing [covers AC-1, AC-3]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    expect(app.engineDay()).toBeNull();
    expect(app.schedule()).toHaveLength(0);
    const before = loadState(storage).logs.length;
    app.reconcile();
    expect(loadState(storage).logs.length).toBe(before);
    expect(Object.keys(loadState(storage).fines)).toHaveLength(0);
  });

  test('first ON creates entry anchored at the ON moment [covers AC-2]', () => {
    const app = createApp(memStorage());
    const ok = app.setEngine(true);
    expect(ok).toBe(true);
    const entry = app.engineDay()!;
    expect(entry.on).toBe(true);
    expect(entry.anchorMs).toBe(Date.now());
    expect(app.schedule()[0].start).toBe(Date.now());
  });

  test('OFF freezes the effective clock [covers AC-3]', () => {
    const app = createApp(memStorage());
    app.setEngine(true);
    app.setEngine(false);
    const frozen = app.state.nowMs;
    const later = Date.now() + 60 * 60000;
    app.tickClock(later);
    expect(app.state.nowMs).toBe(frozen);
    expect(app.engineDay()!.on).toBe(false);
  });

  test('ON resumes from the frozen spot, state survives save and load [covers AC-4]', () => {
    const storage = memStorage();
    const app = createApp(storage);
    app.setEngine(true);
    app.tickClock(Date.now() + 10 * 60000);
    app.setEngine(false);
    const frozen = app.state.nowMs;
    app.tickClock(Date.now() + 60 * 60000);
    app.setEngine(true);
    expect(app.state.nowMs).toBe(frozen);

    const reloaded = createApp(storage);
    expect(reloaded.engineDay()!.on).toBe(true);
    reloaded.tickClock(Date.now() + 120 * 60000);
    expect(reloaded.state.nowMs).toBeGreaterThan(frozen);
  });

  test('OFF is refused while a fine session runs [covers AC-5]', () => {
    const app = createApp(memStorage());
    app.setEngine(true);
    const session = app.startFineSession('pushups', 97);
    expect(session).not.toBeNull();
    expect(app.setEngine(false)).toBe(false);
    expect(app.engineDay()!.on).toBe(true);
    app.answerSession(session!.id, 'paid');
    expect(app.setEngine(false)).toBe(true);
    expect(app.engineDay()!.on).toBe(false);
  });

  test('startFineSession returns null while OFF [covers AC-5]', () => {
    const app = createApp(memStorage());
    expect(app.startFineSession('pushups', 97)).toBeNull();
    app.setEngine(true);
    app.setEngine(false);
    expect(app.startFineSession('pushups', 97)).toBeNull();
  });

  test('reconcile skips occurrences before the anchor [covers AC-2]', () => {
    vi.setSystemTime(new Date('2026-10-01T18:00:00'));
    const storage = memStorage();
    const seededState = defaultPersisted();
    const bounds = windowBounds(seededState.settings, todayISO())!;
    const anchor = bounds.start + 3 * 3600000;
    seededState.engine[todayISO()] = {
      on: true,
      anchorMs: anchor,
      baseEffMs: Date.now(),
      resumeWallMs: Date.now(),
    };
    saveState(storage, seededState);
    createApp(storage);
    const auto = loadState(storage).logs.filter((l) => l.auto === true);
    expect(auto.length).toBeGreaterThan(0);
    const earliest = Math.min(...auto.map((l) => l.plannedStart));
    const anchorMin = new Date(anchor).getHours() * 60 + new Date(anchor).getMinutes();
    expect(earliest).toBeGreaterThanOrEqual(anchorMin);
  });

  test('OFF clears the pay confirm overlay state [covers AC-7]', () => {
    const app = createApp(memStorage());
    app.setEngine(true);
    app.askPayFine('pushups', 5);
    expect(app.state.payConfirm).not.toBeNull();
    app.setEngine(false);
    expect(app.state.payConfirm).toBeNull();
  });
});
