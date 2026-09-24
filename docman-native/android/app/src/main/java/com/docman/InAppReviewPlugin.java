package com.docman;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

// "Rate DOCMAN": Google Play's own in-app review card (approved 2026-09-16).
//
// Google draws the card and decides whether it actually appears (it has its
// own quota and stays silent for sideloaded builds), and it never tells the
// app whether the user rated -- so this reports only whether a launch was
// attempted. The JS side decides *when* to ask; this side refuses whenever
// DOCMAN is not the focused window (the native PDF viewer, the scanner, a
// share sheet or a system dialog is on top), so the card can never land on
// top of someone's work.
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {

    @PluginMethod
    public void requestReview(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            resolve(call, false);
            return;
        }
        activity.runOnUiThread(() -> {
            if (!isFocused(getActivity())) {
                resolve(call, false);
                return;
            }
            ReviewManager manager = ReviewManagerFactory.create(getContext());
            manager.requestReviewFlow().addOnCompleteListener(request -> {
                Activity current = getActivity();
                if (!request.isSuccessful() || !isFocused(current)) {
                    resolve(call, false);
                    return;
                }
                ReviewInfo info = request.getResult();
                manager.launchReviewFlow(current, info)
                        .addOnCompleteListener(flow -> resolve(call, true));
            });
        });
    }

    private static boolean isFocused(Activity activity) {
        return activity != null && !activity.isFinishing() && activity.hasWindowFocus();
    }

    private static void resolve(PluginCall call, boolean launched) {
        JSObject ret = new JSObject();
        ret.put("launched", launched);
        call.resolve(ret);
    }
}
