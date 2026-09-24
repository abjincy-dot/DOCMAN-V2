// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/AppLockGate.java

package com.docman;

// Tiny static state shared between DocmanApplication (which watches the
// PROCESS-level lifecycle) and PdfViewerActivity (which acts on it).
// Deliberately holds no PIN/biometric logic of its own -- that stays in
// JS, where it already exists and is already tested. This class only
// answers two questions: "is App Lock currently armed?" (pushed from JS
// whenever the setting changes) and "did the process just come back from
// being genuinely backgrounded while armed?" (set by DocmanApplication,
// consumed by PdfViewerActivity.onResume()).
final class AppLockGate {
    private AppLockGate() { }

    private static volatile boolean enabled = false;
    private static volatile boolean needsReauth = false;

    static void setEnabled(boolean value) {
        enabled = value;
        if (!value) needsReauth = false;
    }

    static boolean isEnabled() {
        return enabled;
    }

    // Called by DocmanApplication's ProcessLifecycleOwner observer when the
    // whole app (not just one Activity) resumes after having been fully
    // stopped -- NOT on rotation, and NOT on returning from a share sheet/
    // print dialog/camera/file picker, all of which keep the process in the
    // STARTED state throughout (see DocmanApplication's own comment).
    static void markNeedsReauth() {
        if (enabled) needsReauth = true;
    }

    // Consumed (not just read) so a second Activity resuming right after
    // the first doesn't also treat the same backgrounding event as a fresh
    // reason to bounce itself.
    static boolean consumeNeedsReauth() {
        boolean was = needsReauth;
        needsReauth = false;
        return was;
    }
}
