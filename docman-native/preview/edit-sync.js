const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 60)); s = s.replace(a, () => b); }
rep("    lock: 'Locking items'\n};", "    lock: 'Locking items',\n    calsync: 'Calendar sync'\n};");
rep("    ['fa-bell', 'Unlimited reminders & expiry dates', 'Free includes ' + FREE_REMINDERS + ' of each']", "    ['fa-bell', 'Unlimited reminders & calendar sync', 'Free includes ' + FREE_REMINDERS + ' reminders, ' + FREE_EXPIRY_DATES + ' expiry dates and one calendar sync']");
rep("<div class=\"xc-ht\"><div class=\"xc-title\">${titleHtml}</div><div class=\"xc-sub\">${escapeHtml(subtitleText)}</div></div></div>",
    "<div class=\"xc-ht\"><div class=\"xc-title\">${titleHtml}</div><div class=\"xc-sub\">${escapeHtml(subtitleText)}</div></div>${activeTab === 'reminders' && !remindersCalMode ? '<button id=\"expdocSyncCal\" class=\"xc-sync\" type=\"button\"><i class=\"fas fa-calendar-days\"></i><span>Sync Calendar</span></button>' : ''}</div>");
rep("    const addBtn = overlay.querySelector('#expdocAddReminder');\n    if (addBtn) addBtn.addEventListener('click', () => {",
    "    const syncBtn = overlay.querySelector('#expdocSyncCal');\n    if (syncBtn) syncBtn.addEventListener('click', () => syncPhoneCalendar());\n    const addBtn = overlay.querySelector('#expdocAddReminder');\n    if (addBtn) addBtn.addEventListener('click', () => {");
rep("                rescheduleAllExpiryNotifications();\n                recordReviewUsageDay();", "                rescheduleAllExpiryNotifications();\n                setTimeout(() => armCalendarReminders(false), 4000);   // after the document alerts, so the alarm budget is counted right\n                recordReviewUsageDay();");
fs.writeFileSync(f, s);
console.log('edited');
