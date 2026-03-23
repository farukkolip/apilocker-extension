// API Vault — Crypto Layer
// AES-256-GCM encryption with PBKDF2 key derivation
// Keys never leave the device in plaintext.

const STORAGE_KEY = 'apivault_encrypted';
const SALT_KEY    = 'apivault_salt';
const HASH_KEY    = 'apivault_hash';   // stored to verify master password
const PBKDF2_ITER = 100000;

// ── Helpers ────────────────────────────────────────────────────────────────

function bufToArr(buf) { return Array.from(new Uint8Array(buf)); }
function arrToBuf(arr) { return new Uint8Array(arr).buffer; }

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,   // extractable: needed for session storage persistence
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, plaintext) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { iv: bufToArr(iv), data: bufToArr(buf) };
}

async function decrypt(key, payload) {
  const iv  = new Uint8Array(payload.iv);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, arrToBuf(payload.data));
  return new TextDecoder().decode(buf);
}

// ── Public API ─────────────────────────────────────────────────────────────

const Vault = {

  // Check if vault has been initialized
  async isSetup() {
    return new Promise(resolve => {
      chrome.storage.local.get([SALT_KEY, HASH_KEY], r => {
        resolve(!!(r[SALT_KEY] && r[HASH_KEY]));
      });
    });
  },

  // First-time setup: create salt, derive key, save encrypted empty vault
  async setup(masterPassword) {
    const salt = bufToArr(crypto.getRandomValues(new Uint8Array(16)));
    const key  = await deriveKey(masterPassword, salt);

    // Store a password-verification hash (encrypt a known string)
    const verifier = await encrypt(key, 'apivault_ok');
    const emptyVault = await encrypt(key, JSON.stringify([]));

    await new Promise(resolve => {
      chrome.storage.local.set({
        [SALT_KEY]:    salt,
        [HASH_KEY]:    verifier,
        [STORAGE_KEY]: emptyVault
      }, resolve);
    });

    return key;
  },

  // Unlock vault: verify password, return derived key
  async unlock(masterPassword) {
    const stored = await new Promise(resolve => {
      chrome.storage.local.get([SALT_KEY, HASH_KEY], resolve);
    });

    if (!stored[SALT_KEY]) throw new Error('NOT_SETUP');

    const key = await deriveKey(masterPassword, stored[SALT_KEY]);

    try {
      const check = await decrypt(key, stored[HASH_KEY]);
      if (check !== 'apivault_ok') throw new Error('WRONG_PASSWORD');
    } catch {
      throw new Error('WRONG_PASSWORD');
    }

    return key;
  },

  // Load all keys from encrypted storage
  async loadKeys(key) {
    const stored = await new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, resolve);
    });
    if (!stored[STORAGE_KEY]) return [];
    const json = await decrypt(key, stored[STORAGE_KEY]);
    return JSON.parse(json);
  },

  // Save all keys to encrypted storage
  async saveKeys(key, keys) {
    const payload = await encrypt(key, JSON.stringify(keys));
    await new Promise(resolve => {
      chrome.storage.local.set({ [STORAGE_KEY]: payload }, resolve);
    });
  },

  // Add a new key entry
  async addKey(key, keys, entry) {
    const newEntry = {
      id:         crypto.randomUUID(),
      providerId: entry.providerId,
      label:      entry.label,
      value:      entry.value,
      notes:      entry.notes || '',
      expiry:     entry.expiry || null,
      createdAt:  Date.now()
    };
    const updated = [...keys, newEntry];
    await Vault.saveKeys(key, updated);
    return updated;
  },

  // Delete a key entry
  async deleteKey(key, keys, id) {
    const updated = keys.filter(k => k.id !== id);
    await Vault.saveKeys(key, updated);
    return updated;
  },

  // Change master password (re-encrypt vault with new key)
  async changeMasterPassword(oldPassword, newPassword) {
    const oldKey = await Vault.unlock(oldPassword);
    const keys   = await Vault.loadKeys(oldKey);

    // Re-setup with new password
    const salt    = bufToArr(crypto.getRandomValues(new Uint8Array(16)));
    const newKey  = await deriveKey(newPassword, salt);
    const verifier = await encrypt(newKey, 'apivault_ok');
    const payload  = await encrypt(newKey, JSON.stringify(keys));

    await new Promise(resolve => {
      chrome.storage.local.set({
        [SALT_KEY]:    salt,
        [HASH_KEY]:    verifier,
        [STORAGE_KEY]: payload
      }, resolve);
    });

    return newKey;
  }
};
