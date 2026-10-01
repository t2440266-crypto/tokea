import { isVisitDay } from './schedule';
import type { BlockKind, Settings } from './schedule';

export const PENALTY_MIN = 25;

export interface ChainOccurrence {
  kind: BlockKind;
  cycleIndex: number;
  key: string;
  start: number;
  end: number;
}

export interface FineSession {
  id: string;
  kind: BlockKind;
  cycleIndex: number;
  startedAt: number;
  endsAt: number;
  status: 'running' | 'paid' | 'expired';
}

export type SessionWindow = Pick<FineSession, 'startedAt' | 'endsAt'>;

export interface EngineDay {
  on: boolean;
  anchorMs: number;
  baseEffMs: number;
  resumeWallMs: number;
}

export function engineEffNow(entry: EngineDay | null, wallMs: number, lastEffMs: number): number {
  if (!entry) return wallMs;
  if (!entry.on) return entry.baseEffMs;
  return Math.max(lastEffMs, entry.baseEffMs + (wallMs - entry.resumeWallMs), entry.baseEffMs);
}

export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sessionsForDate(sessions: FineSession[], date: string): FineSession[] {
  return sessions.filter((s) => localDateKey(s.startedAt) === date);
}

function overlapCount(sessions: SessionWindow[], start: number, end: number): number {
  let n = 0;
  for (const s of sessions) {
    if (s.startedAt < end && s.endsAt > start) n += 1;
  }
  return n;
}

function localAt(date: string, minutes: number, dayOffset = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + dayOffset, 0, 0, 0, 0).getTime() + minutes * 60000;
}

export function windowBounds(
  settings: Settings,
  date: string,
): { start: number; end: number } | null {
  if (!isVisitDay(settings, date)) return null;
  const start = localAt(date, settings.visitStart);
  const crossesMidnight = settings.visitEnd <= settings.visitStart;
  const end = localAt(date, settings.visitEnd, crossesMidnight ? 1 : 0);
  return { start, end };
}

export function chainSchedule(
  settings: Settings,
  date: string,
  sessions: SessionWindow[] = [],
  anchorMs?: number,
): ChainOccurrence[] {
  const bounds = windowBounds(settings, date);
  if (!bounds) return [];
  const order = [...new Set(settings.cycleOrder)].filter(
    (kind) => Number.isFinite(settings.durations[kind]) && settings.durations[kind] > 0,
  );
  if (order.length === 0) return [];
  const occ: ChainOccurrence[] = [];
  let cursor = anchorMs ?? bounds.start;
  let index = 0;
  let cycle = 1;
  while (cursor < bounds.end) {
    const kind = order[index];
    const baseMs = settings.durations[kind] * 60000;
    const penaltyMs = overlapCount(sessions, cursor, cursor + baseMs) * PENALTY_MIN * 60000;
    const durationMs = baseMs + penaltyMs;
    occ.push({
      kind,
      cycleIndex: cycle,
      key: `${date}:${cycle}:${kind}`,
      start: cursor,
      end: cursor + durationMs,
    });
    cursor += durationMs;
    index += 1;
    if (index === order.length) {
      index = 0;
      cycle += 1;
    }
  }
  return occ;
}

export function occurrenceAt(schedule: ChainOccurrence[], now: number): ChainOccurrence | null {
  for (const occ of schedule) {
    if (now >= occ.start && now < occ.end) return occ;
  }
  return null;
}

export function promptTimes(occ: ChainOccurrence): { openAt: number; closeAt: number } {
  const durationMs = occ.end - occ.start;
  if (durationMs <= 5 * 60000) {
    return { openAt: occ.start, closeAt: occ.end };
  }
  return {
    openAt: Math.max(occ.start, occ.end - 10 * 60000),
    closeAt: Math.max(occ.start, occ.end - 5 * 60000),
  };
}
