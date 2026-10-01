import { describe, expect, test } from 'vitest';
import { appendHistory, daysBetween, drawTopic } from './topics';
import type { HistoryEntry, Topic } from './topics';
import { SEED_TOPICS } from './seedTopics';

function makeTopics(n: number): Topic[] {
  const categories = ['Systems', 'Health', 'Modern'] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Topic ${i}`,
    category: categories[i % categories.length],
    prompts: ['p1', 'p2'],
    closer: 'c',
  }));
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

describe('drawTopic', () => {
  test('no topic repeats inside the no-repeat window across 100 simulated draws', () => {
    const topics = makeTopics(90);
    let history: HistoryEntry[] = [];
    let date = '2026-01-01';
    for (let i = 0; i < 100; i++) {
      const topic = drawTopic({ topics, history, nowDate: date, noRepeatDays: 30 });
      expect(topic).not.toBeNull();
      const id = topic!.id;
      for (const h of history) {
        const age = daysBetween(h.date, date);
        if (age >= 0 && age < 30) expect(h.topicId).not.toBe(id);
      }
      history = appendHistory(history, id, date);
      date = nextDay(date);
    }
  });

  test('category filter draws only from that category', () => {
    const topics: Topic[] = [
      ...makeTopics(5).map((t) => ({ ...t, category: 'Systems' as const })),
      ...makeTopics(5).map((t, i) => ({ ...t, id: `h${i}`, category: 'Health' as const })),
    ];
    for (let i = 0; i < 20; i++) {
      const topic = drawTopic({
        topics,
        history: [],
        nowDate: '2026-01-01',
        noRepeatDays: 30,
        category: 'Systems',
        allowRepeats: true,
      });
      expect(topic?.category).toBe('Systems');
    }
  });

  test('allowRepeats ignores the window', () => {
    const topics = makeTopics(3);
    const history: HistoryEntry[] = topics.map((t) => ({ topicId: t.id, date: '2026-01-01' }));
    const topic = drawTopic({
      topics,
      history,
      nowDate: '2026-01-01',
      noRepeatDays: 30,
      allowRepeats: true,
    });
    expect(topic).not.toBeNull();
  });

  test('returns null when every candidate sits inside the window', () => {
    const topics = makeTopics(2);
    const history: HistoryEntry[] = topics.map((t) => ({ topicId: t.id, date: '2026-01-01' }));
    const topic = drawTopic({ topics, history, nowDate: '2026-01-01', noRepeatDays: 30 });
    expect(topic).toBeNull();
  });
});

describe('appendHistory', () => {
  test('dedupes same topic on same day', () => {
    let history: HistoryEntry[] = [];
    history = appendHistory(history, 't1', '2026-01-01');
    history = appendHistory(history, 't1', '2026-01-01');
    expect(history).toHaveLength(1);
    history = appendHistory(history, 't1', '2026-01-02');
    expect(history).toHaveLength(2);
  });
});

describe('daysBetween', () => {
  test('counts calendar days across month boundary', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('seed bank', () => {
  test('has at least 80 topics across 11 categories, all with prompts and a closer', () => {
    expect(SEED_TOPICS.length).toBeGreaterThanOrEqual(80);
    const categories = new Set(SEED_TOPICS.map((t) => t.category));
    expect(categories.size).toBe(11);
    for (const topic of SEED_TOPICS) {
      expect(topic.prompts.length).toBeGreaterThanOrEqual(3);
      expect(topic.prompts.length).toBeLessThanOrEqual(5);
      expect(topic.closer.length).toBeGreaterThan(0);
      expect(topic.id.length).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(0);
    }
  });

  test('seed ids are unique', () => {
    const ids = SEED_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
