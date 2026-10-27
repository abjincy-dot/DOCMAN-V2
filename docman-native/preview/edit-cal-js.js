// Sync Calendar: a repeating calendar event becomes ONE reminder (monthly / yearly repeat natively, otherwise its next date only),
// and the per-day duplicates imported by the first version are removed on the next sync.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) {
    if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 70));
    s = s.replace(a, () => b);
}

rep("const CAL_MAX_PER_SERIES = 60;      // a daily event would otherwise be 365 reminders\n", "");

rep(`    const key = ev.recurring ? 'cal:' + ev.eventId + ':' + dueAt : 'cal:' + ev.eventId;
    const snap = [title, dueAt, dueTime, endTime || '', place || ''].join('|');
    return { key, title, dueAt, dueTime, endTime, place, details, snap };
}`, `    // ONE reminder per calendar event, however often it repeats (a monthly rent event was 12 identical reminders).
    const key = 'cal:' + ev.eventId;
    const repeat = calRepeatOf(ev);
    // A reminder that repeats by itself keeps its own date, so its date is not part of what "the calendar changed" means.
    const snap = (repeat === 'none' ? [title, dueAt, dueTime, endTime || '', place || ''] : [title, dueTime, endTime || '', place || '', repeat]).join('|');
    return { key, title, dueAt, dueTime, endTime, place, details, snap, repeat };
}

// DOCMAN reminders repeat every month or every year on their own. A calendar event maps onto that only when it is a plain
// "every month" / "every year" with no end and no "second Tuesday" style rule; anything else (daily, weekly, custom) comes
// in as its NEXT occurrence only, and the next Sync moves it on.
function calRepeatOf(ev) {
    const rule = String(ev.rrule || '').toUpperCase();
    if (!ev.recurring || !rule) return 'none';
    if (/UNTIL=|COUNT=|BYDAY|BYSETPOS|BYWEEKNO|BYYEARDAY|BYMONTH=|BYMONTHDAY=[^;]*[,-]/.test(rule)) return 'none';
    const interval = /INTERVAL=(\\d+)/.exec(rule);
    if (interval && Number(interval[1]) !== 1) return 'none';
    if (/FREQ=MONTHLY/.test(rule)) return 'monthly';
    if (/FREQ=YEARLY/.test(rule)) return 'yearly';
    return 'none';
}`);

rep("        const perSeries = new Map();\n", "");
rep(`            const n = (perSeries.get(ev.eventId) || 0) + 1;
            perSeries.set(ev.eventId, n);
            if (n > CAL_MAX_PER_SERIES) continue;
`, "");
rep("if (dismissed.has(f.key) || seenKeys.has(f.key)) continue;", "if (dismissed.has(f.key) || seenKeys.has(f.key)) continue;   // a series: its nearest occurrence only");

rep(`        const byKey = new Map();
        for (const r of reminders) if (r.calKey) byKey.set(r.calKey, r);
        let added = 0, updated = 0, seq = 0;`, `        // The first version imported every occurrence of a repeating event as its own reminder (key "cal:<id>:<day>"). Those
        // duplicates are the one thing a sync removes.
        const OLD_KEY = /^cal:[^:]+:\\d{4}-\\d{2}-\\d{2}$/;
        const stale = reminders.filter(r => r.calKey && OLD_KEY.test(r.calKey));
        for (const r of stale) { try { await cancelReminderNotification(r.id); } catch (e) { /* nothing armed */ } }
        const removed = stale.length;
        if (removed) reminders = reminders.filter(r => !(r.calKey && OLD_KEY.test(r.calKey)));

        const byKey = new Map();
        for (const r of reminders) if (r.calKey) byKey.set(r.calKey, r);
        let added = 0, updated = 0, seq = 0;`);

rep(`                    ex.title = f.title; ex.dueAt = f.dueAt; ex.dueTime = f.dueTime; ex.endTime = f.endTime;
                    ex.place = f.place; ex.details = f.details; ex.calSnap = f.snap;
                    ex.repeatAnchorDay = Number(f.dueAt.slice(8, 10)) || 1;
                    ex.dueAckFor = null;
                    updated++;`, `                    ex.title = f.title; ex.dueTime = f.dueTime; ex.endTime = f.endTime;
                    ex.place = f.place; ex.details = f.details; ex.calSnap = f.snap;
                    const selfRepeats = f.repeat !== 'none' && ex.repeat === f.repeat;   // it rolls its own date forward
                    if (!selfRepeats) {
                        ex.dueAt = f.dueAt;
                        ex.repeatAnchorDay = Number(f.dueAt.slice(8, 10)) || 1;
                        ex.dueAckFor = null;
                    }
                    ex.repeat = f.repeat;
                    updated++;`);

rep("                repeat: 'none', repeatAnchorDay: Number(f.dueAt.slice(8, 10)) || 1,\n                noteRef: null, place: f.place,", "                repeat: f.repeat, repeatAnchorDay: Number(f.dueAt.slice(8, 10)) || 1,\n                noteRef: null, place: f.place,");

rep(`        else if (!added && !updated) showToast('Calendar is already up to date');
        else showToast('Calendar synced: ' + added + ' added' + (updated ? ', ' + updated + ' updated' : '') + (wanted.length >= CAL_MAX_REMINDERS ? ' (nearest ' + CAL_MAX_REMINDERS + ')' : ''));`,
`        else if (!added && !updated && !removed) showToast('Calendar is already up to date');
        else showToast('Calendar synced: ' + added + ' added' + (updated ? ', ' + updated + ' updated' : '') + (removed ? ', ' + removed + ' duplicates removed' : '') + (wanted.length >= CAL_MAX_REMINDERS ? ' (nearest ' + CAL_MAX_REMINDERS + ')' : ''));`);

fs.writeFileSync(f, s);
console.log('js edited');
