const fs = require("fs");
let js = fs.readFileSync("../www/app.js", "utf8");
const s = js.indexOf("// Flip clock under the calendar logo");
const e = js.indexOf("document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLogoClock(); });", s);
if (s < 0 || e < 0) { console.log("anchors", s, e); process.exit(1); }
const body = `// Flip clock under the calendar logo: HH MM and small seconds, 12-hour with a small AM/PM, from the phone's clock.
// Each number is a real flip card: the old top half folds down, then the new bottom half flips into place.
function lkLayers(nv, ov, anim) {
    return '<i class="lk-top"><b>' + nv + '</b></i><i class="lk-bot"><b>' + ov + '</b></i>' +
        (anim ? '<i class="lk-ft"><b>' + ov + '</b></i><i class="lk-fb"><b>' + nv + '</b></i>' : '');
}
function updateLogoClock() {
    const box = document.getElementById('logoClock');
    if (!box) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const vals = { h: pad(now.getHours() % 12 || 12), m: pad(now.getMinutes()), s: pad(now.getSeconds()) };
    box.querySelectorAll('.lk-t').forEach(el => {
        const v = vals[el.dataset.k];
        if (el._v === v) return;
        if (el._v === undefined) el.innerHTML = lkLayers(v, v, false);
        else el.innerHTML = lkLayers(v, el._v, true);
        el._v = v;
    });
    const ap = box.querySelector('.lk-ap');
    const apv = now.getHours() >= 12 ? 'PM' : 'AM';
    if (ap && ap.textContent !== apv) ap.textContent = apv;
}
updateLogoClock();
setInterval(updateLogoClock, 1000);
`;
js = js.slice(0, s) + body + js.slice(e);
fs.writeFileSync("../www/app.js", js);

let css = fs.readFileSync("../www/style.css", "utf8");
css = css.replace(/\s*$/, "\n") + `
/* Real flip cards for the clock numbers (19 Oct): four layers per number (static top, static bottom, folding top, unfolding bottom). */
.logo-clock .lk-t { height: 15px; width: 21px; min-width: 0; perspective: 60px; }
.logo-clock .lk-s { height: 11px; width: 15px; margin-top: 4px; }
.logo-clock .lk-t i { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; display: block; backface-visibility: hidden; -webkit-backface-visibility: hidden; font-style: normal; }
.logo-clock .lk-t i b { position: absolute; left: 0; right: 0; height: 200%; font-weight: 800; text-align: center; line-height: 15px; }
.logo-clock .lk-s i b { line-height: 11px; }
.logo-clock .lk-top, .logo-clock .lk-ft { top: 0; }
.logo-clock .lk-bot, .logo-clock .lk-fb { top: 50%; }
.logo-clock .lk-top b, .logo-clock .lk-ft b { top: 0; }
.logo-clock .lk-bot b, .logo-clock .lk-fb b { top: -100%; }
.logo-clock .lk-ft { transform-origin: 50% 100%; animation: lkFoldDown 0.16s ease-in forwards; z-index: 2; }
.logo-clock .lk-fb { transform-origin: 50% 0; transform: rotateX(90deg); animation: lkFoldUp 0.16s ease-out 0.15s forwards; z-index: 3; }
@keyframes lkFoldDown { from { transform: rotateX(0deg); } to { transform: rotateX(-90deg); } }
@keyframes lkFoldUp { from { transform: rotateX(90deg); } to { transform: rotateX(0deg); } }
.logo-clock .lk-t::after { z-index: 5; }
@media (prefers-reduced-motion: reduce) { .logo-clock .lk-ft { animation: none; opacity: 0; } .logo-clock .lk-fb { animation: none; transform: none; } }
`;
fs.writeFileSync("../www/style.css", css);
console.log("ok");
