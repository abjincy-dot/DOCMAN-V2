package com.docman;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfNativePlugin.class);
        registerPlugin(BiometricAuthPlugin.class);
        registerPlugin(ExactAlarmPlugin.class);
        registerPlugin(EntitlementPlugin.class);
        registerPlugin(BillingPlugin.class);
        registerPlugin(DocumentScannerPlugin.class);
        registerPlugin(InAppReviewPlugin.class);
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(BackupSavePlugin.class);
        super.onCreate(savedInstanceState);
        // Force-discard the WebView's own HTTP disk/memory cache on every
        // launch. Capacitor serves app.js/index.html/etc. from this WebView
        // over its local https://localhost scheme, and installDebug (like a
        // real Play Store update) upgrades the APK in place without
        // touching the app's existing data -- so a stale cached copy of a
        // JS file can keep being served after a reinstall even though the
        // new file is sitting right there in the APK's assets, with no
        // Service Worker involved at all (that's registered only for the
        // browser/PWA build, skipped entirely in the native app -- see
        // index.html). clearCache(true) only discards this resource cache;
        // it does not touch cookies, localStorage, or IndexedDB, so none of
        // the user's saved files/departments/notes are affected.
        getBridge().getWebView().clearCache(true);
        // Android's Display > Font size feeds straight into a WebView as a
        // text zoom, so a phone set to 115% or 130% grew DOCMAN's type while
        // the containers it sits in stayed put: department names, row labels
        // and button captions were cut off. The web layer has its own type
        // scale and is sized for readability already, so the zoom is pinned
        // and the app renders identically whatever the phone is set to.
        getBridge().getWebView().getSettings().setTextZoom(100);
        // Enables chrome://inspect remote debugging of this app's WebView.
        // Debug builds only -- a release build on the Play Store must not
        // ship with this on, regardless of how narrow the actual exposure
        // is (USB debugging + an already-authorized computer), since Play
        // Store review and basic hardening checklists flag it unconditionally.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        // Must be set here, right after super.onCreate() -- NOT in
        // onPostCreate. DocmanWebChromeClient's constructor calls
        // bridge.registerForActivityResult(...) internally, and that API
        // requires the Activity to not yet have reached the STARTED
        // lifecycle state. onCreate() runs before onStart(), so this is
        // still safe here; onPostCreate() runs after onStart() and is too
        // late (this is what caused the crash-on-launch).
        getBridge().getWebView().setWebChromeClient(new DocmanWebChromeClient(getBridge()));
        exposeNavBarInsetToCss();
        // The exact-alarm toggle is no longer opened from here. Doing it in
        // onCreate meant a fresh install landed on an Android Settings screen
        // before the app had drawn anything, with nothing on it to say what it
        // was for -- and a back press out of it was final, because it only
        // ever asked once. The web layer now explains all three permissions
        // after the intro (showAlertSetup) and can be returned to from
        // Settings, so it keeps asking as long as it needs to.
    }

    // targetSdk 35+ forces edge-to-edge, so the page draws behind Android's
    // navigation buttons, and env(safe-area-inset-bottom) isn't reported by
    // every WebView version. Publish the real bar height as --nav-bottom
    // (CSS px) so bottom sheets can clear it. Re-sent on every page load,
    // since a value pushed before the page exists is lost.
    private int navBottomCssPx = 0;

    // Read the navigation bar's height; never stand in the way of it.
    //
    // This used to install an OnApplyWindowInsetsListener, and that cost the
    // app its text selection toolbar: a listener does not sit alongside a
    // view's own onApplyWindowInsets, it REPLACES it. On the WebView it
    // replaced Chromium's, and the Cut/Copy/Paste bar never appeared anywhere
    // in the app -- text selected perfectly, handles and magnifier and all,
    // and no bar, not once. Moving the listener to the WebView's parent only
    // moved the problem: what it replaced there was the step that walks insets
    // DOWN to the WebView, so the bar came back intermittently. The root was
    // no better.
    //
    // So nothing is intercepted now. getRootWindowInsets is a plain read, and
    // a layout listener is only a prompt to take that reading again -- every
    // view in the chain keeps its own handling, Chromium included.
    private void exposeNavBarInsetToCss() {
        final WebView webView = getBridge().getWebView();
        webView.getViewTreeObserver().addOnGlobalLayoutListener(() -> applyNavBarInset(webView));
        applyNavBarInset(webView);
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                navBottomCssPx = -1;          // force a fresh push to the new page
                applyNavBarInset(view);
            }
        });
    }

    // Guarded on both sides because a global layout listener fires constantly
    // and setPadding asks for another layout: without these the two would call
    // each other forever.
    private void applyNavBarInset(WebView webView) {
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(webView);
        if (insets == null) return;
        int bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
        // Keep the page out from under the navigation bar. Edge-to-edge let
        // file rows scroll beneath it, and a tap in that strip is taken by
        // Android -- so a row's "..." button sitting there fired Back instead
        // of opening the menu.
        if (webView.getPaddingBottom() != bottom) {
            webView.setPadding(0, 0, 0, bottom);
        }
        int css = Math.round(bottom / getResources().getDisplayMetrics().density);
        if (css != navBottomCssPx) {
            navBottomCssPx = css;
            pushNavBottom(webView);
        }
    }

    private void pushNavBottom(WebView webView) {
        webView.post(() -> webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--nav-bottom','" + navBottomCssPx + "px')", null));
    }

}
