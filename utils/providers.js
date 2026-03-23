const PROVIDERS = [
  // ── AI / LLM ──────────────────────────────────────────────────────────────
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64',
    domains: ['platform.openai.com', 'api.openai.com'],
    keyHint: 'sk-...'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d97706',
    logo: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64',
    domains: ['console.anthropic.com'],
    keyHint: 'sk-ant-...'
  },
  {
    id: 'gemini',
    name: 'Google AI / Gemini',
    color: '#4285f4',
    logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64',
    domains: ['aistudio.google.com', 'makersuite.google.com'],
    keyHint: 'AIza...'
  },
  {
    id: 'groq',
    name: 'Groq',
    color: '#f97316',
    logo: 'https://www.google.com/s2/favicons?domain=groq.com&sz=64',
    domains: ['console.groq.com'],
    keyHint: 'gsk_...'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    color: '#ff6b35',
    logo: 'https://www.google.com/s2/favicons?domain=mistral.ai&sz=64',
    domains: ['console.mistral.ai'],
    keyHint: ''
  },
  {
    id: 'cohere',
    name: 'Cohere',
    color: '#39c5bb',
    logo: 'https://www.google.com/s2/favicons?domain=cohere.com&sz=64',
    domains: ['dashboard.cohere.com'],
    keyHint: ''
  },
  {
    id: 'together',
    name: 'Together AI',
    color: '#6366f1',
    logo: 'https://www.google.com/s2/favicons?domain=together.ai&sz=64',
    domains: ['api.together.xyz', 'together.ai'],
    keyHint: ''
  },
  {
    id: 'replicate',
    name: 'Replicate',
    color: '#000000',
    logo: 'https://www.google.com/s2/favicons?domain=replicate.com&sz=64',
    domains: ['replicate.com'],
    keyHint: 'r8_...'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    color: '#ffcc00',
    logo: 'https://www.google.com/s2/favicons?domain=huggingface.co&sz=64',
    domains: ['huggingface.co'],
    keyHint: 'hf_...'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    color: '#20b2aa',
    logo: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=64',
    domains: ['www.perplexity.ai'],
    keyHint: 'pplx-...'
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  {
    id: 'stripe',
    name: 'Stripe',
    color: '#635bff',
    logo: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=64',
    domains: ['dashboard.stripe.com'],
    keyHint: 'sk_live_... / sk_test_...'
  },
  {
    id: 'paypal',
    name: 'PayPal',
    color: '#003087',
    logo: 'https://www.google.com/s2/favicons?domain=paypal.com&sz=64',
    domains: ['developer.paypal.com'],
    keyHint: ''
  },

  // ── Cloud / Infra ─────────────────────────────────────────────────────────
  {
    id: 'aws',
    name: 'AWS',
    color: '#ff9900',
    logo: 'https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=64',
    domains: ['console.aws.amazon.com', 'us-east-1.console.aws.amazon.com'],
    keyHint: 'AKIA...'
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    color: '#4285f4',
    logo: 'https://www.google.com/s2/favicons?domain=cloud.google.com&sz=64',
    domains: ['console.cloud.google.com'],
    keyHint: ''
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    color: '#0078d4',
    logo: 'https://www.google.com/s2/favicons?domain=azure.microsoft.com&sz=64',
    domains: ['portal.azure.com'],
    keyHint: ''
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    color: '#f6821f',
    logo: 'https://www.google.com/s2/favicons?domain=cloudflare.com&sz=64',
    domains: ['dash.cloudflare.com'],
    keyHint: ''
  },
  {
    id: 'vercel',
    name: 'Vercel',
    color: '#000000',
    logo: 'https://www.google.com/s2/favicons?domain=vercel.com&sz=64',
    domains: ['vercel.com'],
    keyHint: ''
  },
  {
    id: 'railway',
    name: 'Railway',
    color: '#7b2ff7',
    logo: 'https://www.google.com/s2/favicons?domain=railway.app&sz=64',
    domains: ['railway.app'],
    keyHint: ''
  },
  {
    id: 'supabase',
    name: 'Supabase',
    color: '#3ecf8e',
    logo: 'https://www.google.com/s2/favicons?domain=supabase.com&sz=64',
    domains: ['supabase.com', 'app.supabase.com'],
    keyHint: ''
  },
  {
    id: 'pinecone',
    name: 'Pinecone',
    color: '#2e4057',
    logo: 'https://www.google.com/s2/favicons?domain=pinecone.io&sz=64',
    domains: ['app.pinecone.io'],
    keyHint: ''
  },

  // ── Dev Tools / Source Control ────────────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    color: '#24292e',
    logo: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    domains: ['github.com'],
    keyHint: 'ghp_... / github_pat_...'
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    color: '#fc6d26',
    logo: 'https://www.google.com/s2/favicons?domain=gitlab.com&sz=64',
    domains: ['gitlab.com'],
    keyHint: 'glpat-...'
  },

  // ── Communication ─────────────────────────────────────────────────────────
  {
    id: 'twilio',
    name: 'Twilio',
    color: '#f22f46',
    logo: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64',
    domains: ['console.twilio.com'],
    keyHint: 'AC...'
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    color: '#1a82e2',
    logo: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64',
    domains: ['app.sendgrid.com'],
    keyHint: 'SG...'
  },
  {
    id: 'resend',
    name: 'Resend',
    color: '#000000',
    logo: 'https://www.google.com/s2/favicons?domain=resend.com&sz=64',
    domains: ['resend.com'],
    keyHint: 're_...'
  },
  {
    id: 'slack',
    name: 'Slack',
    color: '#4a154b',
    logo: 'https://www.google.com/s2/favicons?domain=slack.com&sz=64',
    domains: ['api.slack.com'],
    keyHint: 'xoxb-...'
  },

  // ── Analytics / Search ────────────────────────────────────────────────────
  {
    id: 'serpapi',
    name: 'SerpAPI',
    color: '#4caf50',
    logo: 'https://www.google.com/s2/favicons?domain=serpapi.com&sz=64',
    domains: ['serpapi.com'],
    keyHint: ''
  },
  {
    id: 'mapbox',
    name: 'Mapbox',
    color: '#4264fb',
    logo: 'https://www.google.com/s2/favicons?domain=mapbox.com&sz=64',
    domains: ['account.mapbox.com'],
    keyHint: 'pk.ey...'
  },

  // ── Productivity / CMS ────────────────────────────────────────────────────
  {
    id: 'notion',
    name: 'Notion',
    color: '#000000',
    logo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64',
    domains: ['www.notion.so', 'notion.so'],
    keyHint: 'secret_... / ntn_...'
  },
  {
    id: 'airtable',
    name: 'Airtable',
    color: '#2d7ff9',
    logo: 'https://www.google.com/s2/favicons?domain=airtable.com&sz=64',
    domains: ['airtable.com'],
    keyHint: 'pat...'
  },

  // ── Social / Marketing ────────────────────────────────────────────────────
  {
    id: 'twitter',
    name: 'Twitter / X',
    color: '#000000',
    logo: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
    domains: ['developer.twitter.com', 'developer.x.com'],
    keyHint: ''
  },
  {
    id: 'n8n',
    name: 'n8n',
    color: '#ea4b71',
    logo: 'https://www.google.com/s2/favicons?domain=n8n.io&sz=64',
    domains: ['app.n8n.cloud', 'n8n.io'],
    keyHint: ''
  }
];

// Find provider by current hostname
function getProviderForHost(hostname) {
  for (const p of PROVIDERS) {
    if (p.domains.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return p;
    }
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { PROVIDERS, getProviderForHost };
