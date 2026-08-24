// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/PdfNativePlugin.java
//
// Replace "com.oarcel.docman" below with YOUR app's real package name
// (check android/app/src/main/AndroidManifest.xml -> package="...").

package com.oarcel.docman;

import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PdfNative")
public class PdfNativePlugin extends Plugin {

    // Shared with PdfViewerActivity.PROGRESS_PREFS — must match exactly.
    static final String PROGRESS_PREFS = "docman_pdf_progress";

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

        if (path == null || path.isEmpty()) {
            call.reject("No PDF path provided");
            return;
        }

        Intent intent = new Intent(getContext(), PdfViewerActivity.class);
        intent.putExtra("path", path);
        intent.putExtra("title", title);
        intent.putExtra("docId", docId);
        intent.putExtra("initialPage", initialPage);
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
}