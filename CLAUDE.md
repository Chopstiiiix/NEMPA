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

### Auth email — WORKING end-to-end as of 2026-07-21 (was the hard blocker)

Signup email used to be broken for everyone outside the Supabase project team, which made
the app unusable for real users. **That is fixed and verified with a real signup to a
non-team Gmail address.** Do not "re-fix" any of this; the pieces below are live.

- **Sending domain:** `sparrowtell.inspire-edge.net` (subdomain of `inspire-edge.net`, which
  is registered and delegated to Cloudflare — NS `bryce`/`pola.ns.cloudflare.com`).
- **Provider:** Resend, domain **Verified**, region eu-west-1. Four DNS records live in the
  **`inspire-edge.net`** Cloudflare zone, all proxy **DNS only**, TTL Auto:

  | Type | Name (relative to the zone) | Value |
  |---|---|---|
  | TXT | `resend._domainkey.sparrowtell` | DKIM `p=MIGf…EdEwIDAQAB` (1024-bit RSA, 216 chars, single string) |
  | MX | `send.sparrowtell` | `feedback-smtp.eu-west-1.amazonses.com` prio 10 |
  | TXT | `send.sparrowtell` | `v=spf1 include:amazonses.com ~all` |
  | TXT | `_dmarc.sparrowtell` | `v=DMARC1; p=none;` |

  > Resend's setup page shows the DMARC row as a bare `_dmarc` while showing the other three
  > with the `.sparrowtell` suffix. Entering it verbatim creates `_dmarc.inspire-edge.net` —
  > a DMARC policy for the whole parent domain. It belongs at `_dmarc.sparrowtell`. DMARC is
  > advisory and not part of Resend's gating set, so this costs nothing at verification time
  > and the row disappears from the dashboard once verification starts.

- **Supabase SMTP** (Project Settings → Authentication → SMTP Settings): host
  `smtp.resend.com`, port 587, **username the literal string `resend`**, password = a Resend
  API key with *Sending access* only, sender `Sparrowtell <no-reply@sparrowtell.inspire-edge.net>`.
  The sender address must be on the verified domain or Resend 403s every send, which Supabase
  surfaces as a generic email failure.
- **Rate limit:** with custom SMTP the auth-email default is 30 new users/hour
  (Authentication → Rate Limits). Raise before any launch push.
- ⚠️ **Debugging gotcha:** when checking these records, `dig +short` against a public resolver
  can return empty for up to 30 min after a change (the zone SOA sets a 1800s *negative* TTL,
  so an earlier failed lookup stays cached). Query the authoritative NS with `+norecurse` and
  read `ANSWER:` from the full response before concluding a record is missing. This produced a
  false "nothing went through" report during setup.

**Confirmation redirect — also fixed.** Site URL is `https://sparrowtell.inspire-edge.net`
(not `localhost:3000` as this doc claimed until 2026-07-21), with Redirect URLs
`https://sparrowtell.inspire-edge.net/**` and `ng.nempa.app://**`. The page is `site/index.html`,
deployed to Cloudflare Pages (`nempa.pages.dev`); it reads auth errors from **both** the URL
fragment (implicit flow) and the query string (PKCE), strips the fragment, and offers an
"Open Sparrowtell" button pointing at `ng.nempa.app://`.

> Nothing in `src/` passes `emailRedirectTo`, so `signUp` relies entirely on the project's
> Site URL. Changing Site URL silently changes where every confirmation link lands.

> ⚠️ **The "Open Sparrowtell" button needs a build newer than 2026-07-21 08:01.** iOS registers
> URL schemes at *install* time, and `CFBundleURLTypes` was added to `Info.plist` in commit
> `92636bf`. Any device still running an earlier build has no handler for `ng.nempa.app://`, so
> the browser shows a "switch apps?" prompt and then silently does nothing. Rebuild + reinstall
> fixes it. Even then the app only foregrounds to the sign-in screen — there is no
> `@capacitor/app` `appUrlOpen` handler, which is fine because the link carries no token.

Moderation is no longer done in this app at all — see the next section. The `profiles.role`
column and `is_staff()` still exist and still gate the RLS policies that Gecko will write
through, so promoting an operator is still `update profiles set role='moderator' where id='<uuid>';`

### Review + broadcast — ONE server path, two front-ends (2026-07-21, revised)

> Earlier the same day this section said Sparrowtell had **no** moderation surface and that
> all operator work lived in Gecko. That was reversed deliberately: a missing-person report
> filed at 2am shouldn't wait for an operator to reach a laptop. The safety concern behind
> the original decision is unchanged — it's now handled by making both surfaces call the
> same audited server path, rather than by having only one surface.

The `alert_status` enum models the lifecycle, so **no enum change**:

| status | meaning |
|---|---|
| `pending` | filed — in the review queue, visible to its own reporter, **not** public |
| `verified` | an operator hit Broadcast — public feed + radius push |
| `resolved` / `rejected` | ended, or taken down |

**`review-action` is the only thing that may change an alert's status.** It authorises the
caller, transitions the row, writes an `alert_audit` record, and invokes `broadcast-alert`
for delivery. It does not contain FCM code — delivery has exactly one implementation too.

```
Sparrowtell Review tab ─┐
   (user JWT, staff)    ├─► review-action ─► broadcast-alert ─► FCM
Gecko operator UI ──────┘    (authorise,        (deliver)
   (service key + actor)      transition,
                              audit)
```

Actions: `preview` (device count, mutates nothing — powers the confirm sheet) ·
`broadcast` (pending→verified, atomic claim, then push) · `repush` (retry a failed
delivery) · `takedown` (→rejected) · `resolve` (→resolved).

Enforcement, in `supabase/review-audit.sql` (applied to the live DB):

- `revoke update on alerts from anon, authenticated` — the `staff moderate alerts` policy
  proved the caller was staff and nothing more, so any staff client could `PATCH
  /rest/v1/alerts {"status":"verified"}` and flip a report public with no audit row, no
  `verified_by` and no push. The policy is left in place; only the grant is gone, so
  re-enabling direct writes is a deliberate act rather than a forgotten default.
- `alert_audit` is append-only: staff `SELECT` policy, no INSERT/UPDATE/DELETE policy, and
  the only writer is the Edge Function using the service key.
- ⚠️ **Gecko holds the service key, which bypasses RLS and grants — for Gecko this is a
  discipline, not a fence.** Never `PATCH` a status from Gecko.

Sparrow side (done): staff-only Review tab (`src/pages/Review.tsx`, `src/lib/review.ts`,
`src/lib/useRole.ts`, 4th nav tab). `useRole` gates tab *visibility* only — it is not a
security boundary; `review-action` re-reads the role server-side and 403s a non-staff
caller, and RLS returns an empty queue anyway. The confirm sheet shows the device count
returned by `preview`, never a client-side estimate, so it can't disagree with what the
sender actually targets.

> ⚠️ **`review-action` must stay deployed with `verify_jwt` ON.** It identifies a
> service-role caller by the JWT's `role` claim, which is only trustworthy because the
> gateway verifies the signature first. Deploying with `--no-verify-jwt` would let anyone
> forge that claim. (String-comparing the token against `SUPABASE_SERVICE_ROLE_KEY` does
> *not* work — a project can hold several valid service credentials at once, and Gecko's
> legacy JWT key is not equal to the newer-format value in the function's env. That bug
> 401'd every Gecko call until it was fixed.)

> ⚠️ Gecko side (**still not done** — the remaining open loop): `src/app/api/sparrow/route.ts`
> is read-only and queries `alerts_geo?status=eq.verified`, so filed reports do not appear
> there yet. It needs `status=in.(pending,verified)` plus a POST that proxies to
> `review-action`. Full spec in `GECKO_REVIEW_PROMPT.md`. SOS is unaffected — it flows
> instantly via `sos_events_geo` and is never gated.

**Retraction pushes (`supabase/cancel-push.sql`, applied).** Taking a live alert down sends a
follow-up push, because removing it from the feed is not enough: someone who saw "MISSING:
child, Ikeja" and never sees a retraction keeps acting on it.

- `broadcast-alert` gained `mode:'alert'|'cancel'` and `reason:'withdrawn'|'resolved'`. It is
  still the only place a push is built.
- It records accepted deliveries in **`alert_recipients`** (`alert_id, device_id` — device id,
  not the token, so a rotated token is picked up by the join at send time). Cancellation goes
  to *exactly that set*. Re-running `devices_near` at takedown time would be the easy way and
  the wrong one: phones move, so it would miss someone who got the alert and drove home, and
  would alarm someone who arrived later about an alert they never saw.
- Both the alert and its retraction carry `android.notification.tag` / `apns-collapse-id` =
  the alert id, so the retraction **replaces** the original in the tray rather than stacking
  under it.
- `review-action` fires this on `takedown`/`resolve` **only when the alert was `verified`** — a
  rejected pending report was never seen, and "disregard the earlier alert" for something
  nobody received is its own small harm. Logged as a separate `cancel_push` audit row, so a
  failed retraction is visible rather than silent.

> ⚠️ **`alerts_force_pending` trigger** (BEFORE INSERT, pre-existing, was undocumented):
> `if not is_staff() then new.status := 'pending'`. `is_staff()` reads `auth.uid()`, which is
> **null for both anon and the service role** — so a row inserted via the service key or the
> management API is forced to `pending` no matter what `status` you pass. Good guardrail; it
> also means you cannot create a `verified` fixture with a plain INSERT. `UPDATE` it after
> insert instead. This cost a confusing test run where a "verified" fixture came back pending
> and made correct code look broken.

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

### Live-listen audio (2026-07-21)

Audio now records for **both** SOS and danger (it was danger-only, so a panic SOS — the flow
people actually reach for — sent responders a location and nothing they could hear).

⚠️ **MediaRecorder chunks are not independently playable.** Only the first carries the
container header; the WebM clusters / MP4 fragments after it are undecodable alone. The old
recorder worked around this by always concatenating from chunk zero and re-uploading the
*entire take* every 20s — correct as an evidence file, useless for listening along, and it
grows without bound over the connection of someone in trouble.

`EvidenceRecorder` now **stops and restarts the recorder per segment**, so each upload is a
complete standalone file. Cost: a gap of a few tens of ms per boundary while the encoder
cycles. `SEGMENT_MS = 8000`. The next segment is chained from `onstop`, not from the timer,
so a slow encoder can't leave two recorders running against one stream.

- Storage: `sos-evidence/<user_id>/<sos_id>/seg-0001.webm`, zero-padded so a lexical sort is
  chronological. Existing bucket policies check `foldername(name)[1] = auth.uid()`, which is
  still the user id under the extra nesting — unchanged.
- Index: `sos_audio_segments (sos_id, seq, path)`, `supabase/sos-live-audio.sql`, applied.
  Insert is client-side by the SOS owner — no Edge Function hop, because an emergency upload
  shouldn't depend on a function being warm. UPDATE/DELETE revoked: audio evidence that can
  be silently rewritten isn't evidence.
- **Uploads are fire-and-forget; a failed segment is dropped, never retried.** Retrying
  queues audio behind a bad connection and delivers it minutes late, when what an operator
  needs is the most recent sound in the room. A gap beats a backlog pretending to be live.
- `sos_events.audio_path` now holds the segment **folder**, written once on seq 1. Gecko only
  tests it for truthiness, so its existing code is unaffected.

### Emergency triggers — how SOS can be fired (2026-07-21)

| Path | Works when app is… | Where |
|---|---|---|
| SOS chip in the app bar | open | `App.tsx` |
| Volume-down ×5 / volume-up ×5 | **open and on screen only** | `volumeTriggers.ts` + native plugins |
| Home-screen quick action (long-press icon) | closed | `Info.plist` `UIApplicationShortcutItems` + `AppDelegate` |
| Siri phrase / Back Tap / Action Button | closed | `SosIntents.swift` |
| Android Quick Settings tile | closed | `SosTileService.java` |
| Android volume ×5 with screen off | closed, **opt-in** | `SosForegroundService.java` |

> 🚨 **iOS volume triggers need the silent track in `VolumeButtonsPlugin.swift`.**
> `AVAudioSession.outputVolume` tracks the **media** volume, but when nothing is playing the
> hardware buttons adjust the **ringer** — the user gets a volume HUD, media volume never
> moves, the KVO observer never fires, and not one event reaches JS. The plugin shipped this
> way and volume-down ×5 did nothing on iOS at all, for anyone, from the day it was written.
> Fix: loop a silent in-memory PCM buffer while enabled, which makes iOS treat the app as an
> audio client and routes the buttons to media. `.ambient` + `.mixWithOthers` so it neither
> ducks the user's music nor fights WebKit when `getUserMedia` switches the session to record.
> If it still fails on device, the next thing to try is category `.playback` (also with
> `.mixWithOthers`), which claims the route more assertively.

The volume triggers stop the moment the app backgrounds — the iOS listener is a KVO
observation on `AVAudioSession.outputVolume` bound to the bridge's view controller
(`VolumeButtonsPlugin.swift`), and Android's is `dispatchKeyEvent` in MainActivity. **No
third-party app can intercept hardware buttons while it isn't running**; side-button ×5 is
Apple's own Emergency SOS and is off limits. That gap is what the quick action and App
Intent exist to cover.

`SosLaunchPlugin` is the single delivery point for all out-of-app triggers. It stores the
pending kind in **UserDefaults, not a static** — if the OS kills the process between the
trigger and the WebView loading, an in-memory flag is lost and the user's SOS silently does
nothing. JS drains it via `consumePending()` (read + clear in one native call) on boot, on
the `sosLaunch` event, and on resume. **The event carries no payload on purpose**: if it
delivered the kind, a trigger received while the app was running would fire once from the
event and again from the next drain, because nothing would have cleared the stored value.

Everything routes through `armSos()`, so out-of-app triggers get the same 5-second
cancellable countdown. That matters most for Back Tap, which can fire from a knock against a
table.

> `openAppWhenRun = true` on both intents is deliberate: firing without opening the app would
> mean re-implementing location, contact SMS, audio and dispatch in Swift — all of `sos.ts`.
> On a locked phone iOS may demand Face ID before opening; that is an OS rule, not ours.
> AppIntents is iOS 16+ while the deployment target is 13, so everything is `@available`-gated.

Verified by inspecting the built `.app`: `Metadata.appintents/extract.actionsdata` contains
both intents and all eight Siri phrases, and the quick actions are in the built `Info.plist`.

> 🚨 **`MainViewController.swift` is what makes `getUserMedia` work on iOS at all.** From iOS 15
> WKWebView asks its `WKUIDelegate` before letting page JS reach the mic or camera, and if the
> delegate doesn't implement `requestMediaCapturePermissionFor` WebKit **denies by default** —
> silently, with no prompt, no console output, and a `getUserMedia` rejection the JS can't
> distinguish from anything else. **Capacitor 6 does not implement it**, so every Capacitor iOS
> app fails this way out of the box. Found on the first live SOS test: 13 location pings logged
> while `sos_audio_segments` stayed empty. `Main.storyboard` points at this subclass — if that
> reference is ever reset to `CAPBridgeViewController`, SOS audio silently dies again.
> Granting is not a consent bypass: iOS still enforces the real mic permission on top.

**Android background triggers — OPT-IN, off by default.** Turned on from `EmergencySetup`.
Android requires a permanent notification for a foreground service, and a visible
"Sparrowtell is running" on the phone of someone at risk is itself a hazard — which is the
whole reason the danger flow is silent. Default-on would have been the wrong call.

- ⚠️ **A service cannot intercept hardware keys**, and `dispatchKeyEvent` in MainActivity only
  fires while that activity is foreground. `SosForegroundService` instead registers a
  `ContentObserver` on `Settings.System.CONTENT_URI` and watches the volume level change —
  which is what a hardware press does, and it fires with the screen off.
- ⚠️ **The re-centre matters.** At minimum or maximum volume a further press changes nothing,
  so no observer callback arrives and the gesture dies exactly when someone is jabbing the
  button in a panic. The service nudges volume back to mid-range after a press at either
  extreme — the same trick `VolumeButtonsPlugin.swift` uses with `MPVolumeView`.
- ⚠️ **Android 10+ blocks background activity launches** and a plain foreground service gets
  no exemption. `trigger()` attempts `startActivity` (it works on many devices/states) *and*
  posts a high-priority notification as a fallback, so a blocked launch degrades to one tap
  rather than an SOS that silently does nothing. A guaranteed launch would need
  `SYSTEM_ALERT_WINDOW`, which is a Settings round-trip — worth revisiting.
- `foregroundServiceType="specialUse"` with the Play-Console-required justification property;
  the work is observing a system setting, not location or media.
- The Quick Settings tile has no such problem — a tile tap is a user interaction, so
  `startActivityAndCollapse` is permitted.

Verified with `./gradlew :app:assembleDebug`: BUILD SUCCESSFUL, both services present in the
merged manifest with the right `foregroundServiceType` and permissions.

### iOS native (generated 2026-06-01)

`ios/` Xcode project generated (`npx cap add ios`, CocoaPods via Homebrew). Bundle id `ng.nempa.app`. Already wired in-repo:
- `AppDelegate.swift` — the 3 APNs-forwarding callbacks the messaging plugin needs.
- `Info.plist` — `UIBackgroundModes: remote-notification` + Camera/Photos/Location usage strings.
- `capacitor.config.ts` — `FirebaseMessaging.presentationOptions` for foreground alerts.

**Done as of 2026-07-21** (verified in the project, not assumed):
- ✅ `GoogleService-Info.plist` present at `ios/App/App/`, `BUNDLE_ID` matches `ng.nempa.app`, referenced by the App target.
- ✅ Signing: `DEVELOPMENT_TEAM = 5K46PLQ658`, automatic. `App.entitlements` has `aps-environment`.
- ✅ `Info.plist`: `UIBackgroundModes` = remote-notification / audio, all usage strings, and `ITSAppUsesNonExemptEncryption = false` (HTTPS only — skips the export-compliance prompt on every upload).
- ⚠️ **Two copies of `GoogleService-Info.plist` exist** — `ios/App/` and `ios/App/App/` — and the
  project references the **root** one. Anything added next to it in the pbxproj inherits the root
  group, whose `sourceTree` resolves to `ios/App/`. That is how the privacy manifest first landed
  with a broken path (`CpResource … /ios/App/PrivacyInfo.xcprivacy: No such file`). New files
  belong in the `App` group (`path = App`). Updating Firebase config means updating the root copy,
  or deleting it and re-pointing the reference.
- ✅ `PrivacyInfo.xcprivacy` at `ios/App/App/`, **registered in the App target's Resources build phase** (hand-added to `project.pbxproj`; a manifest that isn't in the target ships as a dead file). Declares location / email / name / phone / address / photos / audio / user content, all `Linked`, none `Tracking`, purpose AppFunctionality; plus required-reason APIs UserDefaults `CA92.1`, FileTimestamp `C617.1`, DiskSpace `E174.1`. **Keep it in step with the App Store Connect privacy questionnaire — Apple compares the two and a mismatch is a rejection.**
- Version/build: `MARKETING_VERSION 1.0` / `CURRENT_PROJECT_VERSION 2`. **Every App Store Connect upload needs a unique, higher build number.**

**Still outstanding (only you can do these):**
1. **APNs Auth Key (.p8)** → Apple Developer → Keys → upload to Firebase → Project settings → Cloud Messaging → Apple app config (with Key ID + Team ID `5K46PLQ658`). Downloads once only. **Until this is done, a TestFlight build installs fine and receives no push** — TestFlight uses the production APNs environment.
2. Run on a **real device** (`npm run ios`; the simulator cannot get an APNs/FCM token).
3. App Store Connect: privacy questionnaire, and a **privacy policy URL** (required for any app that collects data — host it alongside the auth landing page on `sparrowtell.inspire-edge.net`).

> ⚠️ **`location` was REMOVED from `UIBackgroundModes` (2026-07-21).** It had been declared while
> the only location string was `NSLocationWhenInUseUsageDescription`, and Capacitor's Geolocation
> plugin only ever requests When-In-Use — so the background mode did nothing, the SOS trail
> stopped on backgrounding anyway, and App Review rejects a `location` background mode with no
> feature that justifies persistent location. **If background SOS tracking is built, this must
> come back properly**: a plugin that requests Always authorisation *plus*
> `NSLocationAlwaysAndWhenInUseUsageDescription`. Re-adding the mode alone would restore the
> rejection risk without restoring the capability.

> ⚠️ **In-app account deletion is mandatory** (App Store Review Guideline 5.1.1(v)) for any app
> with account creation — a "contact us" link does not satisfy it. Built 2026-07-21:
> `src/components/DeleteAccount.tsx` (type DELETE to confirm) → `delete-account` Edge Function.
> Identity comes from the JWT only, with no `user_id` parameter, so a caller cannot delete
> anyone else. FKs cascade profiles / devices / emergency_contacts / sos_events; `alerts.reporter_id`
> and `alert_audit.actor_id` are ON DELETE SET NULL by design — a broadcast alert must not vanish
> from the public feed because its reporter left, and the audit trail must not lose rows. Storage
> has no FK, so the function clears `alert-photos/<uid>/` and `sos-evidence/<uid>/` itself.

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
4. ✅ **Review screen** — removed 2026-07-21, then rebuilt the same day as a staff-only Review tab calling the shared `review-action` function. See the section above.
5. ⏳ **Broadcast trigger** — `review-action` → `broadcast-alert` is deployed and verified from the Sparrow side. **Gecko still can't reach it**: its `/api/sparrow` route is read-only and filters to `verified`, so reports filed in the app remain invisible there. Spec in `GECKO_REVIEW_PROMPT.md`.
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
