// End-to-end tests of the content script: load the saved Goodreads page in
// jsdom, run lib.js + content.js the way the browser does, stub the extension
// storage API and the OverDrive request, and check the widget that appears.

const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { readFixture, readExtensionFile, polyfillInnerText, waitFor } = require('./helpers.js');

const LIB_JS = readExtensionFile('lib.js');
const CONTENT_JS = readExtensionFile('content.js');
const GOODREADS_PAGE = readFixture('goodreads-book.html');
const OVERDRIVE_PAGE = readFixture('overdrive-search.html');
const GOODREADS_URL = 'https://www.goodreads.com/book/show/54493401-project-hail-mary';

let openWindows = [];
afterEach(() => {
  openWindows.forEach(w => w.close());
  openWindows = [];
});

function runContentScript({ page = GOODREADS_PAGE, storage = {}, respond }) {
  const warnings = [];
  const virtualConsole = new VirtualConsole(); // swallow the script's debug logging...
  virtualConsole.on('warn', (...args) => warnings.push(args.map(String).join(' ')));   // ...but keep problems
  virtualConsole.on('error', (...args) => warnings.push(args.map(String).join(' ')));
  virtualConsole.on('jsdomError', err => warnings.push(String(err)));

  const { window } = new JSDOM(page, { url: GOODREADS_URL, runScripts: 'outside-only', virtualConsole });
  openWindows.push(window);
  polyfillInnerText(window);

  const requests = [];
  window.chrome = {
    storage: { sync: { get: async () => ({ ...storage }) } },
    runtime: { onMessage: { addListener() {} } },
  };
  window.fetch = async (url) => {
    requests.push(String(url));
    return respond();
  };

  window.eval(LIB_JS);
  window.eval(CONTENT_JS);
  return { document: window.document, requests, warnings };
}

const okResponse = html => ({ ok: true, status: 200, text: async () => html });

const finishedBadge = document => () => {
  const badge = document.getElementById('libby-badge');
  return badge && !badge.classList.contains('libby-widget-loading') && badge;
};

describe('content script', () => {
  test('asks for a library when none has been set', async () => {
    const { document, requests } = runContentScript({ respond: () => okResponse(OVERDRIVE_PAGE) });
    const badge = await waitFor(finishedBadge(document), { message: 'setup badge' });
    assert.match(badge.textContent, /set your library's OverDrive slug/);
    assert.deepEqual(requests, []);
  });

  test('shows availability from the library for the book on the page', async () => {
    const { document, requests, warnings } = runContentScript({
      storage: { librarySlug: 'nypl' },
      respond: () => okResponse(OVERDRIVE_PAGE),
    });
    const badge = await waitFor(finishedBadge(document), { message: 'availability badge' });

    const searchUrl = 'https://nypl.overdrive.com/search?query=Project%20Hail%20Mary%20Andy%20Weir';
    assert.deepEqual(requests, [searchUrl]);

    // It went into the left column, and has rows rather than "not found".
    assert.ok(badge.closest('.BookPage__leftColumn .Sticky'));
    const rows = badge.querySelectorAll('.libby-format-row');
    assert.ok(rows.length > 0, `expected format rows, got: ${badge.textContent.trim()}`);

    for (const link of badge.querySelectorAll('.libby-format-link')) {
      assert.match(link.href, /^https:\/\/nypl\.overdrive\.com\/media\/[\w-]+$/);
    }
    assert.equal(badge.querySelector('.libby-header-link').href, searchUrl);

    // content.js catches errors and logs "Fetch failed" instead of throwing, so
    // a bug like the old OVERDRIVE_BASE ReferenceError only shows up here.
    assert.deepEqual(warnings, []);
  });

  test('says not found when the library site returns an error', async () => {
    const { document } = runContentScript({
      storage: { librarySlug: 'nypl' },
      respond: () => ({ ok: false, status: 503, text: async () => '' }),
    });
    const badge = await waitFor(finishedBadge(document), { message: 'not-found badge' });
    assert.match(badge.textContent, /Not found in your library/);
  });

  test('does nothing on pages that are not books', async () => {
    const { document, requests } = runContentScript({
      page: '<!DOCTYPE html><html><body><h1>Recommendations</h1></body></html>',
      storage: { librarySlug: 'nypl' },
      respond: () => okResponse(OVERDRIVE_PAGE),
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(document.getElementById('libby-badge'), null);
    assert.deepEqual(requests, []);
  });
});
