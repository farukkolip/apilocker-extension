# API Locker 🔐

> Secure API key manager for developers. AES-256-GCM encrypted, 100% local — your keys never leave your device.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## What is API Locker?

API Locker is a Chrome extension that securely stores your API keys locally with military-grade encryption. It automatically detects 20+ API provider sites and lets you copy your keys with a single click — without ever opening a new tab.

## Features

- 🔐 **AES-256-GCM encryption** with PBKDF2 (100,000 iterations)
- 🏠 **100% local** — no servers, no databases, no telemetry
- ⚡ **Smart site detection** — detects 20+ API providers automatically
- 📋 **One-click copy** — grab your key instantly from any page
- 🔒 **Session lock** — vault auto-locks when browser closes
- 🛡️ **Zero-knowledge** — master password never stored or transmitted

## Supported Providers

OpenAI · Anthropic · Google AI · AWS · Azure · Stripe · GitHub · Supabase · Vercel · Notion · Twilio · SendGrid · Cloudflare · HuggingFace · Replicate · Pinecone · Resend · MongoDB · PlanetScale · Shopify

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)
1. Clone this repo
   ```bash
   git clone https://github.com/farukkolip/apilocker-extension.git
   ```
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the cloned folder

## How It Works

1. **Set master password** — creates your encrypted vault
2. **Add API keys** — name, provider, and key value
3. **Visit any supported site** — API Locker detects it automatically
4. **Click the badge** → see your keys → copy with one click

## Security

| Feature | Detail |
|---|---|
| Encryption | AES-256-GCM |
| Key derivation | PBKDF2, 100,000 iterations, SHA-256 |
| Storage | `chrome.storage.local` (device only) |
| Session key | `chrome.storage.session` (cleared on browser close) |
| Network requests | None |
| Telemetry | None |

All cryptographic operations use the browser's native **WebCrypto API**. The master password is never stored — it is only used to derive the encryption key locally.

## Project Structure

```
api-key-vault/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── background.js      # Service worker — session key management
├── content/
│   └── content.js         # Site detection & key overlay
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js           # Vault UI — add, view, delete keys
├── utils/
│   ├── crypto.js          # AES-256-GCM encryption/decryption
│   └── providers.js       # Supported API provider definitions
└── icons/
    └── icon{16,32,48,128}.png
```

## Roadmap

- [ ] Cloud sync (E2E encrypted, zero-knowledge)
- [ ] Firefox & Edge support
- [ ] Team sharing
- [ ] Import / Export
- [ ] Key expiry reminders

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT © [Faruk Kolip](https://github.com/farukkolip)

---

**Website:** [apilocker.dev](https://apilocker.dev)
