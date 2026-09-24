# Play Console — Data Safety section (answers to enter)

Based on the current Privacy Policy (https://abjincy-dot.github.io/docman-privacy/) and Google's ML Kit data disclosure (https://developers.google.com/ml-kit/android-data-disclosure), checked 2026-09-13.

**Does your app collect or share any of the required user data types?**
→ **Yes**, but only the diagnostics that Google's ML Kit library sends. DOCMAN's own code sends nothing.

In Play Console, "collected" means sent off the device by the app, **including by SDKs inside it**. DOCMAN's own code sends nothing: no analytics, ads, crash reporter, account or server. The on-device text recognizer (Google ML Kit, used to read scanned pages) is the exception. Google's disclosure says ML Kit sends Google basic diagnostics:
- device info (manufacturer, model, OS version)
- app info (package name, app version)
- a **per-installation identifier**
- performance metrics (latency), API configuration, input/output sizes, feature version, event type and error codes

It is encrypted in transit (HTTPS) and not passed to third parties. Google states the developer is responsible for deciding how to declare this.

**Suggested declaration.** Check each against Google's Data safety data-type definitions in the form's help before submitting:
- **App info and performance → Diagnostics**: Collected · Not shared · Purpose: Analytics · Required (ML Kit sends it whenever OCR or the document scanner runs)
- **Device or other IDs**: Collected · Not shared · Purpose: Analytics · Required
- **Everything else**: Not collected. This covers files and docs, photos, personal info, app activity, location, contacts and financial info. Documents, notes and images never leave the device.

**Is all of the user data collected by your app encrypted in transit?**
→ Yes. ML Kit's diagnostics use HTTPS. No document, note or personal data is transmitted by DOCMAN at all. Buying or restoring DOCMAN Pro is handled by the Google Play Store app, and DOCMAN only learns whether the account owns Pro.

**Do you provide a way for users to request data deletion?**
→ Yes. Describe it as: "All documents and notes are local to the device; users can delete individual items in-app, use Settings → Erase All Data, or uninstall the app to remove everything."

**Security practices**
→ Backups are optionally user-encrypted (AES-256, password/key chosen by the user). Worth mentioning in the listing, but not a required Data Safety field.

**Keep the privacy policy consistent with whatever is declared here.** Section 8 describes ML Kit.

---

# Content Rating questionnaire (IARC) — expected answers

Category: **Utility / Productivity app** (not a game).

Answer **No** to essentially every content question:
- Violence: No
- Sexual content: No
- Profanity: No
- Controlled substances: No
- Gambling (simulated or real): No
- User-generated content shared with other users: No (notes/files are private to the device, not shared/published through the app)
- Location sharing: No
- Personal info shared with third parties: No
- Gambling/contests: No
- **Digital purchases: Yes** — the optional one-time DOCMAN Pro unlock (in-app purchase)

Expected result: **Everyone** (or "3+" in some regions' rating systems).

---

# Target audience section
- **Target age group**: not primarily designed for children. Select an adult/general audience range (13+ or 18+ per your preference). DOCMAN is a general-purpose tool, not directed at kids, which matches Section 11 of the privacy policy.
- **"Is your app designed for children"**: No.

---

# App access
DOCMAN needs no login. If Play Console asks whether any part of the app needs special access to review, mention in the reviewer notes that App Lock (PIN/biometric) is optional and the app is fully usable without ever setting one, so no test credentials are needed. Pro tools can each be tried once for free, and the rest are unlocked by the in-app purchase.

---

# Permissions declaration reminders
Justification for each permission in the release build (checked against the built APK on 2026-09-13):
- **POST_NOTIFICATIONS**: expiry alerts & Reminders
- **SCHEDULE_EXACT_ALARM**: lets user-set reminders and expiry alerts fire at the set time ("Alarms & reminders"). DOCMAN is not an alarm or calendar app, so it does **not** use USE_EXACT_ALARM.
- **RECEIVE_BOOT_COMPLETED, WAKE_LOCK, VIBRATE**: needed by the notification-scheduling plugin to survive reboots and alert reliably
- **USE_BIOMETRIC / USE_FINGERPRINT**: optional App Lock
- **com.android.vending.BILLING**: the optional DOCMAN Pro in-app purchase (Google Play Billing)
- **Scan Document (no permission)**: Google's ML Kit document scanner runs inside Google Play services and uses the camera under Play services' own permission; DOCMAN declares no CAMERA permission. It sends the same ML Kit diagnostics as above.
- **INTERNET / ACCESS_NETWORK_STATE**: required by the Google ML Kit library, which sends the diagnostics described above; not used for any DOCMAN network call. Buying or restoring Pro is done by the Google Play Store app.
- **REQUEST_IGNORE_BATTERY_OPTIMIZATIONS**: **removed 2026-09-13.** Google Play forbids asking for a battery-optimisation exemption unless the core function needs it, and reminders aren't an accepted use case. Reminders already use exact-while-idle alarms, which fire in Doze.

---

# In-app purchase (DOCMAN Pro)
- One-time managed product `docman_pro`, base price $4.99 USD; Google Play sets local prices per country.
- **Free tries.** Every Pro tool can be used once for free; there is no time-limited trial.
- **Payment.** Payment and purchase history are processed by Google Play, not sent to the developer. DOCMAN learns only whether the account owns Pro and keeps that yes/no on the device for offline use.
- **Before submitting the Data safety form**, check Google's current Data safety help on Play Billing. Don't rely on this note alone.
- Privacy policy sections 7 and 8 were updated for this on 2026-09-13.
