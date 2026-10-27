// Inserts the 23 Oct block above the READ FIRST - 22 Oct block of CURRENT_STATE.md and PROGRESS.md.
const fs = require('fs');
const block = `## 23 Oct 2026 — corrections BEFORE AAB 77 (versionCode is ALREADY set to 77 in build.gradle; the AAB is NOT built yet: the user said "wait, some corrections")
The user asked for AAB 77, then paused for three corrections. Installed to DOCMAN dev (style.css?v=881, app.js?v=717); still to do: the user checks them, then say "build 77" (version already named) and build, verify, copy to release/, write RELEASE-NOTES-versioncode77.txt, update these docs.
1. **"i" screen, Expiry Dates & Alerts text** was confusing ("7 days before, 3 days before and the day before at 9am, and on the day itself every 30 minutes from 7am"). Now a list: 7 / 3 / 1 days before = one alert each at 9am; on the day it expires = every 30 minutes from 7am until 9pm until Done; after it expires = one alert a day at 9am for 7 days; nothing rings between 9pm and 7am. Checked against the code (\`EXPIRY_ALERT_HOUR=9\`, \`EXPIRY_DAY_SLOTS\`, \`EXPIRY_OVERDUE_DAYS=7\`). Backup \`backups/index.html.before-expiryhelp-23oct\`.
2. **Files / Notes sections of a folder**: (a) **Select** counted files + notes together, so a folder with notes but no files offered Select under FILES; now it follows the section on screen (\`canSelectHere\` uses \`currentActiveTab\`); (b) an empty section now says what the other one holds and jumps there: "This folder has 3 notes -> open NOTES" under "No files here yet" (and "...N files -> open FILES" under the empty Notes message), button \`.empty-state-hop\`; (c) a small orange **count badge on the inactive FILES / NOTES label** (\`updateFilesNotesBadges\`, \`data-count\`), so nobody forgets the notes exist. Tested in Edge with a folder of 3 notes and no files: Select hidden under FILES, shown under NOTES, hop text and badge present. (The words "This folder is empty" exist only in the delete dialog, which already counts notes.) Backups \`backups/app.js.before-filesnotes-23oct\`, \`style.css.before-filesnotes-23oct\`; source of the edit \`preview/edit-filesnotes.js\`.
3. **Settings pages: the back arrow and title sat under the status bar.** Measured on the phone: the status bar is **34 px** (\`env(safe-area-inset-top)\`), the shared \`.settings-page-inner\` started only 20 px from the top. Fixed in the last block of style.css: \`padding-top: max(20px, env(safe-area-inset-top) + 14px)\` (back button now starts about 54 px from the top). Applies to every Settings panel. **Not yet measured on the phone after the fix** (the devtools bridge did not answer; the user's eye is the check). If other full-screen pages show the same problem, give them the same rule.

`;
for (const file of ['CURRENT_STATE.md', 'PROGRESS.md']) {
    let s = fs.readFileSync(file, 'utf8');
    const m = '## READ FIRST — 22 Oct 2026';
    const i = s.indexOf(m);
    if (i < 0) throw new Error(file + ': marker');
    if (s.includes('## 23 Oct 2026 — corrections BEFORE AAB 77')) throw new Error(file + ': already');
    fs.writeFileSync(file, s.slice(0, i) + block + s.slice(i));
    console.log(file, 'ok');
}
