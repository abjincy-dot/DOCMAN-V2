# DOCMAN handoff (2026-10-07)

Read this first, then `CLAUDE.md` in this folder and the memory file
`project_docman_current_state.md` ("START HERE").

## Rules the user wants followed
1. Edit **`www/` only**. `android/app/src/main/assets/public/` is generated, never edit it.
2. On every `www/app.js` or `www/style.css` change, bump the `?v=` number in `www/index.html`.
   After bumping, check it with `grep -o "app.js?v=[0-9]*\|style.css?v=[0-9]*" www/index.html`.
   Current values: `style.css?v=564`, `app.js?v=510`.
3. Deploy: `npx cap copy android`, then from `android/`:
   `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug`
   then `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
4. Test device is the Samsung S23 (adb serial `R5CW82A243H`).
   - **DOCMAN dev** (`com.docman.dev`) is the debug build. Test there.
   - **DOCMAN** (`com.docman`) is the Play copy with the user's real documents.
     Never adb-install over it: the signatures differ and the only fix is uninstalling, which wipes data.
5. UI changes: show a preview (widget, PNG or dev-app screenshot) and wait for OK before shipping.
6. Never upload to Play, commit, or build a release AAB unless the user says so.
7. Reply in a Malayalam-English mix, as numbered steps, with explicit file paths.
8. Always say whether the user needs to test anything.
9. Verify from **inside** the built APK/AAB, never from the build log.

## READ THIS BEFORE ANY npm install
`node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/`
holds **two DOCMAN patches that git does not track** (node_modules is gitignored).
`npm install` wipes both. A `.docman-backup` sits beside each original.

1. `LocalNotificationManager.java` ~line 214 — `VISIBILITY_PUBLIC` (the plugin hard-codes PRIVATE,
   so alerts were unreadable on the lock screen).
2. `TimedNotificationPublisher.java`, right after `notificationManager.notify(id, notification)` —
   remembers the last posted id per notification `group` in SharedPreferences (`docman_notif_groups`)
   and cancels the previous one, so a repeating alert replaces itself instead of stacking.
   `getActiveNotifications()` was tried first and is useless here: inside that receiver it returns
   only the notification just posted, never the earlier ones. Proven with on-device logging.

## Current state (2026-10-07)
- Branch `docman-2026-09-24-pdf-search-ui-animations`, **not merged to main**.
- **Nothing since 2026-10-01 is committed.** `www/app.js`, `www/style.css`, `www/index.html`,
  `android/app/build.gradle` and `MainActivity.java` all carry uncommitted work.
- build.gradle: **versionCode 53 / versionName 1.0.3**.
- AAB built and handed over:
  `DOCMAN Play Store Assets/release/DOCMAN-1.0.3-versioncode53.aab` (59 MB).
  Verified from inside the bundle: manifest says versionCode "53", versionName 1.0.3.
  **Not yet uploaded** when this session ended -- ask what happened to it.
- **Google granted production access** (the user said so on 2026-10-07). The app can go
  straight to the production track now; it no longer has to sit in closed testing.
- Play has used versionCodes 44-53. Next build is **54**.

### The version-name decision (updated)
versionName has **no uniqueness rule on Play** -- only versionCode does. So the public launch can
ship as **versionCode 54 / versionName 1.0.0** even though "1.0.0" was already used twice
(codes 49 and 50). The only cost is three rows reading "1.0.0" in the Play Console release list,
so say which is which in the release notes. The user confirmed they want 1.0.0 for the final file.

## What 53 / 1.0.3 contains (all of it added 2026-10-05..07)
**Reminders**
- `repeat` field: *Never / Every month / Every year*, chosen on the date screen itself
  (`showDateModal` gained `withRepeat`), not a third step.
- `advanceReminderOccurrence()` walks the due date forward a month/year at a time until it is
  ahead of now, clamping the day to the month being landed on while keeping the ORIGINAL day as
  `repeatAnchorDay` -- so a reminder set for the 31st does not creep to the 28th after February.
  Unit-checked against 8 cases in node before shipping.
- `settleSeenReminder()` is the single path for "this has been seen": it either rolls the
  occurrence forward and re-schedules, or marks `dueAckFor`. Both cancel the tray notification.

**Reminders on notes**
- Note row menu gains **Remind me**, and **Remove reminder** once one exists (`remindLabel`).
- The reminder carries `noteRef: {folderPath, noteId}`. A tap on its row, or the sticky note's
  "Open note" button, navigates back to the note. A bell shows on the note card.
- Setting one from a note re-renders in place (bell appears at once) instead of throwing the
  reminders panel over the note list.

**Folder view -- collapsing header**
- The DOCMAN branding panel scrolls away normally; `#folderChrome` (Back/Scan/Select/Favourite
  + breadcrumb) is `position: sticky` at `var(--safe-top)`. No JS.
- Freezing the branding too was tried first and cost 45% of the screen for a logo that does no
  work (9 file rows visible instead of 15). The user chose the collapsing version.
- **`position: sticky` was dead until `.app`'s `overflow-x: hidden` became `overflow-x: clip`.**
  An overflow pair of hidden/visible computes the visible axis to auto, which made `.app` a scroll
  container and resolved every sticky inside it against a scrollport that never scrolls.
- Breadcrumb is now three pills (icon + orange rim) with bare chevrons between, one line,
  scrolling sideways. The old picture-card folder hero is gone.

**Native: navigation-bar overlap**
- `MainActivity.exposeNavBarInsetToCss()` now also calls `v.setPadding(0,0,0,bars.bottom)` on the
  WebView and passes the insets on with the **bottom zeroed**. Measured inset on the S23: 135 px.
- Why: edge-to-edge let file rows scroll under the nav bar, and Android takes every tap in that
  strip -- a row's "..." button landing there fired Back instead of opening the menu. Moving the
  button around could not fix it; only not drawing there could.
- Do not re-add the `DOCMAN-INSET` log line; it was temporary and is removed.

**Rows and press feedback**
- File icon badge 34 -> 28px; `.file-card` min-height 44 -> 38.6px (the min-height, not the icon
  or padding, was what pinned the row height). Note/folder rows are 36px.
- File row edge is the same blue->magenta gradient rim as the "..." button, drawn with the same
  masked-ring trick, at 0.7px instead of 1.4px.
- Press tilt (`setPressTilt`, `--rx/--ry`) **removed** -- it read as the row wobbling. A press now
  shrinks the card and sinks it with an inset shadow.
- `.row-menu` is bound in `attachPressEffects()`, so pressing the dots animates the dots, not the
  whole row (the event used to bubble to `.card`).

**Fixes**
- Dashboard expiry row now calls `setActiveTab('pdfs')` instead of assigning `currentActiveTab`,
  so the FILES/NOTES switch actually moves.
- Light mode went black below the fold because a new `body::before` (the status-bar strip)
  overwrote the one that paints the app wallpaper. The strip moved to `body::after`.

## Still open
1. Upload `DOCMAN-1.0.3-versioncode53.aab` to Play (production track is now available).
2. Store listing: title (`DOCMAN - Document Manager` vs `DOCMAN: PDF Document Manager`),
   the rewritten short/long description, and the 8 screenshots in `final-8-2026-10-02/`.
3. Commit. Nothing since 2026-10-01 is in git.
4. Promo video: `DOCMAN Play Store Assets/promo-video-2026-10-04/DOCMAN-promo-30s-v8.mp4`
   (31.2s, 1080p). Built from three AI clips with the real app keyed into their blank blue
   screens (`scratchpad/composite.js`). Needs music and the official Google Play badge.
5. DOCMAN **dev** carries test data this session added: 12 sample PDFs in
   Personal/IDs & Certificates and a repeating reminder "Ysh". Remove if unwanted.

## What 1.5.4 contains (versionCode 41, on Play since 2026-09-29)
- Big-PDF guard: PDFBox ran out of memory on ~285-300 MB CAD manuals, so the editing tools refuse
  anything over heap/4 with "This PDF is too large to edit on a phone". Reading, search and
  bookmarks still work.
- Open with another app (Adobe etc.): ACTION_VIEW through FileProvider; `docs/` is in
  `res/xml/file_paths.xml`, `openExternallyNative()` is in `www/app.js`. Used when
  Settings → PDF Settings is **External App**, or the PDF is over the Threshold Size.
- PDF open, share and duplicate work from the path only (never read into JS).
- Text-selection fixes: first-digit selection, CAD OCR retry, dropping a stale prefetch.
- PRO badge beside the wordmark (`.logo-pro`), and the restore card no longer hides the
  backup password prompt.

## What changed on 2026-10-01
1. **Notification taps were being dropped.** The plugin delivers the tap within milliseconds of the
   WebView loading and logged `No listeners found`; the listener was attached only after the file
   metadata came back, 2.7 s later. `attachNotificationTapListener()` now runs on the first line of
   `DOMContentLoaded`, and anything arriving before the data is ready waits in
   `pendingNotificationActions` until `flushPendingNotificationActions()`.
2. **A reminder tap showed nothing.** It acknowledged silently and returned. It now opens
   `showReminderDueModal()` — a card with the title and time — and "View in Reminders" runs
   `openRemindersAndHighlight()`, which opens the panel, scrolls to the row and flashes it
   (`.reminder-flash`). The notification's own **Got it** button still dismisses silently.
3. **One notification per document instead of dozens.** Expiry and reminder alerts each carry a
   per-document `group`; the native patch above drops the older member when a new one posts.
   25 records were stacked on `com.docman` before this.
   **Not yet proven on a real 30-minute cycle** — a synthetic 3-notification test proved the first
   approach failed; the SharedPreferences approach replaced it and has not been re-tested.
4. **A past time can no longer be picked** for a reminder. The calendar already disabled past days;
   the wheels did not, so this morning was reachable this afternoon. `clampTimeToFuture()` rolls
   them forward to the next free minute 420 ms after a scroll settles, with a guard on Save behind it.
5. **The folder-unlock keypad** now wears the app-unlock palette (plum scrim, `#1d1033` card,
   coral-to-magenta badge, `--pin-accent:#ff6b4a`). A wrong PIN still goes red — that is a state.
6. **About page**: header margin 22→2, card padding 28→0, icon 84→66px, and the badge-to-APP-INFO
   gap 36→12px (it was three spacings stacking). `.settings-page-inner` bottom padding now follows
   `--nav-bottom` from MainActivity, which fixes the clipped last row on **every** settings panel.
7. **Locked departments** show an amber padlock in the count circle and withhold the item count.
   Two things had been hiding it: `.dept-pill-icon::before` paints the gloss at z-index 2, and
   **`style.css:1679` hides every direct `<i>` in that circle**. Both are overridden for the locked
   variant only. The lock is 1.2rem with a 0.6px black `-webkit-text-stroke`.
8. **The "i" guide** gained three lines, all features rather than fixes: big PDFs open for reading
   while the editing tools decline them, Settings → PDF Settings → External App / Threshold Size,
   and "Also search drawings?" after a search.

## The guide is a how-to, not a changelog
The user reaffirmed this on 2026-10-01. Bug corrections do **not** go in the "i" button —
today's notification, past-time, lock-count and dedupe fixes were all deliberately left out.
Only things a reader cannot discover on their own belong there.

## Privacy policy
Unchanged on 2026-10-01, deliberately: nothing that day collects or moves any new data. The policy
lives in its own repo (`abjincy-dot/docman-privacy`), with a mirror under
`DOCMAN Play Store Assets/privacy-policy/`. The mirror is a copy — never publish from it.

## Play screenshots (from 2026-09-29, still current)
- Final 8 for Play: `DOCMAN Play Store Assets/final-8-2026-09-29/` — six new 1080x2100 captures
  plus the older image-editor and app-lock shots (those two are 1080x1920).
- Raw captures: `DOCMAN Play Store Assets/screens-2026-09-29/`.
- The user uploads them to Play Console themselves.

## Still pending
- **Internal-test feedback on 1.5.8.** Nothing in it has run as a release (R8) build. Worth checking
  there first: the reminder card, the dedupe after two repeats, the unlock keypad colour,
  About top and bottom, and the locked-department padlock.
- **The dedupe is unverified** on a real cycle (see 3 above).
- Branch not merged to `main`.
- AABs 42/43/44 can be deleted.
- Dev-app state the user set up on 2026-09-29: PDF Settings is **DOCMAN Viewer**, three demo
  reminders on 2 Oct 2026, demo PDFs in Personal → IDs & Certificates.
- A long-standing launch error, unrelated to today:
  `Uncaught TypeError: Cannot read properties of null (reading 'style')`, twice per launch,
  reported as "Line 1". Never traced; nothing visibly broken.

## NEXT TASK — the reminder notification should open a sticky note (asked 2026-10-02)

What happens now: tapping a reminder notification opens `showReminderDueModal()` (a centred card),
and "View in Reminders" opens the panel and flashes the row. The user does not want that shape.

What they asked for, in their words:
1. Tapping the notification should pop the reminder up **like a sticky note**, on the Reminders page
   itself — the same feel as the Quick note bubble on a file row (`.qnote-bubble` in `www/style.css`,
   `showNoteViewModal()` in `www/app.js`), not a centred dialog.
2. Closing the note leaves the reminder **sitting in the list as a banner** — no blinking.
   The current `.reminder-flash` pulse was explicitly called out as unwanted.
3. **Edit is not needed** on it. Keep **delete**, as a button **on the side**.

Where the pieces are:
- `showReminderDueModal()` and `openRemindersAndHighlight()` in `www/app.js` (added 2026-10-01) —
  the card and the flash both come from here; both are what the user is replacing.
- `.reminder-flash` keyframes in `www/style.css` — remove with the flash.
- The reminder rows are built in `showExpiringDocumentsPanel()`; each is
  `.reminder-row[data-id]` with `.reminder-edit` and `.reminder-delete` buttons.
- The Quick note bubble is the model to copy: anchored to the row, pointer pointing at it,
  `qnotePop` scale/fade, `transform-origin` set from the anchor's centre, flips above when short
  of room, clamps 8px from the screen edges.

Build it on the dev app and show a screenshot before shipping, as always.
