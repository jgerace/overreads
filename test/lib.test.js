// Unit tests for lib.js, using small hand-written OverDrive pages so each
// case controls exactly the data it needs.

const { describe, test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { parseMediaItems, formatRow } = require('../extension/lib.js');
const { overdrivePage, mediaItem } = require('./helpers.js');

// parseMediaItems logs its matching steps for in-browser debugging; keep test output clean.
mock.method(console, 'log', () => {});
mock.method(console, 'warn', () => {});

const BASE = 'https://examplelibrary.overdrive.com';

describe('parseMediaItems', () => {
  test('builds links from the library it is given', () => {
    // Regression: links once used a leftover OVERDRIVE_BASE constant and threw.
    const result = parseMediaItems(overdrivePage([mediaItem()]), 'Whalefall', 'Daniel Kraus', BASE);
    assert.equal(result.url, `${BASE}/media/ebook-reserve-id`);
    assert.equal(result.formats[0].url, `${BASE}/media/ebook-reserve-id`);
  });

  test('returns one row per format with its hold and copy counts', () => {
    const page = overdrivePage([
      mediaItem({ type: { id: 'audiobook', name: 'Audiobook' }, ownedCopies: 21, holdsCount: 72 }),
      mediaItem({ type: { id: 'ebook', name: 'eBook' }, ownedCopies: 14, holdsCount: 73 }),
    ]);
    const { formats } = parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE);
    assert.deepEqual(
      formats.map(({ label, holdsCount, ownedCopies }) => ({ label, holdsCount, ownedCopies })),
      [
        { label: 'Audiobook', holdsCount: 72, ownedCopies: 21 },
        { label: 'eBook', holdsCount: 73, ownedCopies: 14 },
      ],
    );
  });

  test('ignores similarly titled books by other authors', () => {
    const page = overdrivePage([
      mediaItem({ title: 'Summary of Whalefall', creators: [{ name: 'Quick Reads Press' }], reserveId: 'summary' }),
      mediaItem({ reserveId: 'real-book' }),
    ]);
    const { formats } = parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE);
    assert.deepEqual(formats.map(f => f.reserveId), ['real-book']);
  });

  test('matches titles despite case, punctuation and subtitles', () => {
    const page = overdrivePage([mediaItem({ title: 'WHALEFALL' })]);
    assert.ok(parseMediaItems(page, 'Whalefall: A Novel', 'Daniel Kraus', BASE));
  });

  test('prefers an available copy when a format is listed twice', () => {
    const page = overdrivePage([
      mediaItem({ reserveId: 'waitlisted', isAvailable: false }),
      mediaItem({ reserveId: 'on-shelf', isAvailable: true }),
    ]);
    const { formats } = parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE);
    assert.equal(formats.length, 1);
    assert.equal(formats[0].reserveId, 'on-shelf');
  });

  test("labels unknown media types with OverDrive's own name", () => {
    const page = overdrivePage([mediaItem({ type: { id: 'periodical', name: 'Periodical' } })]);
    const [format] = parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE).formats;
    assert.equal(format.label, 'Periodical');
    assert.equal(format.icon, '📦');
  });

  test('returns null when no result matches the book', () => {
    const page = overdrivePage([mediaItem({ title: 'Something Else' })]);
    assert.equal(parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE), null);
  });

  test('returns null when the page has no results data', () => {
    assert.equal(parseMediaItems('<html><body>No results</body></html>', 'Whalefall', 'Daniel Kraus', BASE), null);
  });

  test('returns null when the results data is not valid JSON', () => {
    const page = '<script>window.OverDrive.mediaItems = {not json};</script>';
    assert.equal(parseMediaItems(page, 'Whalefall', 'Daniel Kraus', BASE), null);
  });
});

describe('formatRow', () => {
  const render = format => JSDOM.fragment(formatRow({ icon: '📖', label: 'eBook', url: `${BASE}/media/x`, ...format }));
  const text = (row, selector) => row.querySelector(selector)?.textContent.trim();

  test('shows a Borrow link when a copy is available', () => {
    const row = render({ isAvailable: true, holdsCount: 0, ownedCopies: 3 });
    assert.equal(text(row, '.libby-format-status'), 'Available');
    assert.equal(text(row, '.libby-format-link'), 'Borrow →');
    assert.equal(row.querySelector('.libby-format-link').href, `${BASE}/media/x`);
  });

  test('shows holds and total copies when there is a waitlist', () => {
    const row = render({ isAvailable: false, holdsCount: 72, ownedCopies: 21 });
    assert.ok(row.querySelector('.libby-format-waitlist'));
    assert.equal(text(row, '.libby-format-copies'), '21 copies');
    assert.equal(text(row, '.libby-format-status'), '72 holds21 copies'); // two lines, styled by badge.css
    assert.equal(text(row, '.libby-format-link'), 'Hold →');
  });

  test('uses singular wording for one hold and one copy', () => {
    const row = render({ isAvailable: false, holdsCount: 1, ownedCopies: 1 });
    assert.equal(text(row, '.libby-format-status'), '1 hold1 copy');
  });

  test('leaves out the copy line when OverDrive gives no copy count', () => {
    const row = render({ isAvailable: false, holdsCount: 5, ownedCopies: undefined });
    assert.equal(row.querySelector('.libby-format-copies'), null);
    assert.equal(text(row, '.libby-format-status'), '5 holds');
  });

  test('shows Unavailable with no link when there is no waitlist', () => {
    const row = render({ isAvailable: false, holdsCount: 0, ownedCopies: 3 });
    assert.equal(text(row, '.libby-format-status'), 'Unavailable');
    assert.equal(row.querySelector('.libby-format-link'), null);
  });
});
