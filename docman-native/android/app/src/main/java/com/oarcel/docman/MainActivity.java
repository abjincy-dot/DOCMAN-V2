package com.oarcel.docman;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfNativePlugin.class);
        registerPlugin(BiometricAuthPlugin.class);
        super.onCreate(savedInstanceState);
        // Enables chrome://inspect remote debugging of this app's WebView,
        // including on release builds (which have it off by default).
        // Safe to leave in production -- it only allows debugging over
        // USB with the device unlocked and USB debugging enabled by the
        // developer, and only from a computer already authorized via the
        // "Allow USB debugging?" prompt.
        WebView.setWebContentsDebuggingEnabled(true);
        // Must be set here, right after super.onCreate() -- NOT in
        // onPostCreate. DocmanWebChromeClient's constructor calls
        // bridge.registerForActivityResult(...) internally, and that API
        // requires the Activity to not yet have reached the STARTED
        // lifecycle state. onCreate() runs before onStart(), so this is
        // still safe here; onPostCreate() runs after onStart() and is too
        // late (this is what caused the crash-on-launch).
        getBridge().getWebView().setWebChromeClient(new DocmanWebChromeClient(getBridge()));
    }
}
