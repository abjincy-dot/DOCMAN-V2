// "i" screen (How to Use DOCMAN): the real feature changes since the last build - Sync Calendar + Auto, the free allowance of 3
// reminders / 3 expiry dates, Save a copy to Google Drive, and the Pro list. (Only features go here, never bug fixes.)
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) {
    if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80));
    s = s.replace(a, () => b);
}

// 1) new Sync Calendar row, right after the Reminders row (before the Lock row)
rep(`  <div class="dept-info-help-row">
    <div class="dept-info-help-icon">🔒</div>`,
`  <div class="dept-info-help-row">
    <div class="dept-info-help-icon">📲</div>
    <div class="dept-info-help-text"><b>Sync Calendar</b> &mdash; On the <b>Reminders</b> tab, press <b>Sync Calendar</b> and DOCMAN reads your phone&rsquo;s calendar (Google, Samsung and any other calendar on your phone) and lists everything coming up in the next year as reminders, in date order. DOCMAN only <b>reads</b> your calendar &mdash; it never changes it &mdash; and nothing leaves your phone. A calendar reminder alerts you at <b>8am on the day</b> and every 30 minutes until 11am, until you press <b>Done</b>. A repeating event comes in once: a monthly or yearly one repeats by itself, and any other shows its next date and moves on when you sync again. Press the button again any time: new events are added, changed ones are updated, and any you deleted come back. Switch on <b>AUTO</b> beside the button and DOCMAN syncs by itself whenever you open the app (Auto-sync is part of DOCMAN Pro; the button itself gets one free try). Free DOCMAN holds <b>3 reminders</b> and <b>3 expiry dates</b>; more than that is part of DOCMAN Pro.</div>
  </div>

  <div class="dept-info-help-row">
    <div class="dept-info-help-icon">🔒</div>`);

// 2) Backup row: Save a copy goes straight to Google Drive
rep("so a wrong import is never permanent.</div>",
    "so a wrong import is never permanent. After a backup, <b>Save a copy</b> opens Google Drive&rsquo;s save screen so the copy leaves your phone (if Drive isn&rsquo;t installed, you pick the place yourself).</div>");

// 3) Pro row
rep("Merge PDFs and Lock can each be used once for free", "Merge PDFs, Calendar sync and Lock can each be used once for free");
rep("add as many departments and folders as you need.", "add as many departments, folders, reminders and expiry dates as you need.");

fs.writeFileSync(f, s);
console.log('help edited');
