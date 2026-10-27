const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor: ' + a.slice(0, 70)); s = s.replace(a, () => b); }
rep("const CAL_AUTO_EVERY_MS = 6 * 3600000;      // at most one automatic sync every 6 hours",
    "const CAL_AUTO_EVERY_MS = 2 * 60000;        // at most one automatic sync every 2 minutes (it was 6 hours: a new calendar event took too long to show)");
// re-arm the alarms after an automatic run only when something changed (a run can happen every couple of minutes)
rep("        await armCalendarReminders(!auto);\n\n        const changed = added + updated + removed;",
    "        const changed = added + updated + removed;\n        if (!auto || changed) await armCalendarReminders(!auto);\n");
// opening the Reminders list also checks
rep("    applyExpdocGlider(overlay, activeTab);\n",
    "    applyExpdocGlider(overlay, activeTab);\n    if (!opts.rerender && activeTab === 'reminders') setTimeout(() => autoSyncCalendarIfDue(), 300);   // Auto-sync: look at the calendar when the list is opened\n");
fs.writeFileSync(f, s); console.log('edited');
