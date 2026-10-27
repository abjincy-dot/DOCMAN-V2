const fs = require('fs');
const BELL = `@keyframes naBellIn {
    0% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    4% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    10% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in-out; }
    16% { transform: scaleX(-1) rotate(34deg) scale(1); animation-timing-function: ease-in-out; }
    22% { transform: scaleX(-1) rotate(-8deg) scale(1); animation-timing-function: ease-in-out; }
    28% { transform: scaleX(-1) rotate(30deg) scale(1); animation-timing-function: ease-in-out; }
    34% { transform: scaleX(-1) rotate(-4deg) scale(1); animation-timing-function: ease-in-out; }
    40% { transform: scaleX(-1) rotate(20deg) scale(1); animation-timing-function: ease-in-out; }
    46%, 54% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.55, 0.05, 0.75, 0.3); }
    60% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: ease-in; }
    64%, 100% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; }
}`;
const BADGE = `@keyframes naBadgeIn {
    0%, 3% { opacity: 0; transform: scale(0.2); animation-timing-function: cubic-bezier(0.25, 1, 0.4, 1); }
    10% { opacity: 1; transform: scale(1); animation-timing-function: ease-in-out; }
    14% { transform: scale(1.2); animation-timing-function: ease-in-out; }
    20%, 54% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
    60% { opacity: 1; transform: scale(0.4); animation-timing-function: ease-in; }
    64%, 100% { opacity: 0; transform: scale(0.2); }
}`;
for (const f of process.argv.slice(2)) {
    let s = fs.readFileSync(f, 'utf8');
    // the LAST definition of each keyframes block is the one in the fast block at the end
    for (const [name, block] of [['naBellIn', BELL], ['naBadgeIn', BADGE]]) {
        const i = s.lastIndexOf('@keyframes ' + name + ' {');
        if (i < 0) throw new Error(f + ': ' + name);
        const j = s.indexOf('\n}', i) + 2;
        s = s.slice(0, i) + block + s.slice(j);
    }
    fs.writeFileSync(f, s);
}
console.log('edited');
