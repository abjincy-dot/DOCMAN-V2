const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const a = '- **USE_BIOMETRIC / USE_FINGERPRINT**: optional App Lock';
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, () => '- **READ_CALENDAR**: optional "Sync Calendar" button on the Reminders screen. Asked only when that button is pressed. Reads the user\'s own upcoming calendar events and lists them as reminders on the device. Read only; nothing is written to the calendar and nothing leaves the device (added 21 Oct 2026; needs the Data safety form updated, see privacy-policy-change-2026-10-21.md).\n' + a);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok');
