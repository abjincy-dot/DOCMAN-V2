// Adds a "breath" to the bell: after the ring it swells (inhale) and settles (exhale) with a soft golden glow that rises and fades with it.
// Cycle 2.0 s: in 0.25 s, ring 0.8 s, settle, breath 0.44 s, shrink away 0.24 s, rest 0.18 s.
const fs = require('fs');
const SINE = 'cubic-bezier(0.45, 0, 0.55, 1)';
const BELL = `@keyframes naBellIn {
    0% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    3.5% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    12.5% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in-out; }
    20.5% { transform: scaleX(-1) rotate(34deg) scale(1); animation-timing-function: ease-in-out; }
    28.5% { transform: scaleX(-1) rotate(-8deg) scale(1); animation-timing-function: ease-in-out; }
    36.5% { transform: scaleX(-1) rotate(30deg) scale(1); animation-timing-function: ease-in-out; }
    44.5% { transform: scaleX(-1) rotate(-4deg) scale(1); animation-timing-function: ease-in-out; }
    52.5% { transform: scaleX(-1) rotate(20deg) scale(1); animation-timing-function: ease-in-out; }
    57% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; filter: drop-shadow(0 0 0 rgba(255, 190, 60, 0)); animation-timing-function: ${SINE}; }
    68% { transform: scaleX(-1) rotate(12deg) scale(1.1); opacity: 1; filter: drop-shadow(0 0 7px rgba(255, 190, 60, 0.8)); animation-timing-function: ${SINE}; }
    79% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; filter: drop-shadow(0 0 0 rgba(255, 190, 60, 0)); animation-timing-function: ease-in; }
    87% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: ease-in; }
    91%, 100% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; }
}`;
const BADGE = `@keyframes naBadgeIn {
    0%, 3.5% { opacity: 0; transform: scale(0.2); animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    12.5% { opacity: 1; transform: scale(1); animation-timing-function: ease-in-out; }
    17% { transform: scale(1.2); animation-timing-function: ease-in-out; }
    24%, 57% { opacity: 1; transform: scale(1); animation-timing-function: ${SINE}; }
    68% { opacity: 1; transform: scale(1.14); animation-timing-function: ${SINE}; }
    79% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
    87% { opacity: 1; transform: scale(0.4); animation-timing-function: ease-in; }
    91%, 100% { opacity: 0; transform: scale(0.2); }
}`;
const WAVE = `@keyframes naWaveIn {
    0%, 12.5% { opacity: 0; transform: scale(0.8); }
    17% { opacity: 0.95; }
    40% { opacity: 0; transform: scale(1.2); }
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
    const before = (s.match(/animation-duration: 1\.8s/g) || []).length;
    if (before !== 3) throw new Error(f + ': expected three 1.8s durations, found ' + before);
    s = s.replace(/animation-duration: 1\.8s/g, 'animation-duration: 2s');
    fs.writeFileSync(f, s);
}
console.log('edited');
