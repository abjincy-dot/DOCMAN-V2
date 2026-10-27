const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const a = "      on your phone into your DOCMAN reminders, stored on your device like any other reminder.\n      DOCMAN never writes to,";
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, () => "      on your phone into your DOCMAN reminders, stored on your device like any other reminder.\n      An optional &ldquo;Auto&rdquo; switch beside the button repeats the same read, on your device,\n      whenever you open the app. DOCMAN never writes to,");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('ok crlf=' + crlf);
