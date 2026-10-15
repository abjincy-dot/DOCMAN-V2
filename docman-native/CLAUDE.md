# DOCMAN Project Instructions

## Before Starting
Read:
1. CURRENT_STATE.md
2. PROGRESS.md

Then inspect the relevant project files.

## Rules
- Work only on the requested task.
- Do not modify unrelated files.
- Do not remove existing working features.
- Do not redesign the UI unless explicitly requested.
- Preserve existing functionality.
- Do not add unnecessary dependencies.
- Make the smallest safe change necessary.

## After Completing a Task
Update:
- CURRENT_STATE.md
- PROGRESS.md

Record what was changed and what should be done next.

---

Everything below is reference, not a task list: what the app is made of, and the traps this
codebase has already fallen into. Read the part that touches what you are about to change.

## Project Context

DOCMAN is a native Android document manager app (Capacitor-wrapped web app).
Package: `com.docman` (renamed from `com.oarcel.docman` on 2026-09-12, before first publish; `applicationId` in android/app/build.gradle).

## Architecture
- **Web layer**: `www/app.js`, `www/index.html`, `www/style.css` — main UI/logic, single-page app style.
- **Native layer**: `android/app/src/main/java/com/docman/`
  - `MainActivity.java` — Capacitor bridge entry point, registers plugins.
  - `PdfViewerActivity.java` — native PDF viewer (AndroidPdfViewer/PdfiumAndroid + PDFBox for text extraction). This is where PDF feature work happens.
  - `PdfNativePlugin.java` — Capacitor plugin bridging JS ↔ PdfViewerActivity (open PDF, Continue Reading page tracking).
  - `PdfMarkOverlayView.java` — screen-space circle-mark overlay for screenshots (not persisted to PDF).
  - `BiometricAuthPlugin.java` — fingerprint/face unlock.
  - `DocmanWebChromeClient.java` — handles the WebView's file picker (Camera/Photo Library/Choose Files/Google Drive).

## Current PDF Viewer status
Native viewer (PdfViewerActivity) has: Bookmarks (TOC + user page-bookmarks), Text Search (page-level, via PDFBox), Rotate, Night Mode, Horizontal/Vertical scroll toggle, Two-Page/Spread view, Fullscreen, Page Thumbnails grid, Continue Reading (last page memory), Zoom/pan (pinch), Screenshot-mark overlay, Print (Android PrintManager), Security (password-protected PDF unlock via `.password()` + `onError` detection), Export (save copy to Downloads via MediaStore), Copy Page Text, drag-to-select Text Selection + Copy (`PdfTextSelectionOverlayView.java`, per-page lazy PDFBox extraction), Attachments (document-level + per-page FileAttachment), Highlight annotations (real `PDAnnotationTextMarkup`, on-screen immediately + saved on exit if kept), Signature (draw in black or ballpoint-blue ink, remembered in viewer prefs + drag/pinch-resize placement, `PdfSignaturePlacementView.java`, stamped as an image), Fill Form (list-based: every text field/checkbox in the AcroForm, saved via `PDField.setValue()`), Erase (`PdfRedactOverlayView.java` — a brush: one finger paints strokes on any page, a second finger hands the gesture to PDFView to move/zoom; each piece of a stroke is filled with the paper colour sampled around it (from a small page render, so the screen shows the saved result) or black; every affected page is flattened to a raster image so the content is genuinely removed, saved once as `_erased.pdf`/`_redacted.pdf`; rotated pages are skipped rather than risk misplacement), Crop Page (`PdfCropOverlayView.java` — drag one rectangle on the current page, then shrinks that page's own MediaBox/CropBox to the marked area (Acrobat's "Crop Pages" model: no content-stream rewrite, so it's near-instant unlike Redact's rasterize step); same rotated-page refusal as Redact, since the screen-fraction→PDF-point conversion assumes unrotated correspondence). All of these (Highlight/Signature/Fill Form/Erase/Crop Page) save a new copy next to the original, in the same DOCMAN folder, never overwriting it. `saveEditedCopy()` writes a verified PDF plus a `{name, docId}` JSON note to `cache/edited/`. `importPendingEditedCopies()` in `www/app.js` then files it with a native `Filesystem.copy`, on the viewer's `editedCopySaved` event, on resume, and at launch. A document with no docId falls back to Downloads. Export (More menu) and attachments still save to Downloads on purpose.

## Roadmap
All items from the original roadmap (Copy Page Text → Redaction) have shipped. No open PDF-viewer feature work queued.

- **OCR fallback (scanned/image-only pages)**: `com.google.mlkit:text-recognition:16.0.1`, on-device Latin recognizer, no network/API key. Triggers in both text-extraction paths whenever PDFBox's `PDFTextStripper` finds zero text objects on a page: `ensurePageTextLayoutForPage()` → `runOcrFallback()` (feeds Text Selection/Highlight, word-level `CharBox` with `wholeUnit=true`) and `ensurePageTextsExtracted()` → `ocrPageTextFallback()` (feeds Search and Copy Page Text, plain string via `Text.getText()`). Renders the page to a bitmap via a fresh `PdfiumCore` open (`renderPageBitmapForFlatten()`) at ~2.5px/pt, then runs ML Kit against it. Works well on printed/typed scans (photocopies, faxed forms, receipts) — the original target. Confirmed via on-device testing that cursive handwriting is recognized too poorly for reliable exact-word search (ML Kit's Latin recognizer is built for print, not handwriting); this is an OCR-model limitation, not a wiring bug.

## Decided against
- **EmbedPDF** (JS/WASM PDF.js-based viewer) was trialed as an alternative rendering engine but had unresolved reliability issues on this WebView: `worker:true` hung indefinitely on "Loading document…" (Module Worker + dynamic import() limitation, unconfirmed root cause); `worker:false` loaded reliably but showed blank tiles during fast scroll on large documents (main-thread rendering couldn't keep pace). Decision: stick with the native PdfiumAndroid engine and build features natively in Java. EmbedPDF's UI couldn't be reused with the native engine either — tightly coupled to its own WASM engine's internal APIs, no clean swap point existed. **Fully removed from the codebase** (JS wiring in `www/app.js`, DOM/CSS in `www/index.html`/`www/style.css`, the Settings "Viewer Engine" toggle, and the `www/vendor/embedpdf/` vendor files) — this was a real trial, not a currently-available option.

## Working style notes
- Native code changes should be defensive where a library's exact API surface can't be verified offline (e.g. `PdfPasswordException` detection uses a runtime class-name/message check rather than a hard import, since the exact package path varies across AndroidPdfViewer/pdfium-android versions).
- When extending `PdfViewerActivity`'s "More" menu, follow the existing pattern: add to the `items` array in `showMoreMenu()`, add a corresponding `case N:` in the switch, keep new methods consistent with the existing ones' structure (Toast on failure, no crashes on missing data).
- Never use `innerHTML +=` on `#content` (or any container the app has already wired up): it re-parses everything already inside and silently drops every listener attached to those nodes. This killed the folder toolbar's Favourite button whenever a folder had no notes (2026-09-16). Use `insertAdjacentHTML("beforeend", ...)` or `appendChild`, and prefer inline `onclick` for the toolbar buttons, which survives a re-parse.
- **`env(safe-area-inset-bottom)` is 0 in this WebView** — targetSdk 35+ draws edge-to-edge and never publishes the inset, so anything that trusts it sits under the gesture/back bar. The app's own measurement is `--nav-bottom`, written onto the root by `MainActivity` from the real window insets. Always reserve `max(env(safe-area-inset-bottom, 0px), var(--nav-bottom, 0px))` — the `max()` covers both a phone that does publish the inset and one that does not. Bit the note editor on 2026-10-13 the moment its card was made full height, and the reminder sticky note the same night. **JS has the same trap:** `innerHeight` runs to the bottom of the screen, so anything deciding whether something fits must use `innerHeight - Math.max(--safe-bottom, --nav-bottom)`, as the row menu and `showReminderStickyNote` now do.
- **`showModal` falls back to the OK button's label for the heading** (`const dlgTitle = title || resolvedOkLabel`). A `showConfirmModal` caller that passes no `title` gets a heading like "View" or "Delete", which reads as a stray verb rather than a title. Always pass `title`.
- **Scroll versus gesture on the PDF view**: `PdfTextSelectionOverlayView` decides whether a touch is a scroll by asking whether the PAGE moved (`pdfView.getCurrentXOffset()/getCurrentYOffset()` against the values taken at ACTION_DOWN), not by how far the finger travelled. Finger distance cannot tell a slow deliberate scroll from a hold, and the long-press slop there is deliberately generous to survive hand tremor. Reuse the page-offset test for any new gesture that has to coexist with scrolling.
- **The note editor opens for READING.** Both fields are `readOnly` until asked otherwise: the writing box needs a double tap, the one-line title a single one. Colour, ruling and text size are saved on the spot by `noteStyleChanged()` and never leave read mode, so no Save/Cancel appears while reading. Anything new added to that editor has to decide which of those two it is, or it will open a keyboard over a note somebody is only reading.
- **A launch that came from tapping a notification skips the launch dialogs** (`launchedFromNotification` guards both `checkExpiryTodayOnLoad` and `checkLaunchAlertsOnLoad`). The tap is already an answer to an alert and already chose a destination; a dialog on top of it is nagging. Any new launch-time popup needs the same guard.
