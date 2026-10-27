// Removes the long empty stretch between bell cycles: the cycle is shortened to 1.8 s so that the bell shrinks away and the next one
// starts straight away (about 0.16 s of nothing instead of ~1 s). Zoom-in, ring and exit keep the same real speed as before.
const fs = require('fs');
const BELL = `@keyframes naBellIn {
    0% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    3% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    14% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in-out; }
    23% { transform: scaleX(-1) rotate(34deg) scale(1); animation-timing-function: ease-in-out; }
    32% { transform: scaleX(-1) rotate(-8deg) scale(1); animation-timing-function: ease-in-out; }
    41% { transform: scaleX(-1) rotate(30deg) scale(1); animation-timing-function: ease-in-out; }
    50% { transform: scaleX(-1) rotate(-4deg) scale(1); animation-timing-function: ease-in-out; }
    59% { transform: scaleX(-1) rotate(20deg) scale(1); animation-timing-function: ease-in-out; }
    66%, 78% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in; }
    85% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: ease-in; }
    91%, 100% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; }
}`;
const BADGE = `@keyframes naBadgeIn {
    0%, 3% { opacity: 0; transform: scale(0.2); animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    14% { opacity: 1; transform: scale(1); animation-timing-function: ease-in-out; }
    19% { transform: scale(1.2); animation-timing-function: ease-in-out; }
    26%, 78% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
    85% { opacity: 1; transform: scale(0.4); animation-timing-function: ease-in; }
    91%, 100% { opacity: 0; transform: scale(0.2); }
}`;
const WAVE = `@keyframes naWaveIn {
    0%, 14% { opacity: 0; transform: scale(0.8); }
    19% { opacity: 0.95; }
    42% { opacity: 0; transform: scale(1.2); }
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
    // durations of the fast block: 2.6 s -> 1.8 s (the last occurrences)
    s = s.replace(/\.na-hbell > svg:not\(\.na-wv\) \{ animation-duration: 2\.6s; \}\n\.na-hbell \.na-hbadge \{ animation-duration: 2\.6s; \}\n\.na-hbell \.na-wv \.w1, \.na-hbell \.na-wv \.w2 \{ animation-duration: 2\.6s; \}/,
        '.na-hbell > svg:not(.na-wv) { animation-duration: 1.8s; }\n.na-hbell .na-hbadge { animation-duration: 1.8s; }\n.na-hbell .na-wv .w1, .na-hbell .na-wv .w2 { animation-duration: 1.8s; }');
    if (!s.includes('animation-duration: 1.8s')) throw new Error(f + ': durations not updated');
    fs.writeFileSync(f, s);
}
console.log('edited');
