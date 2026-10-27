# DOCMAN — AI TECHNICAL HANDOVER

Written 17 Oct 2026 from the repository as it is on disk (branch `docman-2026-09-24-pdf-search-ui-animations`,
HEAD `592c388`, plus uncommitted work). Where I did not verify something in code I say **UNKNOWN**.

**Read order for a new AI:** this file → `CLAUDE.md` (rules) → `CURRENT_STATE.md` (newest facts, 16 Oct) →
`PROGRESS.md` (log) → `HANDOVER.md` (919 lines of reasoning, traps and per-build history; §1, §1a, §1b first) →
`DECISIONS.md` → `NEXT_TASK.md`.

**Scope note (CORRECTED 17 Oct after seeing the phone).** I first wrote that there was no department hub or SVG
connectors. **That was wrong.** The home screen is a column of 8 coloured department pills, each with an "N ITEMS"
badge, joined by curved white connector lines with glowing dots to a round dark **"i" hub** (help) on the right.
My grep used the wrong words and I never read the home-screen code. Before touching the home screen, read
`render()`'s `isRoot` branch plus its CSS/SVG, and treat the hub and connectors as must-not-revert. What does hold:
there is no service worker, and no "equipment" records exist. The home header (logo, PRO badge, search, Recent /
Sort / Dashboard / Recycle Bin) and the orange + FAB are also part of the shipped look.

---

## 1. PROJECT OVERVIEW

**What it is.** DOCMAN is an offline-first Android document manager: a Capacitor 6 WebView app (single-page
vanilla JS in `www/`) with a large native Java layer for PDF viewing/editing, billing, biometrics, scanning and
alarms. Package `com.docman`; debug builds install as the separate app `com.docman.dev` ("DOCMAN dev").
All user data stays on the phone; the only network contact is Google Play Billing.

**Users / workflow.** Individuals keeping personal paperwork (passports, licences, insurance, bills, notes).
Structure: **Department → folders → subfolders → files / notes**. Users import (file picker, camera scan,
Google Drive via intent), view, sign/highlight/fill/erase/crop PDFs, attach an **expiry date** to a document
(alerts + cards) or set free-standing **reminders**, keep **notes**, back everything up to an (optionally
encrypted) `.dbak` file, and lock items / the whole app (PIN / biometrics).

### IMPLEMENTED (in code today)
- Departments / folders / subfolders, files, notes, favourites, recents, recycle bin, tags, drag/sort, search
  (files, notes, folders), dashboard, statistics, settings.
- Native PDF viewer (`PdfViewerActivity`): bookmarks/TOC, page search, rotate, night mode, H/V scroll, spread,
  thumbnails, continue-reading, text selection + copy, highlight, signature (ink colour + stroke), fill form,
  erase (brush, rasterised), crop page, attachments, print, export, password-protected PDFs, OCR fallback
  (ML Kit, on-device), merge/convert to PDF. Edited PDFs are saved as new copies beside the original.
- Text, Word (mammoth), Excel (SheetJS) viewers; image editor; ML Kit document scanner.
- Expiry dates with alerts: 7/3/1 days before 09:00, expiry day every 30 min 07:00–21:00, then daily up to 7
  days; merged into one banner per date; "Got it, stop reminding"/"Renew".
- Reminders (one-off, monthly, yearly), reminder sticky note, reminders calendar.
- "Needs your attention" launch banner + header bell (code present; **unverified on phone**, see §10).
- Backup/restore: streaming v2 backup, optional AES encryption (PBKDF2 → AES), safety snapshot, progress overlay.
- App Lock (PIN v3 salted PBKDF2; biometric via `BiometricAuthPlugin`/`AppLockGate`), per-item locking.
- Pro: one-time Play Billing product `docman_pro`, 11 free "tries" of Pro tools, restore purchase.
- In-app review prompt, help ("i") screen, activity log.

### PARTIALLY IMPLEMENTED / UNVERIFIED
- Everything listed in `CURRENT_STATE.md` items 1–13d (banner, bell, stack scroll, Excel used-area rendering,
  pinch zoom, Clear-expiry fix, alarm budget). **Present in `www/` and installed to DOCMAN dev only. Not in any
  AAB. The user has not confirmed them working.**
- Reminders have **no** alarm-budget check (Android hard-crashes the app past 500 pending alarms).
- Merged expiry banner and the 21:00 stop: never observed arriving on a real alert slot.
- Release (R8-minified) behaviour of Java changes in 66/67: never exercised by a human.

### PLANNED / OFFERED, NOT BUILT
- Reminders merged into one banner like expiry alerts.
- Card view for "Key: Value" text files; slice-rendering for huge text notes.
- PDF cards showing their first page (needs a new `PdfNativePlugin` method); dashboard "Expiring soon" restyle.
- Moving the search suggestion's folder path onto result cards (suggestions dropdown is switched off).
- Only counting an item when an action is taken (not merely opening a group).

### BROKEN
- Nothing known to be broken in shipped behaviour. See §18 for open risks and suspected defects.

### Production readiness
Play: AAB **67 / 1.0.0** is on Internal testing; Closed testing has 61 / 1.0.0; Production inactive (access granted
7 Oct). Not launch-ready until a build containing the dev-only work (esp. the alarm budget) is built, tested as
a release build on a device, and the store listing/screenshots are pasted. Only ever run on one phone (Galaxy S23).

---

## 2. PROJECT STRUCTURE (repo root `docman-native/`)

Parent folder `DOCMAN PLAY STORE/` also holds `DOCMAN Play Store Assets/` (listing text, screenshots, icons, privacy
policy mirror, `release/` AABs) and `backups/` — **both untracked/outside the app**. A near-identically named
folder `Desktop\DOCMAN Play Store Assets\` is a stray that once caused a wrong build; the real one is
`Desktop\DOCMAN PLAY STORE\DOCMAN Play Store Assets\release\`.

| Path | Purpose | Safe to edit? |
|---|---|---|
| `www/app.js` (~20.7k lines, ~1 MB) | **All web logic.** DB, rendering, notes, reminders, expiry, search, backup, Pro, viewers. Contains non-UTF-8-clean bytes (grep needs `-a`). | Yes, carefully; huge shared global state. Run `node --check www/app.js` after every edit. |
| `www/index.html` (~1.8k lines) | Static DOM, modals, views, inline `onclick`s. Carries cache markers `style.css?v=669`, `app.js?v=637`. | Yes; bump `?v=` each build. Many handlers are **only** reachable via inline `onclick` — never "remove unused functions". |
| `www/style.css` (~11.8k lines) | All CSS; later override blocks win (see §8). | Yes; append, do not reorder. |
| `www/manifest.json` | PWA manifest (name, icons, shortcuts). No service worker exists. | Yes |
| `www/vendor/` | fontawesome, heic2any, jspdf, jszip, mammoth, sacramento, xlsx (local copies, no CDN) | Don't edit; replace whole packages only |
| `www/Fonts/`, `www/Images/` | Inter woff2 weights; splash/icon art | Yes |
| `app.js`, `style.css` **at repo root** | **STALE copies** (12 Sep / 19 Aug). Not used by Capacitor (`webDir: www`). Trap: editing these does nothing. | Ignore; consider deleting (user decision) |
| `capacitor.config.json` | appId `com.docman`, appName, `webDir: www`, `server.androidScheme: https`, bg `#1a0b2e` | Rarely |
| `package.json` | Capacitor deps + `patch-package` postinstall | See §22 |
| `patches/@capacitor+local-notifications+6.1.3.patch` | **Hand-written** patch to `TimedNotificationPublisher` (group-merge of same-date expiry alerts). Applied by `patch-package` on `npm install`. | Dangerous, see §28 |
| `tools/serve-www.js` | Dev static server (port 4173) for browser previews. Keep out of `www/`. | Yes |
| `docs/screen-sweep-2026-10-13.md`, `docs/archive/` | Test notes; archive never shipped | Yes |
| `CLAUDE.md, CURRENT_STATE.md, PROGRESS.md, HANDOVER.md, ISSUES.md` | Project memory docs (rules, state, log, reasoning, deferred issues) | Update at end of every task |
| `android/` | Capacitor Android project (Gradle 9.4.1 wrapper, AGP 9.2.1) | See §14 |
| `android/keystore.properties` | **Local release-signing credentials, gitignored. Never print or commit.** | No |

### Native Java (`android/app/src/main/java/com/docman/`) — files use **CRLF**
| File | Role |
|---|---|
| `MainActivity.java` | Capacitor bridge entry; registers 9 plugins; measures nav-bar inset → CSS `--nav-bottom` (`exposeNavBarInsetToCss`); one-time exact-alarm permission prompt |
| `DocmanApplication.java`, `AppLockGate.java` | Process lifecycle; re-lock when whole app backgrounded |
| `PdfViewerActivity.java` | Native PDF viewer + all editing tools ("More" menu pattern in `showMoreMenu()`) |
| `PdfNativePlugin.java` | JS↔viewer bridge (open PDF, continue-reading page, `editedCopySaved`, `freeTryUsed`) |
| `PdfTextService.java` | Separate-process (`:pdftext`) text extraction service |
| `PdfTextSelectionOverlayView`, `PdfMarkOverlayView`, `PdfRedactOverlayView`, `PdfCropOverlayView`, `PdfSignaturePlacementView`, `SignatureDrawView`, `EraseBrushSliderView` | Viewer overlays |
| `BillingPlugin.java` | Play Billing (`docman_pro`), restore, last-known cache |
| `EntitlementPlugin.java`, `FreeTries.java` | Free-try accounting shared with viewer (keys must match JS `FREE_TRIES`) |
| `BiometricAuthPlugin.java` | Fingerprint/face |
| `DocumentScannerPlugin.java` | ML Kit document scanner |
| `ExactAlarmPlugin.java` | Exact-alarm permission |
| `InAppReviewPlugin.java` | Play in-app review |
| `BackupFilePlugin.java`, `BackupSavePlugin.java` | Backup file read/write/save to Documents |
| `DocmanWebChromeClient.java` | WebView file chooser (Camera / Photos / Files / Drive) |
| `android/app/proguard-rules.pro` (24 lines) | R8 keep rules — release minify is **on**; new reflective/plugin code may need keeps |

---

## 3. TECHNOLOGY STACK (verified from files)

- App: vanilla JS, no framework/bundler, no TypeScript. Single `app.js` loaded by `index.html`.
- Capacitor: `@capacitor/core` 6.2.1, `android` 6.2.2, `app` 6.0.3, `filesystem` 6.0.4, `haptics` 6.0.3,
  `local-notifications` 6.1.3 (patched), `share` 6.0.4; dev: `@capacitor/cli` ^6.2.0, `@capacitor/assets` ^3.0.5,
  `patch-package` ^8.0.1.
- Android: `minSdk 24`, `compileSdk 36`, `targetSdk 36`; `applicationId com.docman`; **versionCode 67, versionName
  "1.0.0"** (`android/app/build.gradle`); debug adds suffix `.dev`; release: R8 minify + shrinkResources, symbol
  table. Gradle wrapper 9.4.1, Android Gradle Plugin 9.2.1. Machine has Node v24.18.0, npm 11.16.0.
- Native libs: `io.github.oothp:android-pdf-viewer:3.2.0-beta06`, `io.legere:pdfiumandroid:1.0.32` (text API),
  `com.tom-roush:pdfbox-android:2.0.27.0` (writes PDFs), `mlkit text-recognition:16.0.1`,
  `play-services-mlkit-document-scanner:16.0.0`, `androidx.biometric:1.1.0`, `lifecycle-process:2.8.7`,
  `billing:8.0.0`, `play:review:2.0.2`, appcompat 1.6.1, core-splashscreen 1.0.1.
- Web libs (vendored): jsPDF, JSZip, mammoth, SheetJS xlsx, heic2any, Font Awesome, Sacramento.
- Database: IndexedDB (`DocmanDB`, v12) + `localStorage` + Capacitor Filesystem. No server, no accounts.
- Payments: Google Play Billing one-time product. Auth: local PIN/biometric only.

---

## 4. ARCHITECTURE (startup → interaction)

1. `MainActivity` boots the Capacitor WebView (`https://localhost` scheme) loading `www/index.html`;
   splash (`#splashScreen`). `DocmanApplication`/`AppLockGate` guard re-entry.
2. `app.js` top-level declares globals (§21). `initDB()` opens `DocmanDB` v12; then data loaders fill
   `allFiles`, `allNotes`, `fileSystem`, `deptColors`, `deptIconOverrides`, `folderMeta`, `recycleBin`.
   `migrateBase64ToBlob()` converts legacy base64 entries; `docman_migration_done` flags it.
3. `armLaunchBell()` runs before the first `render()`; `render()` (calls `updateAttentionBell()` first) draws the
   current level from `currentPath`. After ~1.8 s `checkLaunchAlertsOnLoad()` opens the "Needs your attention"
   panel (skipped if `launchedFromNotification`).
4. Navigation is state-driven (`currentPath`, `currentActiveTab`, `isSearchMode`) with overlay panels/modals.
   Back is handled by `goBack()` + `navReturn` (`markNavReturn(restore)`) and Capacitor App back-button handling.
5. **Files:** import → blob persisted as native file (`fsPath`, Capacitor Filesystem) or, in-browser, in the
   `blobs` store (`cacheFileAsBlob`); metadata in `files` store keyed by folder path. PDFs open through
   `PdfNative.openPdf({path,…})` into `PdfViewerActivity`; edits write a verified copy to `cache/edited/` with a JSON
   note, then `importPendingEditedCopies()` files it (on `editedCopySaved`, resume, launch).
6. **Delete** is soft: moves to `recycleBin` (a key in `folderStructure`); blob removed only on Secure Delete.
7. **Alerts:** `imgScheduleExpiryNotification` → `LocalNotifications.schedule`; `rescheduleAllExpiryNotifications`
   re-arms everything on launch; `queueExpiryAlertRefresh` 1.5 s after changes. Tap → `handleNotificationAction`.
8. **Backup:** `writeBackupStream` → `.dbak` (optionally `encryptBackupBlob`); restore via `importBackupV2` →
   staged then `commitStagedRestore`.
9. **Pro:** `entitlement` object, `FREE_TRIES`, `requireProTool(feature)` → `showPaywall`; purchase via
   `BillingPlugin`; viewer spends its own tries through `FreeTries.java`.

Module relationships: `app.js` ⇄ Capacitor plugins ⇄ Java plugins; `PdfViewerActivity` is a separate Activity that
talks back only through `PdfNativePlugin` events and the `cache/edited/` hand-off.

---

## 5. DATABASE / INDEXEDDB

- **Name `DocmanDB`, version `DB_VERSION = 12`** (`app.js` ~2273).
- **Object stores (all created in `onupgradeneeded` only if missing — there is NO per-version migration code):**
  - `files` — keyPath `id`; one record **per folder path** with `files: [ {name,type,uploadedAt,favourite,locked,size,expiryDate,note,tags…,fsPath} ]`
    (record `get(folderPath)` is used in `cacheFileAsBlob`, so `id` = folder path). Mirrors `allFiles`.
  - `folderStructure` — keyPath `key`; a bag of singletons: `structure` (= `fileSystem` tree), `deptColors`,
    `deptIconOverrides`, `folderMeta` (per-path `{createdAt}`), `recycleBin`, others. New app-level maps are added
    as new keys here *specifically to avoid a schema bump*.
  - `notes` — keyPath `id`; mirrors `allNotes` (id, title, content, color, lined, font size, folder, lock…).
  - `blobs` — keyPath `blobId` (= `folderPath/fileName`); `{blobId, blob}` for web/legacy storage.
  - **No secondary indexes** exist.
- **Other persistence:** `localStorage` keys: `docman_settings_v2`, `docman_reminders_v1` (JSON array),
  `docman_recents_v1`, `docman_search_history_v1`, `docman_pin_v3` (+ legacy `docman_pin_v2`, `docman_pin_fails_v1`,
  `docman_pin_cooldown_until_v1`), `docman_activity_log_v1`, `docman_attn_seen_v1` (counted marks, one-day
  stamps), `docman_theme`, `docman_migration_done`, `docman_review_v1`, `docman_last_error_v1`,
  `docman_img_adjust_hints`, `docmanIntroSeen`, `docmanAlertSetupSeen`, `docmanCopyProgress`, `docmanCloudRateBps`.
  Native: SharedPreferences `docman_billing` (last-known purchase), `docman_notif_groups` (notification groups).
- **Create/update/delete:** each mutation edits the in-memory global then writes the relevant store (e.g.
  `saveFolderStructure()`, `saveFolderMeta()`, `cacheFileAsBlob()`, `deleteBlobFromDB()`, `renameBlobInDB()`);
  deletes go to `recycleBin` first.
- **Migrations that exist:** only (a) store creation at upgrade, (b) `migrateBase64ToBlob()` runtime migration,
  (c) PIN v2→v3 on next unlock. UNKNOWN: what changed between DB versions 1–12 (history not in repo).
- **Risks of schema change:** bumping `DB_VERSION` with no migration code relies solely on "create if missing";
  adding an index or changing record shape needs real migration logic. **File objects are copied field-by-field in 8
  places in `app.js`** — a new field on a file record must be added in all of them or it is silently dropped
  (this is why counted-attention state lives in localStorage). Changing `onupgradeneeded` with another tab/WebView open triggers
  `onblocked` (handled by rejecting at startup).

---

## 6. DOCUMENT / PDF MANAGEMENT

- **Import:** `DocmanWebChromeClient` serves the picker (Camera, Photo Library, Choose Files, Google Drive by intent);
  `uploadInProgress` blocks navigation during import (hardware back bypasses the DOM). Scanner via
  `DocumentScannerPlugin` (ML Kit; asks name after save).
- **Storage:** native build copies files to app-private storage (`fsPath`, `writeBlobToFSChunked`, `readBlobFromFS`);
  the `blobs` store is the web/legacy path. Documents never leave the app-private area except Export/Backup/Share.
- **View:** PDFs → native `PdfViewerActivity` (Pdfium); images/Text/Word/Excel → in-WebView viewers; unknown types →
  "Open with another app" (`openExternallyNative`, share-sheet fallback).
- **Rename/move/delete:** `renameBlobInDB`, `reKeyFileAlerts()` re-keys alerts on rename/move/folder rename,
  `sweepOrphanedExpiryAlarms()` cleans stragglers. Delete → recycle bin.
- **Search/sort/metadata:** §12; metadata = name, type, size, uploadedAt, favourite, locked, expiryDate, note, tags.
- **Large PDFs:** PDF search uses `io.legere:pdfiumandroid` per page (works on 300 MB drawing sets); PDFBox (whole-doc
  in Java heap) is used only for *writing* edits and as a fallback text path; `largeHeap=true`. Fast scrolling a
  3000+ page PDF shows white pages briefly — **accepted, do not "fix"**. Rotated pages are refused by Erase/Crop.
- **Large text:** a 4.5 MB note is ~1.9M px tall; zoom is a pure CSS scale for that reason.
- **Offline:** everything except Play Billing works offline (assets are local, no CDN).
- Known limits: PDFs show a PDF picture on cards, not page 1; huge text notes are not slice-rendered; Excel fonts/colours
  not reproduced.

---

## 7. CURRENT UI STRUCTURE

Single page; views are `<div>`s toggled by JS. Ids from `index.html`: `#splashScreen`, `#favouritesView`,
`#recentsView`, `#dashboardView`, `#recycleBinView`, `#settingsListScreen` (+ `settingsPanel-statistics` etc.),
`#noteModal`, `#deptInfoModal`, image-editor panels (`#imgEditor*`), plus dynamically created overlays
(`#expiryCardsPopup`, reminders panel, Expiring Documents panel, paywall, viewers).

| Screen | Entry | Notes |
|---|---|---|
| Home / Departments | default `render()` (`isRoot` branch) | Cards from `DEFAULT_DEPT_ICONS` (Personal, Work, Finance & Bills, Education, Health & Medical, ID & Legal, Home & Property, Others) + custom departments; long-press = rename/colour/**Change Icon** (`deptIconOverrides`). Only departments use long-press. |
| Folder / subfolder | `selectDepartment`, subfolder entry | Tabs `currentActiveTab` (files / notes); rows use the ⋯ menu; breadcrumb; sort (incl. Date via `folderMeta.createdAt`). |
| Document / viewers | open file | PDF native; others in-WebView, white card on grey for text/Word/Excel |
| Notes | `#noteModal`, `prepareNoteModal` | Opens read-only; double-tap text to edit; colour/ruling/size autosave (`noteStyleChanged`) |
| Reminders / Expiring | header bell/logo → Expiring Documents panel (Reminders + Expiring tabs, calendar) | Sticky-stack cards (`.dc-stk`) |
| "Needs your attention" | launch / bell / notification tap (`showExpiryCardsPopup`, `showExpiryCardsFor`) | Summary + detail; **dev-only/unverified** |
| Search | home search field | pill `#searchInfo`; suggestions dropdown disabled |
| Dashboard, Recents, Favourites, Recycle Bin, Statistics | `openDashboardView`, `openRecentsView`, `openRecycleBinView`, `openStatisticsPanel` | Dashboard "Expiring soon" rows keep old look |
| Settings | `openSettingsPage` | App Lock, backup/restore, alerts, theme, Pro status (`updateProStatusSubtitle`) |
| Paywall | `showPaywall(feature)` | Triggered by `requireProTool` |

The app is **portrait-locked** (`MainActivity` `screenOrientation=portrait`); don't write landscape CSS for the web
layer. Known UI risks: bottom-edge overlap (see §28), unverified banner/bell visuals.

---

## 8. DESIGN SYSTEM (as built)

- Dark navy/purple theme (`backgroundColor #1a0b2e`, manifest theme `#0a1128`); gold/amber accent, orange `#ff8c28`
  search border on `#101216`; search pill reuses it. Hairline borders on cards/buttons (1 px; navy-gradient reminder rows).
- Fonts: **Inter** 300–900 (local woff2); **Sacramento** script for decorative text. Icons: Font Awesome (local).
- Notes: six paper colours (`from/to/paper/edge`), ruled-paper background via `paintNoteRuling()`; text size 11–24px (default 15, needs `!important`).
- Status colours on expiry cards: red ≤14 days, amber ≤30, green beyond.
- Header: logo `#appLogoBtn` which swaps to a mirrored gold ringing bell (`.na-hbell`, waves `.na-wv`, badge `.na-hbadge`, 1.6 s cycle) while the launch bell is armed.
- **CSS cascade rules that bite:** `style.css` is append-only layers — compact cards ("Compact cards", "Compact again"),
  `.reminder-row`, button ring/gap, popup frame, `.dc-*`, `.na-*` are late overrides; order matters. `.hidden{display:none!important}` —
  never put `!important` display on elements that toggle `.hidden` (stranded the search pill once). `.modal-footer button:first/last-child`
  rules leak into nested toolbars. Dead rule: `.search-container::before` gradient (overridden to `display:none`).
- Safe areas: `env(safe-area-inset-bottom)` is **0** in this WebView — use `max(env(...,0px), var(--nav-bottom,0px))`.
- Responsive: one geometry for all widths plus a font-size pin; 264 + 42 + 21-size sweeps passed (docs/). Only the
  home screen is swept broadly.

---

## 9. RECENT UI WORK (what must not be reverted)

(Department timeline / orange hub / SVG connectors: **not present in the code.**) The recent work is:
1. Expiry/reminder **cards** with inline-SVG pictures (`DOC_PIC_SVG`, `docPictureKind`: folder name → file name → file type, never contents; folders named for several things are ignored). `docCardHtml`, `reminderCardHtml`, `wireDocCardActions`.
2. **Start-up banner** framed panel; replaced by the **"Needs your attention"** summary/detail panel (`.na-*`); old red/purple expiry modal deleted — do not bring back.
3. **Header bell** armed only by launch check; **View** → `revealFileInFolder`.
4. **Sticky stack scroll** (`.dc-stack-list`, `.dc-stk`, `.na-cards .na-card`, `--i` offset).
5. **Text/Word/Excel viewers**: card look, find (`attachDomFind`), open-with button, pure-scale pinch zoom (`wirePinchZoom`, `applyScaleZoom`).
6. **Note editor**: full-screen, read-first, bullets, baseline-measured ruling, safe-area fixes.
7. Signature **Stroke row** (Thin 3dp / Medium 4.5 / Bold 6) and minimum size 8dp.
Items 2–5 are dev-only and unverified by the user.

---

## 10. REMINDERS / EXPIRY

- **Reminders:** array in `localStorage['docman_reminders_v1']` (`loadReminders`/`saveReminders`). Fields seen: `dueAt` (YYYY-MM-DD), `dueTime`
  (default 09:00), `repeat` (`none|monthly|yearly`), `repeatAnchorDay`, text/title. `advanceReminderOccurrence()` rolls repeats forward keeping the anchor day.
  `reminderOccurrenceKey(r)` identifies an occurrence; "seen" suppresses the launch dialog. Real Android notifications are scheduled; **no alarm budget check**.
- **Expiry:** `file.expiryDate` ('YYYY-MM-DD') on file records. `getExpiryStatus`, `getAllExpiringFiles(thresholdDays)` (default `EXPIRY_SOON_DAYS=5`, launch uses 3).
  Date must start tomorrow (`showDateModal` `minTomorrow`). Clear goes through `clearExpiryWithWarning()`; `setFileExpiryDate()` clears the file's counted mark.
- **Alert schedule (do not change without the user):** 7d/3d/1d at 09:00 (`EXPIRY_ALERT_HOUR`), expiry day every 30 min 07:00–21:00 (`EXPIRY_DAY_SLOTS`, ids 1000–1028, only armed within `EXPIRY_DENSE_WITHIN_DAYS=3`), then daily ≤`EXPIRY_OVERDUE_DAYS=7`. `ALARM_BUDGET=450` trims farthest first.
- **One banner per date:** group key `docman-expiry-<date>-<kind>`; plugin patch merges siblings within 90 s. No document names on lock screen.
- **Acknowledging:** "Counted" (`markAttnSeen`, `attnStamp`, one day, in `docman_attn_seen_v1`; hides from banner/bell only) vs "Stop reminding" (`acknowledgeExpiry`; silences notifications; today/expired only). **Never merge them.**
- **Android receiver:** `MY_PACKAGE_REPLACED` re-declared on the plugin's restore receiver so updates don't wipe alarms.
- **Functional vs UI-only:** notifications, cards, panel, banner: functional in code; banner/bell/stack **unverified by user**. No browser notifications. Dashboard "Expiring soon" is old look but functional.

---

## 11. NOTES

Created/edited in `#noteModal` (`prepareNoteModal`, `updateNote`, `noteStyleChanged`, `paintNoteRuling`, `noteBaselineOffset`,
`wireNoteBullets`, `noteToggleBulletLine`, `wireNoteReadToEdit`). Stored in `notes` store / `allNotes`. 1000-char cap (`maxLength`).
Per-note colour, ruling, size, title, lock. Bullets: `- `/`* ` → `• `, Enter continues a list. Search covers note text (`noteSearchSnippet`), **locked notes excluded**.
Quick-note and tags paths use `escapeHtml`. No attachments or categories on notes (UNKNOWN beyond that). Known problem: ruling travel with scroll was measured, not watched by a human.

---

## 12. SEARCH

`isSearchMode`, `isWithinSearchScope`, result cards (`createFolderSearchResultCard`, note snippets). Case-insensitive substring over
file names, folder names, note title/content; history in `docman_search_history_v1` (`addSearchHistory`). Suggestions dropdown
(`renderSearchSuggestions`) returns early on purpose. PDF in-document search is native, page level (pdfium text API; OCR for scanned pages;
cursive handwriting not reliably recognised). Performance: linear scan of in-memory `allFiles`/`allNotes`. UNKNOWN: exact ranking/sort of results.

---

## 13. OFFLINE / PWA

`manifest.json` exists. **No service worker** (`serviceWorker` not found in `app.js`/`index.html`). The product is the Capacitor APK, which
serves local assets; PWA install is not a supported target (and `main` branch holds an older PWA copy). All features except Billing work offline.
Google Drive import hands off to the Drive app. "Check for Updates" opens the Play Store.

---

## 14. CAPACITOR / ANDROID

- `appId com.docman`, `appName DOCMAN`, `webDir www`; android scheme https.
- Manifest: `MainActivity` (singleTask, portrait, exported), `PdfViewerActivity` (fullUser), `PdfTextService` (`:pdftext` process), FileProvider,
  boot/package-replaced receiver. `allowBackup=true` with `data_extraction_rules`/`full_backup_content` XML (**review contents: UNKNOWN**), `largeHeap=true`.
- Permissions seen: `USE_BIOMETRIC`, `SCHEDULE_EXACT_ALARM`, `WRITE_EXTERNAL_STORAGE` (≤ API 28), `uses-feature camera required=false`; others (e.g. notifications/boot) are
  declared by plugins (**full merged list UNKNOWN — inspect merged manifest**). No INTERNET claim in comments; billing needs Play services.
- Insets: `exposeNavBarInsetToCss()` is a read (global layout listener).
- Release signing: `android/keystore.properties` (gitignored; names: storeFile, storePassword, keyAlias, keyPassword).
- **Build commands used (Windows, Git Bash):**
```bash
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
cd docman-native && npx cap sync android
android/gradlew -p android installDebug        # installs "DOCMAN dev" (com.docman.dev)
android/gradlew -p android bundleRelease       # -> android/app/build/outputs/bundle/release/app-release.aab
```
  Copy the AAB into `DOCMAN Play Store Assets/release/` with a name carrying the versionCode. adb: `%LOCALAPPDATA%/Android/Sdk/platform-tools/adb.exe`.
  Verify an AAB from inside (manifest bytes for versionCode/name, `?v=` tags in `base/assets/public/index.html`, `jarsigner -verify`).

---

## 15. GOOGLE PLAY / PRO

**CODE:** `BillingPlugin` product id `docman_pro` (one-time), purchases read via `queryPurchasesAsync`; last answer cached in SharedPreferences
`docman_billing` used only if Play is unreachable; `restorePurchase()` in JS. 11 free tries (`FREE_TRIES`: scan, sign, highlight, fillform, redact, crop, ocr, imageedit, topdf, mergepdf, lock) mirrored in `FreeTries.java`
(keys must match). App Lock is never limited; unlocking is never restricted. **Dev builds (`*.dev`) auto-unlock Pro** by checking the real package id.

**PLAY CONSOLE (from project docs, not verifiable here):** Internal testing 67 / 1.0.0 (uploaded by user 16 Oct); Closed testing "Alpha" 61 / 1.0.0 (12 Oct);
Production inactive, production access granted 7 Oct; version code 64 refused as already used; Play "automatic protection" on (requires minSdk ≥ 24);
release notes need `<en-US>` tags; pre-launch report never generated. Whether the `docman_pro` product is **active/priced** in Console and license-tester setup: **UNKNOWN**.
Listing text/screenshots prepared in `DOCMAN Play Store Assets/` but **not pasted**. Rule: final public build reads versionName 1.0.0.

---

## 16. SECURITY / PRIVACY

- Documents are **not encrypted at rest** in app-private storage (Android sandbox only). Notes/metadata in IndexedDB/localStorage are **not encrypted**.
- Backups: optional password encryption (PBKDF2 key derivation + AES via WebCrypto, `encryptBackupBlob`); password min length 6 (deliberate). Unencrypted backups are plain.
- PIN: salted PBKDF2 (`docman_pin_v3`), legacy unsalted SHA-256 (`docman_pin_v2`) migrated on unlock; failure counter + cooldown in localStorage (**client-side, editable on a rooted device**).
- Biometric via `androidx.biometric`. Per-item "locked" flag; locked notes excluded from search. Whether a locked *file's content* is encrypted: UNKNOWN (assume flag-gating only).
- `allowBackup=true` — Android auto-backup may copy app data; check XML rules (UNKNOWN).
- Network: only Google Play Billing. Privacy policy live at `abjincy-dot/docman-privacy` (`cc28425`); mirror in `DOCMAN Play Store Assets/privacy-policy/`.
- Six unescaped-filename `innerHTML` sinks were fixed; always use `escapeHtml()`.

---

## 17. PERFORMANCE

Optimised: thumbnails (v9), streaming backup v2, per-page pdfium text search, scale-only zoom, Excel used-area drawing.
Not optimised / risks: whole-app state is in memory (`allFiles`, `allNotes` mirror everything); `app.js` is ~1 MB parsed at start;
very large text notes; PDFBox edits on 400+ page PDFs rely on `largeHeap` (OOM caught in `save()`); Android 500-alarm cap (budget in expiry only);
WebView edge-to-edge insets; blank pages in fast PDF scroll (accepted).

---

## 18. KNOWN BUGS / OPEN DEFECTS (supported by repo docs/code only)

| BUG | SYMPTOM | LIKELY CAUSE | FILES / FUNCTION | STATUS | POSSIBLE FIX | RISK |
|---|---|---|---|---|---|---|
| Reminders can exceed Android's 500-alarm cap | Whole app crashes on launch (plugin throws on own thread; try/catch can't help) | No budget check for reminders; expiry alone uses `ALARM_BUDGET` | `www/app.js` reminder scheduling (`REMINDERS_KEY` paths) | Open | Share one alarm budget across expiry + reminders | Medium: touches alert scheduling |
| Dev-only features unverified | Banner/bell/stack/zoom/Excel may misbehave on phone | Phone screen was locked during screenshots; user hasn't confirmed | `showExpiryCardsPopup`, `updateAttentionBell`, `wirePinchZoom` | Open | User test on DOCMAN dev | Low |
| Release build never run by anyone for 66/67 Java changes | R8 could break signature stroke/min size | debug build skips R8 | `SignatureDrawView`, `PdfViewerActivity`, `PdfSignaturePlacementView` | Open | Install from Internal testing and use Sign | Low |
| Merged banner / 21:00 stop unobserved | Possible stacked banners or alerts after 21:00 | Plugin patch only verified by `git apply --check` | patch file, `TimedNotificationPublisher` | Open | Observe on an expiry day; `dumpsys alarm` | Medium |
| Bottom of text viewer sits under nav bar mid-scroll | Last lines hidden | Same edge-to-edge/`innerHeight` trap | text viewer CSS | Open (offered) | `max(env(),--nav-bottom)` padding | Low |
| Stale root `app.js`/`style.css` | Edits there do nothing | Leftover copies | repo root | Open | Delete after user OK | Low |
| Search folder path lost | Duplicate-named files indistinguishable | Suggestions dropdown disabled | `renderSearchSuggestions` | Open (decision pending) | Put path on result cards | Low |
| `showConfirmModal` without `title` | Heading reads "View"/"Delete" | `title || resolvedOkLabel` | `showModal` | Open sweep | Pass `title` everywhere | Low |
| Counted state in localStorage lost on WebView lazy flush | "No bell/banner" confusion in tests | one-day store | `markAttnSeen`, `attnStamp` | Known trap | n/a | — |

---

## 19. STATUS TABLE

| Feature | Status | Notes | Files |
|---|---|---|---|
| Departments/folders/files | ✅ | Shipped | `app.js` |
| Notes | ✅ | Shipped in 63/65+ | `app.js`, `style.css` |
| Native PDF viewer + edit tools | ✅ | Shipped; 66/67 Java never run as release by user | `PdfViewerActivity.java` etc. |
| OCR, scanner | ✅ | | `PdfViewerActivity`, `DocumentScannerPlugin` |
| Backup/restore (encrypted option) | ✅ | Large-library device test for v2 backup: UNKNOWN | `app.js` §backup |
| App Lock / biometrics | ✅ | | `BiometricAuthPlugin`, `AppLockGate` |
| Pro billing / free tries | 🟡 | Code complete; Console product state UNKNOWN | `BillingPlugin`, `FreeTries`, `app.js` |
| Expiry alerts (7/3/1/day/overdue, merge) | 🟡 | In 63+; merge/21:00 unobserved | `app.js`, patch |
| Alarm budget | 🟡 | Expiry only; **dev only**; reminders none | `app.js` |
| Attention banner + bell | 🟡 | Dev only, unverified | `app.js`, `style.css` |
| Text/Word/Excel viewers, pinch zoom | 🟡 | Text in 67; rest dev only | `app.js` |
| Reminders merged banner | ⚪ | offered | — |
| PDF first-page card picture | ⚪ | needs native method | `PdfNativePlugin` |
| Service worker / PWA offline | ⚪ | not implemented | — |
| Department timeline / equipment records | ⚪ | not in code | — |
| Play listing live | 🟡 | Prepared, unpasted | `DOCMAN Play Store Assets/` |

---

## 20. IMPORTANT FUNCTIONS (all in `www/app.js` unless noted)

| Function | Purpose / warning |
|---|---|
| `initDB()` (~2300) | Opens DocmanDB v12, creates missing stores; rejects on `onblocked`. Don't add migrations casually. |
| `saveFolderStructure()`, `saveFolderMeta()`, `saveDeptColors()`, `saveDeptIconOverrides()` | Persist singletons in `folderStructure`. |
| `cacheFileAsBlob(folderPath,fileName,blob,existing)` (~3044) | Writes blob + rewrites file record; **field list is one of 8 copy sites**. |
| `deleteBlobFromDB`, `renameBlobInDB`, `readBlobFromFS`, `writeBlobToFSChunked` | File bytes; keep paths and alerts in sync. |
| `migrateBase64ToBlob()` | One-time legacy migration, guarded by `docman_migration_done`. |
| `getAllExpiringFiles`, `getExpiryStatus`, `getAttentionSets` (~5743) | The single definition of "needs attention". |
| `imgScheduleExpiryNotification` (~3388), `rescheduleAllExpiryNotifications` (~3485), `queueExpiryAlertRefresh`, `reKeyFileAlerts`, `sweepOrphanedExpiryAlarms` | All alarm creation/cancel; honour `ALARM_BUDGET`. |
| `acknowledgeExpiry` (~3534), `markAttnSeen`, `clearExpiryWithWarning`, `setFileExpiryDate` | Two kinds of acknowledging; don't merge. |
| `handleNotificationAction` (~3631) | Notification taps; sets launch behaviour (`launchedFromNotification`). |
| `showExpiryCardsPopup`, `showExpiryCardsFor`, `checkLaunchAlertsOnLoad`, `armLaunchBell`, `updateAttentionBell`, `revealFileInFolder` | Banner / bell. |
| `loadReminders`, `saveReminders`, `advanceReminderOccurrence`, `reminderOccurrenceKey` | Reminder model. |
| `requireProTool`, `canUseProTool`, `showPaywall`, `buyPro` (~12851), `restorePurchase`, `onProUnlocked`, `updateProBadge` | Pro gate; `entitlement`, `devProOverride`. |
| `importPendingEditedCopies` (~12951) | Files edited PDFs from `cache/edited/`. |
| `writeBackupStream`, `importBackupV2`, `commitStagedRestore`, `encryptBackupBlob`/`decrypt…` | Backup/restore; a restore bug lost real data once. |
| `goBack`, `markNavReturn`, `render`, `selectDepartment`, `goHome` | Navigation/state. |
| Java: `BillingPlugin.PRODUCT_ID`, `FreeTries.ALL`, `PdfNativePlugin.openPdf`, `PdfViewerActivity.saveEditedCopy`, `MainActivity.exposeNavBarInsetToCss` | Native contracts with JS. |

## 21. IMPORTANT STATE
Globals (`app.js` ~2273+): `db`, `allFiles` (path → file[]), `allNotes`, `fileSystem` (tree; **shape is load-bearing**), `deptColors`, `deptIconOverrides`,
`folderMeta`, `recycleBin`, `currentPath`, `currentActiveTab`, `isSearchMode`, `editingNoteId`/`editingNoteFolder`, `uploadInProgress`, `navReturn`,
`entitlement`, `devProOverride`, `attentionBellArmed`, `launchedFromNotification`, `remindersCal*`. Mutating `fileSystem`/`allFiles` without the matching save
corrupts persisted state; changing `uploadInProgress` wrongly traps/frees back navigation.

## 22. DEPENDENCIES
See §3 for exact versions. Critical: Capacitor core/android, local-notifications (+patch), filesystem, pdfium viewer libs, PDFBox, billing 8.0.0, ML Kit libs.
`npm audit` was clean after `@capacitor/android ^6.2.2`. **No tests, lint or type config exist.**

## 23. COMMANDS
```bash
npm install                      # also runs patch-package (postinstall)
node --check www/app.js          # only syntax check available
npx cap sync android
node tools/serve-www.js          # browser preview on :4173
android/gradlew -p android installDebug
android/gradlew -p android bundleRelease
```
No test or lint scripts exist (`package.json` only has `sync`, `open`).

## 24. ENV / SECRETS
No env vars. Secret-bearing local files (values not shown): `android/keystore.properties` (storeFile, storePassword, keyAlias, keyPassword),
`android/local.properties` (SDK path). `google-services.json` intentionally absent. `JAVA_HOME` must be set to Android Studio's jbr.

## 25. GIT
Branch `docman-2026-09-24-pdf-search-ui-animations`, HEAD `592c388` ("Refresh PROGRESS, CURRENT_STATE and HANDOVER for the end of the 15 Oct chat"); `main` exists locally and on origin (older PWA files).
Working tree **not clean**: modified `CLAUDE.md, CURRENT_STATE.md, HANDOVER.md, PROGRESS.md, android/app/build.gradle` (versionCode 67), `www/app.js, index.html, style.css`
(≈1,517 insertions / 378 deletions, all the 16 Oct work) and the Play Store Assets privacy page; many untracked asset folders and `../backups/`.
**All 16 Oct work (AAB 67 and the dev-only features) is uncommitted.** Recent commits: 592c388, d0ba71e (Release 1.0.0 (66)), 5a05e4d, 02e4617, 76f4d35, aa0b45d, db1b3e8, f88adc1 (minSdk 24).

## 26. HISTORY (from docs and commits)
Native PDF viewer features shipped first (roadmap Copy Text → Redaction complete); EmbedPDF trial removed. 61 → Closed testing 12 Oct; 62 never uploaded; 63 (13 Oct) alarm-update fix and 30-min cadence;
65 note editor + PDF scroll fix (never uploaded); 66 expiry cards, banner, Stroke row (never uploaded); 67 (16 Oct) text viewer, uploaded to Internal testing. After 67: banner/bell, viewers,
alarm budget, Excel, zoom — dev only. Earlier history (<58) UNKNOWN; see `docs/archive` and `HANDOVER.md` §2–9.

## 27–28. DECISIONS & DANGEROUS AREAS
See `DECISIONS.md`. Dangerous areas: IndexedDB `onupgradeneeded`/record shapes (8 copy sites); `fileSystem` tree shape; inline `onclick` handlers (don't prune "unused" functions);
plugin patch (hand-written; `patch-package` can't regenerate it here); `registerPlugin` list in `MainActivity` (the build passes even if one is dropped); `FREE_TRIES` ↔ `FreeTries.ALL`;
alarm counts; bottom-edge/nav-bar math; CRLF Java files; `adb screencap` is black on a locked phone; never `innerHTML +=` on wired containers; never touch the user's test data in DOCMAN dev or run `pm clear`.

## 29. PRIORITIES
1. **Critical:** get a build with the alarm-budget fix to a device (bump 68 / 1.0.0 after user confirms); give reminders an alarm budget; user verification of dev-only work.
2. **Important:** run the release build on Internal testing (Sign, viewers, banner); commit the uncommitted work; paste store listing; pre-launch report via Play support.
3. **Improvements:** merged reminder banner, nav-bar padding in text viewer, search path on cards, PDF first-page pictures.
4. **Later:** remove stale root copies, split `app.js`, add a smoke-test script.

## 30. FIRST THING TO DO
Ask the user to run the DOCMAN-dev checklist (`CURRENT_STATE.md` "Next" #1) — it gates every build — and in parallel prepare (do not build) the reminder alarm-budget change described in `NEXT_TASK.md`.

## 31. RULES FOR THE NEXT AI DEVELOPER
Generic: don't rewrite working code; inspect before changing; keep the UI unless asked; no schema change without migration planning; don't remove features;
a feature isn't working because UI exists; test incrementally; check dependents of shared functions; small reversible changes; update `CURRENT_STATE.md`/`PROGRESS.md`/`HANDOVER.md`.
DOCMAN-specific: (1) never build an AAB without telling the user versionCode/versionName and getting a yes; never upload to Play; final public AAB is **1.0.0**, versionCode only goes up.
(2) Verify builds from inside the AAB, not the build log. (3) Show a rendered PNG for any look change and wait for OK. (4) End replies with a token readout and say explicitly whether the user must test.
(5) Debug builds go to "DOCMAN dev" — tell the user to open that icon. (6) Files/notes/folders use the ⋯ menu; only departments long-press. (7) `showConfirmModal` always gets a `title`.
(8) Use `max(env(safe-area-inset-bottom), var(--nav-bottom))` for bottom edges. (9) Keep the alert schedule and the 3-day banner window as is. (10) Keep counted vs stop-reminding separate; bell only armed by launch.
(11) Card pictures from names, never contents. (12) Java edits: CRLF; `node --check` after JS edits; write long edit scripts to files. (13) Python isn't installed — use Node.
(14) Never modify or "fix" the user's test data; back up `docman_reminders_v1` before staging anything.

## 32. FINAL SUMMARY
**State:** 1.0.0 / versionCode 67 on Play Internal testing; a larger body of 16 Oct work is in the working tree and DOCMAN dev only, uncommitted and unverified.
**Works:** core document management, native PDF tools, notes, expiry alerts, backup, Pro code. **Doesn't work:** nothing known broken. **Partial:** banner/bell/viewers/zoom (unverified), reminders alarm budget, store listing.
**Next:** user test → fix → commit → 68 / 1.0.0 (confirm) → Internal testing. **Risks:** alarm cap, unrun R8 build, 8-site file-record copy, hand-written plugin patch, single test device, uncommitted work.
**Important files:** `www/app.js`, `www/style.css`, `www/index.html`, `PdfViewerActivity.java`, `BillingPlugin.java`, `android/app/build.gradle`, `patches/…patch`, `CURRENT_STATE.md`.
**First task:** see `NEXT_TASK.md`.
