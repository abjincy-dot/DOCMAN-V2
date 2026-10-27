// The mode button always reads AUTO (lit = on, dark = off); no MANUAL label.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }
rep(`aria-checked="' + (calAutoOn() ? 'true' : 'false') + '">' + (calAutoOn() ? 'AUTO' : 'MANUAL') + '</button></div>'`,
    `aria-checked="' + (calAutoOn() ? 'true' : 'false') + '">AUTO</button></div>'`);
rep(`sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.textContent = on ? 'AUTO' : 'MANUAL'; }`,
    `sw.setAttribute('aria-checked', on ? 'true' : 'false'); }`);
rep(`showToast('Auto mode is on, so DOCMAN syncs by itself. Switch to MANUAL to sync by hand.');`,
    `showToast('AUTO is on, so DOCMAN syncs by itself. Turn AUTO off to sync by hand.');`);
fs.writeFileSync(f, s);
console.log('auto-only edited');
