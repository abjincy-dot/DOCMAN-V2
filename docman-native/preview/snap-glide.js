const fs = require("fs");
let j = fs.readFileSync("../www/app.js", "utf8");
function rep(a, b) { if (j.split(a).length !== 2) { console.log("anchor", j.split(a).length - 1, a.slice(0, 60)); process.exit(1); } j = j.replace(a, b); }
rep(`    let touching = false, snapTimer = null;
    const snap = () => {`, `    let touching = false, snapTimer = null, animating = false, animFrame = 0;
    // Our own glide (ease-out, about a third of a second): the browser's built-in smooth scroll looked like a jump.
    const glideTo = (target) => {
        cancelAnimationFrame(animFrame);
        const from = list.scrollTop, dist = target - from;
        const dur = Math.min(520, Math.max(300, Math.abs(dist) * 3));
        const t0 = performance.now();
        animating = true;
        const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            list.scrollTop = from + dist * e;
            if (p < 1 && !touching) animFrame = requestAnimationFrame(step); else animating = false;
        };
        animFrame = requestAnimationFrame(step);
    };
    const snap = () => {`);
rep(`        if (Math.abs(target - sc) > 1) list.scrollTo({ top: target, behavior: 'smooth' });`,
    `        if (Math.abs(target - sc) > 1) glideTo(target);`);
rep(`    list.addEventListener('scroll', queueSnap, { passive: true });
    list.addEventListener('touchstart', () => { touching = true; clearTimeout(snapTimer); }, { passive: true });`,
    `    list.addEventListener('scroll', () => { if (!animating) queueSnap(); }, { passive: true });
    list.addEventListener('touchstart', () => { touching = true; animating = false; cancelAnimationFrame(animFrame); clearTimeout(snapTimer); }, { passive: true });`);
fs.writeFileSync("../www/app.js", j);
console.log("ok");
