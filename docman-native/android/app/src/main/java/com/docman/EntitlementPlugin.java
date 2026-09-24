package com.docman;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Set;

// The web layer's view of DOCMAN's free tries: every Pro tool can be used
// once for free, then it asks for Pro. There is no time-limited trial.
// The record itself lives in FreeTries, shared with the native PDF viewer.
//
// Deliberately does NOT own whether the user has paid -- that answer only
// ever comes from Google Play Billing (BillingPlugin), which cannot be
// spoofed locally.
@CapacitorPlugin(name = "Entitlement")
public class EntitlementPlugin extends Plugin {

    @PluginMethod
    public void getFreeTries(PluginCall call) {
        call.resolve(result(FreeTries.used(getContext())));
    }

    // Called only once the result of a free try has actually been saved.
    @PluginMethod
    public void useFreeTry(PluginCall call) {
        String feature = call.getString("feature", "");
        if (!FreeTries.ALL.contains(feature)) {
            call.reject("Unknown feature: " + feature);
            return;
        }
        FreeTries.consume(getContext(), feature);
        call.resolve(result(FreeTries.used(getContext())));
    }

    private static JSObject result(Set<String> used) {
        JSArray usedList = new JSArray();
        for (String key : used) usedList.put(key);
        JSArray all = new JSArray();
        for (String key : FreeTries.ALL) all.put(key);
        JSObject ret = new JSObject();
        ret.put("used", usedList);
        ret.put("all", all);
        return ret;
    }
}
