// In AUTO mode the Sync Calendar button is disabled (greyed, not tappable; a tap explains why); MANUAL enables it.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

rep(`<button id="expdocSyncCal" class="xc-sync" type="button"><i class="fas fa-rotate"></i>`,
    `<button id="expdocSyncCal" class="xc-sync' + (calAutoOn() ? ' xc-sync-disabled' : '') + '" type="button" aria-disabled="' + (calAutoOn() ? 'true' : 'false') + '"><i class="fas fa-rotate"></i>`);

rep(`    if (syncBtn) syncBtn.addEventListener('click', () => syncPhoneCalendar());`,
    `    if (syncBtn) syncBtn.addEventListener('click', () => {
        // AUTO mode: the button is off (DOCMAN syncs by itself); say so instead of doing nothing silently.
        if (calAutoOn()) { showToast('Auto mode is on, so DOCMAN syncs by itself. Switch to MANUAL to sync by hand.'); return; }
        syncPhoneCalendar();
    });`);

rep(`sw.textContent = on ? 'AUTO' : 'MANUAL'; }`,
    `sw.textContent = on ? 'AUTO' : 'MANUAL'; }
    const sb = document.getElementById('expdocSyncCal');
    if (sb) { sb.classList.toggle('xc-sync-disabled', !!on); sb.setAttribute('aria-disabled', on ? 'true' : 'false'); }`);

fs.writeFileSync(f, s);
console.log('modeoff edited');
