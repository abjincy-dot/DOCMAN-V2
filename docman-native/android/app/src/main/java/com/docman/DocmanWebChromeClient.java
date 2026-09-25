package com.docman;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.OpenableColumns;
import java.io.FileOutputStream;
import java.io.InputStream;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Handles the WebView's file chooser for four distinct upload flows from
 * app.js's upload menu:
 *
 *  - "Take Photo"    (accept=image/*, capture=environment) -> real camera
 *                     capture via MediaStore.ACTION_IMAGE_CAPTURE.
 *  - "Photo Library" (accept=image/*, no capture)          -> Android's
 *                     Photo Picker (a proper gallery grid).
 *  - "Choose Files"  (specific extensions, no capture)     -> the original
 *                     ACTION_OPEN_DOCUMENT chooser-sheet logic.
 *  - "Google Drive"  (extensions + the DRIVE_MARKER sentinel accept-type)
 *                     -> tries ACTION_OPEN_DOCUMENT then ACTION_GET_CONTENT
 *                     targeted directly at the Drive app package, so
 *                     Drive's own picker UI opens with no OAuth, no
 *                     browser, no custom URL scheme -- Drive is already
 *                     signed in and just hands back a content:// URI like
 *                     any other picked file. If neither action resolves to
 *                     a Drive activity on this device/app version, falls
 *                     back to the general chooser sheet below, where Drive
 *                     still appears as a source the user can tap into.
 *
 * Earlier versions of this class deferred both camera capture AND photo
 * library selection to generic pickers that only ever showed the system
 * Files/document UI -- neither actually opened a camera or a gallery.
 */
public class DocmanWebChromeClient extends BridgeWebChromeClient {

    private static final String DRIVE_MARKER = "x-docman/google-drive";
    // Only the modern Drive authority is remembered. The ".legacy" one is what
    // made Drive stop and demand an account, and then send the user through its
    // file list a second time.
    private static final String DRIVE_AUTHORITY = "com.google.android.apps.docs.storage";
    private static final String PREFS = "docman_picker";
    private static final String KEY_DRIVE_AUTH = "driveAuthority";
    private static final String KEY_DRIVE_ROOT = "driveRootId";
    private static final String KEY_LOCAL_URI = "localInitialUri";
    private static final String LOCAL_AUTHORITY = "com.android.externalstorage.documents";

    private static final int PHOTO_PICKER_MAX_ITEMS = 50;

    private final Bridge bridge;

    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<Intent> cameraCaptureLauncher;
    private ActivityResultLauncher<PickVisualMediaRequest> photoPickerLauncher;

    private ValueCallback<Uri[]> pendingFilePathCallback;
    private Uri pendingCameraUri;

    public DocmanWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;

        this.fileChooserLauncher = bridge.registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                this::handleFileChooserResult
        );
        this.cameraCaptureLauncher = bridge.registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                this::handleCameraCaptureResult
        );
        this.photoPickerLauncher = bridge.registerForActivityResult(
                new ActivityResultContracts.PickMultipleVisualMedia(PHOTO_PICKER_MAX_ITEMS),
                this::handlePhotoPickerResult
        );
    }

    @Override
    public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams
    ) {
        List<String> acceptTypes = Arrays.asList(fileChooserParams.getAcceptTypes());
        boolean captureEnabled = fileChooserParams.isCaptureEnabled();
        boolean wantsImageCapture = captureEnabled && acceptTypes.contains("image/*");
        // Pure "image/*" with no capture flag = the "Photo Library" button.
        // "Choose Files" sends a list of specific extensions instead, so
        // this check doesn't catch it.
        boolean wantsPhotoLibrary = !captureEnabled
                && acceptTypes.size() == 1
                && "image/*".equals(acceptTypes.get(0));

        pendingFilePathCallback = filePathCallback;

        if (wantsImageCapture) {
            launchCamera();
            return true;
        }

        if (wantsPhotoLibrary) {
            launchPhotoPicker();
            return true;
        }

        // The "Google Drive" menu item in app.js sends an extra fake accept-type
        // as a marker; it is stripped out of the real MIME filter below.
        boolean wantsDrive = acceptTypes.contains(DRIVE_MARKER);
        android.util.Log.i("DOCMANCOPY", "picker opened, wantsDrive=" + wantsDrive);

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        List<String> filteredTypes = new ArrayList<>();
        for (String t : fileChooserParams.getAcceptTypes()) {
            if (!DRIVE_MARKER.equals(t)) filteredTypes.add(t);
        }
        String[] validTypes = getValidTypes(filteredTypes.toArray(new String[0]));
        if (validTypes.length > 0) {
            intent.putExtra(Intent.EXTRA_MIME_TYPES, validTypes);
        }

        // Reopen in the SAME Drive account used last time. The account is part
        // of the document id Drive hands back ("acc=2;doc=encoded=..."), so a
        // root URI built from it names the account by itself -- which is what
        // stops Drive interrupting with "Select an account" and then making the
        // user walk its file list twice. No memory yet (first use) falls through
        // to the ordinary chooser, where the account is picked once.
        if (wantsDrive && android.os.Build.VERSION.SDK_INT >= 26) {
            android.content.SharedPreferences prefs =
                    bridge.getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String savedAuth = prefs.getString(KEY_DRIVE_AUTH, null);
            String savedRoot = prefs.getString(KEY_DRIVE_ROOT, null);
            if (savedAuth != null && savedRoot != null) {
                try {
                    Uri rootUri = android.provider.DocumentsContract.buildRootUri(savedAuth, savedRoot);
                    Intent driveIntent = new Intent(intent);
                    driveIntent.putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, rootUri);
                    android.util.Log.i("DOCMANCOPY", "drive reopen at " + rootUri);
                    fileChooserLauncher.launch(driveIntent);
                    return true;
                } catch (Exception e) {
                    android.util.Log.w("DOCMANCOPY", "drive reopen failed, using chooser", e);
                }
            }
        }

        // "Choose Files" must start on the device. Android's picker otherwise
        // restores whatever location it was last left in -- which, after a Drive
        // upload, meant Choose Files opened inside Google Drive and the two menu
        // items led to the same place. Each one now carries its own starting
        // point: this one the last device folder used (or internal storage),
        // the Drive one the remembered Drive account above.
        if (!wantsDrive && android.os.Build.VERSION.SDK_INT >= 26) {
            try {
                String savedLocal = bridge.getContext()
                        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_LOCAL_URI, null);
                Uri initial = savedLocal != null
                        ? Uri.parse(savedLocal)
                        : android.provider.DocumentsContract.buildDocumentUri(LOCAL_AUTHORITY, "primary:");
                intent.putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, initial);
                android.util.Log.i("DOCMANCOPY", "choose-files initial " + initial + " (saved=" + savedLocal + ")");
            } catch (Exception e) {
                android.util.Log.w("DOCMANCOPY", "local initial-uri failed", e);
            }
        }

        // NOTE: do not try to launch a picker aimed straight at the Drive app.
        // Drive does not refuse the intent -- it accepts it, starts, and finishes
        // with RESULT_CANCELED within about 12ms, every single time (measured
        // 2026-09-25: 12, 13, 17 and 12ms across four attempts, never once
        // succeeding). Pointing the system picker at a remembered Drive URI via
        // EXTRA_INITIAL_URI is worse still: Drive then demands an account before
        // it will resolve the URI, so the user gets a "Select an account" dialog
        // that was never asked for. The system chooser below reaches Drive
        // reliably and is what this menu item now opens.
        // Launch the picker DIRECTLY when we have a starting point to pass.
        // Intent.createChooser loses it: measured 2026-09-25, the Drive button
        // (launched directly) landed exactly where it was told, while this one
        // sent an equally valid EXTRA_INITIAL_URI through a chooser and always
        // reopened wherever the picker had last been left instead. The chooser
        // sheet was originally added to stop Android silently reusing a saved
        // default app, so it is kept for the case where we have nothing to pass.
        boolean hasStartingPoint = android.os.Build.VERSION.SDK_INT >= 26
                && intent.hasExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI);
        Intent toLaunch = hasStartingPoint
                ? intent
                : Intent.createChooser(intent, "Select File");
        try {
            fileChooserLauncher.launch(toLaunch);
        } catch (ActivityNotFoundException e) {
            // Direct launch can fail where the chooser would not; never leave
            // the WebView waiting on a callback that will not come.
            if (hasStartingPoint) {
                try {
                    fileChooserLauncher.launch(Intent.createChooser(intent, "Select File"));
                    return true;
                } catch (ActivityNotFoundException ignored) { }
            }
            filePathCallback.onReceiveValue(null);
            pendingFilePathCallback = null;
        }
        return true;
    }

    private void launchCamera() {
        Context context = bridge.getContext();
        File photoFile;
        try {
            photoFile = createTempImageFile(context);
        } catch (IOException e) {
            if (pendingFilePathCallback != null) pendingFilePathCallback.onReceiveValue(null);
            pendingFilePathCallback = null;
            return;
        }

        pendingCameraUri = FileProvider.getUriForFile(
                context, context.getPackageName() + ".fileprovider", photoFile
        );

        Intent captureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        captureIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
        captureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        try {
            cameraCaptureLauncher.launch(captureIntent);
        } catch (ActivityNotFoundException e) {
            // No camera app available.
            if (pendingFilePathCallback != null) pendingFilePathCallback.onReceiveValue(null);
            pendingFilePathCallback = null;
            pendingCameraUri = null;
        }
    }

    private File createTempImageFile(Context context) throws IOException {
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new java.util.Date());
        // Cache dir is already exposed (scoped) via the existing
        // FileProvider <cache-path> entry in res/xml/file_paths.xml.
        return File.createTempFile("DOCMAN_" + timestamp + "_", ".jpg", context.getCacheDir());
    }

    private void handleCameraCaptureResult(ActivityResult result) {
        if (pendingFilePathCallback == null) return;

        Uri[] uris = null;
        if (result.getResultCode() == Activity.RESULT_OK && pendingCameraUri != null) {
            uris = new Uri[]{pendingCameraUri};
        }
        pendingFilePathCallback.onReceiveValue(uris);
        pendingFilePathCallback = null;
        pendingCameraUri = null;
    }

    private void launchPhotoPicker() {
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build();
        photoPickerLauncher.launch(request);
    }

    private void handlePhotoPickerResult(List<Uri> uris) {
        if (pendingFilePathCallback == null) return;

        if (uris == null || uris.isEmpty()) {
            pendingFilePathCallback.onReceiveValue(null);
        } else {
            pendingFilePathCallback.onReceiveValue(uris.toArray(new Uri[0]));
        }
        pendingFilePathCallback = null;
    }

    private void handleFileChooserResult(ActivityResult activityResult) {
        if (pendingFilePathCallback == null) return;

        android.util.Log.i("DOCMANCOPY", "result code=" + activityResult.getResultCode());

        Uri[] result;
        Intent resultIntent = activityResult.getData();
        if (
                activityResult.getResultCode() == Activity.RESULT_OK &&
                        resultIntent != null &&
                        resultIntent.getClipData() != null
        ) {
            int numFiles = resultIntent.getClipData().getItemCount();
            result = new Uri[numFiles];
            for (int i = 0; i < numFiles; i++) {
                result[i] = resultIntent.getClipData().getItemAt(i).getUri();
            }
        } else {
            result = WebChromeClient.FileChooserParams.parseResult(activityResult.getResultCode(), resultIntent);
        }

        if (result == null || result.length == 0) {
            pendingFilePathCallback.onReceiveValue(result);
            pendingFilePathCallback = null;
            return;
        }

        // Copy the picked items into our own cache OURSELVES, on a background
        // thread, reporting bytes as we go.
        //
        // Why: for a Google Drive (or any cloud) item the picker returns a
        // content:// URI that is not on the device yet. Handing that straight
        // to the WebView makes Chromium do the download internally and only
        // surface the File once it has finished -- which is why the app could
        // sit for 40+ seconds with nothing to show and no way to report a
        // percentage. Doing the copy here means we own the byte counts.
        sCopyProgress = "";
        sPickedPaths.clear();
        // Remember the last device folder, so "Choose Files" reopens there.
        for (Uri u : result) {
            if (u == null || !LOCAL_AUTHORITY.equals(u.getAuthority())) continue;
            bridge.getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LOCAL_URI, u.toString()).apply();
            break;
        }

        // Remember which Drive account this came from, for the jump above.
        for (Uri u : result) {
            if (u == null || !DRIVE_AUTHORITY.equals(u.getAuthority())) continue;
            try {
                String docId = android.provider.DocumentsContract.getDocumentId(u);
                int semi = docId.indexOf(';');
                String rootId = semi > 0 ? docId.substring(0, semi) : docId;
                bridge.getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putString(KEY_DRIVE_AUTH, u.getAuthority())
                        .putString(KEY_DRIVE_ROOT, rootId)
                        .apply();
                android.util.Log.i("DOCMANCOPY", "remembered drive root " + rootId);
            } catch (Exception ignored) { }
            break;
        }

        final Uri[] picked = result;
        final ValueCallback<Uri[]> callback = pendingFilePathCallback;
        pendingFilePathCallback = null;
        new Thread(new Runnable() {
            @Override
            public void run() {
                Uri[] localUris = new Uri[picked.length];
                for (int i = 0; i < picked.length; i++) {
                    localUris[i] = copyToCacheWithProgress(picked[i], i + 1, picked.length);
                    if (localUris[i] == null) localUris[i] = picked[i]; // fall back to the original
                }
                final Uri[] finalUris = localUris;
                emitCopyEvent("{\"phase\":\"done\"}");
                bridge.getActivity().runOnUiThread(new Runnable() {
                    @Override
                    public void run() { callback.onReceiveValue(finalUris); }
                });
            }
        }).start();
    }

    /** Streams one picked item into the app cache, emitting progress to the web layer. */
    private Uri copyToCacheWithProgress(Uri src, int index, int total) {
        Context context = bridge.getContext();
        ContentResolver resolver = context.getContentResolver();

        String displayName = "file";
        long totalBytes = -1;
        try (Cursor c = resolver.query(src, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIdx = c.getColumnIndex(OpenableColumns.SIZE);
                if (nameIdx >= 0 && !c.isNull(nameIdx)) displayName = c.getString(nameIdx);
                if (sizeIdx >= 0 && !c.isNull(sizeIdx)) totalBytes = c.getLong(sizeIdx);
            }
        } catch (Exception ignored) { }

        android.util.Log.i("DOCMANCOPY", "start name=" + displayName + " size=" + totalBytes + " uri=" + src);
        // The WebView reads the display name from the URI we hand back, so the
        // copy must KEEP the original filename or the uploaded file shows up as
        // "pick_1790334392371_...". A unique parent directory gives uniqueness
        // instead of a name prefix; <cache-path path="."> already covers it.
        // Tell the card the name and total size NOW. Everything below can sit
        // for a minute or more on a cloud file, and the user was staring at a
        // card with no information for the whole of it.
        // Report the name and total size NOW. A cloud provider blocks the
        // openInputStream() below for its entire download (measured: 51s for
        // a 301MB Drive file, after which the local copy took 0.7s) and
        // publishes no progress of its own -- its document row was queried
        // once a second throughout and never changed, with no extras and no
        // FLAG_PARTIAL. So this size is the only real number available until
        // the stream opens, and it must not be withheld for a minute.
        emitProgress(displayName, 0, totalBytes, index, total);
        File pickDir = new File(context.getCacheDir(), "picks/" + System.currentTimeMillis() + "_" + index);
        pickDir.mkdirs();
        File outFile = new File(pickDir, sanitize(displayName));
        long copied = 0;
        long lastEmit = 0;
        int lastPct = -1;
        try (InputStream in = resolver.openInputStream(src);
             FileOutputStream out = new FileOutputStream(outFile)) {
            if (in == null) return null;
            byte[] buf = new byte[64 * 1024];
            int read;
            emitProgress(displayName, 0, totalBytes, index, total);
            while ((read = in.read(buf)) != -1) {
                out.write(buf, 0, read);
                copied += read;
                // Throttled: a progress event per chunk would flood the bridge.
                long now = System.currentTimeMillis();
                int pct = totalBytes > 0 ? (int) (copied * 100 / totalBytes) : -1;
                if (now - lastEmit > 400 && pct != lastPct) {
                    emitProgress(displayName, copied, totalBytes, index, total);
                    lastEmit = now;
                    lastPct = pct;
                }
            }
            out.flush();
            emitProgress(displayName, copied, totalBytes < 0 ? copied : totalBytes, index, total);
            android.util.Log.i("DOCMANCOPY", "done name=" + displayName + " copied=" + copied + " out=" + outFile.length());
        } catch (Exception e) {
            android.util.Log.w("DOCMANCOPY", "copy failed for " + displayName, e);
            return null;
        }

        sPickedPaths.put(outFile.getName(), outFile.getAbsolutePath());
        try {
            return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", outFile);
        } catch (Exception e) {
            return null;
        }
    }

    /** Only strips what cannot appear in a path -- spaces and the rest of the
     *  real filename are kept, because this name is what the user will see. */
    private String sanitize(String name) {
        if (name == null || name.trim().isEmpty()) return "file";
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    // Latest copy progress as JSON. The web layer PULLS this through the
    // Capacitor plugin bridge (PdfNative.getCopyProgress) because the
    // evaluateJavascript push below never reached JS on this device -- the
    // UI-thread callback did not even log a return value.
    public static volatile String sCopyProgress = "";

    // Absolute cache path of each file this pick produced, keyed by the name
    // the WebView reports for it. Lets the web layer copy the bytes with a
    // native stream instead of base64-ing them back through the bridge 4MB at
    // a time -- 72 round trips for a 287MB file, which is what made the card
    // sit on "Uploading 1 of 1" long after the download had finished.
    public static final java.util.Map<String, String> sPickedPaths =
            new java.util.concurrent.ConcurrentHashMap<String, String>();

    private void emitProgress(String name, long copied, long total, int index, int count) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"phase\":\"copy\",\"name\":\"")
          .append(name == null ? "" : name.replace("\\", "").replace("\"", ""))
          .append("\",\"copied\":").append(copied)
          .append(",\"total\":").append(total)
          .append(",\"index\":").append(index)
          .append(",\"count\":").append(count).append("}");
        emitCopyEvent(sb.toString());
    }

    private void emitCopyEvent(final String json) {
        sCopyProgress = json;
        try {
            bridge.getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        bridge.getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('docmanCopyProgress',{detail:" + json + "}))",
                                new android.webkit.ValueCallback<String>() {
                                    @Override public void onReceiveValue(String v) {
                                        if (!emitLogged) { emitLogged = true; android.util.Log.i("DOCMANCOPY", "eval ok ret=" + v + " js=" + json); }
                                    }
                                });
                    } catch (Exception e) {
                        android.util.Log.w("DOCMANCOPY", "evaluateJavascript threw", e);
                    }
                }
            });
        } catch (Exception e) { android.util.Log.w("DOCMANCOPY", "emit outer threw", e); }
    }

    private boolean emitLogged = false;

    private String[] getValidTypes(String[] currentTypes) {
        List<String> validTypes = new ArrayList<>();
        MimeTypeMap mtm = MimeTypeMap.getSingleton();
        for (String mime : currentTypes) {
            // An absent/empty HTML accept attribute comes through here as
            // a blank string (sometimes literally "", sometimes just
            // whitespace) rather than an empty array -- previously that
            // blank string was added to validTypes as if it were a real
            // MIME type, which put a single invalid entry into the
            // intent's EXTRA_MIME_TYPES filter. Some document-picker apps
            // then applied that as a real (but unsatisfiable) filter and
            // grayed out every file instead of just not filtering at all.
            if (mime == null || mime.trim().isEmpty()) continue;
            if (mime.startsWith(".")) {
                String extension = mime.substring(1);
                String extensionMime = mtm.getMimeTypeFromExtension(extension);
                if (extensionMime != null && !validTypes.contains(extensionMime)) {
                    validTypes.add(extensionMime);
                }
            } else if (!validTypes.contains(mime)) {
                validTypes.add(mime);
            }
        }
        return validTypes.toArray(new String[0]);
    }
}
