// Orange calendar + tray picture (user's 23 Oct artwork, solid black background, white "Thu 22" painted in):
// (1) the black background is cut out: only black that is CONNECTED TO THE EDGE goes (dark parts inside stay), with soft, un-mixed edges;
// (2) only the largest shape is kept (no stray specks); (3) the painted text is erased with a smooth gradient patch; (4) crop + resize;
// prints where the live text belongs (fractions of the cropped picture).
const sharp = require('../node_modules/sharp');
const fs = require('fs');
const src = process.argv[2], out = process.argv[3];
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const maxc = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

    // 1) background = near-black pixels reachable from the border
    const BG_T = 40;
    const bg = new Uint8Array(W * H);
    const stack = new Int32Array(W * H); let sp = 0;
    const seed = (x, y) => { const i = y * W + x; if (!bg[i] && maxc(i) < BG_T) { bg[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    while (sp) {
        const i = stack[--sp], x = i % W, y = (i / W) | 0;
        if (x > 0) seed(x - 1, y); if (x < W - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < H - 1) seed(x, y + 1);
    }
    // soft edge: pixels within 3 px of the background get alpha from their brightness, colour un-mixed from black
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (bg[i]) { data[i * 4 + 3] = 0; continue; }
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < W && yy >= 0 && yy < H && bg[yy * W + xx]) { near = true; break; }
        }
        if (!near) continue;
        const m = maxc(i);
        const a = Math.max(0, Math.min(1, (m - 25) / 110));
        if (a <= 0) { data[i * 4 + 3] = 0; continue; }
        if (a < 1) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, data[i * 4 + c] / a);
        data[i * 4 + 3] = Math.round(a * 255);
    }

    // 2) keep only the largest shape
    const lab = new Int32Array(W * H); const sizes = [0]; let n = 0;
    const A = (i) => data[i * 4 + 3];
    for (let i0 = 0; i0 < W * H; i0++) {
        if (lab[i0] || A(i0) <= 30) continue;
        n++; let s2 = 0, cnt = 0; stack[s2++] = i0; lab[i0] = n;
        while (s2) {
            const i = stack[--s2]; cnt++; const x = i % W, y = (i / W) | 0;
            const tryp = (j) => { if (!lab[j] && A(j) > 30) { lab[j] = n; stack[s2++] = j; } };
            if (x > 0) tryp(i - 1); if (x < W - 1) tryp(i + 1); if (y > 0) tryp(i - W); if (y < H - 1) tryp(i + W);
        }
        sizes[n] = cnt;
    }
    let best = 1; for (let k = 1; k <= n; k++) if (sizes[k] > sizes[best]) best = k;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let i = 0; i < W * H; i++) {
        if (lab[i] === best) { const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        else data[i * 4 + 3] = 0;
    }
    console.log('components', n, 'kept', sizes[best], 'bbox', minX, minY, maxX, maxY);

    // 3) measure the white text, then rebuild the whole text area (letters + their 3D shadow) from a smooth surface: a quadratic in x, y per colour
    //    channel, least-squares fitted to the plain orange around it (rings, folder and any non-orange pixel excluded); the edge is feathered.
    const px = (x, y, c) => data[(y * W + x) * 4 + c];
    const info2 = {};
    for (const [name, r] of [['day', { x0: 470, y0: 218, x1: 775, y1: 338 }], ['num', { x0: 436, y0: 340, x1: 812, y1: 568 }]]) {
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++)
            if (px(x, y, 0) > 225 && px(x, y, 1) > 225 && px(x, y, 2) > 215) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        info2[name] = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    }
    const R = { x0: 410, y0: 213, x1: 840, y1: 571 };        // the text and its shadow (the bottom follows the folder's slanted top, per column)
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
    // per column: fill down to just above the folder (its top edge slants from about y 577 at the right to 680 at the left)
    const bot = new Int32Array(W);
    for (let x = R.x0; x < R.x1; x++) {
        let y = 560, run = 0;
        for (; y < 700; y++) { if (!isOrange(x, y)) { if (++run >= 3) break; } else run = 0; }
        bot[x] = Math.max(570, y - 6);
    }
    for (let x = R.x0; x < R.x1; x++) for (let y = R.y0; y < bot[x]; y++) {
        const X = (x - 625) / 300, Y = (y - 385) / 300; const f = [1, X, Y, X * X, X * Y, Y * Y];
        const wgt = Math.min(1, (x - R.x0 + 1) / 22, (R.x1 - x) / 22, (y - R.y0 + 1) / 8, (bot[x] - y) / 6);
        for (let c = 0; c < 3; c++) {
            let val = 0; for (let i = 0; i < 6; i++) val += fit[c][i] * f[i];
            const i4 = (y * W + x) * 4 + c;
            data[i4] = Math.max(0, Math.min(255, wgt * val + (1 - wgt) * data[i4]));
        }
    }
    console.log('text found', JSON.stringify(info2));

    // 4) crop + resize, and the text fractions
    const pad = 4;
    const cx0 = Math.max(0, minX - pad), cy0 = Math.max(0, minY - pad), cw = Math.min(W - 1, maxX + pad) - cx0 + 1, ch = Math.min(H - 1, maxY + pad) - cy0 + 1;
    const fr = (t) => ({ cx: (((t.x0 + t.x1) / 2) - cx0) / cw, cy: (((t.y0 + t.y1) / 2) - cy0) / ch, h: (t.y1 - t.y0) / ch, w: (t.x1 - t.x0) / cw });
    const frac = { cropW: cw, cropH: ch, aspect: cw / ch, day: fr(info2.day), num: fr(info2.num) };
    console.log('FRAC', JSON.stringify(frac));
    fs.writeFileSync(__dirname + '/tray-v3-frac.json', JSON.stringify(frac, null, 1));
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract({ left: cx0, top: cy0, width: cw, height: ch })
        .resize({ height: 420, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out);
    const m = await sharp(out).metadata();
    console.log('written', m.width + 'x' + m.height);
})();
