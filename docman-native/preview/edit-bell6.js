// The bell's ZOOM / RING / SHRINK animation again (the version the user liked), now with a BREATH rhythm: the zoom-in is the inhale and the
// shrink-away the exhale, both on the same sine ease as the Reminders tab (xcDim); no glow, no swell. Cycle 2.6 s, no empty gap.
const fs = require('fs');
const SINE = 'cubic-bezier(0.45, 0, 0.55, 1)';
const BELL = `@keyframes naBellIn {
    0% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; animation-timing-function: ${SINE}; }
    26.9% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in-out; }
    33.1% { transform: scaleX(-1) rotate(34deg) scale(1); animation-timing-function: ease-in-out; }
    39.2% { transform: scaleX(-1) rotate(-8deg) scale(1); animation-timing-function: ease-in-out; }
    45.4% { transform: scaleX(-1) rotate(30deg) scale(1); animation-timing-function: ease-in-out; }
    51.5% { transform: scaleX(-1) rotate(-4deg) scale(1); animation-timing-function: ease-in-out; }
    57.7% { transform: scaleX(-1) rotate(20deg) scale(1); animation-timing-function: ease-in-out; }
    61.5%, 69.2% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ${SINE}; }
    96.2%, 100% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; }
}`;
const BADGE = `@keyframes naBadgeIn {
    0% { opacity: 0; transform: scale(0.2); animation-timing-function: ${SINE}; }
    26.9% { opacity: 1; transform: scale(1); animation-timing-function: ease-in-out; }
    31% { transform: scale(1.15); animation-timing-function: ease-in-out; }
    37%, 69.2% { opacity: 1; transform: scale(1); animation-timing-function: ${SINE}; }
    96.2%, 100% { opacity: 0; transform: scale(0.2); }
}`;
const WAVE = `@keyframes naWaveIn {
    0%, 26.9% { opacity: 0; transform: scale(0.8); }
    31% { opacity: 0.95; }
    52% { opacity: 0; transform: scale(1.2); }
    100% { opacity: 0; }
}`;
for (const f of process.argv.slice(2)) {
    let s = fs.readFileSync(f, 'utf8');
    for (const [name, block] of [['naBellIn', BELL], ['naBadgeIn', BADGE], ['naWaveIn', WAVE]]) {
        const i = s.lastIndexOf('@keyframes ' + name + ' {');
        if (i < 0) throw new Error(f + ': ' + name);
        const j = s.indexOf('\n}', i) + 2;
        s = s.slice(0, i) + block + s.slice(j);
    }
    const n = (s.match(/animation-duration: 2\.8s; animation-timing-function: cubic-bezier\(0\.45, 0, 0\.55, 1\);/g) || []).length;
    if (n !== 3) throw new Error(f + ': expected 3 duration lines, found ' + n);
    s = s.replace(/animation-duration: 2\.8s; animation-timing-function: cubic-bezier\(0\.45, 0, 0\.55, 1\);/g, 'animation-duration: 2.6s; animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);');
    s = s.replace('/* 21 Oct (final): the header bell BREATHES like the Reminders tab (xcDim): fades in and out, 2.8 s, sine ease. (Earlier in this block: the fast zoom/ring version, now replaced.)',
        '/* 21 Oct (final): the header bell zooms in (inhale), rings and shrinks away (exhale) on the Reminders tab\'s breathing ease (xcDim sine), 2.6 s, no glow.');
    fs.writeFileSync(f, s);
}
console.log('edited');
