# Phone push notifications

The code is ready for Cloudflare Pages and Supabase Edge Functions. It is **not enabled** by a Git push alone. Complete the following setup in the existing Supabase project. No paid email provider or new account is required.

## 1. Database
Run `notifications.sql` in the Supabase SQL Editor. It is an additive, repeatable migration. It creates a private subscription store and a durable event queue. Existing family check-ins, messages, ideas and votes are unchanged. New submissions, changed check-ins, and vote removals create notification events. Identical check-in updates do not generate duplicates. The SQL contains no credentials.

## 2. Function secrets
After Cloudflare has deployed this branch, open `https://connect-7t0.pages.dev/push-setup.html`.

Select **Generate notification keys**, then leave that tab open. In Supabase, open **Edge Functions → Secrets** and add the four values generated on the page, keeping each name exactly as shown:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `CONNECT_WEBHOOK_SECRET`
- `CONNECT_SITE_URL` (the public website origin, without a trailing slash)

The keys are generated locally using Web Crypto; the page never uploads or saves them. Never put private keys or the webhook secret in GitHub or chat. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically inside hosted Edge Functions; do not put either service-role credentials or private VAPID keys in the website. Keep the same VAPID keys for existing phone subscriptions.

## 3. Deploy the function
In Supabase **Edge Functions → Deploy a new function → Via Editor**, create a function named `push-notifications`. Replace the editor contents with all of `functions/push-notifications/index.ts`, and deploy. The code uses pinned Deno npm imports.

Disable **Verify JWT** / **Enforce JWT verification** for this function in its settings. This is deliberate: the function validates parent user JWTs internally with Supabase Auth, and authenticates webhook/cron calls with the separate `x-connect-webhook-secret` header. Without that switch, database webhooks cannot reach it. `supabase/config.toml` includes the equivalent setting for CLI deployment:

```sh
supabase functions deploy push-notifications --project-ref vxpdafvikpxajktkzldm
```

This command requires your normal Supabase CLI login; do not send access tokens in chat.

## 4. Immediate database webhook
In **Database → Webhooks**, create a webhook:

- Name: `connect-parent-push`
- Table: `public.connect_push_events`
- Event: **INSERT** only (not updates)
- Type: **HTTP request**, method **POST**
- URL: `https://vxpdafvikpxajktkzldm.supabase.co/functions/v1/push-notifications`
- Headers: `Content-Type: application/json` and `x-connect-webhook-secret: <the generated CONNECT_WEBHOOK_SECRET>`

Do not use the publishable key as the webhook secret. No Authorization header is needed when gateway JWT verification is disabled. Each valid webhook drains up to 20 pending events; event leases and per-device delivery records prevent routine duplicate dispatches.

## 5. Automatic retry
Use Supabase's **Cron** module to create a job running every minute (`* * * * *`). Choose **HTTP Request** (or **Supabase Edge Function**, depending on the dashboard version) with the same function URL, POST method, and secret header as the webhook. Set its JSON body to `{"action":"drain"}`. Store the webhook secret only in the secure project configuration. Do not commit a SQL command containing its value.

This job retries transient push errors and handles pending events even if an immediate webhook fails. Database writes do not wait for a push provider. The function processes at most 20 queued events per request. Expired subscriptions (404/410) are removed; successful sends are recorded per subscription. A rare crash after a provider accepts a push but before its delivery record is saved can cause a retry; notification tags let the phone replace the same event rather than show multiple alerts. Push-provider acceptance does not guarantee display if the OS suppresses it.

## 6. Enable on both phones
On each parent's phone, sign in to their own account and tap **Notifications → Enable notifications**. A confirmation push is sent. Each phone/device registers separately; the boys' shared account cannot register notifications.

On iPhone/iPad, use iOS/iPadOS 16.4 or later. Open the website in Safari, tap **Share → Add to Home Screen**, then launch the Home Screen app, sign in, and enable notifications there. Notifications can arrive when the app is closed. On Android, use an up-to-date browser and allow site notifications.

Subscriptions persist through sign-out so phones can still receive generic family updates. To disable on a phone, use **Notifications → Turn off on this device** before signing out, or disable them in OS settings. All alerts are generic and never contain names, emotion scores, or message contents. Both parents are notified even when one parent authored the update. Events that are processed before anyone subscribes are completed without backfilling old notifications.

## Validation
- Enable on Dad's phone and Mum's phone; both should receive a confirmation push.
- On the iPad, submit Buddy's check-in. Both phones should receive an alert, even with Connect closed.
- Send a message, add an outing, vote and remove a vote; each creates an event. Change the check-in and verify an update alert.
- Repeat an unchanged check-in; it should not create an event.
- Confirm the iPad has no Notifications control. Requests made with its account are rejected server-side as well.
- Disable notifications on one phone, then submit again; the remaining phone should still receive them.

Local tests use PostgreSQL-compatible PGlite and mocked push providers. Live delivery remains unverified until the dashboard setup and real-device checks above are completed.
