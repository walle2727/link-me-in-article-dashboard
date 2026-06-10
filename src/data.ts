export type ArticleStatus = 'new' | 'shortlisted' | 'rejected' | 'queued' | 'used';

export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  foundAt: string;
  publishedAt: string;
  summary: string;
  suggestedAngle: string;
  themes: string[];
  lane: string;
  status: ArticleStatus;
  agentScore: number;
  userRating: number | null;
  notes: string;
  sourceQuality: number;
  timeliness: number;
  audienceFit: number;
  practicalValue: number;
  originality: number;
  sourceLinks: string[];
};

export type QueueItem = {
  id: string;
  articleIds: string[];
  workingTitle: string;
  angle: string;
  status: 'ideas' | 'selected' | 'needs-research' | 'ready-to-draft' | 'drafted' | 'published';
  priority: number;
  plannedFor: string | null;
  postType: string;
  notes: string;
  createdAt: string;
};

export type Post = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  themes: string[];
  sourceArticleIds: string[];
  notes: string;
};

export type EncryptedEnvelope = {
  version: 1;
  contentType: 'application/json';
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  encryptedAt: string;
};

export type GitHubTarget = {
  owner: string;
  repo: string;
  branch: string;
};

export const DEFAULT_GITHUB_TARGET: GitHubTarget = {
  owner: 'walle2727',
  repo: 'link-me-in-article-dashboard',
  branch: 'main',
};

export const DATA_PATHS = {
  articles: 'public/data/articles.json',
  queue: 'public/data/queue.json',
  posts: 'public/data/posts.json',
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_ITERATIONS = 250_000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function toBase64Utf8(value: string): string {
  return bytesToBase64(encoder.encode(value));
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(data: unknown, passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<EncryptedEnvelope> {
  if (!passphrase.trim()) throw new Error('A passphrase is required to encrypt dashboard data.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, iterations);
  const plaintext = encoder.encode(JSON.stringify(data, null, 2));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext));
  return {
    version: 1,
    contentType: 'application/json',
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    encryptedAt: new Date().toISOString(),
  };
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { version?: unknown }).version === 1 &&
    (value as { algorithm?: unknown }).algorithm === 'AES-GCM' &&
    typeof (value as { ciphertext?: unknown }).ciphertext === 'string',
  );
}

export async function decryptJson<T>(envelope: EncryptedEnvelope, passphrase: string): Promise<T> {
  if (!passphrase.trim()) throw new Error('Enter the dashboard passphrase.');
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesKey(passphrase, salt, envelope.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error('Could not decrypt data. Check the passphrase.');
  }
}

export function normalizeArticle(candidate: Partial<Article> & { title: string }): Article {
  const now = new Date().toISOString();
  const id = candidate.id ?? `article-${now.slice(0, 10)}-${slugify(candidate.title).slice(0, 54)}`;
  return {
    id,
    title: candidate.title,
    url: candidate.url ?? candidate.sourceLinks?.[0] ?? '',
    source: candidate.source ?? 'Hermes scout',
    foundAt: candidate.foundAt ?? now,
    publishedAt: candidate.publishedAt ?? '',
    summary: candidate.summary ?? '',
    suggestedAngle: candidate.suggestedAngle ?? '',
    themes: candidate.themes?.length ? candidate.themes : ['ai-governance'],
    lane: candidate.lane ?? 'current-thread',
    status: candidate.status ?? 'new',
    agentScore: candidate.agentScore ?? 70,
    userRating: candidate.userRating ?? null,
    notes: candidate.notes ?? '',
    sourceQuality: candidate.sourceQuality ?? 3,
    timeliness: candidate.timeliness ?? 3,
    audienceFit: candidate.audienceFit ?? 3,
    practicalValue: candidate.practicalValue ?? 3,
    originality: candidate.originality ?? 3,
    sourceLinks: candidate.sourceLinks?.length ? candidate.sourceLinks : candidate.url ? [candidate.url] : [],
  };
}

export function upsertArticle(articles: Article[], candidate: Partial<Article> & { title: string }): Article[] {
  const article = normalizeArticle(candidate);
  const key = article.url || article.title.toLowerCase();
  const existingIndex = articles.findIndex((item) => (article.url && item.url === article.url) || item.title.toLowerCase() === key);
  if (existingIndex === -1) return [article, ...articles];
  const copy = [...articles];
  copy[existingIndex] = { ...copy[existingIndex], ...article, id: copy[existingIndex].id, notes: copy[existingIndex].notes, status: copy[existingIndex].status, userRating: copy[existingIndex].userRating };
  return copy;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function getGitHubFileSha(target: GitHubTarget, path: string, token: string) {
  const url = `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${path}?ref=${encodeURIComponent(target.branch)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`Could not read ${path} from GitHub (${response.status}).`);
  const body = await response.json() as { sha: string };
  return body.sha;
}

export async function saveEncryptedJsonToGitHub(options: {
  target: GitHubTarget;
  path: string;
  token: string;
  passphrase: string;
  data: unknown;
  message: string;
}) {
  const sha = await getGitHubFileSha(options.target, options.path, options.token);
  const envelope = await encryptJson(options.data, options.passphrase);
  const response = await fetch(`https://api.github.com/repos/${options.target.owner}/${options.target.repo}/contents/${options.path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({
      message: options.message,
      branch: options.target.branch,
      sha,
      content: toBase64Utf8(`${JSON.stringify(envelope, null, 2)}\n`),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub save failed (${response.status}): ${body}`);
  }
  return response.json();
}

export function createQueueItemFromArticle(article: Article, priority: number): QueueItem {
  return {
    id: `queue-${article.id}`,
    articleIds: [article.id],
    workingTitle: article.title,
    angle: article.suggestedAngle || article.summary || 'Define the LinkedIn angle before drafting.',
    status: 'selected',
    priority,
    plannedFor: null,
    postType: 'LinkedIn post',
    notes: `Auto-created from Article inbox when marked queued. Source: ${article.source}`,
    createdAt: new Date().toISOString(),
  };
}

export function applyArticleStatus(
  data: { articles: Article[]; queue: QueueItem[] },
  articleId: string,
  status: ArticleStatus,
): { articles: Article[]; queue: QueueItem[] } {
  const article = data.articles.find((item) => item.id === articleId);
  if (!article) return data;

  const articles = data.articles.map((item) => item.id === articleId ? { ...item, status } : item);
  const existingQueueIndex = data.queue.findIndex((item) => item.articleIds.includes(articleId));

  if (status === 'queued') {
    if (existingQueueIndex !== -1) return { articles, queue: data.queue };
    const maxPriority = data.queue.reduce((max, item) => Math.max(max, item.priority), 0);
    return { articles, queue: [...data.queue, createQueueItemFromArticle({ ...article, status }, maxPriority + 1)] };
  }

  if (existingQueueIndex !== -1) {
    const existing = data.queue[existingQueueIndex];
    const autoCreatedForArticle = existing.id === `queue-${articleId}` && existing.articleIds.length === 1;
    if (autoCreatedForArticle) {
      const queue = data.queue
        .filter((_, index) => index !== existingQueueIndex)
        .sort((a, b) => a.priority - b.priority)
        .map((item, index) => ({ ...item, priority: index + 1 }));
      return { articles, queue };
    }
  }

  return { articles, queue: data.queue };
}

export function reorderQueue(queue: QueueItem[], fromIndex: number, toIndex: number): QueueItem[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return queue;
  const next = [...queue].sort((a, b) => a.priority - b.priority);
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, priority: index + 1 }));
}

export function draftFromQueueItem(item: QueueItem, articles: Article[]): string {
  const linked = item.articleIds.map((id) => articles.find((article) => article.id === id)).filter(Boolean) as Article[];
  const sourceLines = linked.map((article) => `- ${article.title}: ${article.url || article.sourceLinks[0] || 'source needed'}`).join('\n');
  const evidence = linked.map((article) => article.summary).filter(Boolean).join('\n\n');
  return `Working title: ${item.workingTitle}\n\nCore angle:\n${item.angle}\n\nDraft structure:\n1. Hook: start with the practical tension behind this topic.\n2. Context: explain what changed and why it matters now.\n3. Builder/governance lesson: connect it to responsible AI/product workflow design.\n4. Concrete takeaway: give readers a decision, checklist, or question to use.\n5. Closing question: invite builders/compliance/product people to respond.\n\nEvidence to use:\n${evidence || item.notes || 'Add source evidence before publishing.'}\n\nLinked sources:\n${sourceLines || '- Add at least one source article.'}\n\nFirst rough post:\n${item.workingTitle}\n\n${item.angle}\n\nThe useful question is not “can AI do this?” but “what workflow, controls, and human judgment need to exist around it?”\n\nThat is where responsible AI becomes practical: not a policy PDF after the fact, but product and process decisions made before the system is relied on.\n\nWhat would you want to see documented before trusting this in a real business workflow?`;
}
