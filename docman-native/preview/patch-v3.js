const fs = require('fs');
let s = fs.readFileSync('make-tray-v3.js', 'utf8');
const a = s.indexOf('    // 3) measure the white text');
const b = s.indexOf('    // 4) crop + resize');
if (a < 0 || b < 0) throw new Error('markers');
const step3 = `    // 3) measure the white text, then rebuild the whole text area (letters + their 3D shadow) from a smooth surface: a quadratic in x, y per colour
    //    channel, least-squares fitted to the plain orange around it (rings, folder and any non-orange pixel excluded); the edge is feathered.
    const px = (x, y, c) => data[(y * W + x) * 4 + c];
    const info2 = {};
    for (const [name, r] of [['day', { x0: 470, y0: 218, x1: 775, y1: 338 }], ['num', { x0: 436, y0: 340, x1: 812, y1: 568 }]]) {
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++)
            if (px(x, y, 0) > 225 && px(x, y, 1) > 225 && px(x, y, 2) > 215) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        info2[name] = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    }
    const R = { x0: 425, y0: 200, x1: 825, y1: 571 };        // the text and its shadow, above the folder
    const O = { x0: 330, y0: 175, x1: 920, y1: 590 };        // where the plain orange is sampled
    const isOrange = (x, y) => { const r = px(x, y, 0), g = px(x, y, 1), b = px(x, y, 2); return data[(y * W + x) * 4 + 3] > 250 && r > 200 && g > 55 && g < 200 && b < 90; };
    const fit = [];
    for (let c = 0; c < 3; c++) {
        const M = Array.from({ length: 6 }, () => new Float64Array(6)); const v = new Float64Array(6);
        for (let y = O.y0; y < O.y1; y += 2) for (let x = O.x0; x < O.x1; x += 2) {
            if (x >= R.x0 - 6 && x < R.x1 + 6 && y >= R.y0 - 6 && y < R.y1 + 6) continue;
            if (!isOrange(x, y)) continue;
            const X = (x - 625) / 300, Y = (y - 385) / 300; const f = [1, X, Y, X * X, X * Y, Y * Y]; const t = px(x, y, c);
            for (let i = 0; i < 6; i++) { v[i] += f[i] * t; for (let j = 0; j < 6; j++) M[i][j] += f[i] * f[j]; }
        }
        // solve M k = v (Gaussian elimination)
        for (let i = 0; i < 6; i++) {
            let p = i; for (let r2 = i + 1; r2 < 6; r2++) if (Math.abs(M[r2][i]) > Math.abs(M[p][i])) p = r2;
            [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]];
            for (let r2 = i + 1; r2 < 6; r2++) { const k = M[r2][i] / M[i][i]; for (let j = i; j < 6; j++) M[r2][j] -= k * M[i][j]; v[r2] -= k * v[i]; }
        }
        const k = new Float64Array(6);
        for (let i = 5; i >= 0; i--) { let sum = v[i]; for (let j = i + 1; j < 6; j++) sum -= M[i][j] * k[j]; k[i] = sum / M[i][i]; }
        fit[c] = k;
    }
    const FE = 10;
    for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
        const X = (x - 625) / 300, Y = (y - 385) / 300; const f = [1, X, Y, X * X, X * Y, Y * Y];
        const d = Math.min(x - R.x0, R.x1 - 1 - x, y - R.y0, R.y1 - 1 - y);
        const wgt = Math.min(1, (d + 1) / FE);
        for (let c = 0; c < 3; c++) {
            let val = 0; for (let i = 0; i < 6; i++) val += fit[c][i] * f[i];
            const i4 = (y * W + x) * 4 + c;
            data[i4] = Math.max(0, Math.min(255, wgt * val + (1 - wgt) * data[i4]));
        }
    }
    console.log('text found', JSON.stringify(info2));

`;
s = s.slice(0, a) + step3 + s.slice(b);
fs.writeFileSync('make-tray-v3.js', s);
console.log('patched');
