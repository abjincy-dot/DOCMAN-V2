// The header bell now BREATHES exactly like the Reminders tab (xcDim: 2.8 s, sine ease, rises to full at 55% and falls back): it fades in
// and out. No glow, no zoom, no shake.
const fs = require('fs');
const BELL = `@keyframes naBellIn {
    0%, 100% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 0; }
    55% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; }
}`;
const BADGE = `@keyframes naBadgeIn {
    0%, 100% { transform: scale(1); opacity: 0; }
    55% { transform: scale(1); opacity: 1; }
}`;
const WAVE = `@keyframes naWaveIn {
    0%, 100% { opacity: 0; transform: scale(1); }
    55% { opacity: 0.55; transform: scale(1); }
}`;
for (const f of process.argv.slice(2)) {
    let s = fs.readFileSync(f, 'utf8');
    for (const [name, block] of [['naBellIn', BELL], ['naBadgeIn', BADGE], ['naWaveIn', WAVE]]) {
        const i = s.lastIndexOf('@keyframes ' + name + ' {');
        if (i < 0) throw new Error(f + ': ' + name);
        const j = s.indexOf('\n}', i) + 2;
        s = s.slice(0, i) + block + s.slice(j);
    }
    const a = '.na-hbell > svg:not(.na-wv) { animation-duration: 2s; }\n.na-hbell .na-hbadge { animation-duration: 2s; }\n.na-hbell .na-wv .w1, .na-hbell .na-wv .w2 { animation-duration: 2s; }';
    if (s.split(a).length !== 2) throw new Error(f + ': duration lines');
    const SINE = 'cubic-bezier(0.45, 0, 0.55, 1)';
    s = s.replace(a, () => `.na-hbell > svg:not(.na-wv) { animation-duration: 2.8s; animation-timing-function: ${SINE}; }\n.na-hbell .na-hbadge { animation-duration: 2.8s; animation-timing-function: ${SINE}; }\n.na-hbell .na-wv .w1, .na-hbell .na-wv .w2 { animation-duration: 2.8s; animation-timing-function: ${SINE}; }`);
    s = s.replace('/* 21 Oct: the header bell comes and goes FAST.', '/* 21 Oct (final): the header bell BREATHES like the Reminders tab (xcDim): fades in and out, 2.8 s, sine ease. (Earlier in this block: the fast zoom/ring version, now replaced.)\n   Older note: the header bell comes and goes FAST.');
    fs.writeFileSync(f, s);
}
console.log('edited');
