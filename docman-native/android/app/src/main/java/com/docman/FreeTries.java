package com.docman;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

// Which DOCMAN Pro tools this person has already used their one free try of.
//
// One record shared by the web layer (through EntitlementPlugin) and the
// native PDF viewer, which reads and writes it directly -- so the two can
// never disagree about whether a try is left.
//
// Kept in two places and read as the UNION of both, so losing either copy
// never hands the tries back:
//  1. SharedPreferences -- the normal copy.
//  2. A small hidden file in shared Documents storage, which survives
//     Settings > Clear Data. On Android 11+ a reinstall can no longer read it
//     (scoped storage), so reinstalling does reset the tries. That is
//     accepted: it is true of almost every app without its own server.
//
// Whether someone has BOUGHT Pro is never stored here. That answer only
// comes from Google Play (BillingPlugin).
final class FreeTries {

    // Must match FREE_TRIES in www/app.js.
    static final List<String> ALL = Arrays.asList(
            "scan", "sign", "highlight", "fillform", "redact", "crop", "ocr", "imageedit", "topdf", "mergepdf", "lock");

    private static final String PREFS = "docman_free_tries";
    private static final String KEY_USED = "used";
    private static final String MARKER_NAME = ".docman_tries";

    private FreeTries() { }

    static synchronized Set<String> used(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> stored = prefs.getStringSet(KEY_USED, null);

        Set<String> used = new LinkedHashSet<>();
        if (stored != null) used.addAll(stored);
        used.addAll(readMarker());
        used.retainAll(ALL);

        // The file remembered a try the prefs had lost (Clear Data): copy it back.
        if (stored == null ? !used.isEmpty() : !stored.equals(used)) {
            prefs.edit().putStringSet(KEY_USED, new HashSet<>(used)).apply();
        }
        return used;
    }

    static synchronized void consume(Context context, String feature) {
        if (!ALL.contains(feature)) return;
        Set<String> used = used(context);
        if (!used.add(feature)) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putStringSet(KEY_USED, new HashSet<>(used)).apply();
        writeMarker(used);
    }

    private static File markerFile() {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        return new File(dir, MARKER_NAME);
    }

    private static Set<String> readMarker() {
        Set<String> out = new HashSet<>();
        try {
            File f = markerFile();
            if (!f.exists() || f.length() > 4096) return out;
            byte[] buf = new byte[(int) f.length()];
            FileInputStream in = new FileInputStream(f);
            try {
                int n = 0;
                while (n < buf.length) {
                    int r = in.read(buf, n, buf.length - n);
                    if (r < 0) break;
                    n += r;
                }
            } finally {
                in.close();
            }
            for (String part : new String(buf, StandardCharsets.UTF_8).split(",")) {
                String key = part.trim();
                if (!key.isEmpty()) out.add(key);
            }
        } catch (Exception e) {
            // Unreadable (scoped storage after a reinstall, storage removed):
            // the prefs copy still counts.
        }
        return out;
    }

    private static void writeMarker(Set<String> used) {
        try {
            File f = markerFile();
            File parent = f.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) return;
            StringBuilder sb = new StringBuilder();
            for (String key : used) {
                if (sb.length() > 0) sb.append(',');
                sb.append(key);
            }
            FileOutputStream out = new FileOutputStream(f, false);
            try {
                out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            } finally {
                out.close();
            }
        } catch (Exception e) {
            // Not fatal: the prefs copy still holds it.
        }
    }
}
