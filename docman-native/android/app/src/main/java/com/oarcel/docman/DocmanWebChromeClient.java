package com.oarcel.docman;

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
    private static final String DRIVE_PACKAGE = "com.google.android.apps.docs";
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

        // The "Google Drive" menu item in app.js sends this extra fake
        // accept-type alongside the real ones as a marker, so this class
        // can tell it apart from the plain "Choose Files" button. It is
        // stripped out before computing the real MIME filter below.
        boolean wantsDrive = acceptTypes.contains(DRIVE_MARKER);

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

        if (wantsDrive) {
            // Attempt 1: ACTION_OPEN_DOCUMENT targeted directly at the
            // Drive app. On some Drive app versions/Android versions this
            // has no matching activity (Drive only participates in the
            // system's combined document-picker framework, not as a
            // directly-launchable picker) and throws immediately below.
            Intent driveOpenDocIntent = new Intent(intent).setPackage(DRIVE_PACKAGE);
            try {
                fileChooserLauncher.launch(driveOpenDocIntent);
                return true;
            } catch (ActivityNotFoundException e) {
                // Fall through to attempt 2.
            }

            // Attempt 2: ACTION_GET_CONTENT targeted at the Drive app --
            // older/some Drive app builds expose a direct picker Activity
            // for this action even when they don't for ACTION_OPEN_DOCUMENT.
            Intent driveGetContentIntent = new Intent(Intent.ACTION_GET_CONTENT);
            driveGetContentIntent.addCategory(Intent.CATEGORY_OPENABLE);
            driveGetContentIntent.setType(intent.getType());
            if (intent.hasExtra(Intent.EXTRA_MIME_TYPES)) {
                driveGetContentIntent.putExtra(Intent.EXTRA_MIME_TYPES, intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
            }
            if (intent.hasExtra(Intent.EXTRA_ALLOW_MULTIPLE)) {
                driveGetContentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            driveGetContentIntent.setPackage(DRIVE_PACKAGE);
            try {
                fileChooserLauncher.launch(driveGetContentIntent);
                return true;
            } catch (ActivityNotFoundException e) {
                // Neither action has a directly-launchable Drive activity
                // on this device/Drive version -- fall through to the
                // general chooser below, where Drive still appears as a
                // source the user can tap into manually.
            }
        }

        // The one line that actually fixes the "Choose Files" bug: force
        // the chooser sheet instead of letting Android silently reuse a
        // saved default.
        Intent chooser = Intent.createChooser(intent, "Select File");
        try {
            fileChooserLauncher.launch(chooser);
        } catch (ActivityNotFoundException e) {
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

        pendingFilePathCallback.onReceiveValue(result);
        pendingFilePathCallback = null;
    }

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
