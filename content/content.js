// API Locker — Content Script
// Floating badge + inline key overlay on known API provider pages

(function () {
  'use strict';

  const PROVIDERS_INLINE = [
    { id: 'openai',      name: 'OpenAI',       domains: ['platform.openai.com'],                         logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64' },
    { id: 'anthropic',   name: 'Anthropic',    domains: ['console.anthropic.com'],                       logo: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64' },
    { id: 'gemini',      name: 'Google AI',    domains: ['aistudio.google.com'],                         logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64' },
    { id: 'groq',        name: 'Groq',         domains: ['console.groq.com'],                            logo: 'https://www.google.com/s2/favicons?domain=groq.com&sz=64' },
    { id: 'mistral',     name: 'Mistral AI',   domains: ['console.mistral.ai'],                          logo: 'https://www.google.com/s2/favicons?domain=mistral.ai&sz=64' },
    { id: 'cohere',      name: 'Cohere',       domains: ['dashboard.cohere.com'],                        logo: 'https://www.google.com/s2/favicons?domain=cohere.com&sz=64' },
    { id: 'together',    name: 'Together AI',  domains: ['api.together.xyz', 'together.ai'],             logo: 'https://www.google.com/s2/favicons?domain=together.ai&sz=64' },
    { id: 'replicate',   name: 'Replicate',    domains: ['replicate.com'],                               logo: 'https://www.google.com/s2/favicons?domain=replicate.com&sz=64' },
    { id: 'huggingface', name: 'Hugging Face', domains: ['huggingface.co'],                              logo: 'https://www.google.com/s2/favicons?domain=huggingface.co&sz=64' },
    { id: 'perplexity',  name: 'Perplexity',   domains: ['www.perplexity.ai'],                           logo: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=64' },
    { id: 'stripe',      name: 'Stripe',       domains: ['dashboard.stripe.com'],                        logo: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=64' },
    { id: 'github',      name: 'GitHub',       domains: ['github.com'],                                  logo: 'https://www.google.com/s2/favicons?domain=github.com&sz=64' },
    { id: 'aws',         name: 'AWS',          domains: ['console.aws.amazon.com'],                      logo: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=64' },
    { id: 'cloudflare',  name: 'Cloudflare',   domains: ['dash.cloudflare.com'],                        logo: 'https://www.google.com/s2/favicons?domain=cloudflare.com&sz=64' },
    { id: 'vercel',      name: 'Vercel',       domains: ['vercel.com'],                                  logo: 'https://www.google.com/s2/favicons?domain=vercel.com&sz=64' },
    { id: 'supabase',    name: 'Supabase',     domains: ['supabase.com', 'app.supabase.com'],            logo: 'https://www.google.com/s2/favicons?domain=supabase.com&sz=64' },
    { id: 'pinecone',    name: 'Pinecone',     domains: ['app.pinecone.io'],                             logo: 'https://www.google.com/s2/favicons?domain=pinecone.io&sz=64' },
    { id: 'notion',      name: 'Notion',       domains: ['www.notion.so', 'notion.so'],                  logo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64' },
    { id: 'twilio',      name: 'Twilio',       domains: ['console.twilio.com'],                          logo: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64' },
    { id: 'sendgrid',    name: 'SendGrid',     domains: ['app.sendgrid.com'],                            logo: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64' },
    { id: 'serpapi',     name: 'SerpAPI',      domains: ['serpapi.com'],                                 logo: 'https://www.google.com/s2/favicons?domain=serpapi.com&sz=64' },
    { id: 'n8n',         name: 'n8n',          domains: ['app.n8n.cloud'],                               logo: 'https://www.google.com/s2/favicons?domain=n8n.io&sz=64' },
  ];

  function getProviderForHost(hostname) {
    for (const p of PROVIDERS_INLINE) {
      if (p.domains.some(d => hostname === d || hostname.endsWith('.' + d))) return p;
    }
    return null;
  }

  const builtinProvider = getProviderForHost(location.hostname);

  // ── Crypto helpers ────────────────────────────────────────────────────────
  // chrome.storage.session is NOT accessible from content scripts directly,
  // so we ask the background service worker via message passing.

  async function getVaultData() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_VAULT_DATA' }, (response) => {
        if (chrome.runtime.lastError || !response) resolve({ locked: true });
        else resolve(response);
      });
    });
  }

  // ── Resolve provider (built-in or custom) ─────────────────────────────────

  async function resolveProvider() {
    if (builtinProvider) return builtinProvider;

    // Check storage for custom keys matching this hostname
    const encrypted = await new Promise(r =>
      chrome.storage.local.get('apivault_encrypted', d => r(d.apivault_encrypted))
    );
    if (!encrypted) return null;

    // We can't decrypt here without the vault key, so ask background
    const vaultData = await getVaultData();
    if (vaultData.locked) return null;

    const allKeys = await decryptVault(vaultData.vault_key, vaultData.encrypted);
    const host = location.hostname;
    const hostBase = host.replace(/^www\./, '').split('.')[0].toLowerCase();

    const customKey = allKeys.find(k => {
      if (PROVIDERS_INLINE.find(p => p.id === k.providerId)) return false;
      const pid = (k.providerId || '').toLowerCase().replace(/\s+/g, '');
      return host.includes(pid) || pid.includes(hostBase);
    });

    if (!customKey) return null;

    return {
      id: customKey.providerId,
      name: customKey.providerId,
      logo: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      domains: [host],
      isCustom: true,
    };
  }

  async function decryptVault(vaultKey, encrypted) {
    const key = await crypto.subtle.importKey(
      'raw', new Uint8Array(vaultKey),
      { name: 'AES-GCM' }, false, ['decrypt']
    );
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.data).buffer
    );
    return JSON.parse(new TextDecoder().decode(buf));
  }

  function maskKey(v) {
    if (!v) return '';
    if (v.length <= 8) return '••••••••';
    return v.slice(0, 6) + '••••••••' + v.slice(-4);
  }

  // ── Guard: if extension context is invalidated, bail out silently ──────────
  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // ── Inject badge ──────────────────────────────────────────────────────────

  let provider = builtinProvider; // will be resolved async below

  if (isContextValid()) {
    resolveProvider().then(resolved => {
      if (!resolved) return;
      provider = resolved;
      chrome.storage.local.get('apivault_encrypted', ({ apivault_encrypted }) => {
        if (!apivault_encrypted) return;
        injectBadge();
      });
    });
  }

  let overlayVisible = false;

  function injectBadge() {
    if (document.getElementById('apivault-badge')) return;

    // Badge pill
    const badge = document.createElement('div');
    badge.id = 'apivault-badge';
    badge.innerHTML = `
      <img src="${provider.logo}" alt="${provider.name}" onerror="this.style.display='none'"
           style="width:16px;height:16px;border-radius:4px;object-fit:contain;background:#fff;">
      <span style="font-size:12px;font-weight:600;color:#a5b4fc;">API Locker</span>
    `;

    Object.assign(badge.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: '2147483646',
      display: 'flex', alignItems: 'center', gap: '6px',
      background: '#0d0d0d', border: '1px solid #6366f150',
      borderRadius: '20px', padding: '6px 12px 6px 8px',
      cursor: 'pointer', userSelect: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      transition: 'transform 0.15s, box-shadow 0.15s',
    });

    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'translateY(-2px)';
      badge.style.boxShadow = '0 8px 24px rgba(0,0,0,0.7)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = '';
      badge.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    });

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOverlay();
    });

    document.body.appendChild(badge);

    // Close overlay when clicking outside
    document.addEventListener('click', (e) => {
      const overlay = document.getElementById('apivault-overlay');
      if (overlay && !overlay.contains(e.target) && e.target !== badge) {
        closeOverlay();
      }
    });
  }

  // ── Overlay card ──────────────────────────────────────────────────────────

  async function toggleOverlay() {
    if (overlayVisible) { closeOverlay(); return; }
    overlayVisible = true;

    let overlay = document.getElementById('apivault-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'apivault-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', bottom: '60px', right: '20px',
        zIndex: '2147483647',
        background: '#141414', border: '1px solid #6366f140',
        borderRadius: '12px', padding: '0',
        width: '280px', maxHeight: '360px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
        animation: 'apivault-fade-in 0.15s ease',
      });

      // Inject keyframe animation once
      if (!document.getElementById('apivault-style')) {
        const style = document.createElement('style');
        style.id = 'apivault-style';
        style.textContent = `
          @keyframes apivault-fade-in {
            from { opacity:0; transform: translateY(8px); }
            to   { opacity:1; transform: translateY(0); }
          }
          #apivault-overlay::-webkit-scrollbar { width: 4px; }
          #apivault-overlay::-webkit-scrollbar-track { background: #1a1a1a; }
          #apivault-overlay::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 2px; }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(overlay);
    }

    // Header
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #6366f120;">
        <img src="${provider.logo}" alt="${provider.name}"
             style="width:18px;height:18px;border-radius:4px;background:#fff;object-fit:contain;">
        <span style="color:#e0e0e0;font-size:13px;font-weight:600;flex:1;">${provider.name} Keys</span>
        <button id="apivault-close" style="background:none;border:none;color:#555;font-size:16px;cursor:pointer;padding:0;line-height:1;">✕</button>
      </div>
      <div id="apivault-body" style="overflow-y:auto;max-height:300px;padding:8px 0;"></div>
    `;

    document.getElementById('apivault-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeOverlay();
    });

    const body = document.getElementById('apivault-body');
    body.innerHTML = `<div style="padding:16px;color:#666;font-size:12px;text-align:center;">Loading…</div>`;

    try {
      const vaultData = await getVaultData();

      if (vaultData.locked) {
        body.innerHTML = `
          <div style="padding:20px 14px;text-align:center;">
            <div style="font-size:24px;margin-bottom:8px;">🔒</div>
            <div style="color:#a0a0a0;font-size:12px;line-height:1.5;">
              Vault is locked<br>
              <span style="color:#6366f1;font-weight:600;">Click the extension icon</span><br>
              to unlock & view your keys
            </div>
          </div>`;
        return;
      }

      const allKeys  = await decryptVault(vaultData.vault_key, vaultData.encrypted);
      const matching = allKeys.filter(k => {
        if (!k.providerId) return false;
        if (k.providerId.toLowerCase() === provider.id.toLowerCase()) return true;
        // For custom providers, also match by hostname
        if (provider.isCustom) {
          const host = location.hostname;
          const hostBase = host.replace(/^www\./, '').split('.')[0].toLowerCase();
          const pid = k.providerId.toLowerCase().replace(/\s+/g, '');
          return host.includes(pid) || pid.includes(hostBase);
        }
        return false;
      });

      if (matching.length === 0) {
        body.innerHTML = `
          <div style="padding:20px 14px;text-align:center;">
            <div style="font-size:20px;margin-bottom:8px;">🗝️</div>
            <div style="color:#666;font-size:12px;">No ${provider.name} keys saved yet</div>
          </div>`;
        return;
      }

      body.innerHTML = '';
      matching.forEach((entry) => {
        const now = Date.now();
        const isExpired = entry.expiry && new Date(entry.expiry).getTime() <= now;

        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderBottom: '1px solid #1f1f1f',
          gap: '8px',
        });

        row.innerHTML = `
          <div style="flex:1;min-width:0;">
            <div style="color:${isExpired ? '#ef4444' : '#c0c0c0'};font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${esc(entry.label || 'Default')}
              ${isExpired ? '<span style="color:#ef4444;font-size:10px;margin-left:4px;">(expired)</span>' : ''}
            </div>
            <div style="color:#555;font-size:11px;font-family:monospace;margin-top:2px;">
              ${esc(maskKey(entry.value))}
            </div>
          </div>
          <button data-value="${esc(entry.value)}"
                  style="background:#6366f1;border:none;color:#fff;font-size:11px;font-weight:600;
                         padding:4px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;
                         flex-shrink:0;transition:background 0.15s;">
            Copy
          </button>
        `;

        const btn = row.querySelector('button');
        btn.addEventListener('mouseenter', () => btn.style.background = '#4f52c0');
        btn.addEventListener('mouseleave', () => btn.style.background = '#6366f1');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(entry.value).then(() => {
            btn.textContent = '✓ Copied';
            btn.style.background = '#22c55e';
            setTimeout(() => {
              btn.textContent = 'Copy';
              btn.style.background = '#6366f1';
            }, 1500);
          });
        });

        body.appendChild(row);
      });

    } catch (err) {
      body.innerHTML = `<div style="padding:14px;color:#ef4444;font-size:12px;">Error: ${err.message}</div>`;
    }
  }

  function closeOverlay() {
    overlayVisible = false;
    const overlay = document.getElementById('apivault-overlay');
    if (overlay) overlay.remove();
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Respond to background ping ────────────────────────────────────────────

  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!isContextValid()) return;
      if (msg.type === 'GET_HOST') {
        sendResponse({ host: location.hostname, providerId: provider.id });
      }
    });
  } catch { /* extension context invalidated — ignore */ }

})();
