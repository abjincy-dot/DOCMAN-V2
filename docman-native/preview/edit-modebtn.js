// The AUTO switch becomes a small MODE button that reads AUTO or MANUAL and flips when pressed.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

rep(`<div class="xc-auto"><span class="xc-sync-auto">AUTO</span><span id="expdocAutoSw" class="xc-autosw' + (calAutoOn() ? ' on' : '') + '" role="switch" aria-label="Auto-sync" aria-checked="' + (calAutoOn() ? 'true' : 'false') + '"></span></div></div>'`,
    `<button id="expdocAutoSw" type="button" class="xc-modebtn' + (calAutoOn() ? ' on' : '') + '" role="switch" aria-label="Auto-sync" aria-checked="' + (calAutoOn() ? 'true' : 'false') + '">' + (calAutoOn() ? 'AUTO' : 'MANUAL') + '</button></div>'`);

rep(`    const autoBox = overlay.querySelector('.xc-auto');
    if (autoBox) autoBox.addEventListener('click', () => toggleCalAuto());`,
    `    const modeBtn = overlay.querySelector('#expdocAutoSw');
    if (modeBtn) modeBtn.addEventListener('click', () => toggleCalAuto());`);

rep(`    if (sw) { sw.classList.toggle('on', !!on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); }`,
    `    if (sw) { sw.classList.toggle('on', !!on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.textContent = on ? 'AUTO' : 'MANUAL'; }`);

fs.writeFileSync(f, s);
console.log('mode button edited');
