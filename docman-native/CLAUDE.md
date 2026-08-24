# DOCMAN — Project Context

DOCMAN is a native Android document manager app (Capacitor-wrapped web app).
Package: `com.oarcel.docman` (confirm in android/app/src/main/AndroidManifest.xml).

## Architecture
- **Web layer**: `www/app.js`, `www/index.html`, `www/style.css` — main UI/logic, single-page app style.
- **Native layer**: `android/app/src/main/java/com/oarcel/docman/`
  - `MainActivity.java` — Capacitor bridge entry point, registers plugins.
  - `PdfViewerActivity.java` — native PDF viewer (AndroidPdfViewer/PdfiumAndroid + PDFBox for text extraction). This is where PDF feature work happens.
  - `PdfNativePlugin.java` — Capacitor plugin bridging JS ↔ PdfViewerActivity (open PDF, Continue Reading page tracking).
  - `PdfMarkOverlayView.java` — screen-space circle-mark overlay for screenshots (not persisted to PDF).
  - `BiometricAuthPlugin.java` — fingerprint/face unlock.
  - `DocmanWebChromeClient.java` — handles the WebView's file picker (Camera/Photo Library/Choose Files/Google Drive).

## Current PDF Viewer status
Native viewer (PdfViewerActivity) has: Bookmarks (TOC + user page-bookmarks), Text Search (page-level, via PDFBox), Rotate, Night Mode, Horizontal/Vertical scroll toggle, Two-Page/Spread view, Fullscreen, Page Thumbnails grid, Continue Reading (last page memory), Zoom/pan (pinch), Screenshot-mark overlay, Print (Android PrintManager), Security (password-protected PDF unlock via `.password()` + `onError` detection), Export (save copy to Downloads via MediaStore), Copy Page Text, drag-to-select Text Selection + Copy (`PdfTextSelectionOverlayView.java`, per-page lazy PDFBox extraction), Attachments (document-level + per-page FileAttachment), Highlight annotations (real `PDAnnotationTextMarkup`, on-screen immediately + saved on exit if kept), Signature (draw + drag/pinch-resize placement, `PdfSignaturePlacementView.java`, stamped as an image), Fill Form (list-based: every text field/checkbox in the AcroForm, saved via `PDField.setValue()`), Redact Area (`PdfRedactOverlayView.java` — genuinely removes content by flattening the marked page to a raster image, not just drawing a box over it; rotated pages unsupported, refuses rather than risk misplacement). All of these (Highlight/Signature/Fill Form/Redact Area) always save a new copy to Downloads rather than overwriting the original file.

## Roadmap
All items from the original roadmap (Copy Page Text → Redaction) have shipped. No open PDF-viewer feature work queued.

- **OCR fallback (scanned/image-only pages)**: `com.google.mlkit:text-recognition:16.0.1`, on-device Latin recognizer, no network/API key. Triggers in both text-extraction paths whenever PDFBox's `PDFTextStripper` finds zero text objects on a page: `ensurePageTextLayoutForPage()` → `runOcrFallback()` (feeds Text Selection/Highlight, word-level `CharBox` with `wholeUnit=true`) and `ensurePageTextsExtracted()` → `ocrPageTextFallback()` (feeds Search and Copy Page Text, plain string via `Text.getText()`). Renders the page to a bitmap via a fresh `PdfiumCore` open (`renderPageBitmapForFlatten()`) at ~2.5px/pt, then runs ML Kit against it. Works well on printed/typed scans (photocopies, faxed forms, receipts) — the original target. Confirmed via on-device testing that cursive handwriting is recognized too poorly for reliable exact-word search (ML Kit's Latin recognizer is built for print, not handwriting); this is an OCR-model limitation, not a wiring bug.

## Decided against
- **EmbedPDF** (JS/WASM PDF.js-based viewer) was trialed as an alternative rendering engine but had unresolved reliability issues on this WebView: `worker:true` hung indefinitely on "Loading document…" (Module Worker + dynamic import() limitation, unconfirmed root cause); `worker:false` loaded reliably but showed blank tiles during fast scroll on large documents (main-thread rendering couldn't keep pace). Decision: stick with the native PdfiumAndroid engine and build features natively in Java. EmbedPDF's UI couldn't be reused with the native engine either — tightly coupled to its own WASM engine's internal APIs, no clean swap point existed. **Fully removed from the codebase** (JS wiring in `www/app.js`, DOM/CSS in `www/index.html`/`www/style.css`, the Settings "Viewer Engine" toggle, and the `www/vendor/embedpdf/` vendor files) — this was a real trial, not a currently-available option.

## Working style notes
- Native code changes should be defensive where a library's exact API surface can't be verified offline (e.g. `PdfPasswordException` detection uses a runtime class-name/message check rather than a hard import, since the exact package path varies across AndroidPdfViewer/pdfium-android versions).
- When extending `PdfViewerActivity`'s "More" menu, follow the existing pattern: add to the `items` array in `showMoreMenu()`, add a corresponding `case N:` in the switch, keep new methods consistent with the existing ones' structure (Toast on failure, no crashes on missing data).
