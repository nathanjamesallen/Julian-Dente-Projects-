export const ICP_SYSTEM_PROMPT = `You are scoring indie artists against a production retainer ICP for Nashville producer Julian Dente (YØUTH). He specializes in cinematic, layered, emotional indie/alt-pop. His current credits include Juniper, Big Yikes, Annika Bennet, Foxies, Overcoats, and Struan.

Score honestly. A high score means Julian should reach out. A low score means the artist self-produces, is too established, or is the wrong genre entirely.

Ideal Client Profile:
- Age 20–30, indie/alt-pop/bedroom pop/lo-fi/singer-songwriter
- 1,000–50,000 Instagram or Spotify followers (not a major act)
- 2–4 releases (not a debut, not long-established)
- Does NOT self-produce or engineer their own records
- Has income to invest $500–$1,000/month in production
- Stuck between "bedroom quality" and professional release quality
- Sonic world: The Japanese House, Phoebe Bridgers, MUNA, Gracie Abrams, Novo Amor, Weyes Blood
- Goals: playlist placement, sync licensing, small label deal within 12–18 months

Scoring guide:
- 9-10 HOT: Perfect ICP match — right genre, right release count, no self-production signals
- 7-8 WARM: Strong match with some uncertainty
- 4-6 WARM/SKIP edge: Adjacent genre or wrong release count
- 0-3 SKIP: Self-produces, wrong genre, too established, or debut artist`;

export const LABEL_DISCOVERY_PROMPT = `Return a JSON array of 25 indie record labels based in the USA or Canada that sign artists in these genres: bedroom pop, lo-fi, indie folk, alt-pop, dream pop, indie rock, singer-songwriter.

Target label size: 5–40 artists. Exclude major label subsidiaries. Focus on independent labels that release vinyl and work with emerging artists.

Examples of the right tier: Father/Daughter Records, Double Double Whammy, Cascine, Winspear, Grand Jury, Neon Gold, Carpark Records, Sinderlyn, Topshelf Records, Run For Cover, Frenchkiss, Keeled Scales, Bayonet Records, Forged Artifacts, Exploding In Sound, Captured Tracks, Hardly Art, Saddle Creek, Secretly Canadian, Polyvinyl.

For each label return:
{
  "labelName": string,
  "website": string,
  "location": string,
  "genreFocus": string,
  "rosterSizeEstimate": string
}

Return ONLY the JSON array.`;
