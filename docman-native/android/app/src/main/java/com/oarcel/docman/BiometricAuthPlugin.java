// FILE LOCATION:
// android/app/src/main/java/com/oarcel/docman/BiometricAuthPlugin.java
//
// Replace "com.oarcel.docman" below with YOUR app's real package name
// (check android/app/src/main/AndroidManifest.xml -> package="...").
//
// Wraps androidx.biometric.BiometricPrompt behind two simple JS-callable
// methods. One integration point covers whatever biometric methods the
// device actually has enrolled (fingerprint, face, iris) -- Android decides
// which UI to show, DOCMAN doesn't need to know or care which one it was.

package com.oarcel.docman;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    // Resolves { available: boolean, reason: string } -- reason is a short,
    // human-readable explanation when unavailable (no hardware, nothing
    // enrolled, etc.), useful for deciding whether to even show the option
    // in Settings.
    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int result = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);

        JSObject ret = new JSObject();
        switch (result) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                ret.put("available", true);
                ret.put("reason", "");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                ret.put("available", false);
                ret.put("reason", "No biometric hardware on this device");
                break;
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                ret.put("available", false);
                ret.put("reason", "Biometric hardware is currently unavailable");
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                ret.put("available", false);
                ret.put("reason", "No fingerprint or face enrolled on this device");
                break;
            default:
                ret.put("available", false);
                ret.put("reason", "Biometric unlock is not available");
        }
        call.resolve(ret);
    }

    // Always resolves (never rejects) with a structured result so the
    // caller can tell these apart instead of treating every non-success
    // outcome the same way:
    //   { success: true }                                   -- matched
    //   { success: false, negativeButton: true }             -- tapped "Use PIN instead"
    //   { success: false, negativeButton: false, message }   -- any other cancel/error
    @PluginMethod
    public void authenticate(PluginCall call) {
        final String reason = call.getString("reason", "Unlock DOCMAN");
        final android.app.Activity activity = getActivity();
        if (!(activity instanceof FragmentActivity)) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("negativeButton", false);
            ret.put("message", "Biometric prompt requires a FragmentActivity host");
            call.resolve(ret);
            return;
        }

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Unlock DOCMAN")
                        .setSubtitle(reason)
                        // This label is Android's own button on the SYSTEM
                        // dialog -- distinct from DOCMAN's own "Use PIN
                        // Instead" button on the HTML fallback screen, even
                        // though they're worded the same on purpose (so the
                        // person sees one consistent choice either way).
                        // Tapping this one fires onAuthenticationError with
                        // ERROR_NEGATIVE_BUTTON below, NOT a generic cancel.
                        .setNegativeButtonText("Use PIN instead")
                        .build();

                BiometricPrompt prompt = new BiometricPrompt(
                        (FragmentActivity) activity,
                        ContextCompat.getMainExecutor(getContext()),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                JSObject ret = new JSObject();
                                ret.put("success", true);
                                call.resolve(ret);
                            }

                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                JSObject ret = new JSObject();
                                ret.put("success", false);
                                // ERROR_NEGATIVE_BUTTON (13) is specifically
                                // "the person tapped Use PIN instead" -- every
                                // other code here is a real cancel/timeout/
                                // lockout/hardware error, which the caller
                                // should NOT treat as an explicit PIN request.
                                boolean isNegativeButton = errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON;
                                ret.put("negativeButton", isNegativeButton);
                                ret.put("message", errString != null ? errString.toString() : "Biometric authentication error");
                                call.resolve(ret);
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                // A single failed match (wrong finger/face) -- the
                                // system prompt stays open and lets the person retry,
                                // so this deliberately does NOT resolve the call.
                            }
                        }
                );

                prompt.authenticate(promptInfo);
            }
        });
    }
}