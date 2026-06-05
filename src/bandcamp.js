import { log } from './logger.js';
import {
  USER_AGENT,
  sleep,
  uniqueBy,
  extractEmail,
  extractInstagramHandle,
} from './utils.js';
import { launchBrowser } from './scraper.js';

const TAGS = [
  'bedroom-pop',
  'dream-pop',
  'indie-folk',
  'indie-pop',
  'lo-fi',
  'singer-songwriter',
  'chamber-pop',
  'alt-pop',
  'folk-pop',
  'indie-rock',
];

const PER_TAG_CAP = 50;
const TOTAL_ARTIST_CAP = 250;

async function fetchTagArtists(browser, tag) {
  const url = `https://bandcamp.com/tag/${tag}?tab=highlights`;
  log.info(`Bandcamp tag: ${tag}`);
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2500);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await sleep(700);
    }
    const subdomains = await page.$$eval('a[href*=".bandcamp.com"]', (as) => {
      const seen = new Set();
      for (const a of as) {
        const m = (a.href || '').match(/^https:\/\/([a-z0-9-]+)\.bandcamp\.com/);
        if (!m) continue;
        const sub = m[1];
        if (['blog', 'daily', 'discover', 'shop', 'm', 'support', 'merch'].includes(sub)) continue;
        seen.add(sub);
      }
      return Array.from(seen);
    });
    const urls = subdomains.slice(0, PER_TAG_CAP).map((s) => `https://${s}.bandcamp.com`);
    log.ok(`  → ${urls.length} unique artists`);
    return urls;
  } catch (e) {
    log.warn(`  Bandcamp tag ${tag} failed: ${e.message.slice(0, 80)}`);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeBandcampArtist(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await sleep(1200);

    const data = await page.evaluate(() => {
      const name =
        document.querySelector('#band-name-location .title')?.textContent?.trim() ||
        document.querySelector('p#band-name-location span.title')?.textContent?.trim() ||
        document.querySelector('h1.band-name')?.textContent?.trim() ||
        document.title.split('|')[0].trim();
      const location =
        document.querySelector('#band-name-location .location')?.textContent?.trim() ||
        document.querySelector('p#band-name-location span.location')?.textContent?.trim() ||
        '';
      const bio =
        document.querySelector('#bio-text')?.textContent?.trim() ||
        document.querySelector('.signed-out-artists-bio')?.textContent?.trim() ||
        document.querySelector('.bio-text')?.textContent?.trim() ||
        document.querySelector('.bio')?.textContent?.trim() ||
        '';
      const releases = Array.from(
        document.querySelectorAll('li.music-grid-item .title, .music-grid li .title'),
      )
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);
      const links = Array.from(document.querySelectorAll('a')).map((a) => a.href);
      const text = document.body.innerText;
      return { name, location, bio, releases, links, text };
    });

    const spotifyUrl = data.links.find((h) => h && h.includes('open.spotify.com')) || null;
    const instagramHandle = data.links.map(extractInstagramHandle).find(Boolean) || null;
    const bookingEmail = extractEmail(data.text);
    const externalWebsite =
      data.links.find(
        (h) =>
          h &&
          /^https?:\/\//.test(h) &&
          !h.includes('bandcamp.com') &&
          !h.includes('spotify.com') &&
          !h.includes('instagram.com') &&
          !h.includes('youtube.com') &&
          !h.includes('twitter.com') &&
          !h.includes('facebook.com') &&
          !h.includes('tiktok.com') &&
          !h.includes('apple.com'),
      ) || null;
    const releases = uniqueBy(data.releases, (r) => r.toLowerCase()).slice(0, 25);

    return {
      artistName: data.name,
      bio: (data.bio || '').slice(0, 4000),
      spotifyUrl,
      instagramHandle,
      bandcampUrl: url,
      bookingEmail,
      websiteUrl: externalWebsite,
      releases,
      releaseCount: releases.length,
      labelPageUrl: url,
      labelName: 'Bandcamp (unsigned/micro)',
      labelWebsite: 'https://bandcamp.com',
      labelLocation: data.location,
      labelInstagram: '',
      labelContactPage: '',
    };
  } catch (e) {
    log.warn(`  artist scrape failed (${url}): ${e.message.slice(0, 80)}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function bandcampDiscover() {
  log.step('Bandcamp tag discovery');
  const browser = await launchBrowser();
  const allUrls = new Set();
  try {
    for (const tag of TAGS) {
      const urls = await fetchTagArtists(browser, tag);
      urls.forEach((u) => allUrls.add(u));
      await sleep(1500);
    }
    log.info(`Total unique Bandcamp artists collected: ${allUrls.size}`);

    const list = Array.from(allUrls).slice(0, TOTAL_ARTIST_CAP);
    const artists = [];
    for (let i = 0; i < list.length; i++) {
      log.dim(`  [${i + 1}/${list.length}] ${list[i]}`);
      const a = await scrapeBandcampArtist(browser, list[i]);
      if (a && a.artistName && (a.bio.length > 40 || a.releases.length > 0 || a.spotifyUrl || a.instagramHandle)) {
        artists.push(a);
      }
      await sleep(1500);
    }
    log.ok(`Scraped ${artists.length} Bandcamp artists.`);
    return artists;
  } finally {
    await browser.close().catch(() => {});
  }
}
