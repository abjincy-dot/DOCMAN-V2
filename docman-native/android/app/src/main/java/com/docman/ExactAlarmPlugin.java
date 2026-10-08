package com.docman;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Android 12+ gates exact alarms behind a separate "Alarms & reminders"
// special permission, and from Android 14 (API 34) it is DENIED BY DEFAULT
// for any app targeting SDK 34+ -- DOCMAN targets 36, so every new install
// starts with it off.
//
// That matters because @capacitor/local-notifications silently degrades when
// it is off: LocalNotificationManager.setExactIfPossible() sees
// canScheduleExactAlarms() == false, logs a warning nobody reads, and falls
// back to setAndAllowWhileIdle() -- an INEXACT alarm that Doze is free to
// defer, often until the phone is next unlocked and the app is opened. From
// the outside that is exactly "my reminder never went off, then appeared
// when I opened the app".
//
// MainActivity already opens the system toggle once on first launch, but
// once only, and it marks itself as asked BEFORE the user answers -- so
// anyone who dismisses that screen has permanently broken reminders with no
// way back. This plugin lets the JS layer re-check at the moment it actually
// matters (when a reminder or expiry date is saved) and offer the settings
// screen again, as many times as it takes.
@CapacitorPlugin(name = "ExactAlarm")
public class ExactAlarmPlugin extends Plugin {

    // true when the OS will honour setExactAndAllowWhileIdle() for us.
    // Always true below Android 12, where no such permission exists.
    @PluginMethod
    public void canScheduleExact(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", canScheduleExactNow());
        call.resolve(ret);
    }

    // Opens the system "Alarms & reminders" toggle for this app. There is no
    // runtime-permission dialog for this one -- a Settings screen is the only
    // way to grant it, so the caller should explain why before calling this.
    @PluginMethod
    public void openSettings(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            ret.put("opened", false);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ret.put("opened", true);
        } catch (Exception e) {
            // A few OEM builds restrict this intent. Fall back to the app's
            // own details page, which always exists and has the toggle one
            // level in, rather than leaving the user with a dead button.
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                ret.put("opened", true);
            } catch (Exception e2) {
                ret.put("opened", false);
            }
        }
        call.resolve(ret);
    }

    // Whether the battery saver is currently allowed to put this app to sleep.
    // Exact alarms are only half the story: several manufacturers will still
    // freeze a background app and hold its alarm until the phone is next
    // unlocked, which from the outside looks identical to the alarm never
    // having been set.
    //
    // Reading this needs no permission. Only the direct "allow" dialog does,
    // and that permission is restricted on Play, so openBatterySettings()
    // takes the user to the screen instead of asking for it.
    @PluginMethod
    public void isBatteryUnrestricted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", batteryUnrestrictedNow());
        call.resolve(ret);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        JSObject ret = new JSObject();
        // App details first, NOT ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS.
        // That action was tried on a Galaxy S23 and lands on "Manage battery
        // usage": an alphabetical list of every app on the phone, with DOCMAN
        // somewhere down it. The app's own page already carries a Battery row
        // (and an "Alarms and reminders" row beside it), so it is one screen
        // closer and nothing has to be hunted for.
        boolean opened = openAppDetails();
        if (!opened && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            opened = startSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
        ret.put("opened", opened);
        call.resolve(ret);
    }

    // This app's own page in Settings -- the one screen every Android build
    // has, and where the OEM-specific toggles (autostart, background limits)
    // sit when they exist at all.
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("opened", openAppDetails());
        call.resolve(ret);
    }

    // The manufacturer, so the JS layer can decide whether to mention
    // autostart at all. There is no API to read it or to ask for it -- on the
    // phones that have such a setting, saying so is the only thing an app can
    // do about it.
    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    private boolean batteryUnrestrictedNow() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm == null) return true;   // cannot tell -- better than nagging wrongly
        return pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean openAppDetails() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        return startSettings(i);
    }

    private boolean startSettings(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean canScheduleExactNow() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
        if (am == null) return false;
        return am.canScheduleExactAlarms();
    }
}
