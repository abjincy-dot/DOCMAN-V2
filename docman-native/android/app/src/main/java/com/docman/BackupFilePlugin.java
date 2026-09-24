package com.docman;

import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.RandomAccessFile;

// Reads one piece of a file (offset + length), so the JS backup/restore code
// can stream multi-GB libraries without ever holding a whole file in memory.
// The WebView can't do this itself: Capacitor's local server ignores the
// start of an HTTP Range request, and Filesystem.readFile has no offset.
// Limited to the app's own storage (DATA and CACHE), which is where library
// files and safety snapshots live.
@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {

    private static final int MAX_CHUNK = 8 * 1024 * 1024;

    @PluginMethod
    public void readChunk(PluginCall call) {
        String uriString = call.getString("uri");
        Double offsetD = call.getDouble("offset");
        Integer length = call.getInt("length");
        if (uriString == null || offsetD == null || length == null || offsetD < 0 || length <= 0 || length > MAX_CHUNK) {
            call.reject("Bad arguments");
            return;
        }
        long offset = offsetD.longValue();
        try {
            String path = Uri.parse(uriString).getPath();
            if (path == null) { call.reject("Bad uri"); return; }
            File file = new File(path).getCanonicalFile();
            String canon = file.getPath();
            String filesDir = getContext().getFilesDir().getCanonicalPath();
            String cacheDir = getContext().getCacheDir().getCanonicalPath();
            if (!canon.startsWith(filesDir + File.separator) && !canon.startsWith(cacheDir + File.separator)) {
                call.reject("Outside app storage");
                return;
            }
            byte[] buf = new byte[length];
            int total = 0;
            try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                raf.seek(offset);
                while (total < length) {
                    int n = raf.read(buf, total, length - total);
                    if (n < 0) break;
                    total += n;
                }
            }
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(buf, 0, total, Base64.NO_WRAP));
            ret.put("bytesRead", total);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }
}
