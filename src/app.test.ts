import { describe, expect, test } from 'vitest';
import { createApp, todayISO } from './app';
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
    return [...app.plan().blocks].sort((a, b) => a.start - b.start).map((b) => b.id).reverse();
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
