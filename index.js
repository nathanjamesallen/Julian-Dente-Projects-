#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { log } from './src/logger.js';
import { discoverLabels, verifyLabels } from './src/discover.js';
import { launchBrowser, scrapeLabel } from './src/scraper.js';
import { scoreArtists } from './src/scorer.js';
import { exportArtistsCsv, exportLabelsCsv } from './src/exporter.js';
import {
  DATA_DIR,
  LABELS_FILE,
  ARTISTS_RAW_FILE,
  ARTISTS_SCORED_FILE,
  ensureDataDir,
  readJson,
  writeJson,
  uniqueBy,
  normalizeUrl,
} from './src/utils.js';

const MANUAL_LABELS_FILE = path.resolve('labels.json');

function requireApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log.err('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
    process.exit(1);
  }
}

async function loadManualLabels() {
  return (await readJson(MANUAL_LABELS_FILE, [])) || [];
}

async function runDiscover({ force = false, skipDiscover = false } = {}) {
  requireApiKey();
  await ensureDataDir();

  const manual = await loadManualLabels();
  let verified = [];
  if (skipDiscover) {
    log.info(`Skipping Anthropic label discovery — using ${manual.length} labels from labels.json only.`);
  } else {
    const discovered = await discoverLabels();
    verified = await verifyLabels(discovered);
  }

  const merged = uniqueBy(
    [...manual.map((l) => ({ ...l, website: normalizeUrl(l.website) })), ...verified],
    (l) => l.website,
  );
  await writeJson(LABELS_FILE, merged);
  log.info(`Total labels to scrape: ${merged.length}`);

  log.step('Phase 2: Scraping rosters');
  const existing = (await readJson(ARTISTS_RAW_FILE, [])) || [];
  const existingByLabel = new Set(existing.map((a) => a.labelWebsite));

  const labelRecords = [];
  const allArtists = [...existing];

  const browser = await launchBrowser();
  try {
    for (const label of merged) {
      if (!force && existingByLabel.has(label.website)) {
        log.dim(`Skipping ${label.labelName} (already scraped, use --force to redo)`);
        const count = existing.filter((a) => a.labelWebsite === label.website).length;
        labelRecords.push({ ...label, contactEmail: '', contactPage: '', instagram: '', rosterUrl: '', artistCount: count });
        continue;
      }
      try {
        const { labelContact, artists } = await scrapeLabel(browser, label);
        labelRecords.push({
          ...label,
          contactEmail: labelContact.contactEmail || '',
          contactPage: labelContact.contactPage || '',
          instagram: labelContact.instagram || '',
          rosterUrl: '',
          artistCount: artists.length,
        });
        for (const a of artists) {
          a.labelInstagram = labelContact.instagram || '';
          a.labelContactPage = labelContact.contactPage || '';
        }
        allArtists.push(...artists);
        await writeJson(ARTISTS_RAW_FILE, allArtists);
      } catch (e) {
        log.err(`${label.labelName} crashed: ${e.message.slice(0, 120)}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const dedupedArtists = uniqueBy(allArtists, (a) => `${a.labelWebsite}::${a.artistName.toLowerCase()}`);
  await writeJson(ARTISTS_RAW_FILE, dedupedArtists);
  log.ok(`Scraped ${dedupedArtists.length} total artists.`);

  const scored = await scoreArtists(dedupedArtists);
  await writeJson(ARTISTS_SCORED_FILE, scored);

  log.step('Phase 4: Exporting CSVs');
  await exportArtistsCsv(scored);
  await exportLabelsCsv(labelRecords);

  log.ok('Done.');
}

async function runScrapeOne(url) {
  requireApiKey();
  await ensureDataDir();
  const labels = (await readJson(LABELS_FILE, [])) || [];
  let label = labels.find((l) => l.website === normalizeUrl(url));
  if (!label) {
    label = { labelName: new URL(url).hostname, website: normalizeUrl(url), location: '' };
    labels.push(label);
    await writeJson(LABELS_FILE, labels);
  }
  const browser = await launchBrowser();
  let result;
  try {
    result = await scrapeLabel(browser, label);
  } finally {
    await browser.close().catch(() => {});
  }
  const existing = (await readJson(ARTISTS_RAW_FILE, [])) || [];
  for (const a of result.artists) {
    a.labelInstagram = result.labelContact.instagram || '';
    a.labelContactPage = result.labelContact.contactPage || '';
  }
  const combined = uniqueBy(
    [...existing, ...result.artists],
    (a) => `${a.labelWebsite}::${a.artistName.toLowerCase()}`,
  );
  await writeJson(ARTISTS_RAW_FILE, combined);
  log.ok(`Added ${result.artists.length} artists from ${label.labelName}.`);
}

async function runScore() {
  requireApiKey();
  const artists = await readJson(ARTISTS_RAW_FILE, []);
  if (!artists || artists.length === 0) {
    log.err('No raw artist data found. Run `discover` or `scrape` first.');
    process.exit(1);
  }
  const scored = await scoreArtists(artists);
  await writeJson(ARTISTS_SCORED_FILE, scored);
  log.ok(`Re-scored ${scored.length} artists.`);
}

async function runExport() {
  const scored = await readJson(ARTISTS_SCORED_FILE, []);
  if (!scored || scored.length === 0) {
    log.err('No scored data found. Run `score` first.');
    process.exit(1);
  }
  const labels = (await readJson(LABELS_FILE, [])) || [];
  const counts = {};
  for (const a of scored) {
    counts[a.labelWebsite] = (counts[a.labelWebsite] || 0) + 1;
  }
  const labelRecords = labels.map((l) => ({
    ...l,
    contactEmail: l.contactEmail || '',
    contactPage: l.contactPage || '',
    instagram: l.instagram || '',
    rosterUrl: l.rosterUrl || '',
    artistCount: counts[l.website] || 0,
  }));
  await exportArtistsCsv(scored);
  await exportLabelsCsv(labelRecords);
}

const program = new Command();
program.name('label-scout').description('Discover indie labels, scrape rosters, score artists against Julian Dente\'s ICP.');

program
  .command('discover')
  .description('Run full pipeline: discover labels → scrape rosters → score → export CSV.')
  .option('--force', 'Re-scrape labels even if they already exist in /data.')
  .option('--skip-discover', 'Skip Anthropic label discovery and use labels.json only.')
  .action((opts) => runDiscover({ force: !!opts.force, skipDiscover: !!opts.skipDiscover }));

program
  .command('scrape')
  .description('Scrape a single label by URL and add to existing results.')
  .requiredOption('--url <url>', 'Label website URL.')
  .action((opts) => runScrapeOne(opts.url));

program
  .command('score')
  .description('Re-run ICP scoring on already-scraped raw data.')
  .action(() => runScore());

program
  .command('export')
  .description('Re-export CSV from existing scored data without re-scraping.')
  .action(() => runExport());

program.parseAsync().catch((e) => {
  log.err(e.stack || e.message);
  process.exit(1);
});
