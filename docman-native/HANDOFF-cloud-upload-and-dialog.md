# HANDOFF — cloud upload rework, picker fixes, confirmation dialog

Session of **2026-09-25**. Branch `docman-2026-09-24-pdf-search-ui-animations`.
Three commits: `760c9c2`, `7696602`, `2a6e1af`.

Read this instead of re-deriving anything below. Several findings here were
measured on the device over many rounds and are expensive to rediscover.

---

## Current state

| | |
|---|---|
| Phone (TEST / `com.docman.dev`) | `style.css?v=429`, `app.js?v=408` |
| Release built, **not uploaded** | `DOCMAN Play Store Assets/release/DOCMAN-1.5.0-versioncode37.aab` |
| versionCode / versionName | 37 / 1.5.0 |
| Signer | `CN=Abish Rajan`, SHA256 `D2:EA:97:60:A3:80:15:E5:4B:84:01:D7:63:8C:A1:0A:E5:5B:F7:10:4B:17:01:C0:CC:97:46:82:F6:FC:38:C5` |
| Play Console | untouched — uploads are the user's, always |

Earlier AABs 34/35/36 in that folder are **superseded**; 36 in particular has a
Drive button that opens in the wrong place.

---

## Build rules that cost time when forgotten

- **`npx cap copy android` before every gradle build.** Skipping it packages
  stale `www/`. This silently wasted three rounds: the phone ran `app.js?v=392`
  while fixes were "verified" from the build log.
- **Verify from inside the installed APK**, not the build log:
  ```bash
  APKPATH=$(adb shell pm path com.docman.dev | tr -d '\r' | sed 's/package://' | head -1)
  adb shell "unzip -p $APKPATH assets/public/index.html" | grep -ao 'app.js?v=[0-9]*'
  ```
- **Bump both** `style.css?v=` and `app.js?v=` in `index.html` on every change
  (project rule in CLAUDE.md).
- Env each new shell needs:
  ```bash
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  export PATH="$JAVA_HOME/bin:$LOCALAPPDATA/Android/Sdk/platform-tools:$PATH"
  ```
- No Python, no ImageMagick, no `sharp` on this machine. `/c/Windows/system32/convert`
  is **not** ImageMagick. Image work was done with a hand-written PNG codec on
  Node's built-in `zlib`.

---

## Measured facts about cloud uploads (do not re-test)

Google Drive, 287 MB file, on this device:

```
openInputStream() blocks            51.0 s     ← the entire Drive download
actual byte copy afterwards          0.7 s     ← 301,004,571 bytes
```

- **Drive does not stream.** `openInputStream()` returns only when the file is
  fully materialised, then hands over a finished file. There are no intermediate
  bytes to count during the wait.
- **Drive publishes no progress.** Its document row was queried once a second
  for the whole 51 s: `_size` constant, `flags=455` (no `FLAG_PARTIAL`), and
  **no extras at all**. A live MB count during that phase is impossible for any
  app, not just DOCMAN.
- Enumerating Drive's roots is refused outright:
  `SecurityException: ... requires that you obtain access using ACTION_OPEN_DOCUMENT`.

### What was built instead

- Name + total size are reported **immediately** (native emits before the
  blocking read).
- During the wait: an **estimate** from the transfer rate this phone last
  achieved (`docmanCloudRateBps` in localStorage, seeded 5.6 MB/s, EMA-updated,
  samples under 20 MB or 3 s discarded). Linear to 85%, then eased toward 99%
  so it never stalls — a hard 95% cap read as a hang.
- Real byte counts take over the moment they exist.
- **`PdfNative.copyPickedFile`** copies the picked file natively instead of
  `writeFileToFS()` pulling it into JS and base64-ing it back 4 MB at a time —
  72 bridge round trips for 287 MB, which is what made "Uploading 1 of 1" hang
  for minutes. Verified by read-back at the right size, falls back to the
  chunked write on any mismatch. 98 KB file: **159 ms** pick→saved.

### Two dead ends, recorded so they aren't retried

- **`evaluateJavascript` push silently delivered nothing here.** Native logged
  the copy running and finishing; the UI-thread callback never returned a value.
  The web layer now **pulls** via the plugin bridge (`PdfNative.getCopyProgress`),
  the path every other native call already uses.
- **The card stopped repainting mid-download.** JS kept running (bridge calls
  fired every 250 ms) but the WebView composited no new frames, so text written
  to the card never reached the screen. Progress reports now force a repaint.

---

## Picker findings

- **Never launch a picker aimed at the Drive package.** Drive accepts the
  intent, starts, and finishes `RESULT_CANCELED` in ~12 ms — measured 12, 13,
  17, 12 ms across four attempts, never once succeeding. The old code only had
  an `ActivityNotFoundException` fallback, so the Google Drive menu item did
  nothing at all.
- **`EXTRA_INITIAL_URI` must be a DOCUMENT uri.** Android honours the document
  form and ignores the **root** form (`buildRootUri`). With a root uri the Drive
  button silently reopened wherever the picker was last left — usually the
  device folder Choose Files had just used. This was the actual bug behind
  "both buttons go to the same place".
- **`Intent.createChooser` discards `EXTRA_INITIAL_URI`.** Choose Files went
  through a chooser and ignored its start location while the Drive button,
  launched directly, obeyed. Both launch directly now; the chooser is kept only
  when there is no starting point to pass.
- Each button keeps its own remembered location in `SharedPreferences`
  (`docman_picker`): `driveInitialUri` / `driveAuthority` / `driveRootId` and
  `localInitialUri`. Choose Files falls back to internal storage root
  (`buildDocumentUri(externalstorage, "primary:")`) on first use — so a new user
  lands on the Files home. **The Drive button cannot do the same on first use**,
  because Drive reveals no address until something has been picked through it.

Verified on device, twice, back to back: Drive opens inside Drive
(`My Drive › OARC › FUNCTIONAL DISCRIPTION`), Choose Files opens on the device
(`Abish's S23 Ultra › Download`), and neither follows the other.

---

## Confirmation dialog (`.dlg2`)

The red panel is **the reference artwork itself** (`www/Images/dialog-red-art.png`,
162 KB, 340×498). Three attempts at rebuilding the shape were rejected as not
matching — stacked radial gradients can only make ellipse rims, and hand-traced
SVG curves were no closer. **Do not try to redraw it.**

Preparation (scripts were scratch-only, not in the repo — rewrite from this if
the asset ever needs regenerating from the 1647×955 source):

- Source card occupies x 130..1512, y 145..818. Crop **x 130..470, y 145..643**.
- The crop **stops above the reference's own Cancel button** (its top edge is
  y=648). An earlier version blended across that band and replaced the curve
  running through it with a straight line — a visible cut in the wave.
- The reference's **own badge** is removed by **harmonic inpainting**: circle
  centre (151, 204) r=120, 4000 relaxation passes setting each interior pixel to
  the average of its neighbours with the untouched original ring as boundary.
  This is what makes a wave entering one side leave the other joined up.
  - A large rectangle filled by vertical interpolation → flattened the curves
    into a blocky patch.
  - A radial fill from the rim → broke the curve into a **V** where it crossed
    the circle. Feathering the rim did not fix it.
- Masking alone can never work: the badge and button sit **inside** the red,
  which is why a second ring appeared around the badge and a ghost "C" under
  Cancel when only a mask was used.

Layout, all taken from the reference:

- Buttons clear the badge by **height** (`.dlg2-head { min-height: 76px }`),
  not by indenting — the reference keeps them full width. Cancel used to run
  under the warning circle on two-line dialogs.
- `.dlg2-badge` sits at `left: 16px; top: 20px` (moved up/left from 24/30).
  **Note:** the 76px reserve was set for the old position and is now ~10px more
  than needed, so short dialogs may carry slight slack above the buttons.
- Buttons are equal height (`min-height: 46px`).
- Expiry dialog's action button uses the mango ramp
  `linear-gradient(135deg,#fbab2c 0%,#f78a14 46%,#ef7009 100%)`.

---

## Other changes

- **`sanitize()`** in `DocmanWebChromeClient` replaced spaces and hyphens with
  underscores, and its regex held a literal control character plus an illegal
  Java escape that **broke the build**. Now strips only `[\\/:*?"<>|]`.
- **Debug build is named TEST** via `android/app/src/debug/res/values/strings.xml`,
  so it is distinguishable from the Play copy it installs alongside. Release is
  unaffected — verified 0 occurrences of `TEST` in the AAB's resources.
- **Toast** shortened 3 s → **1.6 s**; error toasts keep 3 s.

---

## Open items

1. **`Uncaught TypeError: Cannot read properties of null (reading 'style')`**
   fires **three times at every launch**, reported as "Line 1" of the document.
   Both inline scripts in `index.html` are properly null-guarded, so it is
   coming from script injected into the page at startup. Never traced. Harmless
   so far. Needs one build with an error handler capturing the stack.
2. `.dlg2-head` 76px reserve vs the badge's new position (above).
3. **AAB 37 is built but not uploaded.** Release builds run R8 minification that
   the debug builds were never tested under — worth an internal-testing pass
   with one Drive upload before it reaches the 12 testers.
4. Branch is not merged to `main`.

---

## Working style (learned the hard way this session)

- **Preview UI changes and wait for approval before installing to the device.**
  This was violated once and called out. Chat previews cannot load local files,
  so image-based work can only be shown on the phone — ask first in that case.
- **Investigate rather than asking the user to describe symptoms** — their
  standing instruction. Screenshot the device with `adb exec-out screencap -p`
  and read the logs.
- **Never tap blind coordinates.** Screenshot, locate the control, then tap.
  Blind taps opened the Recycle Bin once and, in an earlier session, deleted
  five real files.
- The user may be driving the phone at the same time. If taps land somewhere
  unexpected, stop and check rather than continuing.
- Useful log tag: `adb logcat -d -s DOCMANCOPY:V` (picker and copy tracing).
  `Capacitor/Console:V` for the web layer. Plain logcat is flooded by `View`.
