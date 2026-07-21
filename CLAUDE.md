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
- **Dev setting (revert before launch):** Auth → "Confirm email" is **OFF** so signups work instantly for testing. Re-enable before any real launch.

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
- **Key classes:** `.page/.page__title/.page__sub`, `.card`, `.alert-card`, `.badge--missing|robbery|live|pending`, `.btn` family (`.btn-primary`, `.btn--live`, `.btn--danger`, `.btn--ghost`, `.btn--block/lg`), `.segment/.segment__item`, `.field/.field__label`, `.empty`, `.skeleton`, `.notice`, `.map-frame`, `.nav`, `.mono`, `.status-dot--live`.
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

**Still requires you (Xcode GUI + Apple Developer + Firebase console — can't be scripted):**
1. Firebase console → add an **iOS app** (bundle `ng.nempa.app`) → download **`GoogleService-Info.plist`** → drag into Xcode under `App/App/` (check "Copy items if needed" + the App target). The plugin auto-configures Firebase from it; no `FirebaseApp.configure()` needed.
2. Xcode → **Signing & Capabilities**: pick your team (needs a paid Apple Developer account) → **+ Capability → Push Notifications** (creates the `aps-environment` entitlement) → **+ Capability → Background Modes → Remote notifications**.
3. Apple Developer → create an **APNs Auth Key (.p8)** → Firebase → Project settings → **Cloud Messaging → Apple app config → upload the APNs key** (with Key ID + Team ID).
4. Run on a **real device** (`npm run ios` opens Xcode; the iOS simulator cannot get an APNs/FCM token).

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
