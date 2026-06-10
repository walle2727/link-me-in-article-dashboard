#!/usr/bin/env node
import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function usage() {
  console.error(`Usage:
  LINKMEIN_DATA_PASSPHRASE=... node scripts/append-candidate.mjs candidate.json
  cat candidate.json | LINKMEIN_DATA_PASSPHRASE=... node scripts/append-candidate.mjs -

Candidate fields: title is required. url/source/summary/suggestedAngle/themes/agentScore/etc are optional.`);
}

function bytesToBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
function base64ToBytes(value) { return new Uint8Array(Buffer.from(value, 'base64')); }

async function deriveAesKey(passphrase, salt, iterations) {
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function decryptEnvelope(envelope, passphrase) {
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizeArticle(candidate) {
  const now = new Date().toISOString();
  if (!candidate.title) throw new Error('Candidate title is required.');
  return {
    id: candidate.id ?? `article-${now.slice(0, 10)}-${slugify(candidate.title).slice(0, 54)}`,
    title: candidate.title,
    url: candidate.url ?? candidate.sourceLinks?.[0] ?? '',
    source: candidate.source ?? 'Hermes current-thread scout',
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

function upsertArticle(articles, candidate) {
  const article = normalizeArticle(candidate);
  const existingIndex = articles.findIndex((item) => (article.url && item.url === article.url) || item.title.toLowerCase() === article.title.toLowerCase());
  if (existingIndex === -1) return [article, ...articles];
  const copy = [...articles];
  copy[existingIndex] = { ...copy[existingIndex], ...article, id: copy[existingIndex].id, status: copy[existingIndex].status, userRating: copy[existingIndex].userRating, notes: copy[existingIndex].notes };
  return copy;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const inputPath = process.argv[2];
if (!inputPath) {
  usage();
  process.exit(2);
}

const passphrase = process.env.LINKMEIN_DATA_PASSPHRASE;
if (!passphrase) throw new Error('LINKMEIN_DATA_PASSPHRASE is required.');

const rawCandidate = inputPath === '-' ? await readStdin() : await readFile(inputPath, 'utf8');
const candidate = JSON.parse(rawCandidate);
const dataPath = new URL('../public/data/articles.json', import.meta.url);
const currentEnvelope = JSON.parse(await readFile(dataPath, 'utf8'));
const articles = Array.isArray(currentEnvelope) ? currentEnvelope : await decryptEnvelope(currentEnvelope, passphrase);
const next = upsertArticle(articles, candidate);
const nextEnvelope = await encryptJson(next, passphrase);
await writeFile(dataPath, JSON.stringify(nextEnvelope, null, 2) + '\n');
console.log(JSON.stringify({ status: 'ok', articles: next.length, title: candidate.title }, null, 2));
