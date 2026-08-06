// Fetches Scopus publication data for AUTHOR_ID and writes scopus-data.json.
// Run by .github/workflows/update-scopus.yml on a schedule. Requires
// ELSEVIER_API_KEY as an environment variable (GitHub Actions secret).

const AUTHOR_ID = '57226822517';
const PAGE_SIZE = 25;
const MAX_RECORDS = 200;
const FIELDS = 'dc:title,prism:publicationName,prism:coverDate,prism:doi,citedby-count';

async function fetchAllPublications(apiKey) {
  const all = [];
  let start = 0;
  let total = Infinity;

  while (start < total && all.length < MAX_RECORDS) {
    const url =
      'https://api.elsevier.com/content/search/scopus?query=' +
      encodeURIComponent(`AU-ID(${AUTHOR_ID})`) +
      `&count=${PAGE_SIZE}&start=${start}&sort=-coverDate&field=${FIELDS}`;

    const resp = await fetch(url, {
      headers: { 'X-ELS-APIKey': apiKey, Accept: 'application/json' },
    });
    if (!resp.ok) {
      throw new Error(`Search API returned ${resp.status}: ${await resp.text()}`);
    }
    const json = await resp.json();
    const results = json['search-results'] || {};
    total = parseInt(results['opensearch:totalResults'], 10) || 0;
    const entries = results.entry || [];

    for (const e of entries) {
      all.push({
        title: e['dc:title'] || 'Untitled',
        venue: e['prism:publicationName'] || '',
        date: e['prism:coverDate'] || '',
        citedBy: parseInt(e['citedby-count'], 10) || 0,
        doi: e['prism:doi'] || '',
      });
    }

    if (entries.length === 0) break;
    start += PAGE_SIZE;
  }

  return all;
}

function computeSummary(publications) {
  const citeCounts = publications.map((p) => p.citedBy).sort((a, b) => b - a);
  let hIndex = 0;
  for (let i = 0; i < citeCounts.length; i++) {
    if (citeCounts[i] >= i + 1) hIndex = i + 1;
    else break;
  }
  const citationCount = citeCounts.reduce((sum, c) => sum + c, 0);
  return { hIndex, citationCount, documentCount: publications.length };
}

async function main() {
  const apiKey = process.env.ELSEVIER_API_KEY;
  if (!apiKey) throw new Error('ELSEVIER_API_KEY env var is not set.');

  const publications = await fetchAllPublications(apiKey);
  const summary = computeSummary(publications);

  const output = {
    generatedAt: new Date().toISOString(),
    authorId: AUTHOR_ID,
    summary,
    publications,
    license:
      '© Some rights reserved. This work permits academic research purposes only, ' +
      'distribution, and reproduction in any medium, provided the original author and ' +
      'source are credited. Data via Scopus / Elsevier.',
  };

  const fs = require('fs');
  fs.writeFileSync('scopus-data.json', JSON.stringify(output, null, 2));
  console.log(`Wrote scopus-data.json: ${publications.length} publications, h-index ${summary.hIndex}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
