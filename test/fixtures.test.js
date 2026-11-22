// Tests against trimmed copies of real Goodreads and OverDrive pages
// (test/fixtures/, refreshed with `npm run fixtures`). These check that the
// extension still understands the sites' actual markup and data, so they
// assert on structure rather than on counts that change over time.

const { describe, test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { getBookInfo, getInjectionTarget, parseMediaItems } = require('../extension/lib.js');
const { readFixture, polyfillInnerText } = require('./helpers.js');

mock.method(console, 'log', () => {});

function goodreadsDocument(html) {
  const { window } = new JSDOM(html);
  polyfillInnerText(window);
  return window.document;
}

describe('Goodreads book page', () => {
  const doc = goodreadsDocument(readFixture('goodreads-book.html'));

  test('finds the title and author', () => {
    assert.deepEqual(getBookInfo(doc), { title: 'Project Hail Mary', author: 'Andy Weir' });
  });

  test('finds the sticky left column to put the widget in', () => {
    const target = getInjectionTarget(doc);
    assert.ok(target, 'no injection target found');
    assert.ok(target.classList.contains('Sticky'));
    assert.ok(target.closest('.BookPage__leftColumn'));
  });

  test('falls back to the older Goodreads layout', () => {
    const old = goodreadsDocument(`
      <h1 id="bookTitle">Whalefall</h1>
      <div id="bookAuthors"><a class="authorName"><span itemprop="name">Daniel Kraus</span></a></div>`);
    assert.deepEqual(getBookInfo(old), { title: 'Whalefall', author: 'Daniel Kraus' });
  });

  test('returns nothing on pages that are not books', () => {
    const home = goodreadsDocument('<h1>Recommendations</h1>');
    assert.equal(getBookInfo(home), null);
    assert.equal(getInjectionTarget(home), null);
  });
});

describe('OverDrive search page', () => {
  const html = readFixture('overdrive-search.html');
  const BASE = 'https://nypl.overdrive.com';

  test('has every field the extension reads', () => {
    const items = Object.values(JSON.parse(html.match(/window\.OverDrive\.mediaItems\s*=\s*(\{.*?\});/s)[1]));
    assert.ok(items.length > 0, 'no media items on the page');
    for (const item of items) {
      const where = `item "${item.title}"`;
      assert.equal(typeof item.title, 'string', `${where}: title`);
      assert.equal(typeof item.reserveId, 'string', `${where}: reserveId`);
      assert.equal(typeof item.type?.id, 'string', `${where}: type.id`);
      assert.ok(item.creators?.every(c => typeof c.name === 'string'), `${where}: creators[].name`);
      assert.equal(typeof item.isAvailable, 'boolean', `${where}: isAvailable`);
      assert.equal(typeof item.holdsCount, 'number', `${where}: holdsCount`);
      assert.equal(typeof item.ownedCopies, 'number', `${where}: ownedCopies`);
    }
  });

  test('finds the book and builds a row for each format', () => {
    const result = parseMediaItems(html, 'Project Hail Mary', 'Andy Weir', BASE);
    assert.ok(result, 'book not found on the saved search page');
    assert.ok(result.formats.length > 0);
    for (const format of result.formats) {
      assert.equal(format.url, `${BASE}/media/${format.reserveId}`);
      assert.equal(typeof format.holdsCount, 'number');
      assert.equal(typeof format.ownedCopies, 'number');
    }
  });

  test("only matches results by the book's author", () => {
    // The saved search includes look-alikes such as "Summary of Andy Weir's
    // Project Hail Mary" by another author; none of them should get a row.
    const items = Object.values(JSON.parse(html.match(/window\.OverDrive\.mediaItems\s*=\s*(\{.*?\});/s)[1]));
    const byReserveId = new Map(items.map(item => [item.reserveId, item]));
    const result = parseMediaItems(html, 'Project Hail Mary', 'Andy Weir', BASE);
    for (const format of result.formats) {
      const creators = byReserveId.get(format.reserveId).creators.map(c => c.name);
      assert.ok(creators.some(name => /weir/i.test(name)), `matched a book by ${creators.join(', ')}`);
    }
  });
});
