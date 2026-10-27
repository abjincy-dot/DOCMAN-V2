const fs = require('fs');
let s = fs.readFileSync('make-tray-v4.js', 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor: ' + a.slice(0, 60)); s = s.replace(a, () => b); }
// below the drawer: the sheet continues (its lower corners); recolour sheet-orange there too (hue <= 32), never the drawer's gold rim (yellower)
rep("    // distance to the outside (for the orange rim)",
    "    const lastBlue = new Int32Array(W).fill(-1);\n    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (data[i * 4 + 3] > 40 && data[i * 4 + 2] > data[i * 4] + 40 && data[i * 4 + 2] > 110) { lastBlue[x] = y; break; } }\n    const isSheet = (x, y) => { const i = y * W + x; if (y < stopY[x]) return isOrange(i); if (lastBlue[x] >= 0 && y > lastBlue[x] + 2 && isOrange(i)) return hsv(i).h <= 32; return false; };\n    // distance to the outside (for the orange rim)");
s = s.split("if (y < stopY[x] && isOrange(i))").join("if (isSheet(x, y))");
s = s.split("if (!(y < stopY[x] && isOrange(i))) continue;").join("if (!isSheet(x, y)) continue;");
fs.writeFileSync('make-tray-v4.js', s); console.log('patched', (s.match(/isSheet\(x, y\)/g) || []).length);
