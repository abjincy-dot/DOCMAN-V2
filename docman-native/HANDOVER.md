# DOCMAN — Handover (12 Oct 2026)

Start a **new chat** and point it at this file, plus `CLAUDE.md` and `ISSUES.md`.
Everything here is settled; none of it needs re-discovering.

---

## 1. Standing rules — do not break these

- **Never build an AAB for Play** without first telling the user the `versionCode` /
  `versionName` and waiting for a yes.
- **Never upload or publish to Play** unless told to. The user presses the final button.
- Verify a build from **inside the APK/AAB**, never from the build log and never from
  the number the Console shows.
- Always say **explicitly** whether the user has to test something.
- Send a **rendered PNG** of any UI change and wait for approval before building to the phone.
- End every reply with a **token readout**.
- `installDebug` installs the separate **"DOCMAN dev"** app (`com.docman.dev`), never the
  real one. Tell the user to open that icon.
- Never `innerHTML +=` on a container the app already wired up.
- The user has said: *verify things yourself instead of repeatedly asking me to test.*
- Files/notes/folders use the **⋯ row menu**; only departments use long-press.

## 2. Where everything stands, 12 Oct 2026

| | |
|---|---|
| Live on **Closed testing – Alpha** | **versionCode 61 / 1.0.0**, published 12 Oct |
| **Production** | **Inactive** — promoting 61 needs no new upload |
| Next build number | **62** (59 and 60 were built but never accepted) |
| Branch | `docman-2026-09-24-pdf-search-ui-animations` |
| Cache markers in `www/index.html` | `app.js?v=583`, `style.css?v=629` |
| Store listing icon | new flat one, live |
| Privacy policy | 12 Oct version, live |

**61 was verified properly**: the installed APK was pulled off the phone and its
`assets/public/index.html` read for the `?v=` markers. Do this after every Play upload —
the Console's version number alone once hid a stale web layer for days.

### minSdk is now 24
Play refused versionCode 60 outright:

> *Play automatic protection requires a minimum SDK version of 24 or higher. The uploaded
> App Bundle has a minimum SDK version of 23.*

Automatic protection is **on** at app level and worth keeping — the app has a paid tier
(`docman_pro`) that it protects. So `android/variables.gradle` went 23 → 24 and **Android 6
is no longer supported**. Nobody lost the app; only 12 testers had it.

### Release notes need language tags
The Console box wants `<en-US>` … `</en-US>` around the text. Plain text gives
*"Line 1: text outside language tags. Release notes provided for 0 language."*

### Publishing overview
Submitting while another review runs offers **"Restart review"** — it cancels and restarts,
but one review covering everything still beats two in sequence. After submitting, the page
runs *"quick checks… minutes remaining"* and looks like nothing happened. It did.

## 3. The one thing still unresolved

**A pre-launch report has never been generated for this app** — not for 58, not yet for 61,
although both reached Closed testing, which is supposed to trigger one.

- The Pre-launch report **Settings page has no on/off switch**, so nothing was disabled.
- Google's own help: reports arrive within an hour, sometimes a few hours; if nothing comes
  within **two days**, upload a new bundle to trigger a fresh one.
- 61 went up on 12 Oct. If it also produces nothing, the next step is
  **Play Console → Help → Contact support**, *not* another build.

This is an extra safety net, not a gate: the 12-tester / 14-day requirement was already
satisfied and **production access was granted 7 Oct**. The app can launch without it.
But it also means **nothing has ever run on a device other than the user's Galaxy S23**.

## 4. Issues #1–#11 — all closed, all shipped in 61

| # | Reported | Actual cause | Fix |
|---|---|---|---|
| 1 | Duplicate settings rows | "Reminder delivery" repeated Expiry & Reminder alerts | Row removed |
| 2 | Add Reminder button not highlighted | — | Yellow highlight on the Reminders tab only; `+` became the word **ADD** |
| 3 | Note content search broken | Search worked; the result card showed nothing | Snippet added. **Locked notes excluded from search** |
| 4 | No Copy/Paste toolbar | *Not* selection. A global `contextmenu` `preventDefault()` killed Chromium's menu path | Handler returns early for editable fields and live selections |
| 5 | Press-and-hold preview | Asked for, then asked to remove | Removed |
| 6 | FILES/NOTES default | — | Done |
| 7 | Alert outlives its document | Delete was fine; **rename/move/folder-rename** were not | `reKeyFileAlerts()` + `sweepOrphanedExpiryAlarms()` |
| 8 | Expiry notification every 30 min | Cadence, not stacking. 38 alarm slots per document | `EXPIRY_DAY_HOURS = [9, 17]` → 12 slots; legacy 29 still cancelled on upgrade |
| 9 | Paste into note | — | Works |
| 10 | Lock screen over other apps | Not the lock screen — the **biometric prompt** | Fixed |
| 11 | Back button | Only the jump-into-a-folder sites were wrong | `navReturn`, below |

**The lesson, every single time:** *the reported symptom was real and the cause was somewhere
else.* Measure before theorising.

## 5. Key mechanisms

### Back navigation (`www/app.js`)
```js
let navReturn = null;   // { path: string[], restore: () => void }
function markNavReturn(restore) { navReturn = { path: currentPath.slice(), restore }; }
```
`goBack()` honours it first (unless in search mode), then nulls it. Marked at five jump
sites: Statistics largest file, Statistics largest folder, Dashboard department rows,
Dashboard expiring rows, Expiring panel. Cleared in `goHome`, `selectDepartment`,
`navigateToBreadcrumb`, subfolder entry. `returnToDashboard` was removed.

Two traps already hit: the settings panel id is **`settingsPanel-statistics`** (not
`statisticsScreen`), and the Expiring panel's tab must be captured **at leave time**,
because `close()` nulls `expdocLastTab` before restore runs.

### Note editor
- Six paper colours (`from` / `to` / `paper` / `edge`), ruled-page toggle, px text-size
  stepper (11–24, default 15). Font size **must** carry `!important` — a short-screen media
  query sets `font-size: 0.86rem !important`.
- **Read mode**: opens read-only so no keyboard appears; tapping the text starts editing,
  but clicks within 600 ms of opening are ignored (that is the tap that opened it).
- `updateNote` used to accept `color` and silently drop it. Fixed.
- The head holds: pen icon (36px) → title input → count → ✕. The note's own title is the
  headline, with an underline so it still reads as an editable field.

### Expiry date must start tomorrow
`showDateModal` gained `opts.minTomorrow`, used only by the two expiry call sites.
Calendar cell gets `disabled`, plus a Save-time guard.

### Tab pill
Measured with **layout** (`offsetLeft` / `offsetWidth` / `offsetTop`), never
`getBoundingClientRect()` — that reports painted geometry and ancestor transforms threw it
off. `openRecentsView` re-places it on a double rAF.

### Scan
`SCANNER_MODE_FULL`. After saving, a prompt asks what to call the scan. The ML Kit scanner
UI is a Play Services screen launched by IntentSender — **it cannot be restyled**.

### Native insets (`MainActivity.java`)
`exposeNavBarInsetToCss()` is a **read** (`ViewCompat.getRootWindowInsets` on a global-layout
listener), not an interception. `setOnApplyWindowInsetsListener` *replaces* a view's own
`onApplyWindowInsets`, which broke things.

## 6. Security pass — done

Serverless native app, so most of a generic web checklist does not apply. Two real findings,
both fixed:
- `@capacitor/android` → `^6.2.2` (GHSA-rvm3-566m-v7fv). `npm audit` clean. Both
  local-notifications patches survive via `patch-package` + `postinstall`.
- **Six unescaped file names** reaching `innerHTML` — Quick note (×2), Tags (×2), New expiry
  date, Expiry date — now `escapeHtml()`.

Deliberately **not** changed: the 6-character backup password minimum (flagged; the user's call).

## 7. Testing harness — reuse it, it works

- `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then Node 24's global
  `WebSocket` / `fetch` to drive the debuggable WebView.
- To prove a selection toolbar exists: tap to focus → `adb shell input keycombination 113 29`
  (Ctrl+A) → read `dumpsys window windows`. Window sizes are unambiguous: **selection handles
  124x62, caret handle 56x68, floating toolbar 1622x723**.
- **A long press in an editable field places a caret; it does not select a word.** Double-tap
  or Ctrl+A does. A long-press test proves nothing.
- To verify a shipped build: `adb shell pm path com.docman`, pull each APK, and read
  `assets/public/index.html` out of `base.apk` for the `?v=` markers.

## 8. Still open

**Needs the phone and a human:**
- Long-press an image/card → the WebView's own menu must **not** appear (verified
  synthetically only).
- The row ⋯ button just above the nav bar still opens its menu (the inset code was rewritten).

**Decisions waiting on the user:**
- Promote 61 to **Production** (no new upload needed).
- The **feature graphic still carries the old purple icon** — a visible mismatch with the new
  store icon.

**Deferred in `ISSUES.md`:**
- PDF phrase search
- Opacity dial direction
- Backup password minimum (left at 6 on purpose)

**Settled, do not re-propose:**
- Fast-scrolling a 3000+ page PDF shows blank white pages until pdfium catches up. **Normal,
  not a bug.** A grey page backing was tried to make it read as "loading"; the user rejected
  it. Pages stay white.

## 9. Mistakes made — do not repeat them

1. Mistook **my own stand-in toolbar** for Android's and blamed the inset listener. The real
   cause was the `contextmenu` handler.
2. "Ruled out CSS" using a long press — an invalid test (see §7).
3. Wrote `/s+/g` instead of `/\s+/g` **twice** — heredocs and template literals eat
   backslashes, so note snippets lost every "s". Write replacements to a file, or use
   line-indexed edits, instead of inline heredocs.
4. Let bash eat **backticks** inside a `node -e` string, silently deleting two file paths
   from a document. Quote carefully or write the script to a file first.
5. Deleted `registerPlugin(BackupSavePlugin.class)` while removing another plugin. **The build
   still passed** — the class compiled in, it just was not on the bridge. Caught only by
   asking the running app for all 14 plugins by name.
6. `sed -i` on `max-width: 380px` hit **four** media queries instead of one. Count matches
   before writing.
7. Installed builds and restarted the app **while the user was mid-test**.
8. Changed the user's own "SkIn" note during testing (colour/lined/font). Restored it. Their
   data in DOCMAN dev is still their data.
9. Put a finished AAB in `Desktop\DOCMAN Play Store Assets\` — the **stray** folder whose name
   is nearly identical to the real one inside `Desktop\DOCMAN PLAY STORE\`. That folder once
   burned versionCode 54. The real one is
   `Desktop\DOCMAN PLAY STORE\DOCMAN Play Store Assets\release\`.
