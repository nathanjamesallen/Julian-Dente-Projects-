# label-scout

A tool that finds indie record labels, scrapes the artists signed to them, scores each artist as a potential client for **Julian Dente (YØUTH)**, and gives you a spreadsheet you can drop straight into a CRM or email tool.

You do not need to know how to code to use this. Just follow the steps below in order.

---

## Step 1 — Install Node.js (one-time setup)

Node.js is the program that runs this tool.

1. Go to **https://nodejs.org**
2. Click the big green button that says **"LTS"** (recommended for most users).
3. Open the downloaded file and click **Next → Next → Install** like any other app.
4. When it's done, restart your computer.

To confirm it worked:

- **Mac:** open the app called **Terminal** (press `Cmd + Space`, type `terminal`, hit enter).
- **Windows:** open the app called **PowerShell** (press the Windows key, type `powershell`, hit enter).

In that black/blue window, type this and press enter:

```
node --version
```

If you see something like `v20.11.0`, you're good. If you see "command not found," restart your computer and try again.

---

## Step 2 — Get an Anthropic API key (one-time setup)

The tool needs a key so it can talk to Claude (the AI that scores artists).

1. Go to **https://console.anthropic.com**
2. Sign up or log in.
3. Click **"API Keys"** in the left sidebar.
4. Click **"Create Key"**, give it a name like `label-scout`, and click create.
5. **Copy the key immediately** — it starts with `sk-ant-...`. You won't be able to see it again after you close the window.
6. You'll need to add at least $5 of credit on the **"Billing"** page for the tool to work. A full run typically costs $1–3.

Keep that key somewhere safe — you'll paste it into the tool in Step 4.

---

## Step 3 — Open the project folder in your terminal

You should already have the project folder on your computer. Find where it lives (e.g. `Documents/Julian-Dente-Projects-`).

In the terminal window from Step 1, type `cd ` (with a space after it) and then **drag the project folder from Finder/File Explorer onto the terminal window** — the path will auto-fill. Press enter.

It should look something like this:

**Mac:**
```
cd /Users/yourname/Documents/Julian-Dente-Projects-
```

**Windows:**
```
cd C:\Users\yourname\Documents\Julian-Dente-Projects-
```

To confirm you're in the right place, type:

```
ls
```
(on Windows, type `dir` instead)

You should see files like `index.js`, `package.json`, `README.md`.

---

## Step 4 — Install the tool (one-time setup)

In the terminal, while inside the project folder, type:

```
npm install
```

This downloads everything the tool needs (Puppeteer, the Anthropic SDK, etc.). It will take a few minutes the first time and print a lot of text. That's normal. Wait until you see your prompt come back.

Then create your secret key file. In the project folder there's a file called `.env.example`. Make a copy of it called `.env`:

**Mac:**
```
cp .env.example .env
```

**Windows:**
```
copy .env.example .env
```

Now open the `.env` file in any text editor (TextEdit, Notepad, VS Code — doesn't matter). It looks like this:

```
ANTHROPIC_API_KEY=your_key_here
```

Replace `your_key_here` with the key you copied in Step 2. Save the file. The result should look like:

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

You're done with setup. From now on, you only need Steps 3 and 5.

---

## Step 5 — Run the tool

In the terminal, while inside the project folder, type:

```
node index.js discover
```

Press enter. The tool will:

1. Ask Claude for 25 indie labels (about 30 seconds).
2. Check that each label's website is alive (1–2 minutes).
3. Open each label's site in a hidden browser and scrape every artist (this is the slow part — **expect 15–45 minutes** depending on how many labels and artists).
4. Send each artist to Claude to score them (5–10 minutes).
5. Write two spreadsheets into the project folder.

While it runs, you'll see colored log messages telling you exactly what's happening. **Leave the terminal open** until you see `Done.` at the bottom. If you close it early, it'll stop.

---

## Step 6 — Find your spreadsheets

When it finishes, look in the project folder. You'll see two new files with today's date:

- **`julian-prospects-YYYY-MM-DD.csv`** — every artist found, with their ICP score, contact info, and a one-line pitch angle. Sorted so HOT prospects are at the top.
- **`labels-YYYY-MM-DD.csv`** — every label, with the label's contact email, Instagram, and contact page URL.

Double-click either file to open it in Excel, Numbers, or Google Sheets. Or drag it straight into Attio or your email tool.

---

## Running it again later

You only need to do **Step 3** (open the project folder in terminal) and **Step 5** (`node index.js discover`).

Labels you already scraped will be skipped so you don't waste time and API credit re-doing them. If you want to force a fresh scrape of everything:

```
node index.js discover --force
```

---

## Adding labels you found yourself

If you find a label Claude missed and you want it included, open the file called `labels.json` in the project folder. You'll see an example entry. Add your own labels like this:

```json
[
  {
    "labelName": "Born Losers Records",
    "website": "https://bornlosersrecords.com",
    "location": "Philadelphia, PA"
  },
  {
    "labelName": "Some Other Label",
    "website": "https://someotherlabel.com",
    "location": "Brooklyn, NY"
  }
]
```

The format is strict: every `{ }` block is one label, separated by commas, and every label needs the curly quotes shown above. Save the file and re-run `node index.js discover`. Your manual labels will be added to the mix.

If you want to scrape just one label right now without running the whole pipeline:

```
node index.js scrape --url https://carparkrecords.com
```

---

## Tweaking what counts as a "HOT" prospect

If the scores feel wrong (too many HOTs, or the wrong genres), you can edit the AI's instructions.

Open `src/icp.js` in a text editor. You'll see two prompts:

- `ICP_SYSTEM_PROMPT` — describes Julian's ideal client.
- `LABEL_DISCOVERY_PROMPT` — describes the kinds of labels to find.

Edit either one in plain English. For example, if Julian wants to focus more on female artists, add that line to the system prompt. Save the file.

Then run:

```
node index.js score
node index.js export
```

This re-scores the artists you already scraped (using the new rules) and writes a fresh spreadsheet — **without** re-scraping any websites, so it's fast and cheap.

---

## The four commands, summarized

| Command | What it does |
|---|---|
| `node index.js discover` | The full thing: find labels → scrape artists → score → spreadsheet. Run this most of the time. |
| `node index.js scrape --url <url>` | Scrape just one label (paste the URL) and add the results to your existing data. |
| `node index.js score` | Re-score everyone you've already scraped, using the latest ICP rules. |
| `node index.js export` | Just write a fresh spreadsheet from the existing scored data. |

---

## If something goes wrong

**"command not found: node"** — Node.js isn't installed or your computer needs a restart. Go back to Step 1.

**"ANTHROPIC_API_KEY is not set"** — Your `.env` file is missing or empty. Go back to Step 4 and make sure the key is pasted in and the file is named exactly `.env` (with the dot).

**"Cannot find module"** — `npm install` didn't finish. Run it again.

**The tool hangs on one label for a long time** — Some label sites are slow or blocking us. It'll move on after a timeout. Be patient or press `Ctrl + C` to stop and skip that one.

**You see lots of "✗" lines during verification** — Normal. Some of the websites Claude suggests won't exist. The tool drops them automatically and moves on.

**Spreadsheet has fewer rows than you expected** — Some label sites are built in unusual ways and the scraper can't find the artist pages. Add those labels manually to `labels.json` with a `rosterPath` hint:

```json
{
  "labelName": "Tricky Label",
  "website": "https://trickylabel.com",
  "location": "Austin, TX",
  "rosterPath": "/our-bands",
  "artistLinkPattern": "/our-bands/"
}
```

`rosterPath` is the page where the artist list lives. `artistLinkPattern` is the part of the URL that all artist pages share.

---

## What's inside the project folder

You don't need to touch any of this, but if you're curious:

- `index.js` — the main file that handles the four commands.
- `src/` — the working parts (label discovery, scraping, scoring, exporting).
- `src/icp.js` — the AI prompts you can edit to change scoring behavior.
- `labels.json` — where you add labels manually.
- `data/` — created automatically; stores the raw scraped data as JSON so re-scoring is free and fast.
- `package.json` — Node's record of what dependencies are installed. Don't edit by hand.

That's it. Run `node index.js discover` whenever you want a fresh list of prospects.
