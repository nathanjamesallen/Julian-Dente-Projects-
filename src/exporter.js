import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { log } from './logger.js';
import { datestamp } from './utils.js';

const FLAG_ORDER = { HOT: 0, WARM: 1, SKIP: 2 };

export async function exportArtistsCsv(artists, outDir = process.cwd()) {
  const sorted = [...artists].sort((a, b) => {
    const fa = FLAG_ORDER[a.flag] ?? 3;
    const fb = FLAG_ORDER[b.flag] ?? 3;
    if (fa !== fb) return fa - fb;
    return (b.icpScore ?? 0) - (a.icpScore ?? 0);
  });

  const file = path.join(outDir, `julian-prospects-${datestamp()}.csv`);
  const writer = createObjectCsvWriter({
    path: file,
    header: [
      { id: 'flag', title: 'Flag' },
      { id: 'icpScore', title: 'ICP Score' },
      { id: 'artistName', title: 'Artist Name' },
      { id: 'labelName', title: 'Label Name' },
      { id: 'labelLocation', title: 'Label Location' },
      { id: 'labelWebsite', title: 'Label Website' },
      { id: 'labelInstagram', title: 'Label Instagram' },
      { id: 'labelContactPage', title: 'Label Contact Page' },
      { id: 'location', title: 'Artist Location' },
      { id: 'genre', title: 'Genre' },
      { id: 'bioShort', title: 'Bio (200 char max)' },
      { id: 'spotifyUrl', title: 'Spotify URL' },
      { id: 'instagramHandle', title: 'Instagram Handle' },
      { id: 'bandcampUrl', title: 'Bandcamp URL' },
      { id: 'bookingEmail', title: 'Booking Email' },
      { id: 'websiteUrl', title: 'Artist Website' },
      { id: 'releaseCount', title: 'Release Count' },
      { id: 'releasesJoined', title: 'Releases' },
      { id: 'selfProduces', title: 'Self-Produces' },
      { id: 'icpNotes', title: 'ICP Notes' },
      { id: 'pitchAngle', title: 'Pitch Angle' },
      { id: 'labelPageUrl', title: 'Artist Label Page URL' },
    ],
  });

  const rows = sorted.map((a) => ({
    ...a,
    bioShort: (a.bio || '').replace(/\s+/g, ' ').slice(0, 200),
    releasesJoined: (a.releases || []).join(' | '),
    labelInstagram: a.labelInstagram || '',
    labelContactPage: a.labelContactPage || '',
    selfProduces: a.selfProduces === true ? 'TRUE' : a.selfProduces === false ? 'FALSE' : '',
  }));
  await writer.writeRecords(rows);
  log.ok(`Wrote ${rows.length} artist rows → ${file}`);
  return file;
}

export async function exportLabelsCsv(labels, outDir = process.cwd()) {
  const file = path.join(outDir, `labels-${datestamp()}.csv`);
  const writer = createObjectCsvWriter({
    path: file,
    header: [
      { id: 'labelName', title: 'Label Name' },
      { id: 'website', title: 'Website' },
      { id: 'location', title: 'Location' },
      { id: 'genreFocus', title: 'Genre Focus' },
      { id: 'rosterSizeEstimate', title: 'Roster Size' },
      { id: 'contactEmail', title: 'Contact Email' },
      { id: 'contactPage', title: 'Contact Page' },
      { id: 'instagram', title: 'Instagram' },
      { id: 'rosterUrl', title: 'Roster Page URL' },
      { id: 'artistCount', title: 'Artists Scraped' },
    ],
  });
  await writer.writeRecords(labels);
  log.ok(`Wrote ${labels.length} label rows → ${file}`);
  return file;
}
