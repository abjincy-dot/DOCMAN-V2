# DOCMAN — "Combine to PDF" badge stuck + back-button state audit

**Date:** 2026-09-18
**File touched:** `docman-native/www/app.js` (web layer only — no native/Java changes)
**Status:** fixed and verified in the browser preview. **Not yet synced or built to the device.**

Share this with any other session working on DOCMAN so it doesn't re-derive the same ground.

---

## 1. The reported bug

Select several photos with **Merge to PDF**, then press the Android back button without
completing the merge. The app leaves the folder, but the blue **"5 · Combine to PDF"** pill
stays floating on the home department screen.

### Root cause

`pdfQueue` and `pdfSelectMode` are module-level globals, and `imgUpdatePdfQueueBadge()` was
only ever called from the three functions that mutate the queue (enter / toggle / exit).
Nothing re-evaluated the badge when the *screen* changed, and nothing tied the selection to
the folder it was started in. So:

- the badge survived any navigation (home, breadcrumb, back, search);
- `pdfSelectMode` stayed `true`, so **every image card in the next folder opened came up
  wearing a select dot**, and tapping one queued a file from a different folder;
- the sibling FAB (`deptAddFab`) already had a context rule for exactly this
  (`updateDeptAddFabVisibility()`), which the PDF badge never got.

### Fix

Three parts, all in `www/app.js`:

| What | Where |
| --- | --- |
| `pdfSelectContext` records the screen the selection started on (folder path + search text) | `app.js:6784`, set in `imgEnterPdfSelectMode()` |
| `imgPdfSelectionStillValid()` — single source of truth for "does this selection still have a screen under it" | `app.js:6788` |
| `imgUpdatePdfQueueBadge()` now hides the pill unless the selection is still valid and no full-screen overlay is open | `app.js:6794` |
| `imgPruneStalePdfSelection()` drops a stranded selection; called at the top of `render()` — the one place every navigation goes through | `app.js:6811`, called at `app.js:9801` |
| The two body-level FABs are kept in lockstep: `updateDeptAddFabVisibility()` also refreshes the PDF badge | `app.js:9476` |
| Back inside select mode now **cancels the selection and stays in the folder** (standard Android multi-select); a second back leaves the folder | `app.js:14466` |

The search text is part of the context on purpose — "Merge to PDF" can legitimately be
started from a search result, so the selection has to survive *that* screen but die when the
search changes.

---

## 2. The audit — same bug class, six more instances

All of these were the Android back handler (`initAndroidBackButton()`, `app.js:~14300`)
failing to unwind the **topmost visible layer**, so back navigated, closed Settings, or
exited the app *underneath* something still on screen.

| # | Problem | Fix | Line |
| --- | --- | --- | --- |
| 1 | **Nine on-demand modals had no back handling at all**: file details, note view, tags, move-to-folder, date picker, "expires today", backup-encryption choice, recovery-key reveal, safety snapshots | A `dismissableModals` table; back clicks each modal's own ✕/Cancel so its callback semantics still run (a `null` selector means backdrop-dismiss only, and `overlay.click()` hits exactly the listener that tests `e.target === overlay`) | `app.js:14354` |
| 2 | **Note editor** (`#noteModal`, uses `.show` not `.hidden`) — back while writing a note walked out of the folder behind the still-open editor | back behaves like its Cancel button | `app.js:14377` |
| 3 | **Image editor tools** — only `activeTool === 'adjust'` was handled; back during Crop/Scan/Text/brush skipped the tool and raised "discard changes?" over a half-drawn crop box | back cancels the active tool first (`imgEditorSetTool(null)`, same as each tool's Cancel button) | `app.js:14404` |
| 4 | **Spreadsheet viewer** (`#sheetViewer`) — the chain handled `docViewer` but not this second `.doc-viewer` element, so back inside an open .xlsx/.csv navigated the folder list behind it, or exited the app from the root | `closeSheetViewer()` | `app.js:14416` |
| 5 | **Settings sub-panels** — back from Appearance/Security/etc. closed the whole Settings page from three levels in | steps back to `settingsListScreen` first, then closes on the next press | `app.js:14450` |
| 6 | **Busy overlay** — back during a backup/restore/snapshot navigated underneath the spinner | ignored, same guard style as `uploadInProgress` | `app.js:14318` |

### Checked and found already correct (don't re-audit these)

- `uploadInProgress`, `isSharing`, `pinVerifyInProgress`, `importingEditedCopies` — all
  cleared in `finally` blocks or in every callback path, including Cancel and backdrop taps.
- Every `showBusyOverlay()` / `hideBusyOverlay()` pair (backup export, restore, snapshot, upload).
- `updateDeptAddFabVisibility()` — already had the context rule; it is now the lockstep point
  for both body-level FABs.
- `sortMenuOverlay` and `lockedItemsOverlay` — already covered by the generic
  `.ctx-menu-overlay` branch in the back chain.

---

## 3. How it was verified

Served `www/` statically and drove the **real** back handler by stubbing the Capacitor App
plugin in the page (`Capacitor.Plugins.App.addListener` captured the live callback), then
exercising each branch:

- all nine modals dismissed, and `expiryTodayModal`'s `onDone` still fired through the
  backdrop fallback;
- note editor and sheet viewer closed **without** changing `currentPath`;
- Settings unwound panel → list → closed;
- select mode: first back cancelled the selection and stayed in `Personal`, second back left
  the folder, `exitApp` never fired;
- selection also cleared on Home, breadcrumb, subfolder entry and search — badge hidden,
  `pdfSelectMode === false`, zero select dots;
- `node --check app.js` clean, no console errors on load.

### Known preview artifact (not a bug)

While the Claude desktop Browser pane is **hidden**, `requestAnimationFrame` never fires, so
`openDashboardView()` / `openRecentsView()` etc. never reach the rAF callback that adds
`fav-view-visible` and calls `updateDeptAddFabVisibility()`. Any test of the overlay-open
branch reads as a false negative in that state. On device this path is fine.

---

## 4. What still needs doing

- [ ] `npx cap sync android`, build, and test the back button on the phone — the preview
      cannot reproduce a hardware key.
- [ ] On-device smoke test of the six audited flows above (especially: back inside an .xlsx,
      back while writing a note, back from a Settings sub-panel).
- [ ] Nothing was committed, synced, or uploaded to Play Console.
