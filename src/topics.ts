export type Category =
  | 'Modern'
  | 'Power'
  | 'Manipulation'
  | 'Government'
  | 'Relationships'
  | 'Health'
  | 'Time Management'
  | 'Philosophy'
  | 'Systems'
  | 'General'
  | 'Stories';

export interface Topic {
  id: string;
  title: string;
  category: Category;
  prompts: string[];
  closer: string;
}

export interface HistoryEntry {
  topicId: string;
  date: string;
}

export interface DrawOptions {
  topics: Topic[];
  history: HistoryEntry[];
  nowDate: string;
  noRepeatDays: number;
  category?: Category | 'all';
  allowRepeats?: boolean;
}

function toDays(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function daysBetween(from: string, to: string): number {
  return toDays(to) - toDays(from);
}

export function appendHistory(history: HistoryEntry[], topicId: string, date: string): HistoryEntry[] {
  const last = history[history.length - 1];
  if (last && last.topicId === topicId && last.date === date) return history;
  return [...history, { topicId, date }];
}

export function drawTopic(opts: DrawOptions): Topic | null {
  const { topics, history, nowDate, noRepeatDays, category = 'all', allowRepeats = false } = opts;
  let pool = category === 'all' ? topics : topics.filter((t) => t.category === category);
  if (!allowRepeats) {
    const banned = new Set(
      history
        .filter((h) => {
          const age = daysBetween(h.date, nowDate);
          return age >= 0 && age < noRepeatDays;
        })
        .map((h) => h.topicId),
    );
    pool = pool.filter((t) => !banned.has(t.id));
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
