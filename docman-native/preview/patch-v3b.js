const fs = require('fs');
let s = fs.readFileSync('make-tray-v3.js', 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor: ' + a.slice(0, 60)); s = s.replace(a, () => b); }
rep("    const R = { x0: 425, y0: 200, x1: 825, y1: 571 };        // the text and its shadow, above the folder",
    "    const R = { x0: 410, y0: 213, x1: 840, y1: 571 };        // the text and its shadow (the bottom follows the folder's slanted top, per column)");
rep("    const FE = 22;\n    for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {",
    "    // per column: fill down to just above the folder (its top edge slants from about y 577 at the right to 680 at the left)\n    const bot = new Int32Array(W);\n    for (let x = R.x0; x < R.x1; x++) {\n        let y = 560, run = 0;\n        for (; y < 700; y++) { if (!isOrange(x, y)) { if (++run >= 3) break; } else run = 0; }\n        bot[x] = Math.max(570, y - 6);\n    }\n    for (let x = R.x0; x < R.x1; x++) for (let y = R.y0; y < bot[x]; y++) {");
rep("        const d = Math.min(x - R.x0, R.x1 - 1 - x, y - R.y0, R.y1 - 1 - y);\n        const wgt = Math.min(1, (d + 1) / FE);",
    "        const wgt = Math.min(1, (x - R.x0 + 1) / 22, (R.x1 - x) / 22, (y - R.y0 + 1) / 8, (bot[x] - y) / 6);");
fs.writeFileSync('make-tray-v3.js', s); console.log('patched');
