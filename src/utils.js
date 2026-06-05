import fs from 'fs/promises';
import path from 'path';

export const DATA_DIR = path.resolve('data');
export const LABELS_FILE = path.join(DATA_DIR, 'labels.json');
export const ARTISTS_RAW_FILE = path.join(DATA_DIR, 'artists-raw.json');
export const ARTISTS_SCORED_FILE = path.join(DATA_DIR, 'artists-scored.json');

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson(file, fallback = null) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

export function datestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function sameDomain(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

export function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!match) return null;
  const email = match[0];
  if (/newsletter|noreply|no-reply|subscribe/i.test(email)) return null;
  return email;
}

export function extractInstagramHandle(href) {
  if (!href) return null;
  const m = href.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (!m) return null;
  const h = m[1].replace(/\/$/, '');
  if (['p', 'reel', 'tv', 'explore'].includes(h)) return null;
  return `@${h}`;
}

export function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function crossSourceDedupKey(a) {
  if (a.spotifyUrl) return `sp::${a.spotifyUrl.toLowerCase()}`;
  if (a.bandcampUrl) return `bc::${a.bandcampUrl.toLowerCase()}`;
  if (a.instagramHandle) return `ig::${a.instagramHandle.toLowerCase()}`;
  return `nm::${(a.artistName || '').toLowerCase().trim()}`;
}
