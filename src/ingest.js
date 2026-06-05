import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { log } from './logger.js';
import { USER_AGENT, normalizeUrl, uniqueBy, sleep } from './utils.js';

const anthropic = new Anthropic();

export const DEFAULT_SOURCES = [
  'https://en.wikipedia.org/wiki/List_of_record_labels:_A%E2%80%93H',
  'https://en.wikipedia.org/wiki/List_of_record_labels:_I%E2%80%93Q',
  'https://en.wikipedia.org/wiki/List_of_record_labels:_0%E2%80%939',
  'https://en.wikipedia.org/wiki/List_of_record_labels:_R%E2%80%93Z',
  'https://www.audiencerepublic.com/guides/record-labels-in-the-united-states',
];

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 25000,
    maxRedirects: 8,
  });
  return res.data;
}

function extractCandidates(html, sourceUrl) {
  const $ = cheerio.load(html);
  const candidates = new Set();

  if (sourceUrl.includes('wikipedia.org')) {
    $('#mw-content-text a').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();
      if (!href.startsWith('/wiki/')) return;
      if (href.includes(':')) return;
      if (text.length < 2 || text.length > 70) return;
      if (/^(edit|jump|see also|references|external links|notes|main page)$/i.test(text)) return;
      candidates.add(text);
    });
  } else {
    $('main a, article a, .content a, .post-content a, a').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 2 || text.length > 70) return;
      if (/^(home|about|contact|privacy|terms|sign in|log in|menu)$/i.test(text)) return;
      candidates.add(text);
    });
    $('main li, article li, .content li, .post-content li').each((_, el) => {
      const text = $(el).text().trim().split('\n')[0].trim();
      if (text.length < 2 || text.length > 70) return;
      candidates.add(text);
    });
    $('h2, h3, h4, strong').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 2 || text.length > 70) return;
      candidates.add(text);
    });
  }

  return Array.from(candidates);
}

const FILTER_PROMPT = `Below is a list of candidate record label names scraped from a webpage. Filter to ONLY the indie labels that fit this profile:

- Independent labels (NOT major-label subsidiaries like Capitol, Atlantic, RCA, Columbia, Interscope, Def Jam, Sony, Warner, Universal, EMI)
- Genres: indie/alt-pop, bedroom pop, lo-fi, indie folk, dream pop, indie rock, singer-songwriter (NOT hip-hop, EDM, metal, country, classical, jazz, reggae, world)
- 5–40 artist roster size
- Active in the last 5 years (not defunct labels from the 80s/90s only)
- Based primarily in the USA, Canada, UK, Australia, or Western Europe

For each label that fits, return: { "labelName": string, "website": string, "location": string, "genreFocus": string }

CRITICAL RULES:
- Only include labels you actually know exist and can give a REAL, working website for.
- Do NOT invent URLs or guess based on the name. If you don't know the website, skip the label.
- The website MUST start with https:// and be a real domain you have seen before.
- Skip generic names, non-music entries, navigation links, or anything ambiguous.

CANDIDATES:
{LIST}

Return ONLY a JSON array, no commentary.`;

async function filterAndResolve(candidates) {
  const out = [];
  const batches = [];
  const BATCH = 50;
  for (let i = 0; i < candidates.length; i += BATCH) {
    batches.push(candidates.slice(i, i + BATCH));
  }
  log.info(`Filtering ${candidates.length} candidates in ${batches.length} batches via Claude...`);

  const limit = pLimit(3);
  let done = 0;
  await Promise.all(
    batches.map((batch, idx) =>
      limit(async () => {
        try {
          const resp = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [
              { role: 'user', content: FILTER_PROMPT.replace('{LIST}', batch.join('\n')) },
            ],
          });
          const text = resp.content.map((c) => c.text || '').join('');
          const match = text.match(/\[[\s\S]*\]/);
          if (!match) return;
          const arr = JSON.parse(match[0]);
          out.push(...arr.filter((l) => l && l.labelName && l.website));
          done++;
          log.dim(`Batch ${done}/${batches.length}: kept ${arr.length}/${batch.length}`);
        } catch (e) {
          done++;
          log.warn(`Batch ${idx + 1} failed: ${e.message.slice(0, 100)}`);
        }
      }),
    ),
  );

  return uniqueBy(
    out
      .map((l) => ({ ...l, website: normalizeUrl(l.website) }))
      .filter((l) => l.website),
    (l) => l.website,
  );
}

async function verifyOne(label) {
  try {
    const res = await axios.get(label.website, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
      maxRedirects: 8,
      validateStatus: (s) => s < 500,
    });
    return res.status >= 200 && res.status < 500 && res.status !== 404;
  } catch {
    return false;
  }
}

export async function ingestFromSources(sources = DEFAULT_SOURCES) {
  log.step('Ingesting label candidates from external sources');
  const allCandidates = new Set();
  for (const url of sources) {
    try {
      log.info(`Fetching ${url}`);
      const html = await fetchHtml(url);
      const candidates = extractCandidates(html, url);
      log.ok(`  → ${candidates.length} candidate names extracted.`);
      candidates.forEach((c) => allCandidates.add(c));
      await sleep(800);
    } catch (e) {
      log.warn(`Failed ${url}: ${e.message.slice(0, 100)}`);
    }
  }
  log.info(`Total unique candidates across all sources: ${allCandidates.size}`);

  const resolved = await filterAndResolve(Array.from(allCandidates));
  log.ok(`Claude kept ${resolved.length} ICP-matched labels with URLs.`);

  log.step('Verifying URLs');
  const verified = [];
  const limit = pLimit(8);
  await Promise.all(
    resolved.map((l) =>
      limit(async () => {
        const ok = await verifyOne(l);
        if (ok) {
          log.ok(`✓ ${l.labelName} — ${l.website}`);
          verified.push(l);
        } else {
          log.dim(`✗ ${l.labelName} — ${l.website}`);
        }
      }),
    ),
  );

  log.ok(`Verified ${verified.length}/${resolved.length} labels.`);
  return verified;
}
