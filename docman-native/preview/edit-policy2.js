// Privacy policy (local file): Save a copy now opens Google Drive's save screen directly (still the user's choice, DOCMAN uploads nothing).
// The calendar paragraphs and the October 21 date were added earlier.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');
function rep(a, b) {
    if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 60));
    s = s.replace(a, () => b);
}
rep("      elsewhere, entirely at your choice. DOCMAN does not automatically upload this backup\n      anywhere.</p>",
    "      elsewhere, entirely at your choice. After a backup, the &ldquo;Save a copy&rdquo; button\n      hands the backup file to the Google Drive app&rsquo;s own &ldquo;Save to Drive&rdquo; screen\n      (or, if Drive is not installed, to Android&rsquo;s file picker) so that you can keep a copy\n      off your phone; from that point Google Drive handles the file under Google&rsquo;s own\n      terms and privacy policy. DOCMAN does not automatically upload this backup anywhere, and\n      nothing is sent unless you choose where it goes.</p>");
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('policy edited, crlf=' + crlf);
