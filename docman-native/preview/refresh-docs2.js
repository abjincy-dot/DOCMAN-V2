// 24 Oct end of chat: new READ FIRST block at the top of CURRENT_STATE.md and PROGRESS.md (the old "READ FIRST - 22 Oct" block stays below it, renamed older),
// plus the CLAUDE.md lessons. Run from docman-native.
const fs = require('fs');

const FIRST = `## READ FIRST — 24 Oct 2026, end of chat (older READ FIRST blocks and the dated log are below, newest changes first within each 23/24 Oct block)

**Play / builds**
- **AAB 77 / 1.0.0 is built and verified** (\`DOCMAN Play Store Assets/release/DOCMAN-1.0.0-versioncode77-UPLOAD-THIS.aab\`, 63.4 MB, release/R8, signed; inside: versionCode 77, READ_CALENDAR, \`style.css?v=905\`, \`app.js?v=717\`, 12 splash tiles, \`calendar-tray-v15.png\`, no stray files, CalendarImport kept by R8). Release notes (short, with tags): \`RELEASE-NOTES-versioncode77.txt\`. **NOT uploaded.** 75 is on Internal testing; 76 was built (21 Oct) but never uploaded: skip it, 77 supersedes it. If Play refuses 77, build 78.
- **The user must do before uploading:** update the Play Console **Data safety** form for READ_CALENDAR (steps: \`DOCMAN Play Store Assets/privacy-policy-change-2026-10-21.md\`). The **privacy policy is already live** (commit d1699b5, 21 Oct). R8 release behaviour has STILL never run on a phone: after uploading to Internal testing, test Sign, the PDF tools, Save a copy, Sync Calendar, the AUTO button.
- DOCMAN dev on the phone has the same web layer (\`style.css?v=905\`); it runs as Pro (Settings has a dev-only "Test as free user" row).

**What 77 contains beyond 75 (details in the dated log below)**
- Sync Calendar (read only; button + AUTO button joined by a short line; AUTO is Pro; 8 AM alerts until Done; repeating events once), free limit 3 reminders + 3 expiry dates, Save a copy to Google Drive, "i" screen text (clear expiry schedule, Sync Calendar row), Files/Notes fixes (Select follows the section, "open NOTES/FILES" button in the Sync-button 3D style, count badges with a black border), Settings pages clear of the status bar, Reminders page restyle (text pills, flat amber bar, frame around the top tools, counts row with no border and titles on top, 3D buttons everywhere in that area, steady tabs, X fix), start-up screen with the real documents floating at 25 %, new header calendar (v15: dark-orange calendar, navy+gold tray, thin white left edge, rings raised, plain white live date, thin page lines softened so it does not flicker while floating).

**Open follow-ups / questions to the user**
- 3D-button rule outside the Reminders area (everything / main actions / leave it); the one-time hint on the Sync button; the "i"-screen emoji icons they dislike.
- The user said the header calendar still "flickers lightly near the ring" before the last fix (v15 softens the thin page lines and drops palette dithering): ask whether it is gone. If not, the cause is the thin bright lines at the top of \`Images/calendar-tray-v15.png\`; fix = blur them more or remove the extra page lines.
- Not done: project clean-up (see \`docs/FILES-GUIDE.md\`; nothing deleted; make a zip first).

**How the header picture is made (so it can be redone)**
- Pipeline in \`preview/\`: \`OUTH=1000 make-tray-v6b.js\` (cut out the user's artwork) -> \`rim-white.js\` (thin white left edge) -> \`rings-up2.js\` (raise rings, no stretched lines) -> blur of the page lines -> clear the old tray -> \`tray-swap.js\` (lay the navy+gold tray cut from upload 856acca9) -> resize to 420 tall -> drop alpha under 24. CSS: \`preview/tray-v6.css\`, \`tray-v7.css\`, \`tray-v10.css\`, \`tray-v14.css\`, \`v15-and-strokes.css\` (last block wins). Older pictures v2-v14 stay in \`www/Images/\`.
- Preview tools: \`shot-light.js\` (real app in headless Edge, \`VW=384 VH=720 DPR=2.6667\`), \`measure-logo.js\` (header icon at phone scale), \`make-splash-page.js\` + \`page-shot.js\` (start-up screen: the full-app render cannot catch it), \`phone-eval.js\` (layout only, over \`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>\`).

**Install traps seen this session**
- \`gradlew installDebug\` kept failing with \`BindException\` or \`Permission denied: connect\`: use \`gradlew installDebug --no-daemon\`; if adb loses the phone, restart adb and re-plug the cable.
- Write edit scripts with the Write tool (shell heredocs and sed mangled backslashes and regexes several times).

`;

const CLAUDE_ADD = `
## Lessons from 23-24 Oct (AAB 77)
- **Version state (24 Oct):** AAB **77 / 1.0.0** built and verified (not uploaded); 76 was never uploaded. Tell the user the versionCode and wait for a yes before building. Data safety (READ_CALENDAR) is the user's to update before uploading.
- **The header calendar picture** is \`Images/calendar-tray-v15.png\` (see the READ FIRST block of \`CURRENT_STATE.md\` for the pipeline). Never move whole columns of a flat picture (it kinks the outline); lay a cut-out layer over the untouched picture instead. A palette-compressed PNG added hundreds of faint specks that shimmer while the icon floats: save floating pictures without palette, and soften very thin bright lines.
- **Previewing:** the full-app Edge render has no status bar (it cannot show status-bar fixes) and cannot catch the start-up screen: use \`make-splash-page.js\` / \`page-shot.js\`, and measure on the phone with \`phone-eval.js\`.
- **Settings pages** start below the status bar (\`.settings-page-inner\` padding-top uses \`env(safe-area-inset-top)\` + 14 px); the phone's status bar is 34 px.
- **Files/Notes:** Select follows the section on screen (\`canSelectHere\` uses \`currentActiveTab\`); an empty section shows an "open NOTES/FILES" button; the inactive FILES/NOTES label carries a count badge (\`data-count\`).
- **Reminders page:** counts row has no border (titles on top); the Sync Calendar button and the AUTO button are joined by a short line (\`.xc-link\`); in AUTO mode the Sync button is greyed. The frame around the top tools (\`.xc-top\`) must stay BELOW the X (\`z-index:20\`): check \`elementFromPoint\` at the X after any header change.
- **Start-up screen:** the documents behind the logo are 12 WebP tiles in \`Images/splash/\` (\`.splash-docs-real\`, 25 % opacity, 3 s sway), cut from the user's reference by \`preview/make-splash-real.js\`.
- **Install:** \`gradlew installDebug --no-daemon\` (BindException otherwise).
`;

function rename(s) { return s.replace('## READ FIRST — 22 Oct 2026, end of chat (the dated log below it', '## (older) READ FIRST — 22 Oct 2026, end of chat (the dated log below it').replace('## READ FIRST — 22 Oct 2026, end of chat\n', '## (older) READ FIRST — 22 Oct 2026, end of chat\n'); }

for (const file of ['CURRENT_STATE.md', 'PROGRESS.md']) {
    let s = fs.readFileSync(file, 'utf8');
    if (s.includes('## READ FIRST — 24 Oct 2026')) throw new Error(file + ': already refreshed');
    // put the new block above the first "## " section after the header lines; the header "Last updated" line is refreshed too
    const first = s.indexOf('\n## ');
    let header = s.slice(0, first + 1);
    header = header.replace(/Last refreshed [^\n]*\n/, 'Last refreshed 24 Oct 2026, end of chat (AAB 77 built, not uploaded). What is true *right now*. The log is `PROGRESS.md`,\n')
        .replace(/Last updated [^\n]*\n/, 'Last updated 24 Oct 2026, end of chat. Reasoning lives in `HANDOVER.md` (old); rules in `CLAUDE.md`;\n');
    const rest = rename(s.slice(first + 1));
    const block = file === 'PROGRESS.md'
        ? `## READ FIRST — 24 Oct 2026, end of chat\n\nOne-line state: **AAB 77 / 1.0.0 built and verified, not uploaded (75 on Internal testing; 76 never uploaded). Privacy policy live. The user must update the Data safety form (READ_CALENDAR) before uploading.** The full summary, the header-picture pipeline and the open questions are in the READ FIRST block of \`CURRENT_STATE.md\`; the 23-24 Oct entries (items 1-16 and later) are right below.\n\n**Next:** (1) the user updates Data safety, uploads 77 to Internal testing and tests Sign / PDF tools / Save a copy / Sync Calendar / AUTO; (2) ask whether the header calendar still flickers; (3) answer the open questions in CURRENT_STATE.md; (4) offer the project clean-up (\`docs/FILES-GUIDE.md\`) after a zip.\n\n`
        : FIRST;
    fs.writeFileSync(file, header + block + rest);
    console.log(file, 'refreshed');
}
let c = fs.readFileSync('CLAUDE.md', 'utf8');
if (!c.includes('## Lessons from 23-24 Oct')) { c = c.replace(/versioncode76-UPLOAD-THIS\.aab` \(75 is on Internal testing but lacks[^)]*\); if Play refuses 76 as used, build 77\./, 'versioncode77-UPLOAD-THIS.aab` (75 is on Internal testing; 76 was never uploaded); if Play refuses 77 as used, build 78.'); fs.writeFileSync('CLAUDE.md', c.trimEnd() + '\n' + CLAUDE_ADD); }
console.log('CLAUDE.md updated, 77 mentions:', (fs.readFileSync('CLAUDE.md', 'utf8').match(/versioncode77/g) || []).length);
