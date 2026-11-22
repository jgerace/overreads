# overreads

[![Tests](https://github.com/jgerace/overreads/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/jgerace/overreads/actions/workflows/test.yml)

A browser extension to display an ebook's availability from your local library's Overdrive inventory on Goodreads

## What it does

On a Goodreads book page, a small widget in the left column lists each format
(eBook, audiobook, …) your library has on OverDrive (Libby):

- **Available** — ready to borrow now, with a Borrow link
- **Waitlist** — how many holds there are and how many copies the library owns, with a Hold link
- **Unavailable** — in the collection, but no copies free and no waitlist
- **Not found** — no match in your library's catalogue

<img src="docs/screenshot.png" width="400" alt="Goodreads page for Anna Karenina with the widget below the rating stars: the audiobook has 35 holds on 4 copies with a Hold button, and the eBook is available with a Borrow button">

## Installing for development

**Chrome:** open `chrome://extensions`, turn on **Developer mode**, click
**Load unpacked** and choose the `extension/` folder.

**Firefox:** open `about:debugging`, click **This Firefox → Load Temporary
Add-on** and choose `extension/manifest.json`.

Then click the extension's toolbar icon and enter your library's OverDrive
slug — the first part of its OverDrive address, e.g. `freelibrary` for
`freelibrary.overdrive.com`.

## Development

Needs Node.js 24.

```sh
npm ci            # install dev tools
npm test          # run the test suite
npm run lint      # ESLint + Mozilla's extension linter (web-ext lint)
npm run fixtures  # refresh the saved Goodreads/OverDrive pages (see below)
```

### Tests

| File | What it covers |
| --- | --- |
| `test/lib.test.js` | Title/author matching and widget rows, using small hand-written OverDrive data |
| `test/fixtures.test.js` | Trimmed copies of a real Goodreads book page and OverDrive search page, to check the extension still understands the sites' markup and data |
| `test/content.test.js` | The whole content script running in [jsdom](https://github.com/jsdom/jsdom) on the saved Goodreads page, with extension storage and the OverDrive request stubbed out |

The saved pages in `test/fixtures/` keep the tests fast and offline, but they
don't notice when Goodreads or OverDrive change. `npm run fixtures` downloads
fresh copies and stops with an error if the live pages no longer match what the
extension expects; run `npm test` afterwards to check everything else.

GitHub Actions (`.github/workflows/test.yml`) runs the linters and tests on
every pull request and every push to `main`. The badge above shows the result
for `main`.

## Project structure

```
extension/              # everything that ships in the extension
├── manifest.json
├── lib.js              # reads Goodreads pages, parses OverDrive results, renders rows
├── content.js          # runs on Goodreads: storage, OverDrive request, widget
├── badge.css           # widget styles
├── popup.html/.js      # toolbar popup for setting the library
└── icon48.png, icon128.png
test/                   # node:test suites and saved pages
docs/                   # images for this README
scripts/
├── refresh-fixtures.js # updates test/fixtures/ from the live sites
└── make_icons.py       # draws the toolbar icons
```

## How it works

1. `content.js` reads the book's title and author from the Goodreads page.
2. It fetches your library's OverDrive search page for that title and author.
3. `lib.js` pulls the `window.OverDrive.mediaItems` JSON out of that page and
   keeps the results whose title and author match.
4. The widget is added to the left column, one row per format.

## Known limitations

- No caching yet: OverDrive is searched on every book page visit.
- Goodreads or OverDrive markup changes can break it. `npm run fixtures` is the
  quickest way to find out what changed; the selectors live in
  `GOODREADS_SELECTORS` in `extension/lib.js`.
- If every copy is checked out but nobody is waiting, the row shows
  "Unavailable" with no Hold link.

## License

[GPL-3.0](LICENSE)
