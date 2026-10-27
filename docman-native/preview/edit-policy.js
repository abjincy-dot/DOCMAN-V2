const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 50)); s = s.replace(a, () => b); }
rep('Last updated &middot; October 17, 2026', 'Last updated &middot; October 21, 2026');
rep("        it belongs to) &mdash; stored locally.</li>\n",
    "        it belongs to) &mdash; stored locally.</li>\n      <li><strong>Calendar events you choose to import</strong> &mdash; only if you press\n        &ldquo;Sync Calendar&rdquo; and allow Android's calendar permission. DOCMAN reads the\n        upcoming events (title, date, time, place) from your phone's calendar and lists them as\n        reminders, stored locally. See Section 6.</li>\n");
rep("      device.</p>\n    <p><strong>What appears on your lock screen.</strong>",
    "      device.</p>\n    <p><strong>Sync Calendar.</strong> The Reminders screen has an optional &ldquo;Sync Calendar&rdquo;\n      button. Only when you press it, DOCMAN asks Android for permission to <em>read</em> your\n      calendar and then copies your upcoming events (up to a year ahead) from the calendar app\n      on your phone into your DOCMAN reminders, stored on your device like any other reminder.\n      DOCMAN never writes to, changes or deletes anything in your calendar, and the events are\n      not sent to us or to anyone else. If you decline the permission, nothing is read and every\n      other feature works as before. You can withdraw the permission at any time in Android's\n      Settings &gt; Apps &gt; DOCMAN &gt; Permissions; reminders already imported stay in DOCMAN until\n      you delete them.</p>\n    <p><strong>What appears on your lock screen.</strong>");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('policy edited, crlf=' + crlf);
