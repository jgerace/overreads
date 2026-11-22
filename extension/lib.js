// ============================================================
//  Overreads — lib.js
//  Side-effect-free helpers: reading the Goodreads page, parsing
//  OverDrive search results, and rendering format rows.
//  Loaded before content.js (see manifest.json) and imported
//  directly by the test suite.
// ============================================================

// ── 1. Goodreads page scraping ──────────────────────────────

// Tried in order; the first selector that matches wins. Newer Goodreads
// markup first, older layouts as fallbacks. scripts/refresh-fixtures.js
// uses this same list to decide what to keep in the saved test page.
const GOODREADS_SELECTORS = {
  title: [
    'h1[data-testid="bookTitle"]',
    'h1.Text__title1',
    '#bookTitle',
  ],
  author: [
    'span[data-testid="name"]',
    '.ContributorLink__name',
    '#bookAuthors .authorName span[itemprop="name"]',
  ],
  // Inject into the Sticky container so the widget sticks with the left panel
  injectionTarget: [
    '.BookPage__leftColumn .Sticky',
    '.BookPage__leftColumn',
  ],
};

function firstMatch(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function getBookInfo(doc = document) {
  const title = firstMatch(doc, GOODREADS_SELECTORS.title)?.innerText?.trim();
  const author = firstMatch(doc, GOODREADS_SELECTORS.author)?.innerText?.trim();
  return title && author ? { title, author } : null;
}

function getInjectionTarget(doc = document) {
  return firstMatch(doc, GOODREADS_SELECTORS.injectionTarget);
}

// ── 2. OverDrive search result parsing ──────────────────────

function parseMediaItems(html, title, author, overdriveBase) {
  const match = html.match(/window\.OverDrive\.mediaItems\s*=\s*(\{.*?\});/s);

  console.log('[Goodreads×Libby] mediaItems regex match?', !!match);
  if (!match) return null;

  let mediaItems;
  try {
    mediaItems = JSON.parse(match[1]);
  } catch {
    console.warn('[Goodreads×Libby] JSON parse failed');
    return null;
  }

  const normalise = str => str?.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const normTitle = normalise(title);
  const normAuthor = normalise(author);
  const authorLastName = normAuthor.split(' ').pop();

  console.log('[Goodreads×Libby] Matching title:', normTitle, '| author last name:', authorLastName);
  console.log('[Goodreads×Libby] Available items:', Object.values(mediaItems).map(i => ({
    title: normalise(i.title),
    creators: i.creators?.map(c => normalise(c.name)),
    type: i.type?.id,
  })));

  // Collect ALL matching items — OverDrive returns separate items per media type
  // (e.g. one item for the audiobook edition, another for the ebook edition)
  const matchingItems = Object.values(mediaItems).filter(item => {
    const itemTitle = normalise(item.title);
    const itemCreators = item.creators?.map(c => normalise(c.name)).join(' ') || '';
    const titleMatch = itemTitle?.includes(normTitle) || normTitle?.includes(itemTitle);
    const authorMatch = itemCreators.includes(authorLastName);
    return titleMatch && authorMatch;
  });

  if (!matchingItems.length) return null;


  // Consolidate by media type — all formats within the same item share
  // the same availability and URL, so one row per item is enough
  const TYPE_META = {
    'audiobook': { label: 'Audiobook', icon: '🎧' },
    'ebook':     { label: 'eBook',     icon: '📖' },
    'video':     { label: 'Video',     icon: '🎬' },
    'magazine':  { label: 'Magazine',  icon: '📰' },
  };

  const consolidatedFormats = matchingItems.map(item => {
    const meta = TYPE_META[item.type?.id] || { label: item.type?.name || 'Unknown', icon: '📦' };
    return {
      label: meta.label,
      icon: meta.icon,
      isAvailable: item.isAvailable ?? false,
      holdsCount: item.holdsCount ?? 0,
      ownedCopies: item.ownedCopies, // total copies the library owns (the "30" in "0 of 30 copies")
      reserveId: item.reserveId,
      url: `${overdriveBase}/media/${item.reserveId}`,
    };
  });

  // Dedupe by label just in case there are duplicate items of the same type
  const seen = new Map();
  for (const f of consolidatedFormats) {
    if (!seen.has(f.label) || f.isAvailable) seen.set(f.label, f);
  }
  const dedupedFormats = Array.from(seen.values());

  // Use the first matching item for top-level metadata
  const primary = matchingItems[0];

  return {
    title: primary.title,
    creators: primary.creators,
    formats: dedupedFormats,
    reserveId: primary.reserveId,
    url: `${overdriveBase}/media/${primary.reserveId}`,
  };
}

// ── 3. Widget rows ──────────────────────────────────────────

function formatRow(f) {
  const url = f.url;
  if (f.isAvailable) {
    return `
      <div class="libby-format-row libby-format-available">
        <span class="libby-format-icon">${f.icon}</span>
        <span class="libby-format-label">${f.label}</span>
        <span class="libby-format-status">Available</span>
        <a class="libby-format-link" href="${url}" target="_blank">Borrow →</a>
      </div>`;
  } else if (f.holdsCount > 0) {
    const copies = Number.isFinite(f.ownedCopies)
      ? `<span class="libby-format-copies">${f.ownedCopies} cop${f.ownedCopies !== 1 ? 'ies' : 'y'}</span>`
      : '';
    return `
      <div class="libby-format-row libby-format-waitlist">
        <span class="libby-format-icon">${f.icon}</span>
        <span class="libby-format-label">${f.label}</span>
        <span class="libby-format-status">${f.holdsCount} hold${f.holdsCount !== 1 ? 's' : ''}${copies}</span>
        <a class="libby-format-link" href="${url}" target="_blank">Hold →</a>
      </div>`;
  } else {
    return `
      <div class="libby-format-row libby-format-unavailable">
        <span class="libby-format-icon">${f.icon}</span>
        <span class="libby-format-label">${f.label}</span>
        <span class="libby-format-status">Unavailable</span>
      </div>`;
  }
}

// In the browser this file is a plain content script and `module` doesn't
// exist; under Node (the test suite) it exports the helpers.
if (typeof module !== 'undefined') {
  module.exports = { GOODREADS_SELECTORS, getBookInfo, getInjectionTarget, parseMediaItems, formatRow };
}
