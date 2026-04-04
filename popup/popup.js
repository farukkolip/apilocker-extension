// API Vault — Popup Controller

let sessionKey = null;
let allKeys    = [];
let editId     = null;
let selectedProvider = null;

// ── Sync State ─────────────────────────────────────────────────────────────

const SyncState = {
  accessToken:  null,
  refreshToken: null,
  userId:       null,
  email:        null,
  isPro:        false,
  lastSynced:   null,

  async load() {
    const data = await new Promise(r => chrome.storage.local.get([
      'sb_access_token', 'sb_refresh_token', 'sb_user_id', 'sb_email',
      'sb_is_pro', 'sb_last_synced'
    ], r));
    this.accessToken  = data.sb_access_token  || null;
    this.refreshToken = data.sb_refresh_token || null;
    this.userId       = data.sb_user_id       || null;
    this.email        = data.sb_email         || null;
    this.isPro        = data.sb_is_pro        || false;
    this.lastSynced   = data.sb_last_synced   || null;
  },

  async save() {
    await new Promise(r => chrome.storage.local.set({
      sb_access_token:  this.accessToken,
      sb_refresh_token: this.refreshToken,
      sb_user_id:       this.userId,
      sb_email:         this.email,
      sb_is_pro:        this.isPro,
      sb_last_synced:   this.lastSynced
    }, r));
  },

  async clear() {
    this.accessToken = this.refreshToken = this.userId = this.email = null;
    this.isPro = false; this.lastSynced = null;
    await new Promise(r => chrome.storage.local.remove([
      'sb_access_token', 'sb_refresh_token', 'sb_user_id',
      'sb_email', 'sb_is_pro', 'sb_last_synced'
    ], r));
  },

  get isLoggedIn() { return !!this.accessToken; }
};

// Free tier limits
const FREE_KEY_LIMIT = 5;

function showProGate(feature) {
  showToast(`🔒 ${feature} is a Pro feature. Upgrade at apilocker.dev`, true);
}

// Auth navigation tracking
let authReturnScreen  = 'screen-welcome';
let setupReturnScreen = 'screen-welcome'; // where back button goes from setup
let vaultRestoreMode  = false; // true = signing in on new device (no local vault)

// ── Screen Management ──────────────────────────────────────────────────────

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

// ── Setup Screen Text ──────────────────────────────────────────────────────

function prepareSetupScreen(isRestore) {
  vaultRestoreMode = isRestore;
  document.getElementById('setup-title').textContent     = isRestore ? 'Enter Master Password'  : 'Create Master Password';
  document.getElementById('setup-topbar-title').textContent = isRestore ? 'Restore Vault' : 'Master Password';
  document.getElementById('setup-hint').textContent      = isRestore
    ? 'Enter the master password from your other device to decrypt your cloud vault.'
    : 'This password encrypts all your keys locally. It is never sent anywhere.';
  const btn = document.getElementById('setup-btn');
  btn.textContent = isRestore ? 'Unlock' : 'Create Vault';
  btn.disabled    = false;
  // Hide confirm field when restoring (only need password once)
  document.getElementById('setup-confirm-field').style.display = isRestore ? 'none' : '';
  document.getElementById('setup-password').value = '';
  document.getElementById('setup-confirm').value  = '';
  document.getElementById('setup-error').classList.add('hidden');
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await SyncState.load();

  // If session key is alive (same browser session), auto-unlock and go to main
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

  // No live session → always show welcome screen
  show('screen-welcome');
}

// ── Welcome Screen ─────────────────────────────────────────────────────────

document.getElementById('welcome-signup-btn').addEventListener('click', () => {
  authReturnScreen = 'screen-welcome';
  showAuthScreen('signup');
});

document.getElementById('welcome-signin-btn').addEventListener('click', () => {
  authReturnScreen = 'screen-welcome';
  showAuthScreen('login');
});

document.getElementById('welcome-local-btn').addEventListener('click', async () => {
  setupReturnScreen = 'screen-welcome';
  const hasVault = await Vault.isSetup();
  prepareSetupScreen(hasVault); // unlock mode if vault exists, create mode if new
  show('screen-setup');
  document.getElementById('setup-password').focus();
});

// ── Setup Screen Back ──────────────────────────────────────────────────────

document.getElementById('setup-back-btn').addEventListener('click', () => {
  if (setupReturnScreen === 'screen-auth') {
    resetAndShowAuth();
  } else {
    show(setupReturnScreen);
  }
});

// ── Setup ──────────────────────────────────────────────────────────────────

document.getElementById('setup-btn').addEventListener('click', async () => {
  const pw1 = document.getElementById('setup-password').value;
  const pw2 = vaultRestoreMode ? pw1 : document.getElementById('setup-confirm').value;
  const err = document.getElementById('setup-error');
  if (pw1.length < 8) { showError(err, 'Password must be at least 8 characters.'); return; }
  if (!vaultRestoreMode && pw1 !== pw2) { showError(err, 'Passwords do not match.'); return; }
  err.classList.add('hidden');
  const btn = document.getElementById('setup-btn');
  btn.disabled = true;
  btn.textContent = vaultRestoreMode ? 'Unlocking…' : 'Creating vault…';
  try {
    const hasLocalVault = await Vault.isSetup();

    if (vaultRestoreMode && hasLocalVault) {
      // Vault exists locally → just unlock it with master password
      sessionKey = await Vault.unlock(pw1);
      allKeys    = await Vault.loadKeys(sessionKey);
    } else {
      // No local vault → create new vault (then download from cloud if signed in)
      sessionKey = await Vault.setup(pw1);
      allKeys    = [];
    }

    await persistSessionKey(sessionKey);
    await renderMain();

    if (SyncState.isLoggedIn) {
      if (vaultRestoreMode && !hasLocalVault) {
        await doDownload(true); // new device: restore from cloud
      } else if (!vaultRestoreMode) {
        autoUpload(); // new account: upload fresh vault
      }
    }
  } catch (e) {
    showError(err, e.message === 'WRONG_PASSWORD' ? 'Incorrect master password.' : 'Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = vaultRestoreMode ? 'Unlock' : 'Create Vault';
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
    btn.disabled = false; btn.textContent = 'Unlock';   // reset BEFORE navigating away
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

// ── Lock Screen Helper ─────────────────────────────────────────────────────

function showLockScreen() {
  const btn = document.getElementById('unlock-btn');
  btn.disabled = false;
  btn.textContent = 'Unlock';
  document.getElementById('lock-password').value = '';
  document.getElementById('lock-error').classList.add('hidden');
  // Show account email on lock screen if known
  const sub = document.getElementById('lock-subtitle');
  sub.textContent = SyncState.email
    ? `Signed in as ${SyncState.email}`
    : 'Enter password to unlock';
  show('screen-lock');
  document.getElementById('lock-password').focus();
}

// ── Lock ───────────────────────────────────────────────────────────────────

document.getElementById('lock-btn').addEventListener('click', async () => {
  sessionKey = null; allKeys = [];
  await new Promise(r => chrome.storage.session.remove('vault_key', r));
  show('screen-welcome');
});

// ── Main Screen ────────────────────────────────────────────────────────────

async function renderMain() {
  show('screen-main');
  renderKeysList(allKeys);
  await checkActiveSite();
  showExpiryWarnings();
  renderSyncBar();
}

// ── Expiry Warnings ────────────────────────────────────────────────────────

function showExpiryWarnings() {
  let banner = document.getElementById('expiry-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'expiry-banner';
    banner.className = 'expiry-banner hidden';
    document.getElementById('site-banner').after(banner);
  }

  if (!SyncState.isPro) { banner.classList.add('hidden'); return; }

  const now     = Date.now();
  const warn_ms = 14 * 24 * 60 * 60 * 1000;
  const expiring = allKeys.filter(k => k.expiry && (new Date(k.expiry).getTime() - now) < warn_ms && new Date(k.expiry).getTime() > now);
  const expired  = allKeys.filter(k => k.expiry && new Date(k.expiry).getTime() <= now);

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

  const groups = {};
  keys.forEach(k => {
    const gid = k.providerId || 'custom';
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(k);
  });

  Object.entries(groups).forEach(([gid, groupKeys]) => {
    const provider  = PROVIDERS.find(p => p.id === gid);
    const groupName = provider ? provider.name : gid;

    const header = document.createElement('div');
    header.className = 'group-header';
    header.innerHTML = `
      ${provider ? `<img class="group-logo" src="${provider.logo}" alt="${provider.name}" onerror="this.style.display='none'">` : '<div class="group-logo-fallback">' + groupName[0].toUpperCase() + '</div>'}
      <span class="group-name">${escHtml(groupName)}</span>
      <span class="group-count">${groupKeys.length}</span>
      <span class="group-chevron">▾</span>
    `;
    list.appendChild(header);

    const body = document.createElement('div');
    body.className = 'group-body';
    groupKeys.forEach(entry => { body.appendChild(buildKeyCard(entry, provider)); });
    list.appendChild(body);

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
  if (isExpired)       expiryBadge = '<span class="badge badge-expired">Expired</span>';
  else if (isExpiring) expiryBadge = '<span class="badge badge-warning">Expiring soon</span>';

  card.innerHTML = `
    <div class="key-info">
      <div class="key-name">${escHtml(entry.label || 'Default')} ${expiryBadge}</div>
      <div class="key-value-preview">${escHtml(maskKey(entry.value))}</div>
      ${entry.notes ? `<div class="key-notes-preview">${escHtml(entry.notes)}</div>` : ''}
    </div>
    <div class="key-actions">
      <button class="copy-btn" title="Copy key">Copy</button>
      <button class="edit-btn" title="Edit">✎</button>
    </div>
  `;

  card.querySelector('.copy-btn').addEventListener('click', e => { e.stopPropagation(); copyToClipboard(entry.value, e.target); });
  card.querySelector('.edit-btn').addEventListener('click', e => { e.stopPropagation(); openEditScreen(entry); });
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

    // 1. Check built-in providers first
    const provider = getProviderForHost(host);
    if (provider) {
      const matchingKeys = allKeys.filter(k => k.providerId === provider.id);
      if (matchingKeys.length === 0) { banner.classList.add('hidden'); return; }
      document.getElementById('site-banner-logo').src = provider.logo;
      document.getElementById('site-banner-logo').style.display = '';
      document.getElementById('site-banner-text').textContent =
        `You're on ${provider.name} — ${matchingKeys.length} key${matchingKeys.length > 1 ? 's' : ''} saved`;
      banner.classList.remove('hidden');
      return;
    }

    // 2. Check custom providers — match providerId against hostname
    const hostBase = host.replace(/^www\./, '').split('.')[0].toLowerCase();
    const customKeys = allKeys.filter(k => {
      if (PROVIDERS.find(p => p.id === k.providerId)) return false; // skip built-ins
      const pid = (k.providerId || '').toLowerCase().replace(/\s+/g, '');
      return host.includes(pid) || pid.includes(hostBase);
    });

    if (customKeys.length === 0) { banner.classList.add('hidden'); return; }

    const customName = customKeys[0].providerId;
    document.getElementById('site-banner-logo').style.display = 'none';
    document.getElementById('site-banner-text').textContent =
      `You're on ${customName} — ${customKeys.length} key${customKeys.length > 1 ? 's' : ''} saved`;
    banner.classList.remove('hidden');
  } catch { /* tab access denied */ }
}

// ── Search ─────────────────────────────────────────────────────────────────

document.getElementById('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = q
    ? allKeys.filter(k => {
        const p    = PROVIDERS.find(p => p.id === k.providerId);
        const name = p ? p.name.toLowerCase() : (k.providerId || '').toLowerCase();
        return name.includes(q) || (k.label || '').toLowerCase().includes(q) || (k.notes || '').toLowerCase().includes(q);
      })
    : allKeys;
  renderKeysList(filtered);
});

// ── Export ─────────────────────────────────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', () => {
  if (!SyncState.isPro) { showProGate('Export'); return; }
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: allKeys.map(k => ({ providerId: k.providerId, label: k.label, value: k.value, notes: k.notes, expiry: k.expiry || null, createdAt: k.createdAt }))
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
  if (!SyncState.isPro) { showProGate('Import'); return; }
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
      const exists = allKeys.some(ex => ex.providerId === k.providerId && ex.value === k.value && ex.label === k.label);
      if (exists) continue;
      allKeys = await Vault.addKey(sessionKey, allKeys, { providerId: k.providerId, label: k.label || 'Imported', value: k.value, notes: k.notes || '', expiry: k.expiry || null });
      added++;
    }
    e.target.value = '';
    await renderMain();
    showToast(`✅ Imported ${added} key${added !== 1 ? 's' : ''}`);
    autoUpload();
  } catch (err) {
    showToast('❌ Import failed: ' + err.message, true);
  }
});

// ── Add / Edit Screen ──────────────────────────────────────────────────────

document.getElementById('add-btn').addEventListener('click', () => {
  if (!SyncState.isPro && allKeys.length >= FREE_KEY_LIMIT) {
    showUpgradePrompt();
    return;
  }
  openAddScreen();
});

function openAddScreen() {
  editId = null; selectedProvider = null;
  document.getElementById('form-title').textContent   = 'Add API Key';
  document.getElementById('key-label').value          = '';
  document.getElementById('key-value').value          = '';
  document.getElementById('key-notes').value          = '';
  document.getElementById('key-expiry').value         = '';
  document.getElementById('provider-custom').value    = '';
  hideDeleteConfirm();
  _deleteBtn.classList.add('hidden');
  document.getElementById('add-error').classList.add('hidden');
  const btn = document.getElementById('save-btn');
  btn.disabled = false; btn.textContent = 'Save Key';
  // Show/hide expiry based on plan
  document.getElementById('key-expiry').style.display    = SyncState.isPro ? '' : 'none';
  document.getElementById('expiry-pro-gate').classList.toggle('hidden', SyncState.isPro);
  buildProviderGrid();
  show('screen-add');
}

function openEditScreen(entry) {
  editId = entry.id; selectedProvider = entry.providerId;
  document.getElementById('form-title').textContent   = 'Edit API Key';
  document.getElementById('key-label').value          = entry.label  || '';
  document.getElementById('key-value').value          = entry.value  || '';
  document.getElementById('key-notes').value          = entry.notes  || '';
  document.getElementById('key-expiry').value         = entry.expiry || '';
  document.getElementById('provider-custom').value    = PROVIDERS.find(p => p.id === entry.providerId) ? '' : (entry.providerId || '');
  hideDeleteConfirm();
  _deleteBtn.classList.remove('hidden');
  document.getElementById('add-error').classList.add('hidden');
  const btn = document.getElementById('save-btn');
  btn.disabled = false; btn.textContent = 'Save Key';
  // Show/hide expiry based on plan
  document.getElementById('key-expiry').style.display    = SyncState.isPro ? '' : 'none';
  document.getElementById('expiry-pro-gate').classList.toggle('hidden', SyncState.isPro);
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

  // When user types in custom field, deselect all chips and clear selectedProvider
  const customInput = document.getElementById('provider-custom');
  const savedValue = customInput.value;
  const newInput = customInput.cloneNode(true);
  newInput.value = savedValue;
  customInput.parentNode.replaceChild(newInput, customInput);
  newInput.addEventListener('input', () => {
    if (newInput.value.trim()) {
      selectedProvider = null;
      document.querySelectorAll('.provider-chip').forEach(c => c.classList.remove('selected'));
    }
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

  // Pro gate: multiple keys per same provider
  if (!editId && !SyncState.isPro) {
    const sameProvider = allKeys.some(k => k.providerId === providerId);
    if (sameProvider) {
      showError(err, '🔒 Multiple keys per provider is a Pro feature. Upgrade at apilocker.dev');
      return;
    }
  }

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
    autoUpload();
  } catch (e) {
    console.error('Save error:', e);
    const msg = 'Save failed: ' + (e?.message || String(e));
    showError(err, msg);
    showToast('❌ ' + msg, true);
    btn.disabled = false; btn.textContent = 'Save Key';
  }
});

// ── Delete confirm (static HTML, toggled by class) ────────────────────────
const _deleteBtn     = document.getElementById('delete-btn');
const _deleteConfirm = document.getElementById('delete-confirm');
const _confirmYes    = document.getElementById('delete-confirm-yes');
const _confirmNo     = document.getElementById('delete-confirm-no');

function showDeleteConfirm() {
  if (!_deleteConfirm || !_confirmYes) return;
  _deleteBtn.classList.add('hidden');
  _confirmYes.disabled = false; _confirmYes.textContent = 'Yes, Delete';
  _deleteConfirm.classList.remove('hidden');
}
function hideDeleteConfirm() {
  if (_deleteConfirm) _deleteConfirm.classList.add('hidden');
  if (_deleteBtn) _deleteBtn.classList.remove('hidden');
}

if (_deleteBtn) {
  _deleteBtn.addEventListener('click', () => {
    if (!editId) return;
    showDeleteConfirm();
  });
}

if (_confirmNo) {
  _confirmNo.addEventListener('click', () => {
    hideDeleteConfirm();
  });
}

if (_confirmYes) {
  _confirmYes.addEventListener('click', async () => {
    if (!editId) return;
    _confirmYes.disabled = true; _confirmYes.textContent = 'Deleting…';
    try {
      allKeys = await Vault.deleteKey(sessionKey, allKeys, editId);
      if (_deleteConfirm) _deleteConfirm.classList.add('hidden');
      await renderMain();
      autoUpload();
    } catch (err) {
      showToast('❌ Delete failed: ' + err.message, true);
      hideDeleteConfirm();
    }
  });
}

// ── Auto Upload ────────────────────────────────────────────────────────────

async function autoUpload() {
  if (!SyncState.isLoggedIn) return;
  try {
    const token  = await ensureValidToken();
    const stored = await new Promise(r => chrome.storage.local.get('apivault_encrypted', r));
    if (!stored.apivault_encrypted) return;
    await SupabaseDB.upsertVault(token, SyncState.userId, stored.apivault_encrypted);
    SyncState.lastSynced = Date.now();
    await SyncState.save();
    renderSyncBar();
  } catch { /* silent — don't interrupt user */ }
}

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
  toast.style.pointerEvents = 'auto';
  setTimeout(() => { toast.style.opacity = '0'; toast.style.pointerEvents = 'none'; }, 2500);
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

document.addEventListener('click', e => {
  if (!e.target.classList.contains('eye-btn')) return;
  const input = document.getElementById(e.target.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  e.target.textContent = input.type === 'password' ? '👁' : '🙈';
});

document.getElementById('setup-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('setup-btn').click();
});
document.getElementById('setup-confirm').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('setup-btn').click();
});

// ── Sync Bar ───────────────────────────────────────────────────────────────

function renderSyncBar() {
  const bar = document.getElementById('sync-bar');
  const txt = document.getElementById('sync-bar-text');

  if (!SyncState.isLoggedIn) {
    txt.innerHTML = `<span style="color:#444">☁ Cloud sync off</span>`;
    // Replace logout btn with sign in link
    const logoutBtn = document.getElementById('sync-logout-btn');
    logoutBtn.textContent = 'Sign in';
    logoutBtn.classList.remove('sync-logout');
    logoutBtn.onclick = () => {
      authReturnScreen = 'screen-main';
      showAuthScreen('login');
    };
    bar.classList.remove('hidden');
    return;
  }

  const ago = SyncState.lastSynced ? formatAgo(SyncState.lastSynced) : 'never';
  txt.textContent = `${SyncState.email} · synced ${ago}`;
  // Restore logout button
  const logoutBtn = document.getElementById('sync-logout-btn');
  logoutBtn.textContent = 'Sign out';
  logoutBtn.classList.add('sync-logout');
  logoutBtn.onclick = doSignOut;
  bar.classList.remove('hidden');
}

function formatAgo(ts) {
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60)   return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// ── Sync Button (from main screen) ─────────────────────────────────────────

document.getElementById('sync-btn').addEventListener('click', () => {
  if (SyncState.isLoggedIn) {
    const bar = document.getElementById('sync-bar');
    bar.classList.toggle('hidden');
  } else {
    authReturnScreen = 'screen-main';
    showAuthScreen('login');
  }
});

// NOTE: sync-logout-btn click behavior is set dynamically in renderSyncBar()
// (it becomes "Sign in" when logged out, "Sign out" when logged in)

// ── Cloud Upload (manual / auto) ───────────────────────────────────────────

async function doUpload() {
  try {
    const token  = await ensureValidToken();
    const stored = await new Promise(r => chrome.storage.local.get('apivault_encrypted', r));
    if (!stored.apivault_encrypted) throw new Error('No vault data to upload.');
    await SupabaseDB.upsertVault(token, SyncState.userId, stored.apivault_encrypted);
    SyncState.lastSynced = Date.now();
    await SyncState.save();
    renderSyncBar();
    showToast('✅ Vault synced to cloud');
  } catch (e) {
    showToast('❌ Sync failed: ' + e.message, true);
  }
}

// ── Cloud Download ─────────────────────────────────────────────────────────

async function doDownload(silent = false) {
  try {
    const token = await ensureValidToken();
    const row   = await SupabaseDB.getVault(token);
    if (!row) {
      if (!silent) showToast('No cloud vault found.', true);
      return;
    }

    let cloudKeys;
    try {
      const json = await decrypt(sessionKey, row.encrypted_blob);
      cloudKeys  = JSON.parse(json);
    } catch {
      throw new Error('Decryption failed — make sure you use the same master password on all devices.');
    }

    const localIds = new Set(allKeys.map(k => k.id));
    const merged   = [...allKeys];
    for (const k of cloudKeys) {
      if (!localIds.has(k.id)) merged.push(k);
    }

    allKeys = merged;
    await Vault.saveKeys(sessionKey, allKeys);
    SyncState.lastSynced = Date.now();
    await SyncState.save();
    await renderMain();
    showToast(`✅ ${cloudKeys.length} key${cloudKeys.length !== 1 ? 's' : ''} synced from cloud`);
  } catch (e) {
    showToast('❌ Sync failed: ' + e.message, true);
  }
}

// ── Sign Out ───────────────────────────────────────────────────────────────

async function doSignOut() {
  if (!SyncState.isLoggedIn) return;
  if (!confirm('Sign out?')) return;
  await SupabaseAuth.signOut(SyncState.accessToken);
  await SyncState.clear();
  sessionKey = null; allKeys = [];
  await new Promise(r => chrome.storage.session.remove('vault_key', r));
  show('screen-welcome');
  showToast('Signed out');
}

// ── Token Refresh ──────────────────────────────────────────────────────────

async function ensureValidToken() {
  try {
    await SupabaseDB.getProfile(SyncState.accessToken);
    return SyncState.accessToken;
  } catch {
    const data = await SupabaseAuth.refreshSession(SyncState.refreshToken);
    SyncState.accessToken  = data.access_token;
    SyncState.refreshToken = data.refresh_token;
    await SyncState.save();
    return SyncState.accessToken;
  }
}

// ── Auth Screen ────────────────────────────────────────────────────────────

let authMode = 'login';

// Opens auth screen and pre-fills saved email
async function showAuthScreen(mode) {
  updateAuthTab(mode);
  // Pre-fill last used email for convenience
  const data = await new Promise(r => chrome.storage.local.get('last_auth_email', r));
  const emailInput = document.getElementById('auth-email');
  if (data.last_auth_email) {
    emailInput.value = data.last_auth_email;
    document.getElementById('auth-password').focus();
  } else {
    emailInput.value = '';
    emailInput.focus();
  }
  document.getElementById('auth-password').value = '';
  show('screen-auth');
}

document.getElementById('auth-back-btn').addEventListener('click', () => {
  // Reset button state so it's never stuck when auth screen re-opens
  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = false;
  btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
  show(authReturnScreen);
});

document.getElementById('tab-login').addEventListener('click',  () => updateAuthTab('login'));
document.getElementById('tab-signup').addEventListener('click', () => updateAuthTab('signup'));

// Show "Forgot password?" only on Sign In tab
document.getElementById('forgot-pw-link').addEventListener('click', async e => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  if (!email) {
    showError(document.getElementById('auth-error'), 'Enter your email first, then click Forgot password.');
    return;
  }
  try {
    await SupabaseAuth.resetPassword(email);
    showToast('✅ Password reset email sent — check your inbox.');
  } catch (err) {
    showToast('❌ Could not send reset email: ' + err.message, true);
  }
});

document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('auth-submit-btn').click();
});

function resetAndShowAuth() {
  showAuthScreen(authMode);   // resets button, pre-fills email, shows screen
}

function updateAuthTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-signup').classList.toggle('active', !isLogin);
  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = isLogin ? 'Sign In' : 'Create Account';
  btn.disabled = false;
  document.getElementById('auth-error').classList.add('hidden');
  // "Forgot password?" only relevant on Sign In
  document.getElementById('forgot-pw-wrap').style.display = isLogin ? '' : 'none';
}

document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const err      = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');

  if (!email)              { showError(err, 'Please enter your email.'); return; }
  if (password.length < 8) { showError(err, 'Password must be at least 8 characters.'); return; }
  err.classList.add('hidden');

  // Save email immediately so it auto-fills next time (even if sign-in fails)
  chrome.storage.local.set({ last_auth_email: email });

  btn.disabled    = true;
  btn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    let data;
    if (authMode === 'login') {
      data = await SupabaseAuth.signIn(email, password);
    } else {
      data = await SupabaseAuth.signUp(email, password);
      if (!data.access_token) {
        showToast('✅ Check your email to confirm your account, then sign in.');
        updateAuthTab('login');
        btn.disabled    = false;
        btn.textContent = 'Sign In';
        return;
      }
    }

    // Store session
    SyncState.accessToken  = data.access_token;
    SyncState.refreshToken = data.refresh_token;
    SyncState.userId       = data.user?.id;
    SyncState.email        = data.user?.email || email;

    try {
      const profile   = await SupabaseDB.getProfile(data.access_token);
      SyncState.isPro = profile?.is_pro || false;
    } catch { SyncState.isPro = false; }

    await SyncState.save();
    // Remember email for next time
    await new Promise(r => chrome.storage.local.set({ last_auth_email: SyncState.email }, r));
    document.getElementById('auth-password').value = '';

    // Always ask for master password after cloud auth
    const hasLocalVault = await Vault.isSetup();
    setupReturnScreen = 'screen-auth';
    // restore mode = enter existing password; create mode = make new password
    prepareSetupScreen(authMode === 'login' || hasLocalVault);
    show('screen-setup');
    document.getElementById('setup-password').focus();
    showToast(authMode === 'signup'
      ? '✅ Account created. Now set your master password.'
      : '✅ Signed in. Enter your master password.');
  } catch (e) {
    showError(err, e.message);
    btn.disabled    = false;
    btn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
    // If email already exists, auto-switch to Sign In tab
    if (/already registered/i.test(e.message) && authMode === 'signup') {
      updateAuthTab('login');
    }
  }
});

// ── Upgrade Prompt ─────────────────────────────────────────────────────────

function showUpgradePrompt() {
  showToast(`Free plan: ${FREE_KEY_LIMIT} keys max. Upgrade to Pro for unlimited keys + cloud sync.`, true);
  const btn = document.getElementById('sync-btn');
  btn.classList.add('btn-highlight');
  setTimeout(() => btn.classList.remove('btn-highlight'), 2000);
}

// ── Account Screen ──────────────────────────────────────────────────────────

document.getElementById('account-btn').addEventListener('click', () => {
  openAccountScreen();
  show('screen-account');
});

document.getElementById('account-back-btn').addEventListener('click', () => {
  show('screen-main');
});

document.getElementById('account-signout-btn').addEventListener('click', doSignOut);

document.getElementById('account-change-master-btn').addEventListener('click', () => {
  document.getElementById('change-master-current').value = '';
  document.getElementById('change-master-new').value     = '';
  document.getElementById('change-master-confirm').value = '';
  document.getElementById('change-master-error').classList.add('hidden');
  document.getElementById('change-master-btn').disabled    = false;
  document.getElementById('change-master-btn').textContent = 'Update Master Password';
  show('screen-change-master');
  document.getElementById('change-master-current').focus();
});

document.getElementById('change-master-back-btn').addEventListener('click', () => {
  show('screen-account');
});

document.getElementById('change-master-btn').addEventListener('click', async () => {
  const current = document.getElementById('change-master-current').value;
  const newPw   = document.getElementById('change-master-new').value;
  const confirm = document.getElementById('change-master-confirm').value;
  const err     = document.getElementById('change-master-error');
  const btn     = document.getElementById('change-master-btn');

  if (!current)          { showError(err, 'Enter your current master password.'); return; }
  if (newPw.length < 8)  { showError(err, 'New password must be at least 8 characters.'); return; }
  if (newPw !== confirm)  { showError(err, 'New passwords do not match.'); return; }
  err.classList.add('hidden');

  btn.disabled = true; btn.textContent = 'Updating…';
  try {
    // Re-encrypt vault with new master password
    sessionKey = await Vault.changeMasterPassword(current, newPw);
    await persistSessionKey(sessionKey);
    allKeys = await Vault.loadKeys(sessionKey);
    // Upload new encrypted vault to cloud
    autoUpload();
    show('screen-account');
    showToast('✅ Master password updated successfully.');
  } catch (e) {
    showError(err, e.message === 'WRONG_PASSWORD' ? 'Current password is incorrect.' : 'Error: ' + e.message);
    btn.disabled = false; btn.textContent = 'Update Master Password';
  }
});

document.getElementById('account-manage-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://app.lemonsqueezy.com/my-orders' });
});

function openAccountScreen() {
  const emailEl     = document.getElementById('account-email-display');
  const planBadge   = document.getElementById('account-plan-badge');
  const upgradeBtn  = document.getElementById('account-upgrade-btn');
  const manageBtn   = document.getElementById('account-manage-btn');
  const signoutBtn  = document.getElementById('account-signout-btn');
  const localNote   = document.getElementById('account-local-note');
  const keyCount    = document.getElementById('account-key-count');
  const syncStatus  = document.getElementById('account-sync-status');
  const lastSynced  = document.getElementById('account-last-synced');

  keyCount.textContent   = `${allKeys.length} key${allKeys.length !== 1 ? 's' : ''}`;

  if (SyncState.isLoggedIn) {
    emailEl.textContent    = SyncState.email || '—';
    syncStatus.textContent = '✅ Active';
    lastSynced.textContent = SyncState.lastSynced ? formatAgo(SyncState.lastSynced) : 'Never';
    signoutBtn.classList.remove('hidden');
    localNote.textContent  = '';

    if (SyncState.isPro) {
      planBadge.textContent = '⚡ Pro';
      planBadge.classList.add('pro');
      upgradeBtn.classList.add('hidden');
      manageBtn.classList.remove('hidden');
    } else {
      planBadge.textContent = 'Free';
      planBadge.classList.remove('pro');
      upgradeBtn.classList.remove('hidden');
      manageBtn.classList.add('hidden');
    }
  } else {
    emailEl.textContent    = 'Local only';
    syncStatus.textContent = '☁ Off';
    lastSynced.textContent = '—';
    planBadge.textContent  = 'Free';
    planBadge.classList.remove('pro');
    upgradeBtn.classList.remove('hidden');
    manageBtn.classList.add('hidden');
    signoutBtn.classList.add('hidden');
    localNote.textContent  = 'Sign in to enable cloud sync';
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
