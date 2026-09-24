// FILE LOCATION:
// android/app/src/main/java/com/docman/PdfNativePlugin.java

package com.docman;

import android.content.Intent;
import android.content.SharedPreferences;
import android.media.MediaScannerConnection;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PdfNative")
public class PdfNativePlugin extends Plugin {

    // Shared with PdfViewerActivity.PROGRESS_PREFS — must match exactly.
    static final String PROGRESS_PREFS = "docman_pdf_progress";

    // The PDF viewer is its own Activity, so it cannot show the web layer's
    // DOCMAN Pro screen itself. When a locked tool is chosen there, the viewer
    // closes and calls requestProScreen(), which tells the web layer to open
    // the Pro screen. retainUntilConsumed=true so the event is not lost if the
    // WebView's listener is momentarily busy while the viewer finishes.
    private static PdfNativePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    static void requestProScreen(String feature) {
        PdfNativePlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("feature", feature);
        plugin.notifyListeners("proRequested", data, true);
    }

    // The viewer spends its own tools' free tries (FreeTries is shared); this
    // keeps the web layer's copy in step without waiting for a reload.
    static void notifyFreeTryUsed(String feature) {
        PdfNativePlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("feature", feature);
        plugin.notifyListeners("freeTryUsed", data, true);
    }

    // An edited copy is waiting in cache/edited/ for the web layer to file
    // next to its original (see PdfViewerActivity.saveEditedCopy). The web
    // layer also looks there at every launch, so a missed event loses nothing.
    static void notifyEditedCopySaved() {
        PdfNativePlugin plugin = instance;
        if (plugin == null) return;
        plugin.notifyListeners("editedCopySaved", new JSObject(), true);
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        String path = call.getString("path");
        String title = call.getString("title", "");
        // Stable identity for this document (e.g. "REMELT/FURNACE 1::drawing.pdf").
        // NOT the same as `path`, which is always the same reusable cache file
        // (docman-view.pdf) regardless of which document is open — so `path`
        // can't be used as the Continue Reading storage key, only `docId` can.
        String docId = call.getString("docId", "");
        // 0-based page to open directly to (Continue Reading restore). -1 = none.
        int initialPage = call.getInt("initialPage", -1);
        // Whether DOCMAN Pro is bought. Defaults TRUE so that a mismatched or
        // older JS bundle can never lock a user out of tools they are
        // entitled to -- fail open, same rule as the JS entitlement layer.
        boolean pro = call.getBoolean("pro", Boolean.TRUE);
        // PDF tools that still have their one free try. Only consulted when
        // pro is false; a missing list means none are left.
        JSArray tries = call.getArray("freeTries");
        String[] freeTries = new String[0];
        if (tries != null) {
            freeTries = new String[tries.length()];
            for (int i = 0; i < tries.length(); i++) freeTries[i] = tries.optString(i, "");
        }

        if (path == null || path.isEmpty()) {
            call.reject("No PDF path provided");
            return;
        }

        Intent intent = new Intent(getContext(), PdfViewerActivity.class);
        intent.putExtra("path", path);
        intent.putExtra("title", title);
        intent.putExtra("docId", docId);
        intent.putExtra("initialPage", initialPage);
        intent.putExtra("pro", pro);
        intent.putExtra("freeTries", freeTries);
        getActivity().startActivity(intent);

        call.resolve();
    }

    // Continue Reading: returns the last saved page/pageCount for a docId,
    // written by PdfViewerActivity as the user scrolls. Resolves with
    // { found: false } if nothing has been saved for this document yet.
    @PluginMethod
    public void getLastPage(PluginCall call) {
        String docId = call.getString("docId", "");
        JSObject result = new JSObject();
        if (docId.isEmpty()) {
            result.put("found", false);
            call.resolve(result);
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PROGRESS_PREFS, android.content.Context.MODE_PRIVATE);
        int page = prefs.getInt(docId + "_page", -1);
        int total = prefs.getInt(docId + "_total", -1);
        long updatedAt = prefs.getLong(docId + "_time", 0);

        if (page < 0) {
            result.put("found", false);
        } else {
            result.put("found", true);
            result.put("page", page);
            result.put("totalPages", total);
            result.put("updatedAt", updatedAt);
        }
        call.resolve(result);
    }

    // Writing a file directly into a public directory (e.g. via
    // Filesystem.writeFile with directory: 'DOCUMENTS') puts real bytes on
    // disk, but Android's MediaStore index -- what file managers like
    // Files/My Files actually query to list "Documents" -- has no idea the
    // file exists until something scans it. Without this, a just-exported
    // backup is physically present but invisible in Files for hours, or
    // until the next full device media scan. Called with the absolute
    // filesystem path right after a public-directory write completes.
    @PluginMethod
    public void scanFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("No path provided");
            return;
        }
        MediaScannerConnection.scanFile(getContext(), new String[]{path}, null, null);
        call.resolve();
    }

    // ============================================================
    // MERGE PDFs (Pro tool, approved 2026-09-18)
    // ============================================================
    // Page counts come from Android's own PdfRenderer rather than PDFBox:
    // it reads only the page tree, so a 100-page scan costs milliseconds,
    // and a password-protected file fails to open, which is exactly the
    // "this one can't be merged" answer the web layer needs up front.
    @PluginMethod
    public void pdfInfo(PluginCall call) {
        JSArray paths = call.getArray("paths");
        if (paths == null) {
            call.reject("No paths provided");
            return;
        }
        JSArray out = new JSArray();
        try {
            for (Object entry : paths.toList()) {
                JSObject info = new JSObject();
                String path = String.valueOf(entry);
                info.put("path", path);
                android.os.ParcelFileDescriptor fd = null;
                android.graphics.pdf.PdfRenderer renderer = null;
                try {
                    fd = android.os.ParcelFileDescriptor.open(
                            new java.io.File(path), android.os.ParcelFileDescriptor.MODE_READ_ONLY);
                    renderer = new android.graphics.pdf.PdfRenderer(fd);
                    info.put("pages", renderer.getPageCount());
                    info.put("readable", true);
                } catch (Exception e) {
                    // Password-protected, damaged, or not a PDF at all.
                    info.put("pages", 0);
                    info.put("readable", false);
                } finally {
                    if (renderer != null) try { renderer.close(); } catch (Exception ignored) { }
                    if (fd != null) try { fd.close(); } catch (Exception ignored) { }
                }
                out.put(info);
            }
        } catch (Exception e) {
            call.reject("Could not read PDF info: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("files", out);
        call.resolve(ret);
    }

    // Joins the given PDFs, in the given order, into `out`. PDFBox's
    // PDFMergerUtility with setupTempFileOnly() streams through scratch files
    // on disk instead of building the whole document in RAM, so merging
    // several 100-page scans doesn't risk an OutOfMemoryError.
    @PluginMethod
    public void mergePdfs(final PluginCall call) {
        final JSArray paths = call.getArray("paths");
        final String out = call.getString("out");
        if (paths == null || out == null) {
            call.reject("No paths provided");
            return;
        }
        // Off the bridge thread: a large merge is seconds of disk work.
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.io.File outFile = new java.io.File(out);
                try {
                    com.tom_roush.pdfbox.android.PDFBoxResourceLoader.init(getContext());
                    java.io.File parent = outFile.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        throw new java.io.IOException("Could not create " + parent.getPath());
                    }

                    com.tom_roush.pdfbox.multipdf.PDFMergerUtility merger =
                            new com.tom_roush.pdfbox.multipdf.PDFMergerUtility();
                    merger.setDestinationFileName(outFile.getAbsolutePath());
                    for (Object entry : paths.toList()) {
                        java.io.File src = new java.io.File(String.valueOf(entry));
                        if (!src.exists()) throw new java.io.IOException("Missing file: " + src.getName());
                        merger.addSource(src);
                    }
                    merger.mergeDocuments(
                            com.tom_roush.pdfbox.io.MemoryUsageSetting.setupTempFileOnly());

                    // Read the result back before reporting success -- the same
                    // "verify the write" rule the rest of the app follows.
                    int pages = 0;
                    android.os.ParcelFileDescriptor fd = null;
                    android.graphics.pdf.PdfRenderer renderer = null;
                    try {
                        fd = android.os.ParcelFileDescriptor.open(
                                outFile, android.os.ParcelFileDescriptor.MODE_READ_ONLY);
                        renderer = new android.graphics.pdf.PdfRenderer(fd);
                        pages = renderer.getPageCount();
                    } finally {
                        if (renderer != null) try { renderer.close(); } catch (Exception ignored) { }
                        if (fd != null) try { fd.close(); } catch (Exception ignored) { }
                    }
                    if (pages <= 0) throw new java.io.IOException("Merged file could not be read back");

                    JSObject ret = new JSObject();
                    ret.put("pages", pages);
                    ret.put("size", outFile.length());
                    call.resolve(ret);
                } catch (Throwable t) {
                    // Never leave half a document behind for the web layer to
                    // file into a folder as if it were a finished merge.
                    try { outFile.delete(); } catch (Exception ignored) { }
                    call.reject("Merge failed: " + t.getMessage());
                }
            }
        }).start();
    }
}
