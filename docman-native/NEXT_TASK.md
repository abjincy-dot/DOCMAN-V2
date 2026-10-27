# NEXT TASK (18 Oct) — Build the fixed-rail Reminders / Expiring panel (ONLY after the user says yes)

Full spec, traps and open questions: **HANDOVER.md section 0**. Preview the user liked: `preview/nested-rail-3.png` (source `preview/nested-rail-3-source.html`). Not built, not yet approved to build.
Steps once approved: (1) ask the 3 open questions in section 0; (2) rewrite the panel body in `showExpiringDocumentsPanel` (header, orange tab box, fixed bar, search row, scrolling slim cards) reusing the existing handlers (Done / Mark all done / edit / delete / open / view / remind, breathing tabs); (3) `node --check`, install to DOCMAN dev, look at the screen yourself; (4) update CURRENT_STATE.md, PROGRESS.md, HANDOVER.md. Do not remove working features; do not build an AAB.

The older task below (reminders under the alarm budget) is still valid and still waiting.

---

# NEXT TASK — Put reminders under the alarm budget

(Prepared 17 Oct 2026. **Not started.** Do this only after the user confirms they want it, and after the user has tested the dev-only 16 Oct work, since both go into the same next AAB.)

## Objective
Make reminder scheduling respect Android's 500-pending-alarm limit the way expiry scheduling already does, so a user with many documents **and** many reminders can never crash the app at launch.

## Why this one
Android throws "Maximum limit of concurrent alarms 500 reached" on the notification plugin's own thread; a JS `try/catch` cannot stop it, so the whole app dies at launch (it already happened in DOCMAN dev on 16 Oct). Expiry scheduling now keeps under `ALARM_BUDGET` (450) minus pending alarms, but reminders schedule with no check and share the same 500 pool. A real user with ~20 expiring documents (each arms up to ~25 alarms) plus reminders can still hit the cap.

## Files involved
- `www/app.js`: `ALARM_BUDGET` (~3314), `imgScheduleExpiryNotification` (~3388, the existing budget logic), `rescheduleAllExpiryNotifications` (~3485), reminder scheduling code (find with `grep -a "LocalNotifications.schedule"` and `REMINDERS_KEY`, `saveReminders` ~2255), `advanceReminderOccurrence`.
- `www/index.html`: bump `app.js?v=` (currently 637).
- Update `CURRENT_STATE.md`, `PROGRESS.md`, `HANDOVER.md`.
- No Java change expected; the plugin patch must not be touched.

## Current problem
Reminder notifications are scheduled without counting pending alarms. Expiry alarms are trimmed farthest-first against the budget; reminders are not, and are not counted when expiry computes "what is already pending".

## Expected result
- Total pending alarms never exceed 450 from DOCMAN, whatever mix of expiry dates and reminders exists.
- Reminders are never silently starved by expiry alarms: nearest-in-time alerts win across both kinds; only the farthest are dropped; the nearest reminder is always armed.
- Launch re-arms everything, so dropped far-future alerts come back as their date approaches.
- No change to the alert schedule, banner behaviour, or any UI.

## Risks
- Both kinds share one pool: trimming order bug could drop a due-today alert. Keep "nearest first".
- Reading pending alarms is async; double scheduling at launch (`queueExpiryAlertRefresh` fires 1.5 s after changes) can race.
- Reminder ids/groups must not collide with expiry ids (expiry day slots use 1000–1028 per document keying; check the id scheme before adding).
- Must not touch the hand-written `@capacitor/local-notifications` patch.

## Testing procedure
1. `node --check www/app.js` after every edit.
2. In DOCMAN dev (not the user's data; back up `docman_reminders_v1` first, restore after): use the devtools bridge (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`) to count pending alarms (`LocalNotifications.getPending()` and/or `adb shell dumpsys alarm | grep com.docman.dev`).
3. Stage > 450 candidate alarms (many dated docs + many reminders); confirm pending ≤ 450, the nearest reminder and nearest expiry are armed, app launches without crashing, `adb logcat` shows no "Maximum limit of concurrent alarms".
4. Confirm normal case (few items) is unchanged: same alarm count as before the change.
5. State explicitly to the user that they must re-test banner, reminders and expiry alerts on DOCMAN dev; do not build an AAB without confirming 68 / 1.0.0 with them.
