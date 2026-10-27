// Calendar reminders ring at 8:00 AM on the day and repeat every 30 minutes (same repeat rule as the user's own reminders)
// until the reminder is acted on (Done). Applies to arming after a sync / at launch AND to scheduleReminderNotification.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) {
    if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 70));
    s = s.replace(a, () => b);
}

// 1) header comment + constants
rep(`//  - Alarm trap: Android allows 500 alarms per app and the notification plugin crashes the whole app past that. An imported
//    reminder therefore gets ONE alarm (no 30-minute repeats), only the nearest ones are armed, and the count stays under
//    ALARM_BUDGET minus what is already pending. The rest still show in the list.`,
`//  - Alerts (21 Oct, the user's rule): a calendar reminder rings at 8:00 AM ON THE DAY and repeats every 30 minutes (3 hours,
//    like the user's own reminders) until it is acted on (Done). If that window is already over when it is armed but the event
//    is still ahead, it rings once at the event time instead.
//  - Alarm trap: Android allows 500 alarms per app and the notification plugin crashes the whole app past that. Each reminder
//    now owns up to 7 alarms, so only the nearest CAL_ALARM_EVENTS events are armed and the total stays under ALARM_BUDGET
//    minus what is already pending. The rest still show in the list and are armed when the app is opened later.`);
rep("const CAL_ALARM_CAP = 80;\n", "const CAL_ALARM_EVENTS = 40;         // nearest events that get alarms (up to 7 each)\nconst CAL_MORNING = '08:00';\n");

// 2) replace armCalendarReminders with the morning version + slot helper
const a0 = s.indexOf('// Arms ONE alarm per imported reminder');
const a1 = s.indexOf('async function syncPhoneCalendar()');
if (a0 < 0 || a1 < 0 || a1 < a0) throw new Error('arm block markers');
const newArm = `// When a calendar reminder rings: 8:00 AM on its day, then every REMINDER_REPEAT_MINUTES for REMINDER_REPEAT_HOURS. Slots already
// past are dropped (ids keep their index so a re-arm replaces the same alarms). If every slot is past but the event itself is still
// ahead today, one alert at the event time.
function calAlertSlots(r, now) {
    const morning = new Date(r.dueAt + 'T' + CAL_MORNING + ':00');
    const eventAt = new Date(r.dueAt + 'T' + (r.dueTime || '09:00') + ':00');
    const slots = [];
    for (let i = 0; i < reminderRepeatCount(); i++) {
        const t = new Date(morning.getTime() + i * REMINDER_REPEAT_MINUTES * 60000);
        if (t > now) slots.push({ at: t, i });
    }
    if (!slots.length && eventAt > now) slots.push({ at: eventAt, i: 0 });
    return slots;
}

// Re-arms every imported reminder's alerts: first clears all of theirs (so the count is exact), then arms the nearest events inside
// the alarm budget. Safe to call again and again; run after a sync and shortly after launch.
async function armCalendarReminders(askPermission) {
    const plugin = window.Capacitor?.Plugins?.LocalNotifications;
    if (!plugin || !isNativePlatform()) return;
    try {
        const imported = reminders.filter(r => r.calKey && r.dueAt);
        if (!imported.length) return;
        const now = new Date();
        let perm = await plugin.checkPermissions();
        if (perm.display !== 'granted' && askPermission) perm = await plugin.requestPermissions();
        if (perm.display !== 'granted') return;

        const ours = [];
        for (const r of imported) for (const id of reminderNotificationIds(r.id)) ours.push({ id });
        try { await plugin.cancel({ notifications: ours }); } catch (e) { /* nothing was armed */ }

        let room = ALARM_BUDGET;
        try { room -= ((await plugin.getPending())?.notifications || []).length; } catch (e) { /* count unknown: the event cap still applies */ }
        const cands = imported
            .filter(r => r.dueAckFor !== reminderOccurrenceKey(r))
            .map(r => ({ r, slots: calAlertSlots(r, now) }))
            .filter(x => x.slots.length)
            .sort((a, b) => a.slots[0].at - b.slots[0].at);

        const notifications = [];
        let events = 0;
        for (const x of cands) {
            if (events >= CAL_ALARM_EVENTS || notifications.length + x.slots.length > room) break;
            events++;
            for (const { at, i } of x.slots) {
                notifications.push({
                    id: reminderNotificationIdFor(x.r.id, i),
                    title: i === 0 ? 'Reminder' : 'Reminder still due',
                    body: 'You have a reminder due. Open DOCMAN to see it.',
                    schedule: { at, allowWhileIdle: true },
                    channelId: ALERT_CHANNEL_ID,
                    visibility: 1,
                    extra: { kind: 'reminder', reminderId: x.r.id },
                    group: \`docman-reminder-\${reminderNotificationIdFor(x.r.id, 0)}\`,
                    autoCancel: true
                });
            }
        }
        if (notifications.length) await plugin.schedule({ notifications });
    } catch (e) {
        console.warn('Could not arm calendar reminders:', e);
    }
}

`;
s = s.slice(0, a0) + newArm + s.slice(a1);

// 3) scheduleReminderNotification (edit / done-rolls-forward) uses the same morning rule for calendar reminders
rep(`    const at = new Date(reminder.dueAt + 'T' + (reminder.dueTime || '09:00') + ':00'); // defaults to 9am local if no time was set
    if (at <= new Date()) return;`,
`    const at = new Date(reminder.dueAt + 'T' + (reminder.dueTime || '09:00') + ':00'); // defaults to 9am local if no time was set
    // A calendar reminder rings at 8:00 AM on its day (see "Sync Calendar"), not at the event time.
    const calSlots = reminder.calKey ? calAlertSlots(reminder, new Date()) : null;
    if (calSlots ? !calSlots.length : at <= new Date()) return;`);
rep(`        for (let i = 0; i < reminderRepeatCount(); i++) {
            const at_i = new Date(at.getTime() + i * REMINDER_REPEAT_MINUTES * 60000);
            if (at_i <= now) continue; // a slot already past is simply skipped
            notifications.push({`,
`        const slots = calSlots || Array.from({ length: reminderRepeatCount() }, (_, i) => ({ at: new Date(at.getTime() + i * REMINDER_REPEAT_MINUTES * 60000), i }))
            .filter(sl => sl.at > now); // a slot already past is simply skipped
        for (const { at: at_i, i } of slots) {
            notifications.push({`);

fs.writeFileSync(f, s);
console.log('morning rule edited');
