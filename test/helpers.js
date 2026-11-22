const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function readExtensionFile(name) {
  return fs.readFileSync(path.join(ROOT, 'extension', name), 'utf8');
}

// jsdom has no layout engine, so it doesn't implement innerText. For the plain
// title/author elements the extension reads, textContent gives the same result.
function polyfillInnerText(window) {
  if ('innerText' in window.HTMLElement.prototype) return;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent; },
  });
}

// Build a minimal OverDrive search page around a list of media items.
function overdrivePage(items) {
  const byId = Object.fromEntries(items.map((item, i) => [String(1000 + i), item]));
  return [
    '<script>',
    'window.OverDrive = window.OverDrive || {};',
    `window.OverDrive.mediaItems = ${JSON.stringify(byId)};`,
    'window.OverDrive.thunderHost = "https://thunder.api.overdrive.com/v2";',
    '</script>',
  ].join('\n');
}

// One OverDrive media item; defaults describe an ebook with a waitlist.
function mediaItem(overrides = {}) {
  const type = overrides.type?.id ?? 'ebook';
  return {
    reserveId: `${type}-reserve-id`,
    title: 'Whalefall',
    creators: [{ name: 'Daniel Kraus', role: 'Author' }],
    type: { id: 'ebook', name: 'eBook' },
    isAvailable: false,
    availableCopies: 0,
    ownedCopies: 14,
    holdsCount: 73,
    ...overrides,
  };
}

// Poll until `check` returns something truthy (for async UI updates).
async function waitFor(check, { timeout = 2000, message = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

module.exports = { readFixture, readExtensionFile, polyfillInnerText, overdrivePage, mediaItem, waitFor };
