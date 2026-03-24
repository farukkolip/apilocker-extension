// API Locker — Supabase Client
// Zero-knowledge: only AES-256-GCM encrypted blobs are sent to the server.
// The master password never leaves the device.
//
// ── SETUP ──────────────────────────────────────────────────────────────────
// 1. Create a project at https://supabase.com
// 2. Replace the two constants below with your project URL and anon key.
// 3. Run the SQL in /supabase/schema.sql in the Supabase SQL editor.
// ───────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://lwcaewtkopbldllhmypp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3Y2Fld3Rrb3BibGRsbGhteXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyODc0NTUsImV4cCI6MjA4OTg2MzQ1NX0.0mobhr17jL6RX8BpSAxU2TD47wJ08WOOAd2XqUl-NAs';

// ── Core fetch wrapper ─────────────────────────────────────────────────────

async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    ...options.headers
  };

  const res = await fetch(url, { ...options, headers });

  // 204 No Content — success, no body
  if (res.status === 204) return null;

  let json;
  try { json = await res.json(); } catch { json = {}; }

  if (!res.ok) {
    const raw = json.message || json.msg || json.error_description || json.error || `HTTP ${res.status}`;
    // Turn Supabase technical messages into human-readable ones
    let msg = raw;
    if (/already registered/i.test(raw))  msg = 'This email is already registered. Please sign in instead.';
    if (/invalid.*credentials/i.test(raw)) msg = 'Incorrect email or password.';
    if (/email.*invalid/i.test(raw))       msg = 'Please enter a valid email address.';
    throw new Error(msg);
  }
  return json;
}

// ── Auth ───────────────────────────────────────────────────────────────────

const SupabaseAuth = {
  async signUp(email, password) {
    const data = await sbFetch('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    // signUp returns user + session (auto-confirm) or just user (if confirm required)
    if (!data.access_token && !data.user) throw new Error('Sign-up failed. Check your email for confirmation.');
    return data;
  },

  async signIn(email, password) {
    const data = await sbFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (!data.access_token) throw new Error('Login failed.');
    return data; // { access_token, refresh_token, user: { id, email } }
  },

  async signOut(accessToken) {
    await sbFetch('/auth/v1/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => {}); // best-effort
  },

  async resetPassword(email) {
    await sbFetch('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    // Always resolves — Supabase doesn't reveal if email exists
  },

  async refreshSession(refreshToken) {
    const data = await sbFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!data.access_token) throw new Error('Session refresh failed.');
    return data;
  }
};

// ── Database ───────────────────────────────────────────────────────────────

const SupabaseDB = {
  // Upload (upsert) the encrypted vault blob
  async upsertVault(accessToken, userId, encryptedBlob) {
    await sbFetch('/rest/v1/vaults', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_id:        userId,
        encrypted_blob: encryptedBlob,
        updated_at:     new Date().toISOString()
      })
    });
  },

  // Download the encrypted vault blob
  async getVault(accessToken) {
    const rows = await sbFetch('/rest/v1/vaults?select=encrypted_blob,updated_at&limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  },

  // Fetch Pro status
  async getProfile(accessToken) {
    const rows = await sbFetch('/rest/v1/profiles?select=is_pro&limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : { is_pro: false };
  }
};
