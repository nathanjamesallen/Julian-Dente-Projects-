# label-scout

A Node.js CLI tool that autonomously discovers indie record labels on the web, scrapes their artist rosters, scores each artist against producer **Julian Dente (YØUTH)**'s Ideal Client Profile, and exports the results as a CSV ready to upload to a CRM (Attio, HubSpot, etc.).

## What it does

1. **Discovers** 25 indie labels in the USA/Canada via Claude, focused on bedroom pop, lo-fi, indie folk, alt-pop, dream pop, indie rock, and singer-songwriter genres.
2. **Verifies** each label website actually loads.
3. **Scrapes** every label's roster page using Puppeteer, handling multiple site structures (nav links, `/artists` paths, repeated link patterns).
4. **Extracts** per artist: bio, Spotify, Instagram, Bandcamp, booking email, website, releases.
5. **Scores** each artist against Julian's ICP using Claude (`claude-sonnet-4-20250514`).
6. **Exports** two CSVs: `julian-prospects-<date>.csv` (artists) and `labels-<date>.csv` (label contacts).

## Setup

```bash
npm install
cp .env.example .env
# add your Anthropic key to .env
```

`.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Running

```bash
# Full pipeline
node index.js discover

# Re-scrape a single label
node index.js scrape --url https://carparkrecords.com

# Re-score existing data (after editing the ICP prompt)
node index.js score

# Re-export CSV from scored data
node index.js export

# Force re-scraping of labels already in /data
node index.js discover --force
```

Raw scraped data lives in `/data/artists-raw.json`, scored data lives in `/data/artists-scored.json`, and the merged label list lives in `/data/labels.json`. This means you can scrape once, tweak the ICP prompt in `src/icp.js`, and re-score without crawling everything again.

## Adding labels manually

Edit `labels.json` in the project root:

```json
[
  {
    "labelName": "Born Losers Records",
    "website": "https://bornlosersrecords.com",
    "location": "Philadelphia, PA",
    "rosterPath": "/collections",
    "artistLinkPattern": "/collections/"
  }
]
```

`rosterPath` and `artistLinkPattern` are optional hints. The scraper falls back to autodetection when they're missing.

When you run `discover`, manually-added labels are merged with the auto-discovered set before scraping. Already-scraped labels are skipped unless you pass `--force`.

## Updating the ICP prompt

Edit `src/icp.js`. Both the label-discovery prompt and the per-artist scoring prompt live there. After editing, run:

```bash
node index.js score
node index.js export
```

…to re-score and re-export without re-scraping.

## CSV columns

**Artists CSV** (`julian-prospects-<date>.csv`), sorted HOT → WARM → SKIP, then by ICP Score descending:

```
Flag, ICP Score, Artist Name, Label Name, Label Location, Label Website,
Label Instagram, Label Contact Page, Artist Location, Genre,
Bio (200 char max), Spotify URL, Instagram Handle, Bandcamp URL,
Booking Email, Artist Website, Release Count, Releases, Self-Produces,
ICP Notes, Pitch Angle, Artist Label Page URL
```

**Labels CSV** (`labels-<date>.csv`): one row per label with contact email, contact page, Instagram, and roster page URL.

## Stack

- `puppeteer` — headless browser for JS-rendered sites
- `axios` + `cheerio` — fallback for static HTML
- `@anthropic-ai/sdk` — label discovery + ICP scoring
- `p-limit` — concurrency control (max 3 concurrent API calls)
- `csv-writer` — CSV export
- `commander` — CLI parsing
- `dotenv` — env vars
- `chalk` — terminal logging
