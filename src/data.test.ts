import { describe, expect, it } from 'vitest';
import { applyArticleStatus, decryptJson, draftFromQueueItem, encryptJson, isEncryptedEnvelope, reorderQueue, upsertArticle, type Article, type QueueItem } from './data';

const baseArticle: Article = {
  id: 'a-1',
  title: 'Existing article',
  url: 'https://example.com/a',
  source: 'Example',
  foundAt: '2026-06-10T08:00:00Z',
  publishedAt: '',
  summary: 'Existing summary',
  suggestedAngle: 'Existing angle',
  themes: ['responsible-ai'],
  lane: 'governance',
  status: 'new',
  agentScore: 80,
  userRating: null,
  notes: '',
  sourceQuality: 4,
  timeliness: 4,
  audienceFit: 4,
  practicalValue: 4,
  originality: 3,
  sourceLinks: ['https://example.com/a'],
};

const queue: QueueItem[] = [
  { id: 'q-1', articleIds: ['a-1'], workingTitle: 'First', angle: 'Angle one', status: 'ideas', priority: 1, plannedFor: null, postType: 'short post', notes: '', createdAt: '2026-06-01' },
  { id: 'q-2', articleIds: [], workingTitle: 'Second', angle: 'Angle two', status: 'ideas', priority: 2, plannedFor: null, postType: 'short post', notes: '', createdAt: '2026-06-01' },
];

describe('encrypted dashboard data', () => {
  it('round-trips JSON with AES-GCM envelopes', async () => {
    const envelope = await encryptJson([{ id: 'a-1', title: 'Private candidate' }], 'correct horse battery staple', 1_000);
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    await expect(decryptJson(envelope, 'wrong passphrase')).rejects.toThrow(/decrypt/i);
    await expect(decryptJson(envelope, 'correct horse battery staple')).resolves.toEqual([{ id: 'a-1', title: 'Private candidate' }]);
  });
});

describe('article upsert', () => {
  it('adds new candidates and preserves existing review fields on duplicate URLs', () => {
    const reviewed = { ...baseArticle, status: 'shortlisted' as const, userRating: 5, notes: 'Keep this one' };
    const inserted = upsertArticle([reviewed], { title: 'New article', url: 'https://example.com/new' });
    expect(inserted[0].title).toBe('New article');
    const deduped = upsertArticle([reviewed], { title: 'Updated article', url: 'https://example.com/a', summary: 'New scout summary' });
    expect(deduped).toHaveLength(1);
    expect(deduped[0].status).toBe('shortlisted');
    expect(deduped[0].userRating).toBe(5);
    expect(deduped[0].notes).toBe('Keep this one');
    expect(deduped[0].summary).toBe('New scout summary');
  });
});

describe('article status workflow', () => {
  it('creates a future-pile queue item when an article is marked queued', () => {
    const result = applyArticleStatus({ articles: [baseArticle], queue: [] }, 'a-1', 'queued');
    expect(result.articles[0].status).toBe('queued');
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]).toMatchObject({
      articleIds: ['a-1'],
      workingTitle: baseArticle.title,
      angle: baseArticle.suggestedAngle,
      priority: 1,
      status: 'selected',
    });
  });

  it('does not duplicate an existing queue item for the same article', () => {
    const existingQueue: QueueItem[] = [{ ...queue[0], articleIds: ['a-1'] }];
    const result = applyArticleStatus({ articles: [baseArticle], queue: existingQueue }, 'a-1', 'queued');
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].id).toBe(existingQueue[0].id);
  });

  it('removes auto-created queue items when an article leaves queued status', () => {
    const queued = applyArticleStatus({ articles: [baseArticle], queue: [] }, 'a-1', 'queued');
    const result = applyArticleStatus(queued, 'a-1', 'shortlisted');
    expect(result.articles[0].status).toBe('shortlisted');
    expect(result.queue).toHaveLength(0);
  });
});

describe('queue workflow helpers', () => {
  it('reorders queue items and renumbers priorities', () => {
    const reordered = reorderQueue(queue, 0, 1);
    expect(reordered.map((item) => item.id)).toEqual(['q-2', 'q-1']);
    expect(reordered.map((item) => item.priority)).toEqual([1, 2]);
  });

  it('creates a draft scaffold from a selected queue item', () => {
    const draft = draftFromQueueItem(queue[0], [baseArticle]);
    expect(draft).toContain('Working title: First');
    expect(draft).toContain('Existing summary');
    expect(draft).toContain('https://example.com/a');
  });
});
