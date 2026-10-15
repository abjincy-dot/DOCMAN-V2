# DOCMAN Current State

Last refreshed 15 Oct 2026, end of chat. What is true *right now*. The log is `PROGRESS.md`,
the reasoning and traps are `HANDOVER.md` (§1b), the rules are `CLAUDE.md`.

## Current Version
**1.0.0 — Version Code 66** (`android/app/build.gradle`).

| Where | What |
|---|---|
| Built, verified, **NOT uploaded** | `DOCMAN Play Store Assets/release/DOCMAN-1.0.0-versioncode66-UPLOAD-THIS.aab` (61.4 MB, 15 Oct 12:03) |
| Internal testing on Play | 63 / 1.0.2 (13 Oct) |
| Closed testing (Alpha) | 61 / 1.0.0 (12 Oct) |
| Built earlier, never uploaded | 62 / 1.0.1, 65 / 1.0.4 (65's fixes are all inside 66) |
| Refused by Play | 64 — "version code already used". Something else holds it; 66 is a guess at a free number. |

Rule: the **final public AAB reads versionName 1.0.0**. The versionCode can only go up.

## Current Objective
Get **66 / 1.0.0** onto Play and then to Production, with the store listing updated.

## Current Problem
Nothing is broken. What is *unproven*:
1. **66 has never run as a release build.** The Java changes (signature Stroke row, smaller
   signature minimum) go through R8, which the debug build on the phone does not. Upload to
   **Internal testing** and open Sign → Draw Your Signature before promoting.
2. **Merged expiry banner** ("3 documents expire today") is in the code and in DOCMAN dev but
   nobody has seen it arrive at an alert slot. 14 Oct showed four separate banners (the
   behaviour before the merge). The 21:00 stop is also still unobserved.
3. **Play versionCode 66** may already be taken — check the App bundle explorer.

## Files Involved (this session's work)
- `www/app.js`, `www/index.html`, `www/style.css` — cards, start-up banner, picture rules,
  alerts, water level, help text. `www/index.html` carries `app.js?v=605`, `style.css?v=646`.
- `android/app/src/main/java/com/docman/` — `SignatureDrawView.java`, `PdfViewerActivity.java`
  (Stroke row), `PdfSignaturePlacementView.java` (minimum size). **These files use CRLF.**
- `patches/@capacitor+local-notifications+6.1.3.patch` — written by hand.
- `DOCMAN Play Store Assets/` — listing text, `final-8-2026-10-15/` screenshots,
  `privacy-policy/` (mirror), `privacy-policy-change-2026-10-15.md`.

## Do NOT Change
- The alert schedule without the user: **7 days, 3 days, 1 day (09:00); the day itself every
  30 min 07:00–21:00; then daily for up to 7 days.** The user chose to keep the day-before one.
- The start-up banner window: **3 days**. The Expiring tab: **3 days** plus already expired.
- Card pictures come from **folder name → file name → file type, never the file's contents**;
  a folder named for several things (`&`, `,`, `+`, "and") is ignored.
- `main` on DOCMAN-V2 and the live privacy policy: published, change only on request.
- Preview first: show a rendered image of any look change and wait for an OK before installing.

## Last Completed Task
Store listing refresh (15 Oct). New text `store_listing_play_console_1.0.0-2026-10-15.txt`
(description 3,866 / 4,000), new screenshots `05-pdf-sign.png` and `06-reminders.png` in
`final-8-2026-10-15/` (plus an extra `06b-expiring-cards.png`). **Not yet pasted into Play
Console.** Before that: AAB 66 rebuilt with the day-before alert restored; help ("i") text and
the live privacy policy updated to match.

## Next Task
1. Upload `DOCMAN-1.0.0-versioncode66-UPLOAD-THIS.aab` to **Internal testing**; test Sign on it.
2. Paste the new listing text and upload the 8 screenshots from `final-8-2026-10-15/`.
3. Promote to Closed testing, then Production. Production access was granted 7 Oct.

---

## Still open
- **Git:** branch `docman-2026-09-24-pdf-search-ui-animations` is pushed at `d0ba71e`. `main`
  holds the PWA files from before the compact cards / framed banner — update on request.
  The end-of-chat rewrite of `PROGRESS.md` / `CURRENT_STATE.md` / `HANDOVER.md` is committed
  locally on that branch (the commit after `d0ba71e`) and **not pushed**.
- **Pre-launch report** has never been generated for any build → Play Console → Help →
  Contact support, not another upload.
- **Store icon:** the glossy top; three variants rendered 13 Oct, none chosen.
- **Feature graphic and the 12 Oct note screenshot** are made but not uploaded to the listing.
- **Reminders still give one banner each** (only expiry alerts merge). Offered, not decided.
- **PDFs show a PDF picture, not their first page** — needs a new native render method.
- **Dashboard "Expiring soon" rows** were not restyled.
- Only ever run on one phone (Galaxy S23).
