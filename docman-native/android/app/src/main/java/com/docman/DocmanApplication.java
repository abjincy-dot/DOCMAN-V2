// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/DocmanApplication.java

package com.docman;

import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;

import android.app.Application;

// Watches the PROCESS-level lifecycle (androidx.lifecycle's
// ProcessLifecycleOwner), not any single Activity's. This is the
// standard way to tell "the whole app was genuinely backgrounded (Home
// button, app switcher, screen lock)" apart from "one of our own
// Activities briefly stopped because a system chooser/share sheet/print
// dialog/camera is covering it" -- a hand-rolled per-Activity
// onStop/onResume counter gets that distinction wrong (both cases stop
// the foreground Activity), which is exactly the bug App-Lock-on-PDF-
// viewer needs to avoid (re-authenticating on every Share tap would be
// unusable). ProcessLifecycleOwner only fires onStop once EVERY
// Activity in the app has stopped and none is about to start, with its
// own built-in debounce for the rotation/quick-transition case.
public class DocmanApplication extends Application implements DefaultLifecycleObserver {

    @Override
    public void onCreate() {
        super.onCreate();
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);
    }

    @Override
    public void onStop(LifecycleOwner owner) {
        // App genuinely left the foreground. Nothing to record here beyond
        // what AppLockGate already tracks (enabled/not) -- the actual
        // "require reauth" flag gets set on the way back IN, in onStart.
    }

    @Override
    public void onStart(LifecycleOwner owner) {
        // App is back in the foreground after having been fully stopped.
        // If App Lock is armed, mark that the next PDF viewer (or the
        // WebView itself, which already has its own JS-driven lock
        // screen) must not show stale content until re-authenticated.
        AppLockGate.markNeedsReauth();
    }
}
