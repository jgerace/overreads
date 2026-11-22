// Refresh the saved pages in test/fixtures/ from the live sites.
//
//   npm run fixtures
//
// The saved copies are trimmed to what the extension actually reads, so the
// repo doesn't carry Goodreads reviews or OverDrive's other page scripts:
//   - Goodreads: only the elements matched by GOODREADS_SELECTORS (plus their
//     ancestors, so the selectors still match); everything else is removed.
//   - OverDrive: only the `window.OverDrive.mediaItems = {...};` line, reduced
//     to the fields the extension uses.
//
// If either site has changed in a way that breaks the extension, this script
// stops with an error and leaves the existing fixtures alone.

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { GOODREADS_SELECTORS } = require('../extension/lib.js');

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

const BOOK = { title: 'Project Hail Mary', author: 'Andy Weir' };
const GOODREADS_URL = 'https://www.goodreads.com/book/show/54493401-project-hail-mary';
// Any OverDrive library works as a sample of the page format; NYPL is large and public.
// The query matches what content.js sends: "<title> <author>".
const OVERDRIVE_URL = `https://nypl.overdrive.com/search?query=${encodeURIComponent(`${BOOK.title} ${BOOK.author}`)}`;

// Fields of each OverDrive media item that lib.js reads (plus availableCopies for context).
const MEDIA_ITEM_FIELDS = ['id', 'reserveId', 'title', 'creators', 'type', 'isAvailable',
  'availableCopies', 'ownedCopies', 'holdsCount'];

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

function header(url) {
  const date = new Date().toISOString().slice(0, 10);
  return `<!-- Trimmed from ${url} on ${date} by scripts/refresh-fixtures.js -->\n`;
}

function trimGoodreads(html) {
  const { document } = new JSDOM(html).window;

  const keep = new Set();          // elements to keep (without their other children)
  const keepWhole = new Set();     // elements to keep along with everything inside them

  for (const [key, selectors] of Object.entries(GOODREADS_SELECTORS)) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      // Title and author need their text; the injection target only needs to exist.
      if (key !== 'injectionTarget') keepWhole.add(el);
      for (let node = el; node; node = node.parentElement) keep.add(node);
    }
  }

  const prune = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (keepWhole.has(child)) continue;
      if (keep.has(child)) prune(child);
      else child.remove();
    }
  };
  prune(document.documentElement);

  const title = document.querySelector(GOODREADS_SELECTORS.title.join(','))?.textContent.trim();
  const author = document.querySelector(GOODREADS_SELECTORS.author.join(','))?.textContent.trim();
  const target = document.querySelector(GOODREADS_SELECTORS.injectionTarget.join(','));
  if (title !== BOOK.title || author !== BOOK.author || !target) {
    throw new Error(`Goodreads page no longer matches the extension's selectors ` +
      `(found title=${JSON.stringify(title)}, author=${JSON.stringify(author)}, ` +
      `injection target=${!!target}). The request may also have been blocked.`);
  }

  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}\n`;
}

function trimOverDrive(html) {
  const line = html.split('\n').find(l => /window\.OverDrive\.mediaItems\s*=/.test(l));
  const match = line?.match(/^\s*window\.OverDrive\.mediaItems\s*=\s*(\{.*\});\s*$/);
  if (!match) throw new Error('OverDrive page no longer has a `window.OverDrive.mediaItems = {...};` line');

  const items = JSON.parse(match[1]);
  if (!Object.keys(items).length) throw new Error('OverDrive search returned no results');

  const trimmed = {};
  for (const [key, item] of Object.entries(items)) {
    const kept = {};
    for (const field of MEDIA_ITEM_FIELDS) {
      if (field in item) kept[field] = item[field];
    }
    kept.creators = kept.creators?.map(({ name, role }) => ({ name, role }));
    kept.type = kept.type && { id: kept.type.id, name: kept.type.name };
    trimmed[key] = kept;
  }

  return [
    '<!DOCTYPE html>',
    '<html><head><script>',
    'window.OverDrive = window.OverDrive || {};',
    `window.OverDrive.mediaItems = ${JSON.stringify(trimmed)};`,
    '</script></head><body></body></html>',
    '',
  ].join('\n');
}

async function main() {
  // Build both before writing either, so a failure leaves the old pair intact.
  const goodreads = header(GOODREADS_URL) + trimGoodreads(await download(GOODREADS_URL));
  const overdrive = header(OVERDRIVE_URL) + trimOverDrive(await download(OVERDRIVE_URL));

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  for (const [name, content] of [['goodreads-book.html', goodreads], ['overdrive-search.html', overdrive]]) {
    fs.writeFileSync(path.join(FIXTURES_DIR, name), content);
    console.log(`wrote test/fixtures/${name} (${(content.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch(err => {
  console.error(`Fixtures not updated: ${err.message}`);
  process.exit(1);
});
