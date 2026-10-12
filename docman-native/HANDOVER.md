# DOCMAN — Handover (as of 12 Oct 2026)

Start a **new chat** and point it at this file plus `CLAUDE.md` and `ISSUES.md`.
Everything below is the state of the work; nothing here needs re-discovering.

---

## 1. Standing rules (do not break these)

- **Never build an AAB for Play** without first telling the user the `versionCode` /
  `versionName` and waiting for a yes.
- **Never upload to Play** unless told to.
- Verify a build from **inside the APK/AAB**, never from the build log.
- Always say **explicitly** whether the user has to test something.
- Send a **rendered PNG** of any UI change and wait for approval before building to the phone.
- End every reply with a **token readout**.
- `installDebug` installs the separate **"DOCMAN dev"** app (`com.docman.dev`), not the real one.
- Never `innerHTML +=` on a container the app already wired up.
- The user has said: *verify things yourself instead of repeatedly asking me to test.*
- Files/notes/folders use the **⋯ row menu**; only departments use long-press.

## 2. Where the repo stands

- Branch: `docman-2026-09-24-pdf-search-ui-animations`
- `versionCode 58`, `versionName 1.0.0` in `android/app/build.gradle`.
  **The next Play build is 59** — not built, not approved yet.
- Cache markers in `www/index.html`: `app.js?v=583`, `style.css?v=628`.
- **Everything from the last two days is dev-only.** Nothing since the last Play
  upload has been shipped.

### Open question the user never answered
A Play Console **"Your update is live"** notification showed on their phone
(created 12 Oct 2026, ~12:0x). Nothing from these sessions was built for Play, so
it is unclear which build that is. Worth asking once.

## 3. Issues #1–#11 — all closed

| # | Reported | Actual cause | Fix |
|---|---|---|---|
| 1 | Duplicate settings rows | "Reminder delivery" repeated what Expiry & Reminder alerts already offered | Row removed |
| 2 | Add Reminder button not highlighted | — | Yellow highlight, only on the Reminders tab; `+` replaced by the word **ADD**, kept outside the tab track |
| 3 | Note content search broken | Search worked; the result card showed nothing | Snippet added. **Locked notes are now excluded from search** |
| 4 | No Copy/Paste toolbar | *Not* selection. A global `contextmenu` `preventDefault()` killed Chromium's menu path | Handler now returns early for editable fields and for live selections |
| 5 | Press-and-hold preview | User asked for it, then asked to remove it | Removed |
| 6 | FILES/NOTES default | — | Done |
| 7 | Alert outlives its document | Delete was fine; **rename/move/folder-rename** were not | `reKeyFileAlerts()` + `sweepOrphanedExpiryAlarms()` |
| 8 | Expiry notification every 30 min | Not stacking — cadence. 38 alarm slots per document | `EXPIRY_DAY_HOURS = [9, 17]` → 12 slots. Legacy 29 still cancelled on upgrade |
| 9 | Paste into note | — | Works |
| 10 | Lock screen over other apps | Not the lock screen — the **biometric prompt** | Fixed |
| 11 | Back button | Mostly fine; only the jump-into-a-folder sites were wrong | `navReturn` (below) |

**The recurring lesson, worth repeating:** *the reported symptom was real and the
cause was somewhere else every single time.* Measure before theorising.

## 4. Key mechanisms added

### Back navigation (`www/app.js`)
```js
let navReturn = null;   // { path: string[], restore: () => void }
function markNavReturn(restore) { navReturn = { path: currentPath.slice(), restore }; }
```
`goBack()` honours it first (unless in search mode), then nulls it.
Marked at five jump sites: Statistics largest file, Statistics largest folder,
Dashboard department rows, Dashboard expiring rows, Expiring panel.
Cleared in `goHome`, `selectDepartment`, `navigateToBreadcrumb`, subfolder entry.
`returnToDashboard` was removed entirely.

Two traps already hit here: the settings panel id is **`settingsPanel-statistics`**
(not `statisticsScreen`), and the Expiring panel's tab must be captured **at leave
time**, because `close()` nulls `expdocLastTab` before restore runs.

### Expiry date must start tomorrow
`showDateModal` gained `opts.minTomorrow`, used only by the two expiry call sites.
Calendar cell gets `disabled`, plus a Save-time guard.

### Note editor
- Six paper colours, each with `from` / `to` / `paper` / `edge`.
- Ruled page toggle; px text-size stepper (11–24, default 15).
  Font size **must** be set with `!important` — a short-screen media query sets
  `font-size: 0.86rem !important`.
- **Read mode**: opens read-only so no keyboard appears; tapping the text starts
  editing, but clicks within 600 ms of opening are ignored (that is the tap that
  opened it).
- `updateNote` used to take `color` and silently drop it. Fixed.
- Head now holds: pen icon (36px) → title input → count → ✕. The old
  "Edit Note" headline is gone; the note's own title is the headline, with an
  underline under it so it still reads as an editable field, bottom-aligned with
  the icon.

### Tab pill
Measured with **layout** (`offsetLeft` / `offsetWidth` / `offsetTop`), never
`getBoundingClientRect()` — that reports painted geometry and ancestor transforms
threw it off. `openRecentsView` re-places it on a double rAF.

### Scan
`SCANNER_MODE_FULL` (was `BASE_WITH_FILTER`). After a scan saves, a prompt asks
for a name. The ML Kit scanner UI itself is a Play Services screen launched by
IntentSender — **it cannot be restyled**.

### Native insets (`MainActivity.java`)
`exposeNavBarInsetToCss()` is now a **read** (`ViewCompat.getRootWindowInsets` on a
global-layout listener), not an interception. `setOnApplyWindowInsetsListener`
*replaces* a view's own `onApplyWindowInsets`, which broke things.

## 5. Security pass (done)

Applies to a serverless native app; most of a generic web checklist does not.
Two real findings, both fixed:
- `@capacitor/android` → `^6.2.2` (GHSA-rvm3-566m-v7fv). `npm audit` now clean.
  Both local-notifications patches survive via `patch-package` + `postinstall`.
- **Six unescaped file names** flowing into `innerHTML` — Quick note (×2),
  Tags (×2), New expiry date, Expiry date — now `escapeHtml()`.

Deliberately **not** changed: the 6-character backup password minimum (flagged to
the user, their call).

## 6. Testing harness (reuse this, it works)

- `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then Node 24's
  global `WebSocket` / `fetch` to drive the debuggable WebView.
- Scripts live in the session scratchpad (`lib.js` = `connect()` / `sleep`,
  `headshot.js` = open a note + screencap).
- To prove a selection toolbar exists: tap to focus →
  `adb shell input keycombination 113 29` (Ctrl+A) → read `dumpsys window windows`.
  Window sizes are unambiguous: **selection handles 124x62, caret handle 56x68,
  floating toolbar 1622x723**.
- **A long press in an editable field places a caret, it does not select a word.**
  Double-tap or Ctrl+A does. A long-press test proves nothing.

## 7. Still to do

**Needs a human with the phone:**
- Long-press an image/card → the WebView's own menu must **not** appear
  (verified synthetically, `defaultPrevented` true; not verified with a finger).
- The row ⋯ button sitting just above the nav bar still opens its menu
  (the inset code was rewritten).
- Capacitor smoke test: open a PDF, fingerprint unlock, backup "Save a copy",
  scan, share.

**Queued work:**
- Build **59** for Play — tell the user the version and wait for a yes.

**Deferred in `ISSUES.md`:**
- PDF phrase search
- Opacity dial direction
- Backup password minimum (left at 6 on purpose)

## 8. Mistakes made in these sessions — don't repeat them

1. Mistook **my own stand-in toolbar** for Android's and blamed the inset listener.
   The real cause was the `contextmenu` handler.
2. "Ruled out CSS" using a long press — an invalid test (see §6).
3. Wrote `/s+/g` instead of `/\s+/g` **twice** — heredoc/template literals eat
   backslashes, so note snippets lost every "s". Write replacements to a file or
   use line-indexed `sed` instead of inline heredocs.
4. Deleted `registerPlugin(BackupSavePlugin.class)` while removing another plugin.
   **The build still passed** — the class compiled in, it just was not on the
   bridge. Caught only by asking the running app for all 14 plugins by name.
5. `sed -i` on `max-width: 380px` hit **four** media queries instead of one.
   Always count matches before writing.
6. Installed builds and restarted the app **while the user was mid-test**.
   Ask first if they said they are testing.
7. Changed the user's own "SkIn" note during testing (colour/lined/font).
   Restored it. Treat their data in DOCMAN dev as theirs.
