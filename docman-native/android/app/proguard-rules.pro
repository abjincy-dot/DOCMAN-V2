# Keep line numbers/file names in crash stacks Play shows us.
-keepattributes SourceFile,LineNumberTable

# Capacitor finds plugin methods reflectively, so the annotated classes and
# their @PluginMethod methods must survive shrinking. This covers every
# DOCMAN plugin (PdfNative, BiometricAuth, ExactAlarm, Entitlement, Billing,
# DocumentScanner, InAppReview, BackupFile) without naming them one by one.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# JNI entry points.
-keepclasseswithmembernames class * {
    native <methods>;
}

# The PDF engine and its JNI bridge: pdfium's native side looks these up by
# name, so renaming them breaks rendering at runtime rather than at build time.
-keep class com.shockwave.pdfium.** { *; }
-keep class com.github.barteksc.pdfviewer.** { *; }

# PDFBox ships JPEG2000 support that references an optional library we do not
# bundle; nothing in DOCMAN reaches that code path.
-dontwarn com.gemalto.jp2.**
