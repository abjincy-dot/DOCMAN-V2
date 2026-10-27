const fs = require("fs");
let j = fs.readFileSync("../www/app.js", "utf8");
const a = "    list.addEventListener('scroll', update, { passive: true });\n    update();";
if (j.split(a).length !== 2) { console.log("anchor", j.split(a).length - 1); process.exit(1); }
j = j.replace(a, `    list.addEventListener('scroll', update, { passive: true });
    update();

    // Snap: when the finger is lifted and the list stops, the card nearest the top (a card that has covered at least half
    // of the one before it) settles exactly on the first card's position.
    let touching = false, snapTimer = null;
    const snap = () => {
        if (touching) return;
        const sc = list.scrollTop;
        let best = 0;
        for (let i = 1; i < wraps.length; i++) if (Math.abs(natural[i] - sc) < Math.abs(natural[best] - sc)) best = i;
        const target = natural[best];
        if (Math.abs(target - sc) > 1) list.scrollTo({ top: target, behavior: 'smooth' });
    };
    const queueSnap = () => { clearTimeout(snapTimer); snapTimer = setTimeout(snap, 120); };
    list.addEventListener('scroll', queueSnap, { passive: true });
    list.addEventListener('touchstart', () => { touching = true; clearTimeout(snapTimer); }, { passive: true });
    list.addEventListener('touchend', () => { touching = false; queueSnap(); }, { passive: true });
    list.addEventListener('touchcancel', () => { touching = false; queueSnap(); }, { passive: true });`);
fs.writeFileSync("../www/app.js", j);
let css = fs.readFileSync("../www/style.css", "utf8");
css = css.replace(/\s*$/, "\n") + `/* 19 Oct: the Open note is oval like the cards (rounded corners), not a flat rectangle. */
.rnote-sticky.rnote-cover { border-radius: 22px; padding: 12px 10px 12px 16px; }
`;
fs.writeFileSync("../www/style.css", css);
console.log("ok");
