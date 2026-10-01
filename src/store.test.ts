import { describe, expect, test } from 'vitest';
import { STORAGE_KEY, defaultPersisted, loadState, migrate, saveState } from './store';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
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

describe('loadState', () => {
  test('absent key returns defaults', () => {
    expect(loadState(memStorage())).toEqual(defaultPersisted());
  });

  test('corrupt JSON returns defaults without throwing [covers AC-7]', () => {
    expect(loadState(memStorage({ [STORAGE_KEY]: '{"v":1,' }))).toEqual(defaultPersisted());
  });

  test('wrong shape returns defaults', () => {
    expect(loadState(memStorage({ [STORAGE_KEY]: '{"v":1}' }))).toEqual(defaultPersisted());
    expect(loadState(memStorage({ [STORAGE_KEY]: '"just a string"' }))).toEqual(defaultPersisted());
  });

  test('saved state roundtrips', () => {
    const state = defaultPersisted();
    state.settings.visitEnd = 22 * 60;
    state.settings.durations.smoke = 15;
    state.logs.push({
      date: '2026-09-30',
      blockId: 'pushups',
      kind: 'pushups',
      plannedStart: 540,
      outcome: 'done',
      cycleIndex: 1,
    });
    state.topics.custom.push({
      id: 'c-1',
      title: 'Custom topic',
      category: 'General',
      prompts: ['p1', 'p2', 'p3'],
      closer: 'c?',
    });
    state.topicHistory.push({ topicId: 'mod-attention', date: '2026-09-30' });
    state.savedTopicIds.push('mod-attention');
    state.template.days['2026-09-30'] = { edits: { starts: { discussion: 900 } }, dirty: true };
    state.settings.template = ['discussion', 'stories', 'pushups', 'smoke', 'dumbbell', 'parallel'];
    state.fineSessions.push({
      id: 'sess-1',
      kind: 'pushups',
      cycleIndex: 2,
      startedAt: 1760000000000,
      endsAt: 1760000060000,
      status: 'running',
    });
    state.routine.exercises[0] = { ...state.routine.exercises[0], name: 'Renamed lift', sets: 5 };
    const storage = memStorage();
    saveState(storage, state);
    expect(loadState(storage)).toEqual(state);
  });
});

describe('migrate', () => {
  test('unknown version falls back to defaults', () => {
    expect(migrate({ v: 99, settings: {} })).toEqual(defaultPersisted());
  });

  test('untouched five day default upgrades to all seven days', () => {
    const result = migrate({
      v: 1,
      settings: { visitDays: [1, 2, 3, 4, 5] },
      template: { days: {} },
      routine: { exercises: [] },
      topics: { seedMeta: { version: 1 }, custom: [] },
      topicHistory: [],
      logs: [],
    });
    expect(result.settings.visitDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('customized day set is never touched by the upgrade', () => {
    const result = migrate({
      v: 1,
      settings: { visitDays: [1, 3] },
      template: { days: {} },
      routine: { exercises: [] },
      topics: { seedMeta: { version: 1 }, custom: [] },
      topicHistory: [],
      logs: [],
    });
    expect(result.settings.visitDays).toEqual([1, 3]);
  });

  test('v1 with missing additive fields fills them from defaults [covers AC-6]', () => {
    const minimal = {
      v: 1,
      settings: { visitEnd: 20 * 60 },
      template: { days: {} },
      routine: { exercises: [] },
      topics: { seedMeta: { version: 1 }, custom: [] },
      topicHistory: [],
      logs: [],
    };
    const result = migrate(minimal);
    expect(result.settings.visitEnd).toBe(20 * 60);
    expect(result.settings.durations.lunch).toBe(defaultPersisted().settings.durations.lunch);
    expect(result.savedTopicIds).toEqual([]);
  });
});

describe('engine map [spec 0005]', () => {
  test('defaults to an empty map', () => {
    expect(defaultPersisted().engine).toEqual({});
  });

  test('legacy save without the key loads as empty [covers AC-1]', () => {
    const raw = JSON.parse(JSON.stringify(defaultPersisted())) as Record<string, unknown>;
    delete raw.engine;
    const loaded = migrate(raw);
    expect(loaded.engine).toEqual({});
  });

  test('invalid engine entries are dropped, valid ones kept', () => {
    const raw = JSON.parse(JSON.stringify(defaultPersisted())) as Record<string, unknown>;
    raw.engine = {
      '2026-10-01': { on: true, anchorMs: 1, baseEffMs: 2, resumeWallMs: 3 },
      '2026-10-02': { on: 'yes' },
      bad: 7,
    };
    const loaded = migrate(raw);
    expect(Object.keys(loaded.engine)).toEqual(['2026-10-01']);
    expect(loaded.engine['2026-10-01'].on).toBe(true);
  });

  test('engine entries roundtrip through save and load', () => {
    const storage = memStorage();
    const state = defaultPersisted();
    state.engine['2026-10-01'] = { on: false, anchorMs: 10, baseEffMs: 20, resumeWallMs: 30 };
    saveState(storage, state);
    expect(loadState(storage).engine['2026-10-01']).toEqual({
      on: false,
      anchorMs: 10,
      baseEffMs: 20,
      resumeWallMs: 30,
    });
  });

  test('entries older than 30 days are pruned on write', () => {
    const storage = memStorage();
    const state = defaultPersisted();
    state.engine['2000-01-01'] = { on: true, anchorMs: 1, baseEffMs: 1, resumeWallMs: 1 };
    state.engine[todayKey()] = { on: true, anchorMs: 2, baseEffMs: 2, resumeWallMs: 2 };
    saveState(storage, state);
    const loaded = loadState(storage);
    expect(loaded.engine['2000-01-01']).toBeUndefined();
    expect(loaded.engine[todayKey()]).toBeDefined();
  });
});
