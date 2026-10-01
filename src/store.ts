import { defaultSettings } from './schedule';
import type { BlockKind, DayEdits, LogEntry, Settings } from './schedule';
import { defaultRoutine } from './routine';
import type { Routine } from './routine';
import type { FineSession } from './cycle';
import type { HistoryEntry, Topic } from './topics';

export const STORAGE_KEY = 'daydriver:v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Persisted {
  v: 1;
  settings: Settings;
  template: {
    days: Record<string, { edits: DayEdits; dirty: boolean; note?: string; startedId?: string }>;
  };
  routine: Routine;
  topics: { seedMeta: { version: number }; custom: Topic[] };
  topicHistory: HistoryEntry[];
  logs: LogEntry[];
  savedTopicIds: string[];
  fines: Record<string, number>;
  fineSessions: FineSession[];
}

export function defaultPersisted(): Persisted {
  return {
    v: 1,
    settings: defaultSettings(),
    template: { days: {} },
    routine: defaultRoutine(),
    topics: { seedMeta: { version: 1 }, custom: [] },
    topicHistory: [],
    logs: [],
    savedTopicIds: [],
    fines: {},
    fineSessions: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrate(raw: unknown): Persisted {
  const defaults = defaultPersisted();
  if (!isRecord(raw)) return defaults;
  if (raw.v !== 1) return defaults;
  if (
    !isRecord(raw.settings) ||
    !isRecord(raw.template) ||
    !isRecord(raw.routine) ||
    !isRecord(raw.topics) ||
    !Array.isArray(raw.topicHistory) ||
    !Array.isArray(raw.logs)
  ) {
    return defaults;
  }
  const settingsIn = raw.settings as Record<string, unknown>;
  const topicsIn = raw.topics as Record<string, unknown>;
  return {
    v: 1,
    settings: {
      ...defaults.settings,
      ...settingsIn,
      durations: {
        ...defaults.settings.durations,
        ...(isRecord(settingsIn.durations)
          ? (settingsIn.durations as Partial<Record<BlockKind, number>>)
          : {}),
      },
      pushups: isRecord(settingsIn.pushups)
        ? { ...defaults.settings.pushups, ...settingsIn.pushups }
        : defaults.settings.pushups,
      lunchWindow:
        Array.isArray(settingsIn.lunchWindow) && settingsIn.lunchWindow.length === 2
          ? [Number(settingsIn.lunchWindow[0]), Number(settingsIn.lunchWindow[1])]
          : defaults.settings.lunchWindow,
      template: Array.isArray(settingsIn.template)
        ? (settingsIn.template as BlockKind[])
        : defaults.settings.template,
      visitDays: (() => {
        const stored = settingsIn.visitDays;
        if (!Array.isArray(stored)) return defaults.settings.visitDays;
        const oldDefault = stored.length === 5 && [1, 2, 3, 4, 5].every((n, i) => stored[i] === n);
        return oldDefault ? [0, 1, 2, 3, 4, 5, 6] : (stored as number[]);
      })(),
    },
    template: {
      days: isRecord(raw.template.days) ? (raw.template.days as Persisted['template']['days']) : {},
    },
    routine: Array.isArray(raw.routine.exercises)
      ? (raw.routine as unknown as Routine)
      : defaults.routine,
    topics: {
      seedMeta: isRecord(topicsIn.seedMeta)
        ? { version: Number(topicsIn.seedMeta.version) || 1 }
        : defaults.topics.seedMeta,
      custom: Array.isArray(topicsIn.custom) ? (topicsIn.custom as Topic[]) : [],
    },
    topicHistory: raw.topicHistory as HistoryEntry[],
    logs: raw.logs as LogEntry[],
    savedTopicIds: Array.isArray(raw.savedTopicIds) ? (raw.savedTopicIds as string[]) : [],
    fines: isRecord(raw.fines) ? (raw.fines as Record<string, number>) : {},
    fineSessions: Array.isArray(raw.fineSessions) ? (raw.fineSessions as FineSession[]) : [],
  };
}

export function loadState(storage: StorageLike): Persisted {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return defaultPersisted();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultPersisted();
  }
}

export function saveState(storage: StorageLike, state: Persisted): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
