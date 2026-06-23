#!/usr/bin/env node
import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
function base64ToBytes(value) { return new Uint8Array(Buffer.from(value, 'base64')); }

async function deriveAesKey(passphrase, salt, iterations) {
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function decryptEnvelope(envelope, passphrase) {
  if (Array.isArray(envelope)) return envelope;
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesKey(passphrase, salt, envelope.iterations);
  const plaintext = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

async function encryptJson(data, passphrase) {
  const iterations = 250000;
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, iterations);
  const plaintext = encoder.encode(JSON.stringify(data, null, 2));
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return { version: 1, contentType: 'application/json', algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext), encryptedAt: new Date().toISOString() };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

async function readData(name, passphrase) {
  const path = new URL(`../public/data/${name}.json`, import.meta.url);
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  return { path, data: await decryptEnvelope(envelope, passphrase) };
}

async function writeData(path, data, passphrase) {
  const envelope = await encryptJson(data, passphrase);
  await writeFile(path, JSON.stringify(envelope, null, 2) + '\n');
}

const passphrase = process.env.LINKMEIN_DATA_PASSPHRASE;
if (!passphrase) throw new Error('LINKMEIN_DATA_PASSPHRASE is required.');

const dryRun = process.argv.includes('--dry-run');
const query = (process.argv.find((arg) => arg.startsWith('--query=')) ?? '').slice('--query='.length).toLowerCase();
if (!query) throw new Error('--query is required.');

const postedTitle = process.argv.find((arg) => arg.startsWith('--posted-title='))?.slice('--posted-title='.length) ?? 'AI-generated ads are not a legal detail. They are a quality-control problem.';
const postedAt = process.argv.find((arg) => arg.startsWith('--posted-at='))?.slice('--posted-at='.length) ?? new Date().toISOString().slice(0, 10);
const postedUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice('--url='.length) ?? '';

const articlesFile = await readData('articles', passphrase);
const queueFile = await readData('queue', passphrase);
const postsFile = await readData('posts', passphrase);

const haystack = (article) => [article.title, article.summary, article.suggestedAngle, article.source, article.url, ...(article.sourceLinks ?? []), ...(article.themes ?? [])].join('\n').toLowerCase();
const matches = articlesFile.data.filter((article) => haystack(article).includes(query));

if (dryRun) {
  console.log(JSON.stringify({ matches: matches.map((article) => ({ id: article.id, title: article.title, status: article.status, lane: article.lane, themes: article.themes })) }, null, 2));
  process.exit(0);
}

if (matches.length !== 1) {
  console.error(JSON.stringify({ error: `Expected 1 match, found ${matches.length}`, matches: matches.map((article) => ({ id: article.id, title: article.title, status: article.status })) }, null, 2));
  process.exit(1);
}

const article = matches[0];
const articleIds = new Set([article.id]);
const todayNote = `Posted on LinkedIn ${postedAt}: ${postedTitle}`;

const articles = articlesFile.data.map((item) => {
  if (item.id !== article.id) return item;
  const notes = item.notes?.trim() ? `${item.notes.trim()}\n${todayNote}` : todayNote;
  return { ...item, status: 'used', notes };
});

const queue = queueFile.data.map((item) => {
  if (!(item.articleIds ?? []).some((id) => articleIds.has(id))) return item;
  return { ...item, status: 'published', notes: item.notes?.trim() ? `${item.notes.trim()}\n${todayNote}` : todayNote };
});

const postId = `post-${postedAt}-${slugify(postedTitle)}`;
const existingPostIndex = postsFile.data.findIndex((post) => post.id === postId || (post.title === postedTitle && post.publishedAt === postedAt));
const post = {
  id: existingPostIndex === -1 ? postId : postsFile.data[existingPostIndex].id,
  title: postedTitle,
  url: postedUrl,
  publishedAt: postedAt,
  themes: Array.from(new Set([...(article.themes ?? []), 'ai-generated-ads'])),
  sourceArticleIds: [article.id],
  notes: 'Posted from the AI-generated ads / EU transparency rules item. Marked used by Hermes from Telegram confirmation.',
};
const posts = [...postsFile.data];
if (existingPostIndex === -1) posts.unshift(post);
else posts[existingPostIndex] = { ...posts[existingPostIndex], ...post };

await writeData(articlesFile.path, articles, passphrase);
await writeData(queueFile.path, queue, passphrase);
await writeData(postsFile.path, posts, passphrase);

console.log(JSON.stringify({ status: 'ok', article: { id: article.id, title: article.title, previousStatus: article.status, nextStatus: 'used' }, queueItemsUpdated: queue.filter((item) => (item.articleIds ?? []).some((id) => articleIds.has(id)) && item.status === 'published').length, post: { id: post.id, title: post.title, publishedAt: post.publishedAt } }, null, 2));
