const fs = require('fs');
let s = fs.readFileSync('make-tray-v5.js', 'utf8');
// (1) background = colours close to a smooth model of the picture's border (the backdrop is a dark navy-to-brown gradient, the left of the calendar is dark too)
const a = s.indexOf('    // 1) background');
const b = s.indexOf('    // 2) keep only the largest shape');
if (a < 0 || b < 0) throw new Error('markers 1');
const step1 = `    // 1) background: a smooth quadratic model of the backdrop, fitted to the outer 14 px of the picture; a pixel is background when it is within 20 of that
    //    model AND connected to the edge. Soft edge: alpha ramps with the distance from the model, colour un-mixed from the model.
    const bgm = [];
    for (let c = 0; c < 3; c++) {
        const M = Array.from({ length: 6 }, () => new Float64Array(6)); const v = new Float64Array(6);
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            if (x > 14 && x < W - 15 && y > 14 && y < H - 15) continue;
            const X = x / W - 0.5, Y = y / H - 0.5, f = [1, X, Y, X * X, X * Y, Y * Y], t = data[(y * W + x) * 4 + c];
            for (let i = 0; i < 6; i++) { v[i] += f[i] * t; for (let j = 0; j < 6; j++) M[i][j] += f[i] * f[j]; }
        }
        for (let i = 0; i < 6; i++) { let p = i; for (let r = i + 1; r < 6; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]];
            for (let r = i + 1; r < 6; r++) { const k = M[r][i] / M[i][i]; for (let j = i; j < 6; j++) M[r][j] -= k * M[i][j]; v[r] -= k * v[i]; } }
        const k = new Float64Array(6); for (let i = 5; i >= 0; i--) { let sum = v[i]; for (let j = i + 1; j < 6; j++) sum -= M[i][j] * k[j]; k[i] = sum / M[i][i]; }
        bgm[c] = k;
    }
    const model = (x, y, c) => { const X = x / W - 0.5, Y = y / H - 0.5; const k = bgm[c]; return k[0] + k[1] * X + k[2] * Y + k[3] * X * X + k[4] * X * Y + k[5] * Y * Y; };
    const dist = (i) => { const x = i % W, y = (i / W) | 0; let d = 0; for (let c = 0; c < 3; c++) { const e = data[i * 4 + c] - model(x, y, c); d += e * e; } return Math.sqrt(d); };
    const BG_T = 20;
    const bg = new Uint8Array(W * H);
    const stack = new Int32Array(W * H); let sp = 0;
    const seed = (x, y) => { const i = y * W + x; if (!bg[i] && dist(i) < BG_T) { bg[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    while (sp) { const i = stack[--sp], x = i % W, y = (i / W) | 0; if (x > 0) seed(x - 1, y); if (x < W - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < H - 1) seed(x, y + 1); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (bg[i]) { data[i * 4 + 3] = 0; continue; }
        let near = false;
        for (let dy = -4; dy <= 4 && !near; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H && bg[yy * W + xx]) { near = true; break; } }
        if (!near) continue;
        const a2 = Math.max(0, Math.min(1, (dist(i) - BG_T) / 60));
        if (a2 <= 0) { data[i * 4 + 3] = 0; continue; }
        if (a2 < 1) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, (data[i * 4 + c] - (1 - a2) * model(x, y, c)) / a2));
        data[i * 4 + 3] = Math.round(a2 * 255);
    }

`;
s = s.slice(0, a) + step1 + s.slice(b);
// (2) the text area: the plain colour just above the text, per column, no side correction (that made vertical bands)
s = s.replace('            const v = T[c][x] + (1 - sx) * lt + sx * rt;', '            const v = T[c][x];');
fs.writeFileSync('make-tray-v5.js', s); console.log('patched');
