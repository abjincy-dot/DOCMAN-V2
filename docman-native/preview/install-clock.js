const fs = require("fs");
const R = "../www/";
// 1) index.html: a clock element inside the logo box, after the calendar picture
let h = fs.readFileSync(R + "index.html", "utf8");
const a = '<span class="lc-d"></span><span class="lc-n"></span></div></div></div>';
if (h.split(a).length !== 2) { console.log("html anchor", h.split(a).length - 1); process.exit(1); }
h = h.replace(a, '<span class="lc-d"></span><span class="lc-n"></span></div><div class="logo-clock" id="logoClock" aria-hidden="true"><span class="lk-ap"></span><span class="lk-t" data-k="h"></span><span class="lk-t" data-k="m"></span><span class="lk-t lk-s" data-k="s"></span></div></div></div>')
     .replace("style.css?v=760", "style.css?v=761").replace("app.js?v=676", "app.js?v=677");
fs.writeFileSync(R + "index.html", h);

// 2) app.js: tick every second from the phone's clock, flip a tile when its number changes
let js = fs.readFileSync(R + "app.js", "utf8");
const b = "document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLogoDate(); });";
if (js.split(b).length !== 2) { console.log("js anchor", js.split(b).length - 1); process.exit(1); }
js = js.replace(b, b + `

// Flip clock under the calendar logo: HH MM and small seconds, 12-hour with a small AM/PM, from the phone's clock.
function updateLogoClock() {
    const box = document.getElementById('logoClock');
    if (!box) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const vals = { h: pad(now.getHours() % 12 || 12), m: pad(now.getMinutes()), s: pad(now.getSeconds()) };
    box.querySelectorAll('.lk-t').forEach(el => {
        const v = vals[el.dataset.k];
        if (el.textContent !== v) {
            el.textContent = v;
            el.classList.remove('lk-flip');
            void el.offsetWidth;
            el.classList.add('lk-flip');
        }
    });
    const ap = box.querySelector('.lk-ap');
    const apv = now.getHours() >= 12 ? 'PM' : 'AM';
    if (ap && ap.textContent !== apv) ap.textContent = apv;
}
updateLogoClock();
setInterval(updateLogoClock, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLogoClock(); });`);
fs.writeFileSync(R + "app.js", js);

// 3) style.css
let css = fs.readFileSync(R + "style.css", "utf8");
css = css.replace(/\s*$/, "\n") + `
/* Flip clock under the calendar logo (19 Oct): bold digits with a thin split line, no tiles or banner. */
.logo-clock {
    position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: -6px;
    display: flex; align-items: flex-start; gap: 3px; white-space: nowrap; pointer-events: none; z-index: 3;
}
.logo-clock .lk-t {
    position: relative; min-width: 21px; text-align: center; font: 800 15px/1 Inter, Arial, sans-serif; letter-spacing: -0.5px;
    color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(255, 255, 255, 0.2);
    font-variant-numeric: tabular-nums;
}
.logo-clock .lk-t::after {
    content: ""; position: absolute; left: -1px; right: -1px; top: 50%; height: 1px; margin-top: -0.5px;
    background: rgba(0, 0, 0, 0.75); box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12);
}
.logo-clock .lk-s { font-size: 11px; min-width: 15px; margin-top: 4px; color: #e7ecf7; }
.logo-clock .lk-ap { position: absolute; right: -2px; top: -8px; font: 700 6.5px/1 Inter, Arial, sans-serif; color: #c9cdd6; }
.logo-clock .lk-flip { animation: lkFlip 0.28s ease-out; transform-origin: 50% 50%; }
@keyframes lkFlip { 0% { transform: perspective(60px) rotateX(-80deg); opacity: 0.2; } 100% { transform: perspective(60px) rotateX(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .logo-clock .lk-flip { animation: none; } }
`;
fs.writeFileSync(R + "style.css", css);
console.log("ok");
