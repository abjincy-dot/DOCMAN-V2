// Moves the 20-22 Oct appended session entries from the END of CURRENT_STATE.md / PROGRESS.md to the TOP (under a new READ FIRST block),
// and writes the READ FIRST summaries. Run from docman-native.
const fs = require('fs');
const MARK = '## 20 Oct 2026 — Reminders/Expiring card colour back to the old slate look';

const FIRST_STATE = `## READ FIRST — 22 Oct 2026, end of chat (the dated log below it is chronological, OLDEST FIRST, for 20-22 Oct; older entries after it are newest first)

**Play / builds**
- **AAB 76 / 1.0.0 is built** (\`DOCMAN Play Store Assets/release/DOCMAN-1.0.0-versioncode76-UPLOAD-THIS.aab\`, release/R8, signed, verified inside), **NOT uploaded.** 75 is on Internal testing (released 20 Oct 9:09 PM). If Play refuses 76, build 77.
- 76 = Sync Calendar + Auto, free limit 3 reminders + 3 expiry dates, Save a copy to Google Drive, light-mode Reminders area, slate 3D cards, "i" screen text, Storage cylinder icon, bell animation, frozen "i" header (\`style.css?v=852\`, \`app.js?v=709\`).
- **Everything after 76 is in DOCMAN dev ONLY (not in any AAB; goes into 77):** the Reminders / Expiring page restyle (text pills View/Edit/Delete, flat amber bar \`#f98a0d\`, frame around the top tools, Sync Calendar 3D button + AUTO button with a link line, 3D buttons everywhere in that area, steady tabs, X fix) and the NEW header calendar+tray picture. Current web layer: \`style.css?v=880\`, \`app.js?v=716\`.
- **The user must still do before uploading 76/77:** update the Play Console **Data safety** form for READ_CALENDAR (steps in \`DOCMAN Play Store Assets/privacy-policy-change-2026-10-21.md\`). The **privacy policy is already pushed and live** (commit d1699b5). R8 release behaviour has still NEVER run on a phone: test Sign, PDF tools, Save a copy, Sync Calendar, Auto on the Internal build.

**Features built 21-22 Oct (details in the log below)**
- **Sync Calendar** (native \`CalendarImportPlugin\`, READ_CALENDAR; JS block "Sync Calendar" in app.js): phone calendar to Reminders, one tap; today to 1 year, nearest 300 events; Pro with one free try; one reminder per event (monthly/yearly repeat natively, other repeats show the next date); alerts 8 AM on the day every 30 min to 11 AM until Done; a manual press brings deleted ones back; **AUTO** button (Pro): syncs when the app/Reminders list opens, at most every 2 min, silent unless something changed; in AUTO the Sync button is greyed out. Alarms capped (7 per event, nearest 40 events, under ALARM_BUDGET).
- Free limit **3 reminders + 3 expiry dates** (\`FREE_REMINDERS\`, \`FREE_EXPIRY_DATES\`); dev-only Settings row "Test as free user" (never in the Play build).
- Save a copy opens Google Drive directly (\`BackupSave.saveToDrive\`, fallback = the picker).

**Where things are**
- Previews / test tools: \`preview/shot-light.js\` (real app in headless Edge, sample data, \`VW/VH/DPR\` env vars for the phone's 384 px), \`preview/phone-eval.js\` and \`phone-devtools.js\` (measure on the phone over \`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>\`), \`preview/cal-test*.js\` (fake-calendar tests). Backups of app.js/style.css before each risky edit are in \`../backups/\` (\`*.before-*-2xoct\`).
- File guide: \`docs/FILES-GUIDE.md\` (what to keep and what is safe to delete); nothing was deleted yet.

**Open follow-ups**
- The user was asked, no answer yet: the 3D-button rule outside the Reminders area (everything / main actions / leave it); the one-time hint for the Sync button; the "i"-screen icons (emoji) they dislike; the counts box could be trimmed 6 px more to match their reference.
- Check on the phone (user): the new header picture (one-digit dates, long day names), the bar colour and pills, Save to Drive, Sync Calendar / Auto, the X button.

**Traps found this session (also in CLAUDE.md)**
- The phone's viewport is **384 css px**, not 412/420: measure fit on the phone, not only in Edge.
- \`PluginCall.getDouble/getInt\` return null for epoch-millisecond Longs: use \`call.getData().optLong\`.
- Any positioned element inside \`.xc-panel\` can paint over the X and swallow taps: check \`elementFromPoint\` at the X.
- Pill shadows 4 px apart overlap and darken a flat bar: no shadows on pills over a flat colour; a pseudo-element outside a clipped button is not drawn.

`;

const FIRST_PROGRESS = `## READ FIRST — 22 Oct 2026, end of chat

The 20-22 Oct session entries (oldest first) sit directly below this block; \`CURRENT_STATE.md\` has the full READ FIRST summary. One-line state: **AAB 76 / 1.0.0 built, not uploaded (75 on Internal testing); privacy policy pushed; Data safety form for READ_CALENDAR is the user's next step; everything after 76 (Reminders page restyle, new header picture) is dev-only and goes into 77.**

**Next:** (1) the user updates Data safety and uploads 76 to Internal testing, tests Sign / PDF tools / Save a copy / Sync Calendar / Auto; (2) check the dev changes on the phone and answer the open questions listed in CURRENT_STATE.md; (3) build 77 (tell the user the versionCode first and wait for a yes); (4) offer the project clean-up in \`docs/FILES-GUIDE.md\` after taking a zip.

`;

for (const [file, first, headLines] of [['CURRENT_STATE.md', FIRST_STATE, 4], ['PROGRESS.md', FIRST_PROGRESS, 4]]) {
    let s = fs.readFileSync(file, 'utf8');
    const i = s.indexOf(MARK);
    if (i < 0) throw new Error(file + ': marker not found');
    if (s.includes('## READ FIRST — 22 Oct 2026')) throw new Error(file + ': already refreshed');
    const tail = s.slice(i).trimEnd() + '\n\n';
    const body = s.slice(0, i).trimEnd() + '\n';
    // split the header (first headLines lines up to the first "## ")
    const firstSec = body.indexOf('\n## ');
    const header = body.slice(0, firstSec + 1);
    const rest = body.slice(firstSec + 1);
    const stamp = file === 'CURRENT_STATE.md'
        ? header.replace(/Last refreshed [^\n]*\n/, 'Last refreshed 22 Oct 2026, end of chat (AAB 76 built, not uploaded). What is true *right now*. The log is `PROGRESS.md`,\n')
        : header.replace(/Last updated [^\n]*\n/, 'Last updated 22 Oct 2026, end of chat. Reasoning lives in `HANDOVER.md` (old); rules in `CLAUDE.md`;\n');
    const log = '## 20-22 Oct 2026 session log (chronological, OLDEST FIRST: moved here from the end of the file so a new chat finds it)\n\n' + tail;
    fs.writeFileSync(file, stamp + first + log + rest);
    console.log(file, 'moved', tail.split('\n').length, 'lines to the top');
}
