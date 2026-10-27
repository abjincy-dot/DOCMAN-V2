const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }
rep(`<span>Sync Calendar</span></button><button id="expdocAutoSw"`,
    `<span>Sync Calendar</span></button><span class="xc-link' + (calAutoOn() ? ' on' : '') + '" aria-hidden="true"></span><button id="expdocAutoSw"`);
rep(`sw.setAttribute('aria-checked', on ? 'true' : 'false'); }`,
    `sw.setAttribute('aria-checked', on ? 'true' : 'false'); }
    const lk = document.querySelector('.xc-link');
    if (lk) lk.classList.toggle('on', !!on);`);
fs.writeFileSync(f, s);
console.log('link edited');
