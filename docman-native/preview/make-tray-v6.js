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

    // 1) background: a smooth quadratic model of the backdrop, fitted to the outer 14 px of the picture; a pixel is background when it is within 20 of that
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

    // 1b) second pass: dim leftovers of the backdrop's own glow (a brown smudge top-right, an orange haze on the left) that are connected to the outside are
    //     removed too; the calendar's bright rim (and everything inside it) stops the fill.
    {
        const DIM = Number(process.env.DIM || 150);
        const out2 = new Uint8Array(W * H); let sp2 = 0;
        const dimPx = (i) => data[i * 4 + 3] > 0 && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) * (data[i * 4 + 3] / 255) < DIM;
        // the fill may only run in the band OUTSIDE the calendar face and the drawer, never inside them
        const inside = (i) => { const x = i % W, y = (i / W) | 0; return (x >= 175 && x < 975 && y >= 235 && y < 1080) || (x >= 255 && x < 925 && y >= 780 && y < 1128); };
        const push = (i) => { if (!out2[i] && !inside(i) && (data[i * 4 + 3] === 0 || dimPx(i))) { out2[i] = 1; stack[sp2++] = i; } };
        for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
        while (sp2) { const i = stack[--sp2], x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
        let removed = 0;
        for (let i = 0; i < W * H; i++) if (out2[i] && data[i * 4 + 3] > 0) { data[i * 4 + 3] = 0; removed++; }
        console.log('second pass removed', removed);
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

    // 3) text + its glow: rebuilt per column from the plain plate colour just ABOVE the text (top profile), corrected by the columns just left and right of the
    //    area (Coons patch with the bottom edge = the top profile); the area runs down to the first folder pixel in each column. The plate here is mostly a
    //    left-to-right dark-to-orange gradient, which this keeps.
    const px = (x, y, c) => data[(y * W + x) * 4 + c];
    const white = (x, y) => px(x, y, 0) > 225 && px(x, y, 1) > 225 && px(x, y, 2) > 220;
    const info2 = {};
    for (const [name, r] of [['day', [380, 300, 800, 430]], ['num', [380, 430, 800, 630]]]) {
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
        for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) if (white(x, y)) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        info2[name] = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    }
    const R = { x0: 395, y0: 308, x1: 765 };
    const isFolder = (x, y) => { const r = px(x, y, 0), g = px(x, y, 1), b = px(x, y, 2); return (b > 140 && r < 110) || (b > r + 30 && b > 70) || (r > 225 && g > 225 && b > 200) || (r > 240 && g > 170 && b < 90); };
    const bot = new Int32Array(W);
    for (let x = R.x0; x < R.x1; x++) { let y = 612; for (; y < 790; y++) if (isFolder(x, y) && isFolder(x, y + 1)) break; bot[x] = y - 5; }
    // a smooth surface (degree 4 in x, 2 in y, with cross terms) fitted to the calendar face AROUND the text: the face goes from dark (left) to orange (right)
    // and darkens toward the bottom-left, which a single row or a rectangle patch cannot follow. Excluded from the fit: the text area and its glow, the ring
    // eyelets, the bright rim near the edge, the folders, anything see-through.
    const basis = (x, y) => { const X = (x - 580) / 400, Y = (y - 480) / 230; return [1, X, X * X, X * X * X, X * X * X * X, Y, X * Y, X * X * Y, X * X * X * Y, Y * Y, X * Y * Y, X * X * Y * Y]; };
    const NB = 12;
    const eyelets = [[355, 292], [812, 292]];
    const useForFit = (x, y) => {
        if (data[(y * W + x) * 4 + 3] < 250) return false;
        if (x >= R.x0 - 12 && x < R.x1 + 12 && y >= R.y0 - 8 && y < 640) return false;
        for (const [ex, ey] of eyelets) if ((x - ex) * (x - ex) + (y - ey) * (y - ey) < 75 * 75) return false;
        if (isFolder(x, y)) return false;
        for (let d = 1; d <= 22; d += 7) if (data[(y * W + x - d) * 4 + 3] < 250 || data[(y * W + x + d) * 4 + 3] < 250) return false;
        return true;
    };
    const fitC = [];
    for (let c = 0; c < 3; c++) {
        const M = Array.from({ length: NB }, () => new Float64Array(NB)); const v = new Float64Array(NB);
        for (let y = 300; y < 700; y += 2) for (let x = 185; x < 975; x += 2) {
            if (!useForFit(x, y)) continue;
            const f = basis(x, y), t = px(x, y, c);
            for (let i = 0; i < NB; i++) { v[i] += f[i] * t; for (let j = 0; j < NB; j++) M[i][j] += f[i] * f[j]; }
        }
        for (let i = 0; i < NB; i++) { let p = i; for (let r = i + 1; r < NB; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]];
            for (let r = i + 1; r < NB; r++) { const k = M[r][i] / M[i][i]; for (let j = i; j < NB; j++) M[r][j] -= k * M[i][j]; v[r] -= k * v[i]; } }
        const k = new Float64Array(NB); for (let i = NB - 1; i >= 0; i--) { let sum = v[i]; for (let j = i + 1; j < NB; j++) sum -= M[i][j] * k[j]; k[i] = sum / M[i][i]; }
        fitC[c] = k;
    }
    const FE = 18;
    for (let x = R.x0 - FE; x < R.x1 + FE; x++) for (let y = R.y0 - 6; y < bot[Math.max(R.x0, Math.min(R.x1 - 1, x))]; y++) {
        const f = basis(x, y);
        const inside = Math.min(x - (R.x0 - FE), (R.x1 + FE - 1) - x, y - (R.y0 - 6));
        const wgt = Math.max(0, Math.min(1, inside / FE));
        for (let c = 0; c < 3; c++) {
            let val = 0; for (let i = 0; i < NB; i++) val += fitC[c][i] * f[i];
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
    fs.writeFileSync(__dirname + '/tray-v6-frac.json', JSON.stringify(frac, null, 1));
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract({ left: cx0, top: cy0, width: cw, height: ch })
        .resize({ height: 420, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out);
    const m = await sharp(out).metadata();
    console.log('written', m.width + 'x' + m.height);
})();
