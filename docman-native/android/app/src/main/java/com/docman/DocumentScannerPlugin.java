package com.docman;

import android.app.Activity;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

// "Scan Document" -- Google's ML Kit document scanner (the one Google Drive
// uses): live edge detection, auto-capture, crop/rotate, filters, multi-page.
// Its ML "Clean" tool is deliberately hidden (SCANNER_MODE_BASE_WITH_FILTER):
// it puts printed text back, which confused people next to DOCMAN's Erase
// tool, where whatever is erased stays erased. Its screens and models live in Google Play
// services, so DOCMAN needs no camera permission and barely grows in size.
//
// scan() resolves with { path, pageCount, size }: a PDF copied into
// CACHE/scans/ that the web layer files into the current folder, or with
// { cancelled: true }. It rejects with code "UNAVAILABLE" when the phone can't
// run the scanner (no Google Play services, or under ~1.7 GB RAM).
@CapacitorPlugin(name = "DocumentScanner")
public class DocumentScannerPlugin extends Plugin {

    private static final int PAGE_LIMIT = 20;

    private ActivityResultLauncher<IntentSenderRequest> scanLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // Must be registered while the activity is still being created;
        // Capacitor loads plugins from BridgeActivity.onCreate.
        scanLauncher = getActivity().registerForActivityResult(
                new ActivityResultContracts.StartIntentSenderForResult(),
                this::onScanResult);
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) { call.reject("No activity available."); return; }
        if (pendingCall != null) { call.reject("A scan is already open.", "BUSY"); return; }

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(PAGE_LIMIT)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER)
                .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);

        pendingCall = call;
        scanner.getStartScanIntent(activity)
                .addOnSuccessListener(intentSender -> {
                    try {
                        scanLauncher.launch(new IntentSenderRequest.Builder(intentSender).build());
                    } catch (Exception e) {
                        finishWithError("Could not open the scanner.", "UNAVAILABLE", e);
                    }
                })
                .addOnFailureListener(e ->
                        // No Google Play services, too little RAM (UNSUPPORTED),
                        // or the scanner module could not be prepared.
                        finishWithError("Scanning isn't available on this phone.", "UNAVAILABLE", e));
    }

    private void onScanResult(ActivityResult result) {
        final PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
        final GmsDocumentScanningResult.Pdf pdf = scan != null ? scan.getPdf() : null;
        if (pdf == null) {
            call.reject("The scanner returned no document.", "SCAN_FAILED");
            return;
        }

        // A multi-page PDF can be several MB: copy it off the main thread.
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), "scans");
            File out = new File(dir, "scan_" + System.currentTimeMillis() + ".pdf");
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("cannot create scans folder");
                copy(pdf.getUri(), out);
                if (out.length() == 0) throw new IllegalStateException("empty scan");
                JSObject ret = new JSObject();
                ret.put("path", "scans/" + out.getName()); // relative to Directory.CACHE
                ret.put("pageCount", pdf.getPageCount());
                ret.put("size", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                out.delete();
                call.reject("Could not save the scan.", "SCAN_FAILED", e);
            }
        }).start();
    }

    private void copy(Uri from, File to) throws Exception {
        InputStream in = getContext().getContentResolver().openInputStream(from);
        if (in == null) throw new IllegalStateException("cannot read scan");
        try {
            OutputStream out = new FileOutputStream(to);
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } finally {
                out.close();
            }
        } finally {
            in.close();
        }
    }

    private void finishWithError(String message, String code, Exception e) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call != null) call.reject(message, code, e);
    }
}
