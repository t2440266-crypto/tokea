import { applyEdits, defaultSettings, generatePlan, isVisitDay } from './schedule';
import type { BlockKind, LogEntry, Plan, Settings } from './schedule';
import { chainSchedule } from './cycle';
import type { ChainOccurrence } from './cycle';
import { loadState, saveState, defaultPersisted } from './store';
import type { Persisted, StorageLike } from './store';
import { SEED_TOPICS } from './seedTopics';
import { appendHistory, drawTopic } from './topics';
import type { Category, HistoryEntry, Topic } from './topics';

export type View = 'today' | 'topics' | 'routine' | 'week' | 'more' | 'recap' | 'settings';

export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function minutesNow(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export interface AppCtx {
  state: {
    persisted: Persisted;
    view: View;
    now: number;
    nowMs: number;
    date: string;
    started: Record<string, true>;
    topicFilter: Category | 'all';
    allowRepeats: boolean;
    activeTopicId: string | null;
    recapDate: string | null;
  };
  subscribe(fn: () => void): () => void;
  emit(): void;
  setView(v: View): void;
  plan(): Plan;
  allTopics(): Topic[];
  topicById(id: string): Topic | undefined;
  todayLogs(): LogEntry[];
  doneIds(): string[];
  ensureDailyDraw(): void;
  drawNow(cat?: Category | 'all'): Topic | null;
  logOutcome(blockId: string, outcome: 'done' | 'skipped', note?: string): void;
  setLogNote(blockId: string, note: string): void;
  startBlock(id: string): void;
  applyOrder(idList: string[]): void;
  markVerified(
    occ: Pick<ChainOccurrence, 'kind' | 'cycleIndex'>,
    result: 'tick' | 'x',
    opts?: { correction?: boolean; auto?: boolean },
  ): void;
  reconcile(): void;
  schedule(): ChainOccurrence[];
  fines(): Record<string, number>;
  extendBlock(id: string): void;
  moveBlock(id: string, dir: -1 | 1): void;
  regenDay(): void;
  isDirty(): boolean;
  setDayNote(note: string): void;
  dayNote(): string;
  topicDone(id: string): void;
  topicSave(id: string): void;
  topicDiscuss(id: string): void;
  upsertTopic(topic: Topic): void;
  deleteTopic(id: string): void;
  updateSettings(
    patch: Partial<Omit<Settings, 'durations'>> & { durations?: Partial<Settings['durations']> },
  ): void;
  updateRoutine(routine: Persisted['routine']): void;
  exportData(): void;
  resetData(): void;
}

export function createApp(rootStorage: StorageLike, opts?: { nowMs?: number }): AppCtx {
  const persisted = loadState(rootStorage);
  const listeners = new Set<() => void>();

  const state: AppCtx['state'] = {
    persisted,
    view: 'today',
    now: minutesNow(),
    nowMs: opts?.nowMs ?? Date.now(),
    date: todayISO(),
    started: {},
    topicFilter: 'all',
    allowRepeats: false,
    activeTopicId: null,
    recapDate: null,
  };

  function emit(): void {
    saveState(rootStorage, persisted);
    listeners.forEach((fn) => fn());
  }

  function ensureDay() {
    if (!persisted.template.days[state.date]) {
      persisted.template.days[state.date] = { edits: {}, dirty: false };
    }
    return persisted.template.days[state.date];
  }

  function hydrateStarted(): void {
    const storedId = persisted.template.days[state.date]?.startedId;
    if (!storedId) return;
    if (plan().blocks.some((b) => b.id === storedId)) state.started[storedId] = true;
  }

  function plan(): Plan {
    const day = persisted.template.days[state.date];
    const base = generatePlan(persisted.settings, state.date);
    return day && Object.keys(day.edits).length > 0 ? applyEdits(base, day.edits) : base;
  }

  function allTopics(): Topic[] {
    const map = new Map<string, Topic>();
    for (const t of SEED_TOPICS) map.set(t.id, t);
    for (const t of persisted.topics.custom) map.set(t.id, t);
    return [...map.values()];
  }

  function topicById(id: string): Topic | undefined {
    return allTopics().find((t) => t.id === id);
  }

  function todayLogs(): LogEntry[] {
    return persisted.logs.filter((l) => l.date === state.date);
  }

  function doneIds(): string[] {
    return todayLogs().map((l) => l.blockId);
  }

  function drawNow(cat: Category | 'all' = state.topicFilter): Topic | null {
    const pool = allTopics().filter((t) => (cat === 'all' ? true : t.category === cat));
    const topic = drawTopic({
      topics: pool,
      history: persisted.topicHistory,
      nowDate: state.date,
      noRepeatDays: persisted.settings.noRepeatDays,
      allowRepeats: state.allowRepeats,
    });
    if (!topic) return null;
    persisted.topicHistory = appendHistory(persisted.topicHistory, topic.id, state.date);
    state.activeTopicId = topic.id;
    emit();
    return topic;
  }

  function ensureDailyDraw(): void {
    if (!isVisitDay(persisted.settings, state.date)) return;
    const todayDraws = persisted.topicHistory.filter((h) => h.date === state.date);
    const deepDraw = [...todayDraws]
      .reverse()
      .find((h) => topicById(h.topicId)?.category !== 'Stories');
    if (deepDraw) {
      state.activeTopicId = deepDraw.topicId;
      return;
    }
    const pool = allTopics().filter((t) => t.category !== 'Stories');
    const topic = drawTopic({
      topics: pool,
      history: persisted.topicHistory,
      nowDate: state.date,
      noRepeatDays: persisted.settings.noRepeatDays,
      allowRepeats: false,
    });
    if (topic) {
      persisted.topicHistory = appendHistory(persisted.topicHistory, topic.id, state.date);
      state.activeTopicId = topic.id;
      emit();
    }
  }

  function logOutcome(blockId: string, outcome: 'done' | 'skipped', note?: string): void {
    const block = plan().blocks.find((b) => b.id === blockId);
    if (!block) return;
    persisted.logs = persisted.logs.filter(
      (l) => !(l.date === state.date && l.blockId === blockId),
    );
    const entry: LogEntry = {
      date: state.date,
      blockId,
      kind: block.kind,
      plannedStart: block.start,
      outcome,
      cycleIndex: 1,
    };
    if (note) entry.note = note;
    persisted.logs.push(entry);
    const day = ensureDay();
    if (day.startedId === blockId) delete day.startedId;
    delete state.started[blockId];
    emit();
  }

  function findRow(date: string, cycleIndex: number, kind: BlockKind): LogEntry | undefined {
    return persisted.logs.find(
      (l) => l.date === date && l.cycleIndex === cycleIndex && l.kind === kind,
    );
  }

  function toLocalMinutes(ms: number): number {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }

  function markVerified(
    occ: Pick<ChainOccurrence, 'kind' | 'cycleIndex'>,
    result: 'tick' | 'x',
    opts?: { correction?: boolean; auto?: boolean },
  ): void {
    const existing = findRow(state.date, occ.cycleIndex, occ.kind);
    if (opts?.correction) {
      if (!existing || existing.outcome !== 'x') return;
      existing.outcome = 'done';
      existing.corrected = true;
      if ((persisted.fines[occ.kind] ?? 0) > 0) {
        persisted.fines[occ.kind] = persisted.fines[occ.kind] - 1;
      }
      emit();
      return;
    }
    if (existing) return;
    const occurrence = chainSchedule(persisted.settings, state.date).find(
      (o) => o.cycleIndex === occ.cycleIndex && o.kind === occ.kind,
    );
    const entry: LogEntry = {
      date: state.date,
      blockId: occ.kind,
      kind: occ.kind,
      plannedStart: occurrence ? toLocalMinutes(occurrence.start) : 0,
      outcome: result === 'tick' ? 'done' : 'x',
      cycleIndex: occ.cycleIndex,
    };
    if (result === 'x') {
      if (opts?.auto === true) entry.auto = true;
      persisted.fines[occ.kind] = (persisted.fines[occ.kind] ?? 0) + 1;
    } else if ((persisted.fines[occ.kind] ?? 0) > 0) {
      persisted.fines[occ.kind] = persisted.fines[occ.kind] - 1;
    }
    persisted.logs.push(entry);
    emit();
  }

  function reconcile(): void {
    const nowMs = state.nowMs;
    const daySchedule = chainSchedule(persisted.settings, state.date);
    let changed = false;
    for (const occ of daySchedule) {
      if (occ.end > nowMs) continue;
      if (findRow(state.date, occ.cycleIndex, occ.kind)) continue;
      persisted.logs.push({
        date: state.date,
        blockId: occ.kind,
        kind: occ.kind,
        plannedStart: toLocalMinutes(occ.start),
        outcome: 'x',
        cycleIndex: occ.cycleIndex,
        auto: true,
      });
      persisted.fines[occ.kind] = (persisted.fines[occ.kind] ?? 0) + 1;
      changed = true;
    }
    if (changed) emit();
  }

  function schedule(): ChainOccurrence[] {
    return chainSchedule(persisted.settings, state.date);
  }

  function fines(): Record<string, number> {
    return persisted.fines;
  }

  function setLogNote(blockId: string, note: string): void {
    const log = persisted.logs.find((l) => l.date === state.date && l.blockId === blockId);
    if (!log) return;
    log.note = note;
    emit();
  }

  function extendBlock(id: string): void {
    const current = plan().blocks.find((b) => b.id === id);
    if (!current) return;
    const day = ensureDay();
    day.edits.durations = { ...(day.edits.durations ?? {}), [id]: current.duration + 5 };
    day.dirty = true;
    emit();
  }

  function effectiveSequence(): string[] {
    return plan().blocks.map((b) => b.id);
  }

  function applyOrder(idList: string[]): void {
    const planIds = new Set(plan().blocks.map((b) => b.id));
    const cleaned = idList.filter((id) => planIds.has(id));
    for (const id of effectiveSequence()) {
      if (!cleaned.includes(id)) cleaned.push(id);
    }
    const current = effectiveSequence();
    if (cleaned.length === current.length && cleaned.every((id, i) => id === current[i])) return;
    const day = ensureDay();
    day.edits.order = cleaned;
    delete day.edits.starts;
    day.dirty = true;
    emit();
  }

  function moveBlock(id: string, dir: -1 | 1): void {
    const seq = effectiveSequence();
    const i = seq.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= seq.length) return;
    [seq[i], seq[j]] = [seq[j], seq[i]];
    const day = ensureDay();
    day.edits.order = seq;
    delete day.edits.starts;
    day.dirty = true;
    emit();
  }

  function regenDay(): void {
    const day = persisted.template.days[state.date];
    if (!day) return;
    day.edits = {};
    day.dirty = false;
    emit();
  }

  function updateSettings(
    patch: Partial<Omit<Settings, 'durations'>> & { durations?: Partial<Settings['durations']> },
  ): void {
    const { durations, ...rest } = patch;
    const next: Settings = { ...persisted.settings, ...rest };
    if (durations) next.durations = { ...persisted.settings.durations, ...durations };
    persisted.settings = next;
    emit();
  }

  hydrateStarted();
  reconcile();

  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit,
    setView(v) {
      state.view = v;
      emit();
    },
    plan,
    allTopics,
    topicById,
    todayLogs,
    doneIds,
    ensureDailyDraw,
    drawNow,
    logOutcome,
    setLogNote,
    startBlock(id) {
      if (!plan().blocks.some((b) => b.id === id)) return;
      ensureDay().startedId = id;
      state.started = { [id]: true };
      emit();
    },
    extendBlock,
    applyOrder,
    markVerified,
    reconcile,
    schedule,
    fines,
    moveBlock,
    regenDay,
    isDirty() {
      return persisted.template.days[state.date]?.dirty === true;
    },
    setDayNote(note) {
      ensureDay().note = note;
      emit();
    },
    dayNote() {
      return persisted.template.days[state.date]?.note ?? '';
    },
    topicDone(id) {
      persisted.topicHistory = appendHistory(persisted.topicHistory, id, state.date);
      if (state.activeTopicId === id) state.activeTopicId = null;
      emit();
    },
    topicSave(id) {
      const set = new Set(persisted.savedTopicIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      persisted.savedTopicIds = [...set];
      emit();
    },
    topicDiscuss(id) {
      state.activeTopicId = id;
      emit();
    },
    upsertTopic(topic) {
      const idx = persisted.topics.custom.findIndex((t) => t.id === topic.id);
      if (idx >= 0) persisted.topics.custom[idx] = topic;
      else persisted.topics.custom.push(topic);
      emit();
    },
    deleteTopic(id) {
      persisted.topics.custom = persisted.topics.custom.filter((t) => t.id !== id);
      emit();
    },
    updateSettings,
    updateRoutine(routine) {
      persisted.routine = routine;
      emit();
    },
    exportData() {
      const blob = new Blob([JSON.stringify(persisted, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tokea-${state.date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    resetData() {
      const fresh = defaultPersisted();
      Object.keys(persisted).forEach(
        (k) => delete (persisted as unknown as Record<string, unknown>)[k],
      );
      Object.assign(persisted, fresh);
      state.started = {};
      state.activeTopicId = null;
      emit();
    },
  };
}

export { defaultSettings, isVisitDay };
export type { Category, HistoryEntry, Topic };
