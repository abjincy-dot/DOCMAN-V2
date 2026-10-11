package com.docman;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

// "Save a copy of the backup wherever you keep things" -- Drive, OneDrive, the
// SD card, a local folder -- through the system's own file picker.
//
// Sharing was the only route before, and on a phone that uses AOSP's Sharesheet
// rather than an OEM one that crashed: "Intent Resolver keeps stopping", with
// the backup left on the phone and no way to get it off. It worked on a Galaxy
// S23 because Samsung ships its own share sheet. Keeping a backup off the phone
// is the whole point of making one, so it cannot depend on which share sheet a
// phone happens to have.
//
// ACTION_CREATE_DOCUMENT is the right tool anyway: sharing means "send this to
// someone", while this is a save, and the picker names the file, asks where it
// goes, and hands back a URI to write into. Google Drive appears there as a
// destination on any phone that has it. The copy is streamed, so a multi-GB
// library never sits in memory.
@CapacitorPlugin(name = "BackupSave")
public class BackupSavePlugin extends Plugin {

    private static final int BUFFER = 256 * 1024;

    // uri       file:// path to the backup already written on this device
    // name      what the picker should suggest as the file name
    // mimeType  optional; octet-stream is right for a format nothing else reads
    @PluginMethod
    public void saveCopy(PluginCall call) {
        String src = call.getString("uri");
        if (src == null || src.isEmpty()) {
            call.reject("No source file given");
            return;
        }
        String name = call.getString("name", "backup");
        String mime = call.getString("mimeType", "application/octet-stream");

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        // Keep the call so its "uri" can be read again once a destination has
        // been chosen; the copy cannot start until then.
        call.setKeepAlive(true);
        startActivityForResult(call, intent, "onDestinationChosen");
    }

    @ActivityCallback
    private void onDestinationChosen(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
                || result.getData().getData() == null) {
            // Backing out of the picker is an ordinary thing to do, not an error.
            ret.put("saved", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        Uri dest = result.getData().getData();
        String src = call.getString("uri");
        if (src == null) { call.reject("No source file given"); return; }

        InputStream in = null;
        OutputStream out = null;
        try {
            in = openSource(src);
            out = getContext().getContentResolver().openOutputStream(dest);
            if (in == null || out == null) { call.reject("Could not open the file to copy"); return; }

            byte[] buf = new byte[BUFFER];
            long total = 0;
            int read;
            while ((read = in.read(buf)) > 0) {
                out.write(buf, 0, read);
                total += read;
            }
            out.flush();

            ret.put("saved", true);
            ret.put("cancelled", false);
            ret.put("bytes", total);
            // Which provider took the file. The JS side uses this to notice a
            // copy that never left the phone, which is the one destination a
            // backup must not end on: Android offers no way to keep local
            // storage out of the picker, so the only thing left is to say so
            // afterwards.
            ret.put("authority", dest.getAuthority() == null ? "" : dest.getAuthority());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the copy: " + e.getMessage());
        } finally {
            closeQuietly(in);
            closeQuietly(out);
        }
    }

    // The JS side hands over whatever Filesystem.getUri returned, which is a
    // file:// URI on Android; a content:// one is read through the resolver.
    private InputStream openSource(String src) throws Exception {
        if (src.startsWith("content:")) {
            return getContext().getContentResolver().openInputStream(Uri.parse(src));
        }
        String path = src.startsWith("file:") ? Uri.parse(src).getPath() : src;
        if (path == null) return null;
        File f = new File(path);
        if (!f.exists() || !f.isFile()) return null;
        return new FileInputStream(f);
    }

    private void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try { c.close(); } catch (Exception ignored) { }
    }
}
