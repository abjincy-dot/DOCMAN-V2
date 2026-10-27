const fs = require('fs');
for (const f of process.argv.slice(2)) {
    let s = fs.readFileSync(f, 'utf8');
    const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error(f + ' anchor: ' + a.slice(0, 50)); s = s.replace(a, () => b); };
    rep("    46%, 54% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; }\n    62%, 100% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 0; }\n}",
        "    46%, 54% { transform: scaleX(-1) rotate(12deg) scale(1); opacity: 1; animation-timing-function: ease-in; }\n    60% { transform: scaleX(-1) rotate(12deg) scale(0.1); opacity: 1; animation-timing-function: ease-in; }\n    64%, 100% { transform: scaleX(-1) rotate(12deg) scale(0.06); opacity: 0; }\n}");
    rep("    20%, 54% { opacity: 1; transform: scale(1); }\n    62%, 100% { opacity: 0; transform: scale(1); }\n}",
        "    20%, 54% { opacity: 1; transform: scale(1); }\n    60% { opacity: 1; transform: scale(0.4); }\n    64%, 100% { opacity: 0; transform: scale(0.2); }\n}");
    s = s.replace("and fades out in ~0.2 s (was ~0.45 s)", "and leaves the way it came: it shrinks back down to a tiny bell in ~0.26 s and is gone (was ~0.45 s of fading)");
    fs.writeFileSync(f, s);
}
console.log('edited');
