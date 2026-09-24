package com.docman;

import android.app.AlarmManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
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
        requestExactAlarmPermissionOnce();
    }

    // targetSdk 35+ forces edge-to-edge, so the page draws behind Android's
    // navigation buttons, and env(safe-area-inset-bottom) isn't reported by
    // every WebView version. Publish the real bar height as --nav-bottom
    // (CSS px) so bottom sheets can clear it. Re-sent on every page load,
    // since a value pushed before the page exists is lost.
    private int navBottomCssPx = 0;

    private void exposeNavBarInsetToCss() {
        final WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            float density = getResources().getDisplayMetrics().density;
            navBottomCssPx = Math.round(bars.bottom / density);
            pushNavBottom(webView);
            // A listener REPLACES the WebView's own inset handling, which is
            // what feeds env(safe-area-inset-*) to the page. Returning the
            // insets untouched (as v6/1.0.3 did) zeroed those values and slid
            // the header up under the status bar -- so hand them on as well.
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                pushNavBottom(view);
            }
        });
    }

    private void pushNavBottom(WebView webView) {
        webView.post(() -> webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--nav-bottom','" + navBottomCssPx + "px')", null));
    }

    // Android 12+ (S) requires the separate "Alarms & reminders" special
    // permission before AlarmManager.canScheduleExactAlarms() returns true.
    // Without it, the notification plugin's own canScheduleExactAlarms()
    // check (see @capacitor/local-notifications' LocalNotificationManager)
    // silently falls back to an INEXACT alarm for every scheduled reminder
    // and expiry alert -- which the OS is free to delay for a long time
    // while the phone is idle/locked, rather than firing anywhere near the
    // set time. This is what "no notification or sound at all while the
    // phone is locked" looks like from the outside -- Asked once, ever --
    // this opens a system Settings toggle screen, not a runtime permission
    // popup.
    private void requestExactAlarmPermissionOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        SharedPreferences prefs = getSharedPreferences("docman_native_prefs", MODE_PRIVATE);
        if (prefs.getBoolean("asked_exact_alarm_permission", false)) return;

        AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (alarmManager != null && !alarmManager.canScheduleExactAlarms()) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
                // Only now, having actually shown the screen, is it true that
                // we asked. Setting this up front (as this did before) meant a
                // user who never saw the screen -- or dismissed it -- was never
                // asked again, and their reminders silently never fired.
                prefs.edit().putBoolean("asked_exact_alarm_permission", true).apply();
            } catch (Exception e) {
                // Some OEM builds restrict this intent -- fall through
                // silently rather than crash; reminders still work via the
                // in-app due-reminders check either way.
            }
        }
    }
}
