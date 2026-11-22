// ============================================================
//  Overreads — content.js
//  Runs on every Goodreads page, detects book titles/authors,
//  queries OverDrive, and injects availability badges.
//  Page parsing and row rendering live in lib.js, which the
//  manifest loads first.
// ============================================================

/* global getBookInfo, getInjectionTarget, parseMediaItems, formatRow */

const ext = globalThis.chrome ?? globalThis.browser;

// ── 1. Fetch OverDrive search results ───────────────────────

async function searchOverDrive(title, author, overdriveBase) {
  const query = encodeURIComponent(`${title} ${author}`);
  const searchUrl = `${overdriveBase}/search?query=${query}`;

  console.log('[Goodreads×Libby] Searching:', searchUrl);

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    console.log('[Goodreads×Libby] Got HTML, length:', html.length);
    console.log('[Goodreads×Libby] Has mediaItems?', html.includes('window.OverDrive.mediaItems'));

    const result = parseMediaItems(html, title, author, overdriveBase);
    console.log('[Goodreads×Libby] Parse result:', result);

    if (result) result.searchUrl = searchUrl;
    return result;
  } catch (err) {
    console.warn('[Goodreads×Libby] Fetch failed:', err);
    return null;
  }
}

// ── 2. Build and inject the widget ───────────────────────────

function createBadge(result) {
  const widget = document.createElement('div');
  widget.id = 'libby-badge';
  widget.className = 'libby-widget';

  if (!result) {
    widget.innerHTML = `
      <div class="libby-header">
        <span class="libby-logo">📚</span>
        <span class="libby-title">Libby</span>
      </div>
      <div class="libby-not-found">Not found in your library</div>
    `;
    return widget;
  }

  const formatRows = result.formats.length > 0
    ? result.formats.map(f => formatRow(f)).join('')
    : `<div class="libby-not-found">No formats available</div>`;

  widget.innerHTML = `
    <div class="libby-header">
      <span class="libby-logo">📚</span>
      <span class="libby-title">Libby</span>
      <a class="libby-header-link" href="${result.searchUrl}" target="_blank">View →</a>
    </div>
    <div class="libby-formats">
      ${formatRows}
    </div>
  `;

  return widget;
}

function injectBadge(badge, target) {
  document.getElementById('libby-badge')?.remove();
  target.appendChild(badge);
}

// ── 3. Loading state ─────────────────────────────────────────

function createLoadingBadge() {
  const widget = document.createElement('div');
  widget.id = 'libby-badge';
  widget.className = 'libby-widget libby-widget-loading';
  widget.innerHTML = `
    <div class="libby-header">
      <span class="libby-logo">📚</span>
      <span class="libby-title">Libby</span>
    </div>
    <div class="libby-loading-row">Checking library…</div>
  `;
  return widget;
}

// ── 4. Main ──────────────────────────────────────────────────

async function main() {
  const bookInfo = getBookInfo();
  if (!bookInfo) return; // not a book page

  const target = getInjectionTarget();
  if (!target) return;

  // Load library slug from storage
  const { librarySlug } = await ext.storage.sync.get('librarySlug');

  if (!librarySlug) {
    const widget = document.createElement('div');
    widget.id = 'libby-badge';
    widget.className = 'libby-widget';
    widget.innerHTML = `
      <div class="libby-header">
        <span class="libby-logo">📚</span>
        <span class="libby-title">Libby</span>
      </div>
      <div class="libby-not-found">
        Click the extension icon to set your library's OverDrive slug.
      </div>
    `;
    document.getElementById('libby-badge')?.remove();
    target.appendChild(widget);
    return;
  }

  const overdriveBase = `https://${librarySlug}.overdrive.com`;

  // Show loading state immediately
  injectBadge(createLoadingBadge(), target);

  const result = await searchOverDrive(bookInfo.title, bookInfo.author, overdriveBase);
  injectBadge(createBadge(result), target);
}

// Run on page load, and again if Goodreads navigates via JS
main();

// Re-run when the popup saves a new slug
ext.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SLUG_UPDATED') main();
});

// Goodreads is a SPA — re-run when the URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(main, 1000); // wait for new page content to render
  }
}).observe(document.body, { subtree: true, childList: true });
