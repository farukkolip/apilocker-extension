// API Vault — Popup Controller

let sessionKey = null;
let allKeys    = [];
let editId     = null;
let selectedProvider = null;

// ── Screen Management ──────────────────────────────────────────────────────

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const setup = await Vault.isSetup();
  if (!setup) {
    show('screen-setup');
    document.getElementById('setup-password').focus();
  } else {
    const session = await new Promise(r => chrome.storage.session.get('vault_key', r));
    if (session.vault_key) {
      try {
        const rawKey = new Uint8Array(session.vault_key);
        sessionKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        allKeys = await Vault.loadKeys(sessionKey);
        await renderMain();
        return;
      } catch { /* fall through */ }
    }
    show('screen-lock');
    document.getElementById('lock-password').focus();
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────

document.getElementById('setup-btn').addEventListener('click', async () => {
  const pw1 = document.getElementById('setup-password').value;
  const pw2 = document.getElementById('setup-confirm').value;
  const err = document.getElementById('setup-error');
  if (pw1.length < 8) { showError(err, 'Password must be at least 8 characters.'); return; }
  if (pw1 !== pw2)    { showError(err, 'Passwords do not match.'); return; }
  err.classList.add('hidden');
  const btn = document.getElementById('setup-btn');
  btn.disabled = true; btn.textContent = 'Creating vault…';
  try {
    sessionKey = await Vault.setup(pw1);
    await persistSessionKey(sessionKey);
    allKeys = [];
    await renderMain();
  } catch (e) {
    showError(err, 'Error: ' + e.message);
    btn.disabled = false; btn.textContent = 'Create Vault';
  }
});

// ── Unlock ─────────────────────────────────────────────────────────────────

document.getElementById('unlock-btn').addEventListener('click', doUnlock);
document.getElementById('lock-password').addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });

async function doUnlock() {
  const pw  = document.getElementById('lock-password').value;
  const err = document.getElementById('lock-error');
  const btn = document.getElementById('unlock-btn');
  btn.disabled = true; btn.textContent = 'Unlocking…';
  try {
    sessionKey = await Vault.unlock(pw);
    await persistSessionKey(sessionKey);
    allKeys = await Vault.loadKeys(sessionKey);
    document.getElementById('lock-password').value = '';
    await renderMain();
  } catch (e) {
    showError(err, e.message === 'WRONG_PASSWORD' ? 'Incorrect password.' : 'Error: ' + e.message);
    btn.disabled = false; btn.textContent = 'Unlock';
  }
}

async function persistSessionKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  await new Promise(r => chrome.storage.session.set({ vault_key: Array.from(new Uint8Array(raw)) }, r));
}

// ── Lock ───────────────────────────────────────────────────────────────────

document.getElementById('lock-btn').addEventListener('click', async () => {
  sessionKey = null; allKeys = [];
  await new Promise(r => chrome.storage.session.remove('vault_key', r));
  document.getElementById('lock-password').value = '';
  show('screen-lock');
  document.getElementById('lock-password').focus();
});

// ── Main Screen ────────────────────────────────────────────────────────────

async function renderMain() {
  show('screen-main');
  renderKeysList(allKeys);
  await checkActiveSite();
  showExpiryWarnings();
}

// ── Expiry Warnings ────────────────────────────────────────────────────────

function showExpiryWarnings() {
  const now     = Date.now();
  const warn_ms = 14 * 24 * 60 * 60 * 1000; // 14 days
  const expiring = allKeys.filter(k => k.expiry && (new Date(k.expiry).getTime() - now) < warn_ms && new Date(k.expiry).getTime() > now);
  const expired  = allKeys.filter(k => k.expiry && new Date(k.expiry).getTime() <= now);

  let banner = document.getElementById('expiry-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'expiry-banner';
    banner.className = 'expiry-banner hidden';
    document.getElementById('site-banner').after(banner);
  }

  if (expired.length > 0) {
    banner.className = 'expiry-banner expired';
    banner.textContent = `⚠️ ${expired.length} key${expired.length > 1 ? 's have' : ' has'} expired!`;
    banner.classList.remove('hidden');
  } else if (expiring.length > 0) {
    banner.className = 'expiry-banner warning';
    banner.textContent = `⏰ ${expiring.length} key${expiring.length > 1 ? 's expire' : ' expires'} within 14 days`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ── Keys List (grouped by provider) ───────────────────────────────────────

function renderKeysList(keys) {
  const list  = document.getElementById('keys-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  if (keys.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Group by providerId
  const groups = {};
  keys.forEach(k => {
    const gid = k.providerId || 'custom';
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(k);
  });

  Object.entries(groups).forEach(([gid, groupKeys]) => {
    const provider = PROVIDERS.find(p => p.id === gid);
    const groupName = provider ? provider.name : gid;

    // Group header
    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      ${provider ? `<img class="group-logo" src="${provider.logo}" alt="${provider.name}" onerror="this.style.display='none'">` : '<div class="group-logo-fallback">' + groupName[0].toUpperCase() + '</div>'}
      <span class="group-name">${escHtml(groupName)}</span>
      <span class="group-count">${groupKeys.length}</span>
      <span class="group-chevron">▾</span>
    `;
    list.appendChild(header);

    // Group body
    const body = document.createElement('div');
    body.className = 'group-body';

    groupKeys.forEach(entry => {
      const card = buildKeyCard(entry, provider);
      body.appendChild(card);
    });

    list.appendChild(body);

    // Collapse/expand toggle
    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      header.querySelector('.group-chevron').textContent = collapsed ? '▸' : '▾';
    });
  });
}

function buildKeyCard(entry, provider) {
  const card = document.createElement('div');
  card.className = 'key-card';
  card.dataset.id = entry.id;

  const now = Date.now();
  const isExpired  = entry.expiry && new Date(entry.expiry).getTime() <= now;
  const isExpiring = entry.expiry && !isExpired && (new Date(entry.expiry).getTime() - now) < 14 * 24 * 60 * 60 * 1000;

  let expiryBadge = '';
  if (isExpired)  expiryBadge = '<span class="badge badge-expired">Expired</span>';
  else if (isExpiring) expiryBadge = '<span class="badge badge-warning">Expiring soon</span>';

  const maskedValue = maskKey(entry.value);

  card.innerHTML = `
    <div class="key-info">
      <div class="key-name">${escHtml(entry.label || 'Default')} ${expiryBadge}</div>
      <div class="key-value-preview">${escHtml(maskedValue)}</div>
      ${entry.notes ? `<div class="key-notes-preview">${escHtml(entry.notes)}</div>` : ''}
    </div>
    <div class="key-actions">
      <button class="copy-btn" title="Copy key">Copy</button>
      <button class="edit-btn" title="Edit">✎</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    copyToClipboard(entry.value, e.target);
  });
  card.querySelector('.edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openEditScreen(entry);
  });
  card.addEventListener('click', () => copyToClipboard(entry.value, null));

  return card;
}

// ── Site Detection Banner ──────────────────────────────────────────────────

async function checkActiveSite() {
  const banner = document.getElementById('site-banner');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const host = new URL(tab.url).hostname;
    const provider = getProviderForHost(host);
    if (!provider) { banner.classList.add('hidden'); return; }

    const matchingKeys = allKeys.filter(k => k.providerId === provider.id);
    if (matchingKeys.length === 0) { banner.classList.add('hidden'); return; }

    document.getElementById('site-banner-logo').src = provider.logo;
    document.getElementById('site-banner-text').textContent =
      `You're on ${provider.name} — ${matchingKeys.length} key${matchingKeys.length > 1 ? 's' : ''} saved`;
    banner.classList.remove('hidden');
  } catch { /* tab access denied */ }
}

// ── Search ─────────────────────────────────────────────────────────────────

document.getElementById('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = q
    ? allKeys.filter(k => {
        const p = PROVIDERS.find(p => p.id === k.providerId);
        const name = p ? p.name.toLowerCase() : (k.providerId || '').toLowerCase();
        return name.includes(q) || (k.label || '').toLowerCase().includes(q) || (k.notes || '').toLowerCase().includes(q);
      })
    : allKeys;
  renderKeysList(filtered);
});

// ── Export ─────────────────────────────────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', () => {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: allKeys.map(k => ({
      providerId: k.providerId,
      label:      k.label,
      value:      k.value,
      notes:      k.notes,
      expiry:     k.expiry || null,
      createdAt:  k.createdAt
    }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `api-vault-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Import ─────────────────────────────────────────────────────────────────

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.keys || !Array.isArray(data.keys)) throw new Error('Invalid backup file.');

    let added = 0;
    for (const k of data.keys) {
      if (!k.providerId || !k.value) continue;
      // Skip duplicates (same provider + label + value)
      const exists = allKeys.some(existing => existing.providerId === k.providerId && existing.value === k.value && existing.label === k.label);
      if (exists) continue;
      allKeys = await Vault.addKey(sessionKey, allKeys, {
        providerId: k.providerId,
        label:      k.label || 'Imported',
        value:      k.value,
        notes:      k.notes || '',
        expiry:     k.expiry || null
      });
      added++;
    }
    e.target.value = '';
    await renderMain();
    showToast(`✅ Imported ${added} key${added !== 1 ? 's' : ''}`);
  } catch (err) {
    showToast('❌ Import failed: ' + err.message, true);
  }
});

// ── Add / Edit Screen ──────────────────────────────────────────────────────

document.getElementById('add-btn').addEventListener('click', openAddScreen);

function openAddScreen() {
  editId = null; selectedProvider = null;
  document.getElementById('form-title').textContent = 'Add API Key';
  document.getElementById('key-label').value  = '';
  document.getElementById('key-value').value  = '';
  document.getElementById('key-notes').value  = '';
  document.getElementById('key-expiry').value = '';
  document.getElementById('provider-custom').value = '';
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('add-error').classList.add('hidden');
  buildProviderGrid();
  show('screen-add');
}

function openEditScreen(entry) {
  editId = entry.id; selectedProvider = entry.providerId;
  document.getElementById('form-title').textContent = 'Edit API Key';
  document.getElementById('key-label').value  = entry.label || '';
  document.getElementById('key-value').value  = entry.value || '';
  document.getElementById('key-notes').value  = entry.notes || '';
  document.getElementById('key-expiry').value = entry.expiry || '';
  document.getElementById('provider-custom').value = PROVIDERS.find(p => p.id === entry.providerId) ? '' : (entry.providerId || '');
  document.getElementById('delete-btn').classList.remove('hidden');
  document.getElementById('add-error').classList.add('hidden');
  buildProviderGrid(entry.providerId);
  show('screen-add');
}

function buildProviderGrid(selectedId = null) {
  const grid = document.getElementById('provider-grid');
  grid.innerHTML = '';
  PROVIDERS.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'provider-chip' + (selectedId === p.id ? ' selected' : '');
    chip.dataset.id = p.id;
    chip.innerHTML = `<img src="${p.logo}" alt="${p.name}" onerror="this.style.display='none'"><span>${p.name}</span>`;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.provider-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedProvider = p.id;
      document.getElementById('provider-custom').value = '';
    });
    grid.appendChild(chip);
  });
}

document.getElementById('back-btn').addEventListener('click', () => {
  renderKeysList(allKeys);
  show('screen-main');
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const label    = document.getElementById('key-label').value.trim();
  const value    = document.getElementById('key-value').value.trim();
  const notes    = document.getElementById('key-notes').value.trim();
  const expiry   = document.getElementById('key-expiry').value || null;
  const custom   = document.getElementById('provider-custom').value.trim();
  const err      = document.getElementById('add-error');
  const providerId = selectedProvider || custom || null;

  if (!providerId) { showError(err, 'Please select a provider or enter a custom name.'); return; }
  if (!value)      { showError(err, 'API key value cannot be empty.'); return; }
  err.classList.add('hidden');

  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (!sessionKey) throw new Error('Vault is locked — please reopen and unlock.');
    if (editId) {
      allKeys = allKeys.map(k => k.id === editId ? { ...k, providerId, label, value, notes, expiry } : k);
      await Vault.saveKeys(sessionKey, allKeys);
    } else {
      allKeys = await Vault.addKey(sessionKey, allKeys, { providerId, label, value, notes, expiry });
    }
    await renderMain();
  } catch (e) {
    console.error('Save error:', e);
    const msg = 'Save failed: ' + (e?.message || String(e));
    showError(err, msg);
    showToast('❌ ' + msg, true);
    btn.disabled = false; btn.textContent = 'Save Key';
  }
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!editId) return;
  if (!confirm('Delete this API key? This cannot be undone.')) return;
  allKeys = await Vault.deleteKey(sessionKey, allKeys, editId);
  await renderMain();
});

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = 'toast' + (isError ? ' toast-error' : '');
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ── Utilities ──────────────────────────────────────────────────────────────

function maskKey(value) {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 6) + '••••••••' + value.slice(-4);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('✅ Copied to clipboard');
    if (btn) {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    }
  });
}

// Toggle password visibility
document.addEventListener('click', e => {
  if (!e.target.classList.contains('eye-btn')) return;
  const input = document.getElementById(e.target.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  e.target.textContent = input.type === 'password' ? '👁' : '🙈';
});

document.getElementById('setup-confirm').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('setup-btn').click();
});

// ── Boot ───────────────────────────────────────────────────────────────────
init();
