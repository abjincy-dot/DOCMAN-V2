package com.docman;

import android.content.Context;
import android.text.InputType;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

// Capacitor's WebView, with one addition: while the note editor is being typed in (the web layer calls DocmanSys.setVerbatim), the keyboard is told
// the field is verbatim text (no suggestions, no composing), so it does not underline the word being typed. Everywhere else the keyboard behaves as before.
public class DocmanWebView extends CapacitorWebView {
    private static volatile boolean verbatim = false;

    public DocmanWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public static void setVerbatim(boolean on) {
        verbatim = on;
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (verbatim && outAttrs != null && (outAttrs.inputType & InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_TEXT) {
            outAttrs.inputType = (outAttrs.inputType & ~InputType.TYPE_MASK_VARIATION)
                    | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                    | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
        }
        return ic;
    }
}
