// API Locker — Stripe Webhook Handler (Supabase Edge Function)
//
// Triggers on: checkout.session.completed, customer.subscription.deleted
// Sets profiles.is_pro = true on successful payment
// Sets profiles.is_pro = false on subscription cancellation
//
// ── Deploy ──────────────────────────────────────────────────────────────────
// supabase functions deploy stripe-webhook --no-verify-jwt
//
// ── Environment Variables (set in Supabase Dashboard → Edge Functions) ──────
// STRIPE_SECRET_KEY       = sk_live_...
// STRIPE_WEBHOOK_SECRET   = whsec_...
// SUPABASE_URL            = https://xxxx.supabase.co
// SUPABASE_SERVICE_KEY    = eyJ... (service_role key — NOT anon key)
// ────────────────────────────────────────────────────────────────────────────

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? 'https://lwcaewtkopbldllhmypp.supabase.co',
  Deno.env.get('SUPABASE_SERVICE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3Y2Fld3Rrb3BibGRsbGhteXBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4NzQ1NSwiZXhwIjoyMDg5ODYzNDU1fQ.2ymY4lvfTaAEkhh9m7QmsHQ-EssPOjGtuwQj9ZCM5C0',
);

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  console.log(`Processing event: ${event.type}`);

  try {
    switch (event.type) {

      // ── Payment completed (LTD or first month of subscription) ────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email ?? session.customer_email;
        if (!email) {
          console.warn('No email in checkout session — skipping');
          break;
        }
        await activatePro(email);
        break;
      }

      // ── Subscription renewed ───────────────────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const email = invoice.customer_email;
        if (!email) break;
        await activatePro(email);
        break;
      }

      // ── Subscription cancelled / payment failed ────────────────────────────
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object as Stripe.Subscription | Stripe.Invoice;
        // Get customer email from the customer object
        const customerId = 'customer' in obj
          ? (typeof obj.customer === 'string' ? obj.customer : obj.customer?.id)
          : null;
        if (!customerId) break;

        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        if (customer.deleted || !customer.email) break;
        await deactivatePro(customer.email);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing event:', err);
    // Return 200 so Stripe doesn't retry — log for investigation
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function activatePro(email: string) {
  // Find the Supabase user by email using admin API
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;

  const user = data.users.find(u => u.email === email);
  if (!user) {
    console.warn(`No Supabase user found for email: ${email}`);
    return;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_pro: true, pro_since: new Date().toISOString() })
    .eq('user_id', user.id);

  if (updateError) throw updateError;
  console.log(`✅ Pro activated for: ${email}`);
}

async function deactivatePro(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;

  const user = data.users.find(u => u.email === email);
  if (!user) {
    console.warn(`No Supabase user found for email: ${email}`);
    return;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_pro: false })
    .eq('user_id', user.id);

  if (updateError) throw updateError;
  console.log(`⚠️ Pro deactivated for: ${email}`);
}
