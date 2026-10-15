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

- **Pushed 15 Oct 2026:** commit 02e4617 on branch docman-2026-09-24-pdf-search-ui-animations -> origin (abjincy-dot/DOCMAN-V2). main untouched. Play Store Assets and backups deliberately not committed. No sw.js exists; no PWA files added.

- **Pushed to main 15 Oct 2026** (9f40c9e): index.html, style.css, app.js + Fonts/Images/vendor (add/overwrite only) for the PWA. sw.js, manifest.json, icons untouched; sw.js cache is still docman-v151 (network-first fetch, so no bump required).

- **15 Oct (later): app-open popup is now the card.** `showExpiryCardsPopup` (app.js) shows one card per expiring document (max 3 + "and N more"), a reminder-due line above them; `.dc-popup*` CSS. Reminder-only launches keep the old dialog. View/Edit/Remind close the popup first. Installed to DOCMAN dev; not yet seen on the phone.

- **15 Oct (later): reminders get the same card** in the app-open popup (`reminderCardHtml`, `wireReminderCardActions`): bell picture, title, "Due now/today/D Mon · time", View / Edit / Done. Done = same as answering the notification. The old one-line dialog is gone: any due reminder or expiring document opens `showExpiryCardsPopup`. The Reminders panel list rows were NOT changed. Installed to DOCMAN dev; not yet seen on the phone.
- CORRECTION: the reminder-card build above was NOT installed (phone disconnected, installDebug failed). The document-card popup build before it was installed.
- **15 Oct (later): card pictures are by NAME/TYPE only, never the file content** (user asked: a ruled-paper screenshot named PASSPORT was showing). `docPictureKind`: name hints first (added visa/permit/residence -> ID card, statement/tax -> receipt), then type; an image with no telling name = plain photo picture. Real thumbnails no longer used on cards (`wireDocPictures` is a no-op). Reminder cards also installed with this build if the phone was connected.
- **Folder name also picks the picture** (immediate folder only; certificate/receipt are NOT read from folders because folders like "IDs & Certificates" hold mixed documents). Order: file name, then folder, then file type. Installed to DOCMAN dev together with the reminder cards and names-only pictures (earlier install attempt failed on a transient capacitor.settings.gradle error; retry succeeded).
- **Picture order changed: folder name FIRST, then file name, then file type** (user: "look for the folder name"). All kinds are read from folders now, including certificate/receipt, so a file in "Personal / IDs & Certificates" gets the certificate picture. Installed to DOCMAN dev.
- **Multi-topic folders ("IDs & Certificates": any folder name with &, comma, + or "and") no longer set the picture;** file name then type decide. UPDATED DRAWING.pdf there now gets the PDF picture. Installed to DOCMAN dev.
- **Mixed popup layout (15 Oct):** `showExpiryCardsPopup` shows full cards for 1-2 items; for 3+ it shows compact rows grouped REMINDERS DUE / EXPIRING SOON, first item open as a card, tap a row to open it in place, "See all" opens the panel. No cap. App-open documents window widened from 5 to 14 days (getAllExpiringFiles(14)). Installed to DOCMAN dev and seen on the phone: 1 reminder + 6 documents listed. Not yet committed/pushed since 02e4617 / main 9f40c9e.
- **Cards made compact (15 Oct):** smaller picture (56x70), buttons (34px), tighter padding; open card ~25% shorter. Appended override block at the end of style.css. Installed and seen on the phone: 6 documents + See all fit on one screen.
- **Backup water level fixed (15 Oct):** the earlier fix covered Restore only. `updateBusyOverlay` now reads any "NN%" in its message and sets the water, so Backup, safety snapshot and Restore all follow the number. Installed to DOCMAN dev, not yet re-tested on a backup.
- **App-open popup window set to 3 days (15 Oct)**, back from 14 (user: nothing beyond 3 days in the banner). Notification schedule unchanged and verified in code: 7 days (09:00), 3 days (09:00), tomorrow (09:00), expiry day every 30 min 07:00-21:00 (armed only within 3 days), then daily 09:00 for 7 days overdue. Reminders: due time then every 30 min for 3 hours. Whether to drop the 7-day notification is an open question for the user.
- **Cards compacted a second time (15 Oct):** picture 42x52 (rows 32x40), buttons 29px, tighter padding; second override block at the end of style.css. Installed and seen on the phone.
- **Expiring tab now limited to 3 days (15 Oct)** (plus already-expired), was end of month; empty text "Nothing expires in the next 3 days." The Reminders tab is a per-day calendar list (shows the selected day, default today) and was NOT changed. Installed to DOCMAN dev.
- **Reminder rows get the expiry-card background (15 Oct):** navy gradient, magenta/blue glow, violet rim, white text, violet round buttons; the due pulse and banner rim untouched. Appended to style.css. Built and installed BEFORE a preview was shown (user then said "preview first") — shown after the fact via a phone screenshot; revert with git checkout of that CSS block if rejected.
- **Reminder row: thin white border (1px, 60%) and 1px violet ring on edit/delete buttons (15 Oct)**, approved from a preview, installed to DOCMAN dev.
- **Reminder row: 8px more gap between edit and delete (15 Oct)**, approved from a preview, installed to DOCMAN dev.
- **PDF signature minimum size lowered (15 Oct):** PdfSignaturePlacementView pinch minimum 24dp -> 8dp so a signature can be shrunk to fit small boxes on large drawings. Java change; debug build installed to DOCMAN dev; R8 is release-only so confirm in a release build before shipping.
- NOTE: the first install that claimed the signature change did NOT contain it (the edit had failed). The change is now really in the file and installed (11:3x). Reminder row extra gap is 3px (approved), installed.
- **Signature Stroke row (15 Oct):** Thin 3dp / Medium 4.5dp (default) / Bold 6dp chips under Ink in the Draw Your Signature dialog; remembered in viewer prefs (signature_stroke_level). `SignatureDrawView.setStrokeDp`, `makeStrokeChip` in PdfViewerActivity. Java files are CRLF: edit through a CRLF-aware script. Compiled and installed to DOCMAN dev; not yet seen on the phone (preview mock-up was approved).
- **App-open popup framed (15 Oct):** 1px light border (white 55%), rounded panel, solid dark overlay with NO blur/home screen behind (user: add a thin border, remove the main screen bg). Approved from a preview, installed to DOCMAN dev.
- **"i" button help text and privacy policy updated (15 Oct):** help rows for PDF signing (pen thickness, smaller minimum), Expiry Dates & Alerts (7/3/1 day, same-day merge, cards, 3-day list) and Reminders (start-up banner as cards/rows). Privacy policy MIRROR edited (stamp 15 Oct; lock-screen paragraph and alert schedule were out of date and are corrected; saved-signature pen note; banner/picture paragraph). Change note: DOCMAN Play Store Assets/privacy-policy-change-2026-10-15.md. The LIVE policy (abjincy-dot/docman-privacy) is NOT updated yet — needs the user OK to push.
