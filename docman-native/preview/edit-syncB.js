// Sync Calendar B: the bell + title go on the Reminders tab; the row holds a standalone 3D push button "Sync Calendar" and, beside it, a SEPARATE AUTO switch.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

// 1) a class on the head when the Sync row is there (so the bell + title can be hidden only then)
rep(`            <div class="xc-top">\n            <div class="xc-head">`,
    `            <div class="xc-top">\n            <div class="xc-head\${activeTab === 'reminders' && !remindersCalMode ? ' xc-head-sync' : ''}">`);

// 2) markup: standalone button + separate AUTO switch
rep(`'<button id="expdocSyncCal" class="xc-sync" type="button"><i class="fas fa-calendar-days"></i><span>Sync Calendar</span><span class="xc-sync-sep"></span><span class="xc-sync-auto">AUTO</span><span id="expdocAutoSw" class="xc-autosw' + (calAutoOn() ? ' on' : '') + '" role="switch" aria-label="Auto-sync" aria-checked="' + (calAutoOn() ? 'true' : 'false') + '"></span></button>'`,
    `'<div class="xc-sync-row"><button id="expdocSyncCal" class="xc-sync" type="button"><i class="fas fa-rotate"></i><span>Sync Calendar</span></button><div class="xc-auto"><span class="xc-sync-auto">AUTO</span><span id="expdocAutoSw" class="xc-autosw' + (calAutoOn() ? ' on' : '') + '" role="switch" aria-label="Auto-sync" aria-checked="' + (calAutoOn() ? 'true' : 'false') + '"></span></div></div>'`);

// 3) wiring: the button syncs; the AUTO group toggles (no more "which part did I hit" test)
rep(`    if (syncBtn) syncBtn.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('#expdocAutoSw')) { ev.stopPropagation(); toggleCalAuto(); return; }
        syncPhoneCalendar();
    });`,
`    if (syncBtn) syncBtn.addEventListener('click', () => syncPhoneCalendar());
    const autoBox = overlay.querySelector('.xc-auto');
    if (autoBox) autoBox.addEventListener('click', () => toggleCalAuto());`);

fs.writeFileSync(f, s);
console.log('syncB edited');
