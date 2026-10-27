# DOCMAN — Decisions that must not be casually reversed

Sources: `CLAUDE.md`, `CURRENT_STATE.md`, `HANDOVER.md`, `PROGRESS.md`, code comments. "Why" is given where the repo records it; otherwise **UNKNOWN**.

## Product / release
- **Final public AAB reads versionName 1.0.0; versionCode only goes up.** (User: "the last AAB should be 1.0.0".) Confirm version with the user before any build; never upload to Play.
- **Package `com.docman`** (renamed from `com.oarcel.docman` before first publish). Debug installs as `com.docman.dev` ("DOCMAN dev") so it can sit beside the Play copy and never replaces user data.
- **minSdk 24** — Play "automatic protection" needs ≥ 24; Android 6 dropped.
- **Pro = one-time `docman_pro`**; 11 free tries; App Lock never limited; unlocking never restricted. Dev builds auto-unlock Pro by package id.

## Architecture
- **Native PdfiumAndroid viewer, features built in Java.** EmbedPDF (JS/WASM) was trialled and fully removed (worker hang / blank tiles). Do not reintroduce.
- **Vanilla JS single `app.js`; no framework or bundler.** A cleanup/refactor pass was assessed and rejected as risky: many handlers only reachable via inline `onclick`.
- **Capacitor 6, `webDir: www`.** Root-level `app.js`/`style.css` are stale; the live code is in `www/`.
- **No service worker; offline comes from the APK's local assets.**
- **Edited PDFs are saved as new copies beside the original, never overwritten**; Export and attachments go to Downloads on purpose.
- **Erase flattens pages to raster so content is truly removed**; rotated pages are refused by Erase/Crop.
- **PDF search uses `io.legere:pdfiumandroid` (per page)**, PDFBox only for writing (OOM on large files otherwise).

## Database
- **New app-level data goes in as a new key in `folderStructure`** (folderMeta, recycleBin, deptColors…) rather than a schema bump.
- **Counted-attention state lives in localStorage (`docman_attn_seen_v1`)** because file objects are copied field-by-field in 8 places.
- **Soft delete → `recycleBin`;** blobs removed only by Secure Delete.

## Alerts / reminders
- **Schedule: 7d, 3d, 1d (09:00); expiry day every 30 min 07:00–21:00; then daily ≤ 7 days.** The user restored the day-before alert after it was removed by mistake — do not remove it.
- **Banner and Expiring tab show items ≤ 3 days away plus expired.**
- **One banner per date, "N documents", no names on the lock screen** (privacy); hand-written plugin patch implements the merge.
- **Alarm budget `ALARM_BUDGET=450`** (Android cap 500, crash is uncatchable in JS).
- **Two kinds of acknowledging, never merged:** counted (hides from banner/bell for one day) vs stop reminding (silences notifications).
- **Bell armed only by the launch check;** at zero it gives the box logo back. One definition of "needs attention": `getAttentionSets()`. The old red/purple expiry modal is gone for good.
- **A launch from a notification skips launch dialogs.**
- **View on an expiring document goes to its folder and flashes it** (user chose this); a reminder's View opens the note.
- **Expiry date must start tomorrow.**

## UI
- **Card pictures from names (folder → file → type), never file contents; multi-topic folder names are ignored.**
- **Compact cards: 1–2 full, 3+ rows, no cap; no blurred background behind the banner (thin frame).**
- **Files/notes/folders use the ⋯ row menu; only departments long-press.**
- **Note editor opens for reading;** double tap to edit text, single tap for title; colour/ruling/size autosave.
- **Search suggestions dropdown stays off** (duplicated the result cards).
- **Viewers (text/Word/Excel) share one look and use pure-scale zoom,** never font-size/CSS zoom.
- **Fast-scroll blank pages in huge PDFs are accepted;** a grey backing was rejected.
- **Web layer stays portrait-only** (MainActivity locked).
- **Play listing screenshots: app content only (no status/nav bars).**
- **Bottom-edge spacing uses `max(env(safe-area-inset-bottom), var(--nav-bottom))`** — `env()` alone is 0 here.

## Process
- Preview a rendered PNG and wait for approval before installing look changes.
- Update `CURRENT_STATE.md`, `PROGRESS.md`, `HANDOVER.md` as work lands and at chat end.
- Always use Sonnet 5.5 for this project unless the user says otherwise (user memory).
- Always back up before restore-flow tests (a ZIP-restore test once lost real data).
- Backup password minimum stays 6 (user's call).
