package com.docman;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Reading and writing the system clipboard, for the web layer.
//
// Android's own Cut/Copy/Paste bar never appears anywhere in DOCMAN. Text
// selects normally -- handles, magnifier, the lot -- and Samsung Notes on the
// same phone shows the bar, so neither the selection nor the phone is at
// fault. It was measured down to this: Chromium's selection controller is
// alive and never asks for an ActionMode at all, and a logging override of
// onWindowStartingActionMode on the activity stayed silent throughout. The
// app's CSS, its markup, its native code and its activity theme were each
// ruled out on the device. See ISSUES.md.
//
// That is still open, but a note nobody can copy out of is a note half
// useless, so the app offers the two actions itself. The web Clipboard API
// was not an option: writeText is unreliable in a WebView and readText is
// refused outright without a permission prompt a WebView has no way to show.
// ClipboardManager has neither problem.
@CapacitorPlugin(name = "DocmanClipboard")
public class ClipboardPlugin extends Plugin {

    private static final String LABEL = "DOCMAN";

    @PluginMethod
    public void write(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("Nothing to copy");
            return;
        }
        try {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) { call.reject("No clipboard on this device"); return; }
            cm.setPrimaryClip(ClipData.newPlainText(LABEL, text));
            JSObject ret = new JSObject();
            ret.put("copied", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not copy: " + e.getMessage());
        }
    }

    // Returns "" rather than rejecting when the clipboard is empty or holds
    // something that is not text -- an image, say. The caller treats both the
    // same way: there is nothing to paste.
    @PluginMethod
    public void read(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ClipboardManager cm = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) {
                ret.put("text", "");
                call.resolve(ret);
                return;
            }
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) {
                ret.put("text", "");
                call.resolve(ret);
                return;
            }
            // coerceToText rather than getText: it also turns a copied URI or
            // an HTML fragment into something sensible to paste.
            CharSequence text = clip.getItemAt(0).coerceToText(getContext());
            ret.put("text", text == null ? "" : text.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read the clipboard: " + e.getMessage());
        }
    }
}
