# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------
# DOCMAN release-build rules
# ---------------------------------------------------------------------

# Keep readable stack traces in crash reports.
-keepattributes SourceFile,LineNumberTable

# Capacitor dispatches to plugin methods by name via reflection
# (Bridge.call... -> @PluginMethod). R8 doesn't know these are entry
# points, so without this it will rename/strip them and every native
# call from app.js (BiometricAuth.*, PdfNative.*) will silently fail
# at runtime instead of failing to compile.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class com.oarcel.docman.BiometricAuthPlugin { *; }
-keep class com.oarcel.docman.PdfNativePlugin { *; }

# android-pdf-viewer (io.github.oothp) binds to PDFium through JNI.
# Native methods must keep their exact names/signatures or the
# native .so lookup fails.
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.shockwave.pdfium.** { *; }
-keep class com.github.barteksc.pdfviewer.** { *; }

# Capacitor's own framework classes ship their own consumer rules
# inside the AAR, so no manual rules needed for @capacitor/* here.
