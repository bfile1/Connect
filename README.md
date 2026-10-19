# Connect
A family check-in app with Supabase email/password accounts, shared check-ins, messages, outing/food ideas, and per-person votes.

## Run
Requires Node.js 18+. No package installation is required.

```sh
npm start
```

Open port 3000. `PORT` can select another port. `npm run check` checks JavaScript syntax.

## Supabase setup
`config.js` contains only the project's public URL and publishable key, which are safe for the browser. Never put database passwords, secret keys, or service-role keys in these files.

1. Run `supabase/schema.sql` once in your project's SQL Editor. It creates the tables and row-level security policies in a transaction.
2. In Authentication > Users > Add user, create three email/password users, with email confirmed: one for each parent and one dedicated shared-iPad account. Keep the passwords private. The boys do not need their own email addresses. Disable public signups in Authentication settings; membership is admin-managed regardless.
3. Edit the three email placeholders in `supabase/add-family.sql` and run that file in the SQL Editor. It assigns all three accounts to one private family. It fails safely if an account is missing or already assigned.
4. Sign in on the parents' phones using their separate accounts. Sign in on the iPad with the dedicated account; it offers only the three boys' avatars and cannot submit as a parent.

All family members can read all family check-ins and messages. Recipient selection labels a message; it does not make it private. Both parents can see everything. The boys share one authenticated device identity, so avatar switching is a convenience, not isolation between siblings. Only the account's assigned profiles may submit. Anonymous clients and accounts without family membership have no family-data access.

The original local-only preview data is not uploaded automatically. New saves go to Supabase. Data refreshes every 30 seconds, at login, and after a save. Accounts/password recovery are currently managed in Supabase's dashboard.

## Cloudflare Pages
Connect this GitHub repository in Workers & Pages > Create application > Pages > Connect to Git. Select the `connect-cloudflare` branch, framework preset **None**, build command `npm run build`, and build output directory `dist`. No environment variables or package installation are required for this version. The build copies only the five public website assets; SQL files and server code are not published.

## Other hosting
Serve `index.html`, `style.css`, `app.js`, `cloud.js`, and `config.js` on an HTTPS static host. These require no build. Do not include the `supabase` directory in the website upload. The Node server is an alternative for a host with Node support. Hosting credentials are not configured in this workspace; the site has not been deployed.

The user reported successfully running both SQL files and creating the three accounts. Live authenticated multi-device validation remains pending; browser flows were checked with simulated Supabase responses.

## Phone notifications
Parent-only Web Push is implemented, including a Home Screen manifest, service worker, local key-generation page, and Supabase database/Edge Function components. **It requires dashboard activation before alerts can be delivered.** Follow [the complete activation guide](supabase/PUSH-SETUP.md), starting with the additive [notifications migration](supabase/notifications.sql). Each parent then enables alerts on their own phone; iPhones require a Home Screen installation. Alerts never include private note/message content.

Run `npm ci` then `npm test` for the database, access-control, retry, and service-worker tests. The tests use local PostgreSQL-compatible PGlite and simulated delivery, and do not send real pushes. The hosted function also needs the keys and webhook/cron setup described in the guide.

## Check-in journal
Mum and Dad have a **History** tab with member and inclusive date-range filters, daily grouping, notes, and all three wellbeing/happiness/energy scores. Results are fetched in pages of 50 with an extra row to detect the next page, so older check-ins remain accessible beyond Supabase's default API row cap. The daily screen fetches only today's check-ins. No database migration is needed: existing dated records are used. Each person has one current record per date; changing a check-in replaces that day's previous values, rather than retaining a separate revision history. History navigation is offered to parents; the existing database policy still treats check-ins as shared family data.
