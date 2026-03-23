#!/bin/bash
# API Locker — Deploy Lemon Squeezy webhook Edge Function to Supabase
#
# Prerequisites:
#   npm install -g supabase
#   supabase login
#   supabase link --project-ref lwcaewtkopbldllhmypp
#
# Usage:
#   chmod +x supabase/deploy-webhook.sh
#   ./supabase/deploy-webhook.sh

set -e

echo "🚀 Deploying lemon-webhook Edge Function..."

# Set secrets (replace values below with your actual keys)
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3Y2Fld3Rrb3BibGRsbGhteXBwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjY2MzMxMCwiZXhwIjoyMDU4MjM5MzEwfQ.2ymY4lvfTaAEkhh9m7QmsHQ-EssPOjGtuwQj9ZCM5C0" \
  LEMON_SIGNING_SECRET="REPLACE_WITH_YOUR_LEMON_WEBHOOK_SECRET"

echo "✅ Secrets set."

# Deploy the function
supabase functions deploy lemon-webhook --no-verify-jwt

echo ""
echo "✅ Done! Webhook URL:"
echo "   https://lwcaewtkopbldllhmypp.supabase.co/functions/v1/lemon-webhook"
echo ""
echo "📌 Next: Add this URL to Lemon Squeezy:"
echo "   Dashboard → Settings → Webhooks → Add Webhook"
echo "   Events: order_created, subscription_created, subscription_updated"
echo "   Signing secret: copy from LEMON_SIGNING_SECRET above"
