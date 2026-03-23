// API Locker — Lemon Squeezy Webhook Handler
// Supabase Edge Function (Deno)
//
// Receives Lemon Squeezy payment events and sets is_pro = true for the buyer.
//
// ── SETUP ──────────────────────────────────────────────────────────────────
// 1. Deploy:  supabase functions deploy lemon-webhook
// 2. Set env: supabase secrets set LEMON_SIGNING_SECRET=<your_secret>
//             supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
// 3. In Lemon Squeezy dashboard → Settings → Webhooks:
//    URL: https://<your-project-ref>.supabase.co/functions/v1/lemon-webhook
//    Events: order_created, subscription_created, subscription_updated
//    Signing secret: (generate one, same as LEMON_SIGNING_SECRET above)
// ───────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEMON_SIGNING_SECRET   = Deno.env.get('LEMON_SIGNING_SECRET')!;

// ── Verify Lemon Squeezy HMAC-SHA256 signature ─────────────────────────────
async function verifySignature(body: string, signature: string): Promise<boolean> {
  const encoder  = new TextEncoder();
  const keyData  = encoder.encode(LEMON_SIGNING_SECRET);
  const msgData  = encoder.encode(body);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sigHex    = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return sigHex === signature;
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body      = await req.text();
  const signature = req.headers.get('x-signature') ?? '';

  // Verify signature (skip in dev if secret not set)
  if (LEMON_SIGNING_SECRET) {
    const valid = await verifySignature(body, signature);
    if (!valid) {
      console.error('Invalid Lemon Squeezy signature');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const eventName = (event.meta as Record<string, unknown>)?.event_name as string;
  console.log('Lemon Squeezy event:', eventName);

  // We care about successful orders and active subscriptions
  const isOrderComplete = eventName === 'order_created';
  const isSubActive     = eventName === 'subscription_created' || eventName === 'subscription_updated';

  if (!isOrderComplete && !isSubActive) {
    // Ignore other events (refunds, cancellations, etc.)
    return new Response('OK – ignored', { status: 200 });
  }

  // For subscription_updated, only activate if status is "active"
  if (isSubActive) {
    const attrs = ((event.data as Record<string, unknown>)?.attributes as Record<string, unknown>);
    const status = attrs?.status as string;
    if (status && status !== 'active') {
      console.log('Subscription not active, status:', status);
      return new Response('OK – not active', { status: 200 });
    }
  }

  // Extract buyer email from event
  const data       = event.data as Record<string, unknown>;
  const attributes = data?.attributes as Record<string, unknown>;
  const email: string = (
    (attributes?.user_email as string) ||
    (attributes?.customer_email as string) ||
    ''
  ).toLowerCase().trim();

  if (!email) {
    console.error('No email found in event payload');
    return new Response('No email', { status: 400 });
  }

  console.log('Activating Pro for:', email);

  // Use service role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // 1. Look up the Supabase user by email
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list users:', listErr.message);
    return new Response('Server error', { status: 500 });
  }

  const user = usersData.users.find(u => u.email?.toLowerCase() === email);
  if (!user) {
    // User hasn't signed up yet — store pending activation by email
    // We'll upsert a "pending" row so when they sign up it gets picked up
    console.warn('No Supabase user found for email:', email);
    // Store in a simple table for later activation (optional)
    // For now: log and return OK — user must sign up first then contact support
    return new Response('OK – user not found, please sign up first', { status: 200 });
  }

  // 2. Upsert profile with is_pro = true
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(
      { user_id: user.id, is_pro: true, pro_since: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (upsertErr) {
    console.error('Failed to set is_pro:', upsertErr.message);
    return new Response('Server error', { status: 500 });
  }

  console.log('Pro activated for user:', user.id, email);
  return new Response('OK', { status: 200 });
});
