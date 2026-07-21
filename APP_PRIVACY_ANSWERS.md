# App Store Connect → App Privacy — answer sheet

Derived from what Sparrowtell actually stores, and matched **exactly** to
`ios/App/App/PrivacyInfo.xcprivacy`. Apple compares the two; a mismatch is itself a
rejection, so if you change one, change the other.

**Every item below is the same three answers**, which makes this quicker than it looks:

- Is this data linked to the user's identity? → **Yes**
- Is it used for tracking? → **No** (Sparrowtell has no ads, no analytics SDK, no
  cross-app or cross-site tracking, and does not share with data brokers)
- Purpose → **App Functionality** only

---

## Data to declare

| Apple category | Data type | Notes for the "purpose" screen |
|---|---|---|
| Contact Info | **Email Address** | Account and sign-in |
| Contact Info | **Name** | Shown to responders during an SOS |
| Contact Info | **Phone Number** | Shown to responders during an SOS |
| Contact Info | **Physical Address** | Shown to responders during an SOS |
| Contacts | **Contacts** | Emergency contacts the user types in — other people's name/phone/relation |
| User Content | **Photos or Videos** | Photo attached to a report |
| User Content | **Audio Data** | Recorded only while the user's own SOS is active |
| User Content | **Other User Content** | Report titles, descriptions, tips |
| Location | **Precise Location** | Incident location, alert radius targeting, SOS live trail |
| Identifiers | **Device ID** | FCM push token, so alerts can reach the phone |
| Other Data | **Other Data Types** | Optional National Identification Number on a report |

### Do NOT tick

- Financial Info, Health & Fitness, Browsing History, Search History, Purchases —
  none are collected.
- **Sensitive Info** — Apple defines this as protected characteristics (race, religion,
  sexual orientation, biometrics and so on). The NIN is a government identifier, which
  belongs under Other Data. Ticking Sensitive Info would be inaccurate and invites
  questions you'd then have to answer.
- **Usage Data / Diagnostics** — there is no analytics or crash-reporting SDK in the
  build. Only tick these if you add one later.
- **Identifiers → User ID** — the account id never leaves our own systems as an
  identifier for tracking. Device ID is the one to declare.

### Tracking question

At the start Apple asks whether the app collects data used to **track** you. Answer
**No**. Nothing is shared with data brokers, there is no advertising identifier, and no
data is combined with third-party data for targeted advertising.

---

## Privacy Policy URL

Required before Beta App Review will accept a build.

```
https://sparrowtell.inspire-edge.net/privacy.html
```

Enter it in **both** places — they are separate fields and Apple checks the first:

1. App Store Connect → your app → **App Information** → Privacy Policy URL
2. App Store Connect → **App Privacy** → Privacy Policy section

> 🚨 **Before you submit:** `site/privacy.html` contains the placeholder
> `REPLACE_WITH_A_MONITORED_ADDRESS`. Apple follows the policy URL and a contact address
> that bounces is a rejection. It must be an address you can actually receive mail on —
> note that inbound mail is **off** on the Resend domain, so
> `privacy@sparrowtell.inspire-edge.net` will not work until you enable receiving. A
> personal or team Gmail is fine.

---

## Also needed for external TestFlight

Beta App Review checks more than the privacy label:

- **Test information** (TestFlight → Test Details): what the app does, and **sign-in
  credentials for a working demo account**. Reviewers cannot get past the sign-in screen
  without one, and "we'll send it on request" fails the review.
- **What to test** notes for the build.
- **Beta App Description** and a support email.
- Expect a question about the microphone and background location. Have a one-line answer
  ready: *audio and location are captured only while a user-triggered SOS is active, are
  visible only to the user and our operators, and stop when the user ends the alert.*
