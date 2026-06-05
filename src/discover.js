import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { log } from './logger.js';
import { LABEL_DISCOVERY_PROMPT } from './icp.js';
import { USER_AGENT, normalizeUrl, uniqueBy, sleep } from './utils.js';

const anthropic = new Anthropic();

export async function discoverLabels() {
  log.step('Phase 1: Discovering labels via Anthropic');
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: LABEL_DISCOVERY_PROMPT }],
  });
  const text = resp.content.map((c) => c.text || '').join('');
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Anthropic returned no JSON array.');
  let labels;
  try {
    labels = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse label JSON: ${e.message}`);
  }
  labels = labels
    .map((l) => ({ ...l, website: normalizeUrl(l.website) }))
    .filter((l) => l.website);
  log.ok(`Anthropic returned ${labels.length} label candidates.`);
  return uniqueBy(labels, (l) => l.website);
}

export async function verifyLabels(labels) {
  log.step('Phase 1: Verifying label websites');
  const confirmed = [];
  for (const label of labels) {
    try {
      const res = await axios.get(label.website, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
      });
      if (res.status >= 200 && res.status < 400) {
        log.ok(`✓ ${label.labelName} — ${label.website}`);
        confirmed.push(label);
      } else {
        log.warn(`✗ ${label.labelName} — status ${res.status}`);
      }
    } catch (e) {
      log.warn(`✗ ${label.labelName} — ${e.code || e.message}`);
    }
    await sleep(400);
  }
  log.info(`${confirmed.length}/${labels.length} labels confirmed.`);
  return confirmed;
}
