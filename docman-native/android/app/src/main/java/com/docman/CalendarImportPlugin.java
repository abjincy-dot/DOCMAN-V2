package com.docman;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// "Sync Calendar": READS the events in the phone's calendar app (Google Calendar, Samsung Calendar, ...) so the web layer can
// list them as reminders. Read only: nothing is ever written to the calendar, and nothing is sent anywhere -- the events go
// straight from the phone's calendar database into DOCMAN's own storage.
//
// Uses the Instances table, which has already expanded repeating events into one row per occurrence inside the asked range.
// Cancelled events and calendars the phone itself hides are left out.
@CapacitorPlugin(
        name = "CalendarImport",
        permissions = { @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = "calendar") }
)
public class CalendarImportPlugin extends Plugin {

    // A busy calendar over a year can hold thousands of rows (a daily event alone is 365). The web layer trims again; this
    // only keeps one call from building an enormous answer.
    private static final int MAX_ROWS = 4000;

    // startMs / endMs   the window to read, in epoch milliseconds
    // Resolves { events: [ { eventId, begin, end, title, allDay, location, calendar, recurring, rrule } ] }
    @PluginMethod
    public void getEvents(final PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }
        // Read from the raw JSON: a date in milliseconds is a Long, and PluginCall.getDouble/getInt return nothing for a Long
        // (this was the "Bad date range" error on the first run).
        final long start = call.getData().optLong("startMs", 0);
        final long end = call.getData().optLong("endMs", 0);
        if (start <= 0 || end <= start) {
            call.reject("Bad date range");
            return;
        }

        // Off the bridge thread: a large calendar is a real query.
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    call.resolve(read(start, end));
                } catch (SecurityException e) {
                    call.reject("Calendar permission not granted");
                } catch (Exception e) {
                    call.reject("Could not read the calendar: " + e.getMessage());
                }
            }
        }, "docman-calendar-import").start();
    }

    private JSObject read(long start, long end) {
        ContentResolver cr = getContext().getContentResolver();
        String[] proj = {
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
                CalendarContract.Instances.VISIBLE,
                CalendarContract.Instances.STATUS
        };

        List<JSObject> rows = new ArrayList<>();
        Set<Long> ids = new HashSet<>();
        Cursor c = null;
        try {
            c = CalendarContract.Instances.query(cr, proj, start, end);
            while (c != null && c.moveToNext() && rows.size() < MAX_ROWS) {
                if (c.getInt(7) == 0) continue;                                   // calendar hidden on the phone
                if (c.getInt(8) == CalendarContract.Events.STATUS_CANCELED) continue;
                long eventId = c.getLong(0);
                JSObject o = new JSObject();
                o.put("eventId", String.valueOf(eventId));
                o.put("begin", c.getLong(1));
                o.put("end", c.getLong(2));
                o.put("title", c.isNull(3) ? "" : c.getString(3));
                o.put("allDay", c.getInt(4) == 1);
                o.put("location", c.isNull(5) ? "" : c.getString(5));
                o.put("calendar", c.isNull(6) ? "" : c.getString(6));
                rows.add(o);
                ids.add(eventId);
            }
        } finally {
            if (c != null) c.close();
        }

        // Which of those events repeat. Instances does not say, and the web layer needs to know: a one-off event that is moved
        // in the calendar must UPDATE its reminder, while each occurrence of a repeating one is its own reminder.
        Map<Long, String> repeating = repeatingEvents(cr, ids);
        JSArray arr = new JSArray();
        for (JSObject o : rows) {
            long id;
            try { id = Long.parseLong(o.getString("eventId")); } catch (Exception e) { id = -1; }
            try {
                o.put("recurring", repeating.containsKey(id));
                String rule = repeating.get(id);
                o.put("rrule", rule == null ? "" : rule);   // e.g. FREQ=MONTHLY;INTERVAL=1 (empty when it only has fixed extra dates)
            } catch (Exception ignored) { }
            arr.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("events", arr);
        ret.put("truncated", rows.size() >= MAX_ROWS);
        return ret;
    }

    private Map<Long, String> repeatingEvents(ContentResolver cr, Set<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        List<Long> list = new ArrayList<>(ids);
        for (int i = 0; i < list.size(); i += 100) {
            List<Long> chunk = list.subList(i, Math.min(list.size(), i + 100));
            StringBuilder in = new StringBuilder();
            for (Long id : chunk) { if (in.length() > 0) in.append(','); in.append(id); }
            Cursor c = null;
            try {
                c = cr.query(CalendarContract.Events.CONTENT_URI,
                        new String[] { CalendarContract.Events._ID, CalendarContract.Events.RRULE, CalendarContract.Events.RDATE },
                        CalendarContract.Events._ID + " IN (" + in + ")", null, null);
                while (c != null && c.moveToNext()) {
                    boolean rrule = !c.isNull(1) && !c.getString(1).isEmpty();
                    boolean rdate = !c.isNull(2) && !c.getString(2).isEmpty();
                    if (rrule || rdate) out.put(c.getLong(0), rrule ? c.getString(1) : "");
                }
            } catch (Exception ignored) {
                // Unknown repeat state: those events are then treated as one-offs, which is the harmless direction.
            } finally {
                if (c != null) c.close();
            }
        }
        return out;
    }
}
