# DOCMAN Progress

Last updated 15 Oct 2026. Reasoning lives in `HANDOVER.md`; rules in `CLAUDE.md`;
what is on Play right now in `CURRENT_STATE.md`.

## Completed

**Shipped in 63 / 1.0.2 — on Play, Internal testing since 13 Oct**
- Expiry alerts rebuilt: 07:00–21:00 every 30 min on the expiry day, one banner that
  refreshes instead of stacking, "Got it" silences the alert while the in-app banner stays.
- Alarms survive an app update (`MY_PACKAGE_REPLACED` receiver). Android drops pending
  alarms on update, which is why a dated document lost its alert entirely.
- Search results pill: own row, outlined to match the search field, duplicate dropdown gone.
- Note editor: bulleted lines (Enter carries the marker, `- `/`* ` starts one), ruling that
  scrolls with the text, visible bullet and ruling buttons in the Save Note row.
- Two stray files removed from inside the bundle (`ws.txt`, `serve-www.js`).

**Built in 65 / 1.0.4 — on disk, NOT uploaded (13 Oct)**
- PDF: a slow scroll no longer turns into a text selection; also fixed selecting in the wrong
  place when a finger lands on a page still flinging.
- Note page fills the screen (writing box ~609px, was ~200).
- A note opens for reading: double tap the text to edit, single tap only scrolls.
- No Cancel/Save while reading; colour, ruling and size save themselves on the spot.
- Ruling sits under the writing, measured per font, so letters rest on the line.
- Note card and reminder sticky note both clear the gesture bar.
- Opening the app from a notification no longer drops a second dialog on top of the first.
- A dialog heading that read "View" (it was taking the OK button's label).

**Verification**
- Whole app: 22 sizes x 12 screens = 264 checks, zero failures
  (`docs/screen-sweep-2026-10-13.md`).
- Note editor after the rework: 21 sizes x 2 states = 42 checks, plus 5 navigation-bar
  heights, zero failures.
- Every 65 fix confirmed on the phone through DOCMAN dev, one at a time.
- 65 verified from inside the bundle, not from the build log.

## In Progress

Nothing is mid-edit. The working tree is complete and builds; it is simply **uncommitted** —
ten files have carried this work since 12 Oct on branch
`docman-2026-09-24-pdf-search-ui-animations`.

## Pending

1. **Confirm the 14 Oct expiry test.** 108 alarms were confirmed armed on the phone on
   13 Oct — exact, max importance, the right times. Whether exactly ONE banner arrived and
   whether it stopped after 21:00 was never reported back. **Blocks promoting anything.**
2. **Upload 65 / 1.0.4** to Internal testing.
3. **Commit.** Three days of work is unsaved.
4. Decide on Closed testing (the 12 testers) and then Production. Production access was
   granted 7 Oct and does not reset per build.
5. **Pre-launch report** — never generated for any build. The two-day mark has passed, so the
   next step is Play Console → Help → Contact support, *not* another upload.
6. Store icon: the "glossy" top. Three reduced variants were rendered 13 Oct; none was
   picked, nothing was changed.
7. Upload the feature graphic and the new note screenshot to the listing — both made, neither
   uploaded.
8. Production cleanup/refactor pass — assessed in handover §8, not begun. No test suite
   behind it, so sweep before and after.
9. PDF phrase search. Opacity dial direction. Folder path on search result cards (asked
   twice, never answered).

## Known Bugs

**Open**
- *(none confirmed)* — every reported bug has a fix in 63 or 65.

**Unverified, could still be a bug**
- The 14 Oct expiry run. Until someone says what arrived, "one banner, every 30 minutes,
  stopping at 21:00" is a design, not an observed fact.

**Environmental, not ours**
- Play refuses versionCode 64: *"Version code 64 has already been used."* Nothing in any chat
  uploaded a 64. Something else occupies that number — worth one look in the App bundle
  explorer before the next build, or the same surprise repeats at 66.

**Unknowable from here**
- The app has only ever run on one phone, a Galaxy S23. Manufacturer skins, real touch
  handling, device fonts, memory limits and other Android versions are all untested, and no
  pre-launch report has ever been produced to cover that gap.

## 15 Oct 2026 — two small fixes (NOT built, NOT checked on the phone)
- Restore: the water in the progress circle now follows the percentage. The restore loop
  (`app.js`, `report()`) updated only the text line and never called `setBusyFill()`, so the
  water sat at its idle 12-18% while the text reached 91%.
- Note page: ink darkened `#1f2937` -> `#0b1220` and weight 400 -> 500 (both rules in
  `style.css`, dark and light mode). Colour was already dark; it read faded because it was thin.
- Next: check both in DOCMAN dev (restore needs a real backup — see the restore data-loss
  memory), then fold into the next build. Version number still undecided (1.0.4 vs 1.0.0).

## 15 Oct 2026 — one banner for several expiring documents (installed in DOCMAN dev, untested)
- Documents sharing an expiry date now give ONE banner ("3 documents expire today", same for
  7 days / 3 days / tomorrow / expired N days ago). No names on the lock screen. Group key is
  now per date + alert kind (`docman-expiry-<date>-<kind>`), not per document.
- Plugin patch (`TimedNotificationPublisher`): a sibling posted within 90 s of the first
  updates it in place instead of sounding again. Patch file rebuilt by hand (patch-package
  cannot diff here — build output inside node_modules); verified to apply to the clean file.
- "Got it"/"Renew" buttons only on a one-document banner. Tapping a multi banner opens the
  list (`showExpiryTodayModal`). Any change re-arms all alerts after 1.5 s so counts stay right.
- NOT done: reminders still give one banner each. Needs the same treatment if wanted.
- Test: give 3 documents today's date, wait for the next :00/:30 slot (or one 3 days out).

- **Decision 15 Oct:** final AAB = versionName 1.0.0, versionCode 66+. Resolves the 1.0.4-vs-1.0.0 question; build.gradle still says 1.0.4 until the final build.

## 15 Oct 2026 — expiry cards with document pictures (built, NOT yet installed or seen on the phone)
- Expiring Documents panel (Expiring tab) now shows one card per document in the approved
  look: picture, name, "Expires in N days", bar, View / Edit / Remind. Colour: red <=14 days or
  expired, amber <=30, green beyond. App-open "Needs your attention" popup gains a row of the
  documents' small pictures. Dashboard "Expiring soon" rows were NOT changed.
- Picture: an image file shows its own thumbnail (existing pipeline); otherwise by name
  (passport, licence, ID card, insurance, certificate, medicine, receipt), then by type
  (PDF, Word, Excel, note). PDFs show a PDF picture, not their first page — that needs a new
  native render method (not done).
- Code: `docCardHtml`, `docPictureHtml`, `wireDocPictures`, `wireDocCardActions` in `app.js`
  (before `showExpiringDocumentsPanel`); `.dc-*` block at the end of `style.css`.
- Checked in a desktop harness with the real helper code and CSS only. The phone was not connected.
- Next: install to DOCMAN dev, give two documents expiry dates, open the Expiring panel, check
  View/Edit/Remind, a real photo thumbnail, and the app-open popup.
