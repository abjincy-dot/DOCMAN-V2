# PROGRESS

Project state as of **2026-09-26**. Branch `docman-2026-09-24-pdf-search-ui-animations`
(not merged to `main`). Working tree clean.

DOCMAN is a native Android document manager — a Capacitor-wrapped web app.
Package `com.docman`; the debug build installs alongside it as `com.docman.dev`,
labelled **TEST**.

For architecture and the PDF viewer feature list see `CLAUDE.md`.
For the deep detail behind the most recent work see
`HANDOFF-cloud-upload-and-dialog.md` — it records measurements and dead ends
that are expensive to rediscover.

---

## 1. Completed

- **Native PDF viewer** — full feature set shipped (bookmarks, search, rotate,
  night mode, two-page, thumbnails, continue reading, zoom/pan, print, export,
  text selection, attachments, highlights, signature, form fill, erase, crop,
  OCR fallback). See `CLAUDE.md`; no open work queued there.
- **Cloud upload rework** (2026-09-25) — real progress reporting, native stream
  copy, filename preservation.
- **File picker fixes** — the Google Drive menu item works at all now, and
  Choose Files and Drive keep separate start locations.
- **Confirmation dialog** rebuilt to match the supplied reference artwork.
- **Debug/release app names split**, so the two installs are distinguishable.
- Release bundle **`DOCMAN-1.5.0-versioncode37.aab`** built and verified.

## 2. Currently working

Verified on device unless noted.

- **Drive upload end to end** — filename and total size appear instantly, a
  live estimated MB bar runs during the cloud wait, real byte counts take over
  at handover, then the file saves in milliseconds. Byte-exact on every test
  (287 MB, 22 MB, 1.5 MB, 98 KB, 72 KB).
- **Upload → Google Drive** opens inside Drive at the last account used.
- **Upload → Choose Files** opens on the device; the two no longer follow each
  other.
- Filenames keep their real names and spaces.
- Confirmation dialogs render the reference red artwork with no artefacts.
- Toast: 1.6 s for confirmations, 3 s for errors.

## 3. Broken / not working

- **First press of Google Drive for a new user** does not land in Drive — it
  opens the system picker, and Drive must be chosen once. This is a platform
  limit, not a bug: Drive exposes no address until something has been picked
  through it, and enumerating its roots is refused outright.
- **No live MB count during Drive's own download.** Also a platform limit —
  Drive publishes no progress at all. The bar shown during that phase is an
  estimate and is labelled as one.
- Nothing else is known broken.

## 4. Files modified (2026-09-25 session)

| File | Change |
|---|---|
| `www/app.js` | progress rendering + poll, native copy fast path, cloud-rate estimate, toast duration, expiry button colour |
| `www/style.css` | `.dlg2-art` / `.dlg2-head` / `.dlg2-row` / `.dlg2-badge` |
| `www/index.html` | cache-buster versions only |
| `www/Images/dialog-red-art.png` | **new** — dialog artwork, 340×498, 162 KB |
| `android/.../DocmanWebChromeClient.java` | copy-with-progress, `sanitize()` fix, picker start locations, picked-path publishing |
| `android/.../PdfNativePlugin.java` | `getCopyProgress`, `getPickedPaths`, `copyPickedFile` |
| `android/app/src/debug/res/values/strings.xml` | **new** — debug build named TEST |
| `android/app/build.gradle` | versionCode 37 / versionName 1.5.0 |

Commits: `760c9c2`, `7696602`, `2a6e1af`, `553bc82`.

## 5. Design / UI decisions

- **Never fake a percentage.** During the cloud wait the bar is an estimate
  learned from this phone's measured transfer rate, capped below 100% and
  labelled "estimated". A hard 95% cap was tried first and read as a hang, so
  it now eases toward 99% instead.
- **The dialog's red panel is the reference artwork, not a redrawn shape.**
  Gradient and SVG reconstructions were both rejected as not matching. Do not
  try to redraw it.
- **Dialog buttons clear the badge by height, not by indenting** — the
  reference keeps them full width.
- **Error toasts stay longer than confirmations** (3 s vs 1.6 s).
- Debug build is visually distinguishable from the Play build by name; the icon
  is still shared.

## 6. Storage model

No server, no SQL. All local.

- **IndexedDB `DocmanDB` v12**, stores:
  - `files` — keyed by `folderPath`, holds the serialized file entries for it
  - `blobs` — keyed `folderPath + '/' + fileName`, fallback bytes when a native
    write is unavailable
  - `folderStructure` — keyed records: `structure`, `folderMeta`, `recycleBin`,
    `deptColors`, `deptIconOverrides`
  - `notes`
- **Native filesystem** (the real storage for file bytes): Capacitor
  `Directory.Data` (`getFilesDir()`), path `docs/<sanitized folder>/<sanitized name>`,
  referenced by `fsPath` on each file entry. A file entry has either `fsPath`
  (native) or `fileData` (IndexedDB fallback) — never both.
- **Writes are verified by read-back at the right size** before the row is
  created; on mismatch the code falls back rather than losing the file.
- `localStorage`: `docman_theme`, `docman_migration_done`,
  `docman_last_error_v1`, `docmanCloudRateBps`.
- **Native SharedPreferences `docman_picker`**: `driveInitialUri`,
  `driveAuthority`, `driveRootId`, `localInitialUri`.

## 7. Current bugs

1. **`Uncaught TypeError: Cannot read properties of null (reading 'style')`** —
   fires **three times at every app launch**, reported as "Line 1" of the
   document. Both inline scripts in `index.html` are null-guarded, so it comes
   from script injected at startup. Never traced. Nothing visibly broken.
   Predates the 2026-09-25 work.
2. **`.dlg2-head` reserves 76 px** for the badge, a number set before the badge
   moved 10 px higher. Short dialogs may carry slight slack above the buttons.
3. Duplicate test files may be sitting in **Personal › Photos** from device
   testing (`A01-R00.doc`, `B02-R00.doc`) — safe to delete.

## 8. Next steps

1. **Upload `DOCMAN-1.5.0-versioncode37.aab`** — the user does this; it is not
   Claude's to do. Worth an internal-testing pass with one Drive upload first,
   since release builds run R8 minification that the debug builds are never
   tested under.
2. Trace bug 1 with a build that captures the error's stack.
3. Tighten the 76 px reserve (bug 2).
4. Merge the branch to `main`.

## 9. Commands and setup

Each new shell needs:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$LOCALAPPDATA/Android/Sdk/platform-tools:$PATH"
```

Build and install the debug (TEST) build — **`cap copy` first, always**:

```bash
npx cap copy android && cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Release bundle:

```bash
npx cap copy android && cd android && ./gradlew bundleRelease
```

Verify what is actually installed, from inside the APK rather than the build log:

```bash
APKPATH=$(adb shell pm path com.docman.dev | tr -d '\r' | sed 's/package://' | head -1)
adb shell "unzip -p $APKPATH assets/public/index.html" | grep -ao 'app.js?v=[0-9]*'
```

Logs — plain logcat is flooded by `View`, so always filter:

```bash
adb logcat -d -s DOCMANCOPY:V          # picker and file-copy tracing
adb logcat -d -s Capacitor/Console:V   # web layer
```

Notes:

- **Bump both** `style.css?v=` and `app.js?v=` in `index.html` on every change.
- Signing config is in `android/keystore.properties` (gitignored).
- This machine has **no Python, no ImageMagick, no sharp**. `/c/Windows/system32/convert`
  is not ImageMagick. Image work is done with a PNG codec written on Node's
  built-in `zlib`.
