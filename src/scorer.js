import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';
import { log } from './logger.js';
import { ICP_SYSTEM_PROMPT } from './icp.js';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

function buildUserPrompt(a) {
  return `ARTIST: ${a.artistName}
LABEL: ${a.labelName} (${a.labelLocation || 'unknown'})
BIO: ${(a.bio || '').slice(0, 2500)}
RELEASES: ${(a.releases || []).join(', ') || 'unknown'} (count: ${a.releaseCount ?? 0})
SPOTIFY: ${a.spotifyUrl || 'unknown'}
INSTAGRAM: ${a.instagramHandle || 'unknown'}

Return ONLY this JSON:
{
  "icpScore": <0-10>,
  "flag": <"HOT" | "WARM" | "SKIP">,
  "genre": <string>,
  "location": <string>,
  "selfProduces": <boolean>,
  "icpNotes": <2-3 sentences explaining score>,
  "pitchAngle": <one sharp sentence: the specific reason Julian should reach out to this artist>
}`;
}

async function scoreOne(artist, attempt = 0) {
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: ICP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(artist) }],
    });
    const text = resp.content.map((c) => c.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response.');
    const parsed = JSON.parse(match[0]);
    return { ...artist, ...parsed, _scored: true };
  } catch (e) {
    if (attempt === 0) {
      log.warn(`Retry scoring ${artist.artistName}: ${e.message.slice(0, 80)}`);
      return scoreOne(artist, 1);
    }
    log.err(`Failed scoring ${artist.artistName}: ${e.message.slice(0, 100)}`);
    return {
      ...artist,
      icpScore: 0,
      flag: 'SKIP',
      genre: '',
      location: '',
      selfProduces: false,
      icpNotes: `Scoring failed: ${e.message}`,
      pitchAngle: '',
      _scored: false,
    };
  }
}

export async function scoreArtists(artists) {
  log.step(`Phase 3: Scoring ${artists.length} artists against ICP`);
  const limit = pLimit(3);
  let done = 0;
  const results = await Promise.all(
    artists.map((a) =>
      limit(async () => {
        const scored = await scoreOne(a);
        done++;
        if (done % 5 === 0 || done === artists.length) {
          log.info(`Scored ${done}/${artists.length}`);
        }
        return scored;
      }),
    ),
  );
  return results;
}
