import puppeteer from 'puppeteer';
import fs from 'fs';
import { log } from './logger.js';
import {
  USER_AGENT,
  sleep,
  normalizeUrl,
  sameDomain,
  extractEmail,
  extractInstagramHandle,
  uniqueBy,
} from './utils.js';

const ROSTER_KEYWORDS = [
  'artists', 'roster', 'our artists', 'bands', 'musicians', 'our roster',
  'the roster', 'label artists', 'our bands', 'all artists', 'our roster',
];
const ROSTER_PATHS = [
  '/artists', '/roster', '/bands', '/our-artists', '/musicians',
  '/pages/artists', '/pages/roster', '/pages/our-artists', '/the-roster',
  '/collections', '/collections/all', '/artist',
];
const PAGE_TIMEOUT = 25000;

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    return true;
  } catch (e) {
    log.warn(`goto failed (${url}): ${e.message.slice(0, 80)}`);
    return false;
  }
}

async function findRosterUrl(page, baseUrl, hint = null) {
  if (hint?.rosterPath) {
    const u = new URL(hint.rosterPath, baseUrl).toString();
    log.dim(`Using hinted roster path → ${u}`);
    return u;
  }
  const links = await page.$$eval('a', (as) =>
    as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().toLowerCase() })),
  );
  for (const kw of ROSTER_KEYWORDS) {
    const hit = links.find((l) => l.text === kw || l.text === kw + ' ▾' || l.text.includes(kw));
    if (hit?.href && sameDomain(hit.href, baseUrl)) return hit.href;
  }
  for (const p of ROSTER_PATHS) {
    const candidate = new URL(p, baseUrl).toString();
    const ok = await safeGoto(page, candidate);
    if (ok) {
      const status = await page.evaluate(() => document.body.innerText.length);
      if (status > 200) return candidate;
    }
  }
  const inLinks = links.filter((l) => sameDomain(l.href, baseUrl));
  const buckets = {};
  for (const l of inLinks) {
    try {
      const seg = new URL(l.href).pathname.split('/').filter(Boolean)[0];
      if (!seg) continue;
      buckets[seg] = (buckets[seg] || 0) + 1;
    } catch {}
  }
  const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 5) {
    return new URL('/' + top[0], baseUrl).toString();
  }
  return null;
}

async function extractArtistLinks(page, baseUrl, hint = null) {
  const links = await page.$$eval('a', (as) =>
    as.map((a) => ({ href: a.href, text: (a.textContent || '').trim() })),
  );
  const internal = links.filter((l) => l.href && sameDomain(l.href, baseUrl));
  if (hint?.artistLinkPattern) {
    const filtered = internal.filter((l) => l.href.includes(hint.artistLinkPattern));
    return uniqueBy(filtered, (l) => l.href.split('#')[0]);
  }
  const buckets = {};
  for (const l of internal) {
    try {
      const segs = new URL(l.href).pathname.split('/').filter(Boolean);
      if (segs.length < 2) continue;
      const prefix = '/' + segs[0] + '/';
      buckets[prefix] = buckets[prefix] || [];
      buckets[prefix].push(l);
    } catch {}
  }
  const best = Object.entries(buckets)
    .filter(([p]) => /artist|roster|band|collection|musician/i.test(p))
    .sort((a, b) => b[1].length - a[1].length)[0];
  const chosen = best
    ? best[1]
    : Object.entries(buckets).sort((a, b) => b[1].length - a[1].length)[0]?.[1] || [];
  return uniqueBy(chosen, (l) => l.href.split('#')[0]);
}

async function scrapeArtistPage(page, url, labelMeta) {
  const ok = await safeGoto(page, url);
  if (!ok) return null;
  await sleep(800);

  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim()
      || document.title.split(/[—–|-]/)[0].trim();

    let bio = '';
    const candidates = document.querySelectorAll(
      'article, main, .bio, .artist-bio, .description, .product-description, .rte, section p, main p',
    );
    const seen = new Set();
    for (const el of candidates) {
      const t = (el.textContent || '').trim();
      if (t.length < 60) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      bio += (bio ? '\n\n' : '') + t;
      if (bio.length > 1500) break;
    }
    if (!bio) {
      const ps = Array.from(document.querySelectorAll('p'))
        .map((p) => p.textContent?.trim() || '')
        .filter((t) => t.length > 60);
      bio = ps.slice(0, 4).join('\n\n');
    }

    const links = Array.from(document.querySelectorAll('a')).map((a) => a.href);
    const text = document.body.innerText;

    const releases = [];
    const releaseSel = document.querySelectorAll(
      '.product-title, .release-title, .album-title, .discography li, .releases li, .product__title',
    );
    releaseSel.forEach((el) => {
      const t = el.textContent?.trim();
      if (t && t.length < 200) releases.push(t);
    });

    return { title, bio, links, text, releases };
  });

  const spotifyUrl = data.links.find((h) => h.includes('open.spotify.com')) || null;
  const bandcampUrl = data.links.find((h) => h.includes('bandcamp.com')) || null;
  const instagramHandle =
    data.links.map(extractInstagramHandle).find(Boolean) || null;
  const bookingEmail = extractEmail(data.text);

  const externalLinks = data.links.filter((h) => {
    if (!h) return false;
    if (sameDomain(h, url)) return false;
    if (/spotify|instagram|bandcamp|youtube|tiktok|twitter|facebook|apple\.com/.test(h)) return false;
    return /^https?:\/\//.test(h);
  });
  const websiteUrl = externalLinks[0] || null;

  const releases = uniqueBy(data.releases, (r) => r.toLowerCase()).slice(0, 25);

  return {
    artistName: data.title,
    bio: data.bio.slice(0, 4000),
    spotifyUrl,
    instagramHandle,
    bandcampUrl,
    bookingEmail,
    websiteUrl,
    releases,
    releaseCount: releases.length,
    labelPageUrl: url,
    labelName: labelMeta.labelName,
    labelWebsite: labelMeta.website,
    labelLocation: labelMeta.location,
  };
}

async function findLabelContact(page, baseUrl) {
  const out = { contactEmail: null, contactPage: null, instagram: null };
  const links = await page.$$eval('a', (as) =>
    as.map((a) => ({ href: a.href, text: (a.textContent || '').trim().toLowerCase() })),
  );
  const contactLink = links.find(
    (l) => /contact|about/i.test(l.text) && sameDomain(l.href, baseUrl),
  );
  if (contactLink) out.contactPage = contactLink.href;
  out.instagram =
    links.map((l) => extractInstagramHandle(l.href)).find(Boolean) || null;
  if (contactLink) {
    const ok = await safeGoto(page, contactLink.href);
    if (ok) {
      const txt = await page.evaluate(() => document.body.innerText);
      out.contactEmail = extractEmail(txt);
    }
  }
  if (!out.contactEmail) {
    const txt = await page.evaluate(() => document.body.innerText);
    out.contactEmail = extractEmail(txt);
  }
  return out;
}

export async function scrapeLabel(browser, label) {
  log.step(`Scraping ${label.labelName} (${label.website})`);
  const page = await newPage(browser);
  const result = { label, artists: [], labelContact: {} };
  try {
    const ok = await safeGoto(page, label.website);
    if (!ok) return result;
    await sleep(1500);

    result.labelContact = await findLabelContact(page, label.website);
    await safeGoto(page, label.website);
    await sleep(800);

    const rosterUrl = await findRosterUrl(page, label.website, label);
    if (!rosterUrl) {
      log.warn(`No roster page found for ${label.labelName}`);
      return result;
    }
    log.info(`Roster page → ${rosterUrl}`);
    await safeGoto(page, rosterUrl);
    await sleep(1500);

    const artistLinks = await extractArtistLinks(page, label.website, label);
    log.info(`Found ${artistLinks.length} artist link candidates.`);

    const trimmed = artistLinks.slice(0, 60);
    for (let i = 0; i < trimmed.length; i++) {
      const link = trimmed[i];
      log.dim(`  [${i + 1}/${trimmed.length}] ${link.href}`);
      try {
        const artist = await scrapeArtistPage(page, link.href, label);
        const hasContact = artist && (artist.spotifyUrl || artist.instagramHandle || artist.bandcampUrl || artist.bookingEmail);
        const hasBio = artist && artist.bio && artist.bio.length > 40;
        if (artist && artist.artistName && (hasBio || hasContact)) {
          result.artists.push(artist);
        }
      } catch (e) {
        log.warn(`  scrape error: ${e.message.slice(0, 80)}`);
      }
      await sleep(1500);
    }
    log.ok(`${label.labelName}: ${result.artists.length} artists scraped.`);
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

export async function launchBrowser() {
  const opts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    log.info(`Using Chrome from CHROME_PATH: ${envPath}`);
    opts.executablePath = envPath;
  } else {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Arc.app/Contents/MacOS/Arc',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        log.info(`Using system browser: ${p}`);
        opts.executablePath = p;
        break;
      }
    }
  }
  return puppeteer.launch(opts);
}
