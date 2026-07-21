# Sparrow — Claude Code Handoff

> **Renamed 2026-07-05: the app is now branded "Sparrowtell"** (briefly "Sparrow", but that App Store name was taken; formerly NEMPA — Nigerian Emergency Missing Person Alert). All user-facing strings, app display names, and the Gecko Intel integration use Sparrowtell. Internal identifiers kept the short form: logo assets `sparrow-logo.png`, gecko route `/api/sparrow`, env vars `SPARROW_SUPABASE_*`, data key `sparrow_alerts`. Identifiers that are expensive/impossible to change keep the old name: bundle/app id `ng.nempa.app`, Firebase project `nempa-22521`, Supabase project name `NEMPA` (ref `ticnoeumdvticwtuaujd`), the `~/NEMPA` folder, and the GitHub repo. Where this doc says "NEMPA" below, read it as historical/infra naming.

**Sparrow** is a community safety app for **missing-person** and **robbery** alerts, broadcasting push notifications to users near an incident. Web (React + Vite + TS) wrapped with **Capacitor** for Android + iOS. Backend is **Supabase** (Postgres + PostGIS + Auth + Storage + Edge Functions). Push via **Firebase Cloud Messaging (FCM)**.

> ⚠️ Not affiliated with the US AMBER Alert system. Brand strictly as a *community* alert tool. Moderation is mandatory before any broadcast.

---

## Current state (what this scaffold already contains)

```
nempa/
├── capacitor.config.ts        # appId ng.nempa.app, FCM-ready plugin config
├── src/
│   ├── lib/supabase.ts        # client (reads VITE_ env vars)
│   ├── lib/geo.ts             # Capacitor Geolocation + WKT helper
│   ├── lib/push.ts            # FCM token registration -> devices table
│   ├── types/index.ts         # Alert / NewAlert / enums
│   ├── pages/Feed.tsx         # list verified alerts + type filter
│   ├── pages/ReportForm.tsx   # file missing/robbery report (status=pending)
│   ├── pages/AlertDetail.tsx  # detail + Leaflet map
│   ├── pages/Auth.tsx         # email/password auth; triggers push reg
│   └── components/            # Nav, AlertCard, AlertMap
└── supabase/
    ├── schema.sql             # tables, PostGIS, devices_near(), RLS
    └── functions/broadcast-alert/index.ts  # radius push via FCM
```

Everything compiles as a web app. Native folders (`/android`, `/ios`) are **not** generated yet — they come from `npx cap add`.

### Live infrastructure (provisioned 2026-06-01)

- **Project location:** the app lives in `~/NEMPA` (moved off the Desktop). Build with `npm run build` / `npm run dev`.
- **Supabase project:** `NEMPA`, ref `ticnoeumdvticwtuaujd`, region `eu-west-1`. URL + anon key are in `.env` (gitignored).
- **Schema:** `schema.sql` applied. Added an `alerts_geo` view that exposes the PostGIS point as numeric `last_seen_lat` / `last_seen_lng` — clients and the Edge Function read this instead of decoding WKB/GeoJSON. `search_path` pinned on SECURITY DEFINER functions.
- **Storage:** `alert-photos` bucket created (public read, authenticated insert).
- **Edge Function:** `broadcast-alert` deployed + `verify_jwt` on. **FCM secrets ARE set** (`FCM_PROJECT_ID=nempa-22521`, `FCM_SERVICE_ACCOUNT`) and verified end-to-end — the service account mints an FCM OAuth token successfully; sends to a real device token will deliver. Returns `{ok, targeted, sent, failed, errors}`. The only thing left for real push is registering device tokens, which needs a native build on a device.
- **Seed:** one sample `pending` alert (Adaeze Okoro, Ikeja) so the moderation queue is testable.
- **Auth → "Confirm email" is ON** (was off during early dev; this doc said otherwise until 2026-07-21). Signup therefore sends a confirmation email and the account can't sign in until the link is clicked.
- ⚠️ **The confirmation link dead-ends.** Site URL is still the default `http://localhost:3000`, so on a phone the link confirms the account server-side and then fails to load ("localhost is currently unreachable"). Confirmation *works* — only the redirect is broken, which reads like total failure to a user. Nothing in the app passes `emailRedirectTo`, and there's no deep-link handler, so this needs either: (a) confirmations off, (b) Site URL pointed at a real https "you're confirmed, reopen Sparrowtell" page, or (c) a custom scheme (`ng.nempa.app://auth/callback`) added to Redirect URLs + `@capacitor/app` `appUrlOpen` handling.
- 🚨 **CUSTOM SMTP IS A HARD BLOCKER — signup is currently closed to everyone but the project team.** Supabase's built-in email service *only delivers to addresses belonging to the project's team*; it silently refuses everyone else. Combined with "Confirm email" being ON, that means an ordinary user never receives the mail, so can never confirm, so can never sign in. It is not a branding issue and not a rate-limit issue — it makes the app unusable for real users. Fix: Project Settings → Authentication → SMTP Settings, with a provider (Resend/Postmark/SendGrid/SES) on a domain you own + SPF/DKIM. That also unlocks the `Sparrowtell <no-reply@…>` sender name. Secondary limits: built-in service is a few emails/hour; with custom SMTP the auth-email default is 30 new users/hour, adjustable under Authentication → Rate Limits.

Moderation is no longer done in this app at all — see the next section. The `profiles.role`
column and `is_staff()` still exist and still gate the RLS policies that Gecko will write
through, so promoting an operator is still `update profiles set role='moderator' where id='<uuid>';`

### No moderation in Sparrowtell — it all happens in Gecko (2026-07-21)

Sparrowtell is the **citizen-side** app and has **no moderation surface at all**. There is
no Review tab, no `/moderate` route, no `Moderation.tsx`, no `SosQueue`, no `useRole.ts` —
all deleted. Operator work (investigate, broadcast, resolve, reporter phone+NIN, SOS queue)
lives in **Gecko Intel** (`~/gecko_intel`).

There is no separate "moderation" step: **the investigation you already do in Gecko is the
review.** A report reaches Gecko the instant it is filed. What still needs a human is the
outbound blast — one operator click, in Gecko, on the screen where the investigating happens.
Rationale: anyone who can create an account could otherwise push-notify every phone within
25km, and a missing-person post broadcasts a real person's face and last-seen location.

The existing `alert_status` enum already models this, so **no schema change**:

| status | meaning |
|---|---|
| `pending` | filed — live in Gecko, visible to its own reporter, **not** public |
| `verified` | an operator hit Broadcast — public feed + radius push |
| `resolved` / `rejected` | as before |

Sparrow side (done): `ReportForm` inserts without `status` (defaults `pending`) and does
**not** call `broadcast-alert`. `Feed.tsx` asks for `pending` too — the alerts RLS policy
(`schema.sql:119`) returns pending rows only to their own reporter, so you see your own
report with a "With responders" badge and nobody else's. `push.ts` no longer deep-links
SOS anywhere.

> ⚠️ Gecko side (**not done** — this is the open loop): `src/app/api/sparrow/route.ts` is
> read-only and queries `alerts_geo?status=eq.verified`, so filed reports do not appear yet.
> It needs `status=in.(pending,verified)` plus a write path that sets `status='verified'`
> and invokes the `broadcast-alert` Edge Function. **Until then nothing can ever be
> broadcast.** SOS is unaffected — it flows instantly via `sos_events_geo` and is never gated.

### Design system

The UI uses an **"emergency dispatch / civic signal"** aesthetic (dark, high-contrast). All tokens + component classes live in `src/index.css` — **use those classes, don't reintroduce ad-hoc inline styles**.

- **Fonts (self-hosted via @fontsource, offline-safe):** Bricolage Grotesque (display `--font-display`), IBM Plex Sans (body), IBM Plex Mono (labels/timestamps/IDs). Imported in `src/main.tsx`.
- **Report types:** `src/lib/alertTypes.ts` is the single source of truth (`missing_person`, `robbery`, `other`) — label, short label and CSS class. Adding a type = a row there, a colour rule in `index.css`, and `alter type alert_type add value` in Postgres. Don't reintroduce `type === 'robbery' ? … : …` ternaries; they silently mislabel everything past the second type.
- **Key classes:** `.page/.page__title/.page__sub`, `.card`, `.alert-card`, `.badge--missing|robbery|other|live|pending`, `.btn` family (`.btn-primary`, `.btn--live`, `.btn--danger`, `.btn--ghost`, `.btn--block/lg`), `.segment/.segment__item`, `.field/.field__label`, `.empty`, `.skeleton`, `.notice`, `.map-frame`, `.nav`, `.mono`, `.status-dot--live`.
- **Shell:** `App.tsx` renders a sticky `.app-bar` + bottom `.nav`; the nav is a fixed three-tab list (Alerts / Report / Account) for every user — no staff tab.
- Old token names (`--signal`, `--surface`, `--r`, etc.) are kept as aliases for back-compat.

Seed data includes 3 verified demo alerts (Lagos/Abuja/PH) + 1 pending. Remove with `delete from alerts where reporter_id is null or verified_by = '<seed-user>'` when you want a clean slate.

### Native push architecture (migrated 2026-06-01)

Push now uses **`@capacitor-firebase/messaging`** (not `@capacitor/push-notifications`, which was removed) so `registerPush()` gets real **FCM tokens on both iOS and Android** — the `broadcast-alert` FCM v1 `token` send works unchanged on either platform. `src/lib/push.ts` uses `FirebaseMessaging.getToken()` + `tokenReceived`/`notificationActionPerformed` listeners. The web build stubs the optional `firebase/messaging` peer via `src/shims/firebase-messaging.ts` (aliased in `vite.config.ts`) — push is native-only, so the Firebase JS SDK is never bundled.

### iOS native (generated 2026-06-01)

`ios/` Xcode project generated (`npx cap add ios`, CocoaPods via Homebrew). Bundle id `ng.nempa.app`. Already wired in-repo:
- `AppDelegate.swift` — the 3 APNs-forwarding callbacks the messaging plugin needs.
- `Info.plist` — `UIBackgroundModes: remote-notification` + Camera/Photos/Location usage strings.
- `capacitor.config.ts` — `FirebaseMessaging.presentationOptions` for foreground alerts.

**Done as of 2026-07-21** (verified in the project, not assumed):
- ✅ `GoogleService-Info.plist` present at `ios/App/App/`, `BUNDLE_ID` matches `ng.nempa.app`, referenced by the App target.
- ✅ Signing: `DEVELOPMENT_TEAM = 5K46PLQ658`, automatic. `App.entitlements` has `aps-environment`.
- ✅ `Info.plist`: `UIBackgroundModes` = remote-notification / audio / location, all usage strings, and `ITSAppUsesNonExemptEncryption = false` (HTTPS only — skips the export-compliance prompt on every upload).
- Version/build: `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 1`. **Every App Store Connect upload needs a unique, higher build number.**

**Still outstanding:**
1. **APNs Auth Key (.p8)** → Apple Developer → Keys → upload to Firebase → Project settings → Cloud Messaging → Apple app config (with Key ID + Team ID `5K46PLQ658`). Downloads once only. **Until this is done, a TestFlight build installs fine and receives no push** — TestFlight uses the production APNs environment.
2. Run on a **real device** (`npm run ios`; the simulator cannot get an APNs/FCM token).

> ⚠️ `UIBackgroundModes` declares `location` and `sos.ts` runs `Geolocation.watchPosition` for the live SOS trail, but the only location usage string is `NSLocationWhenInUseUsageDescription`. Capacitor's Geolocation plugin only ever requests When-In-Use on iOS, so the trail stops when the app is backgrounded — and App Review rejects apps that declare the `location` background mode without a feature that justifies persistent location. Either drop `location` from `UIBackgroundModes`, or move to a plugin that requests Always authorisation and add `NSLocationAlwaysAndWhenInUseUsageDescription`.

Server side (FCM secrets) is already done, so once a device registers its token, broadcasts deliver.

### Android native (generated 2026-06-01)

`android/` project generated (`npx cap add android`; uses Android Studio's bundled JDK 21 + SDK at `~/Library/Android/sdk`). Package `ng.nempa.app`, `compileSdk 34`. Launcher icons (bird/eye) generated via `@capacitor/assets`. FCM Gradle wiring is **already in place** — Capacitor's `android/app/build.gradle` auto-applies the `com.google.gms.google-services` plugin when `google-services.json` is present, and `@capacitor-firebase/messaging` pulls in the Firebase SDK.

**Still requires you (Firebase console — same project `nempa-22521`):**
1. Firebase → add an **Android app** with package `ng.nempa.app` → download **`google-services.json`** → drop it into **`android/app/`**. (FCM uses the APNs-equivalent automatically on Android; no extra key needed.)
2. Build/run: open Android Studio (`npm run android`) on a real device or emulator with Google Play services. The token registers the same way (`@capacitor-firebase/messaging`) and broadcasts deliver.

To build from CLI: set `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` and `ANDROID_HOME="$HOME/Library/Android/sdk"`, then `cd android && ./gradlew :app:assembleDebug`.

---

## First-run setup (do these in order)

```bash
npm install
cp .env.example .env          # then fill in Supabase URL + anon key
npm run dev                   # verify web app boots
```

**Supabase:**
1. Create a project. Run `supabase/schema.sql` in the SQL Editor (enables PostGIS).
2. Create a Storage bucket `alert-photos` (public read) for report images.
3. Put URL + anon key in `.env`.

**Capacitor native:**
```bash
npm run build
npx cap add android
npx cap add ios            # macOS + Xcode only
```

**Firebase / FCM (push):**
1. Firebase project → add Android app (package `ng.nempa.app`) → download `google-services.json` → `android/app/`.
2. Add iOS app → download `GoogleService-Info.plist` → add to Xcode project root.
3. iOS push needs an **APNs key** uploaded to Firebase + a paid Apple Developer account.
4. Deploy the edge function and set secrets:
   ```bash
   supabase functions deploy broadcast-alert
   supabase secrets set FCM_PROJECT_ID=<id> FCM_SERVICE_ACCOUNT='<service-account-json>'
   ```

---

## Build roadmap (suggested order for Claude Code)

1. ✅ **Wire env + run** — `.env` wired to live project; Feed/dev server boot confirmed.
2. ✅ **Photo upload** — `src/lib/photo.ts` (native Camera + `uploadAlertPhoto` to `alert-photos`); `ReportForm` has a picker + preview with a web `<input type=file>` fallback, uploads on submit and saves `photo_url`. Storage RLS verified (public read, authenticated insert).
3. ✅ **Leaflet markers** — fixed in `AlertMap.tsx` (bundled icon URLs + retina/shadow).
4. ~~**Moderation screen**~~ — built, then **removed** from this app (2026-07-21). Moved to Gecko; see the section above.
5. ⏳ **Broadcast trigger** — the `broadcast-alert` Edge Function is deployed and working, but nothing calls it any more. Gecko's Broadcast action must invoke it after setting `status='verified'`.
6. **Tips/sightings** — render + insert `alert_tips` on `AlertDetail`.
7. **Foreground notifications** — use `@capacitor/local-notifications` to show pushes received while app is open.
8. **Resolve flow** — mark alerts resolved; auto-expire stale ones.

> Next biggest unblock: **Firebase/FCM** (steps in setup section) so `broadcast-alert` actually delivers, then `npx cap add android/ios` for on-device push.

---

## Architecture notes & gotchas

- **Geo targeting:** devices store their last location as `geography(point)`. `devices_near(lat, lng, radius_m)` (in schema) powers the broadcast query. Default radius is 25 km in the edge function — tune per city.
- **PostGIS point format:** inserting from the client uses WKT `SRID=4326;POINT(lng lat)` (see `geo.ts`). **Order is lng, lat.** When selecting, Supabase returns GeoJSON `{coordinates:[lng,lat]}` — `AlertDetail` already flips these to `{lat,lng}`.
- **PostGIS point → lat/lng (RESOLVED):** raw `geography` columns come back as WKB hex over PostgREST. Instead of decoding, read from the `alerts_geo` view, which exposes numeric `last_seen_lat` / `last_seen_lng`. Both `AlertDetail` and the Edge Function use it; the old `parsePoint()` WKB hack was removed. Insert path still uses WKT `SRID=4326;POINT(lng lat)`.
- **RLS:** reports insert as `pending` and are invisible to the public until a moderator sets `verified`. Promote a user to moderator: `update profiles set role='moderator' where id='<uuid>'`.
- **Push only works on a real device / native build**, never in `npm run dev`. `registerPush` no-ops on web.
- **After every web change**, run `npm run sync` (= build + `cap sync`) before opening native.
- **Secrets:** `google-services.json`, `GoogleService-Info.plist`, and `.env` are gitignored. Never commit the FCM service account.

---

## Safety / product guardrails (don't skip)

- No alert is ever broadcast without moderator verification.
- Be careful publishing locations/photos of minors — consider obscuring exact home addresses; broadcast area, not doorstep.
- Add an abuse/false-report reporting path and a way to take down resolved alerts fast.
- Consider a "verified reporter" tier (police/NGO partners) for faster broadcast.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web dev server |
| `npm run build` | Type-check + build to `dist/` |
| `npm run sync` | build + `cap sync` (run before native) |
| `npm run android` | sync + open Android Studio |
| `npm run ios` | sync + open Xcode |

---

## Profile details → SOS identity (2026-07-21)

`profiles` gained `address` and `details` (free text for responders: appearance, medical
info, who to call) alongside the existing `full_name` / `phone`. Users edit them in
`src/components/ProfileCard.tsx` on the Account page.

`sos_events_geo` LEFT JOINs `profiles` and exposes `reporter_name`, `reporter_phone`,
`reporter_address`, `reporter_details`, so an SOS reaches Gecko as a named person instead
of "user needs help". LEFT JOIN matters: the view is `security_invoker`, so an INNER JOIN
would make the whole SOS event vanish for any viewer who can't read that profile.

> ⚠️ **Use `update`, never `upsert`, on `profiles` from the client.** `upsert` compiles to
> `INSERT … ON CONFLICT`, which needs an INSERT policy (there is none) and writes `id`,
> which isn't in the column grant — it fails with `42501` for every user. The row is
> guaranteed by the `handle_new_user()` signup trigger.

### Security fix applied at the same time

The `update own profile` policy proved only that the row was yours; it never constrained
*which columns* changed, and Supabase grants table-wide UPDATE to `anon` + `authenticated`
by default. Any signed-in user could `PATCH /rest/v1/profiles?id=eq.<self> {"role":"admin"}`,
satisfy `is_staff()`, and read every profile, every pending alert, every SOS location trail
and every reporter NIN. Fixed with column-level grants (`supabase/profile-details.sql`):

```sql
revoke update on profiles from anon, authenticated;
grant update (full_name, phone, address, details) on profiles to authenticated;
```

Column grants rather than a policy `WITH CHECK`, because a check comparing against the
caller's current role has to read `profiles` from inside a `profiles` policy, which recurses.
**Any new user-writable column on `profiles` must be added to that grant**, or saving breaks.

---

## Edge functions MUST handle OPTIONS (2026-07-21)

`sos-dispatch` had returned **500 on every CORS preflight since it was written**, and there
is not one successful POST to it in the logs. The SOS staff page had never fired, once.

The app calls edge functions from a WebView, which is a different origin to `*.supabase.co`,
so the browser sends an `OPTIONS` preflight first. Neither function handled it: the preflight
hit `await req.json()`, found no body, threw, and the catch returned 500. **A failed preflight
means the browser never sends the real POST** — and `sos.ts` invokes this fire-and-forget, so
nothing surfaced. `broadcast-alert` had the identical bug; it just never showed because Gecko
calls it server-to-server with the service key, where no preflight happens.

Every edge function needs this as its first line, plus the CORS headers on *every* response
(a response without them is discarded by the browser even when the status is 200):

```ts
if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
```

The gateway lets `OPTIONS` through without a JWT even when `verify_jwt` is on, so this does
not weaken auth — verified: preflight 200, unauthenticated POST still 401.

> Worth doing eventually: `sos.ts` fires `sos-dispatch` from the client and ignores the
> result, so any failure is invisible. A DB webhook on `sos_events` insert would page staff
> even if the app is killed mid-SOS — which is exactly when it matters.
