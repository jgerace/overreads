const ext     = globalThis.chrome ?? globalThis.browser;
const input   = document.getElementById('slug-input');
const saveBtn = document.getElementById('save-btn');
const statusEl  = document.getElementById('status');
const preview = document.getElementById('preview');

// Load saved slug on open
ext.storage.sync.get('librarySlug', ({ librarySlug }) => {
  if (librarySlug) {
    input.value = librarySlug;
    showPreview(librarySlug);
  }
});

saveBtn.addEventListener('click', () => {
  const slug = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (!slug) {
    showStatus('Please enter a slug.', true);
    return;
  }

  ext.storage.sync.set({ librarySlug: slug }, () => {
    input.value = slug;
    showStatus('✓ Saved! Checking current page…');
    showPreview(slug);

    // Tell the active Goodreads tab to re-run immediately
    ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        ext.tabs.sendMessage(tabs[0].id, { type: 'SLUG_UPDATED' });
      }
    });
  });
});

// Allow saving with Enter key
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (isError ? ' error' : '');
}

function showPreview(slug) {
  preview.textContent = `https://${slug}.overdrive.com`;
  preview.style.display = 'block';
}
