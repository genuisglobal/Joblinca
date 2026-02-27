# WhatsApp Business Cloud API — Setup Guide

## 1. Environment Variables

Add these to `.env.local` (local dev) and to Vercel / your hosting environment:

```env
# Meta Graph API access token (from your WABA system user)
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxx

# Phone Number ID from Meta Business Suite → WhatsApp → API Setup
WHATSAPP_PHONE_NUMBER_ID=1234567890

# Meta App Secret — found in App Dashboard → Settings → Basic
WHATSAPP_APP_SECRET=abc123

# A random string you choose; must match what you enter in Meta webhook config
WHATSAPP_VERIFY_TOKEN=joblinca_wh_2026

# Optional — defaults to v22.0
WHATSAPP_API_VERSION=v22.0
```

> ⚠️ The old `WHATSAPP_TOKEN` variable has been renamed to `WHATSAPP_ACCESS_TOKEN`.
> Update `vercel.json` / Vercel environment settings accordingly.

---

## 2. Meta Developer App — Webhook Configuration

1. Go to **Meta for Developers → Your App → WhatsApp → Configuration**
2. Under **Webhook**, click **Edit**
3. Set **Callback URL** to:
   ```
   https://your-domain.com/api/whatsapp/webhook
   ```
4. Set **Verify Token** to the same value as `WHATSAPP_VERIFY_TOKEN`
5. Subscribe to these webhook fields:
   - `messages` (required — inbound messages + statuses)
6. Click **Verify and Save**

---

## 3. Database Migration

Run the migration against your Supabase project:

```bash
# Via Supabase CLI
supabase db push

# Or paste the contents of:
# supabase/migrations/20260227000100_whatsapp_enhanced.sql
# into the SQL editor in your Supabase dashboard
```

The migration:
- Adds columns to `whatsapp_logs` (wa_message_id, wa_conversation_id, message_type, template_name, raw_payload)
- Creates `wa_conversations` — one row per WhatsApp contact
- Creates `wa_statuses` — delivery/read receipt events
- Sets up RLS policies for admin read + service-role full access

---

## 4. Message Templates

For messages sent outside the 24-hour window you **must** use Meta-approved templates.

Templates referenced in the codebase:

| Template name          | Description                         | Language |
|------------------------|-------------------------------------|----------|
| `job_alert_v1`         | New job match notification          | en       |
| `interview_reminder_v1`| Interview time reminder             | en       |

To create/submit templates:
1. **Meta Business Suite → WhatsApp → Message Templates**
2. Click **Create Template**
3. Category: **Utility** (for transactional alerts)
4. Add your template body with `{{1}}`, `{{2}}` placeholders
5. Submit for review (usually approved within minutes–hours)

Example `job_alert_v1` body:
```
Hi {{1}}, a new *{{2}}* role at {{3}} is available in {{4}}.

Apply here: {{5}}

Reply STOP to unsubscribe.
```

---

## 5. Testing Locally

### Verify the webhook endpoint works:

```bash
# Simulate Meta's verification GET request
curl "http://localhost:3000/api/whatsapp/webhook\
?hub.mode=subscribe\
&hub.verify_token=joblinca_wh_2026\
&hub.challenge=test_challenge_123"
# Expected: test_challenge_123
```

### Send a test outbound message:

```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -H "Cookie: jg_access_token=<your-session-token>" \
  -d '{"to":"+237612345678","message":"Hello from Joblinca!"}'
```

### Simulate an inbound webhook POST (no signature check in dev):

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "ENTRY_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "237XXXXXXX",
            "phone_number_id": "PHONE_NUMBER_ID"
          },
          "contacts": [{"profile":{"name":"Test User"},"wa_id":"237612345678"}],
          "messages": [{
            "from": "237612345678",
            "id": "wamid.test123",
            "timestamp": "1700000000",
            "text": {"body": "Hello Joblinca!"},
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```

Check your Supabase `whatsapp_logs` and `wa_conversations` tables to verify the row was inserted.

---

## 6. API Routes Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET`  | `/api/whatsapp/webhook` | None (Meta) | Webhook verification |
| `POST` | `/api/whatsapp/webhook` | X-Hub-Signature-256 | Inbound events |
| `POST` | `/api/whatsapp/send` | AM/Admin session | Send text message |

Legacy path `/api/messaging/whatsapp` re-exports the same handlers.

---

## 7. Production Checklist

- [ ] `WHATSAPP_ACCESS_TOKEN` set in Vercel environment (Production + Preview)
- [ ] `WHATSAPP_PHONE_NUMBER_ID` set in Vercel environment
- [ ] `WHATSAPP_APP_SECRET` set in Vercel environment
- [ ] `WHATSAPP_VERIFY_TOKEN` set in Vercel environment
- [ ] Meta webhook URL updated to `https://joblinca.com/api/whatsapp/webhook`
- [ ] Webhook field `messages` subscribed in Meta dashboard
- [ ] DB migration applied to production Supabase
- [ ] `job_alert_v1` template approved in Meta Business Suite
- [ ] `interview_reminder_v1` template approved in Meta Business Suite
- [ ] Phone number verified in Meta Business Suite (green checkmark)
- [ ] Tested inbound webhook via Meta's "Test" button in dashboard
- [ ] Tested outbound text message to a real number
