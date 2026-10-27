// New calendar + tray header picture: removes stray specks (keeps the largest shape), erases the baked-in "Thu 22" by diffusion fill (the app draws the live
// day and date itself), crops to the shape, resizes, and prints where the live text belongs (as fractions of the cropped picture).
const sharp = require('../node_modules/sharp');
const fs = require('fs');
const src = process.argv[2], out = process.argv[3];
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const A = (x, y) => data[(y * W + x) * 4 + 3];

    // 1) keep only the largest connected shape (alpha > 30)
    const lab = new Int32Array(W * H);
    const sizes = [0];
    let n = 0;
    const stack = new Int32Array(W * H);
    for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
        const i0 = y0 * W + x0;
        if (lab[i0] || A(x0, y0) <= 30) continue;
        n++; let sp = 0, cnt = 0; stack[sp++] = i0; lab[i0] = n;
        while (sp) {
            const i = stack[--sp]; cnt++;
            const x = i % W, y = (i / W) | 0;
            if (x > 0) { const j = i - 1; if (!lab[j] && A(x - 1, y) > 30) { lab[j] = n; stack[sp++] = j; } }
            if (x < W - 1) { const j = i + 1; if (!lab[j] && A(x + 1, y) > 30) { lab[j] = n; stack[sp++] = j; } }
            if (y > 0) { const j = i - W; if (!lab[j] && A(x, y - 1) > 30) { lab[j] = n; stack[sp++] = j; } }
            if (y < H - 1) { const j = i + W; if (!lab[j] && A(x, y + 1) > 30) { lab[j] = n; stack[sp++] = j; } }
        }
        sizes[n] = cnt;
    }
    let best = 1; for (let k = 1; k <= n; k++) if (sizes[k] > sizes[best]) best = k;
    console.log('components', n, 'largest', sizes[best], 'others total', sizes.slice(1).reduce((a, b) => a + b, 0) - sizes[best]);
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (lab[i] === best) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        else data[i * 4 + 3] = 0;   // specks and their fringes
    }
    console.log('shape bbox', minX, minY, maxX, maxY);

    // 2) erase the baked text: measure it first (dark pixels inside a safe rectangle), then replace the WHOLE rectangle by a smooth gradient (a Coons patch built
    //    from the colours just outside its four edges), so no ghost of the letters or their glow is left.
    const rects = [{ name: 'day', x0: 505, y0: 150, x1: 790, y1: 252 }, { name: 'num', x0: 470, y0: 280, x1: 830, y1: 471 }];
    const lum = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const info2 = {};
    for (const r of rects) {
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0, cr = 0, cg = 0, cb = 0, cnt = 0;
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
            const i = y * W + x;
            const dark = r.name === 'day' ? (data[i * 4] > 120 && data[i * 4 + 1] < 70 && data[i * 4 + 2] < 70 && lum(i) < 110) : lum(i) < 95;
            if (dark) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; cr += data[i * 4]; cg += data[i * 4 + 1]; cb += data[i * 4 + 2]; cnt++; }
        }
        info2[r.name] = { x0: bx0, y0: by0, x1: bx1, y1: by1, color: [Math.round(cr / cnt), Math.round(cg / cnt), Math.round(cb / cnt)] };
        // colours just outside each edge (3 px band, averaged)
        const px = (x, y, c) => data[(y * W + x) * 4 + c];
        const avgH = (y, x, c) => (px(x, y, c) + px(x, y - 1, c) + px(x, y - 2, c)) / 3;
        const w = r.x1 - r.x0, h = r.y1 - r.y0;
        const Lc = [], Rc = [], Tc = [], Bc = [];
        for (let c = 0; c < 3; c++) {
            Lc[c] = []; Rc[c] = []; Tc[c] = []; Bc[c] = [];
            for (let y = 0; y < h; y++) {
                const yy = r.y0 + y;
                Lc[c][y] = (px(r.x0 - 1, yy, c) + px(r.x0 - 2, yy, c) + px(r.x0 - 3, yy, c)) / 3;
                Rc[c][y] = (px(r.x1, yy, c) + px(r.x1 + 1, yy, c) + px(r.x1 + 2, yy, c)) / 3;
            }
            for (let x = 0; x < w; x++) {
                const xx = r.x0 + x;
                Tc[c][x] = (px(xx, r.y0 - 1, c) + px(xx, r.y0 - 2, c) + px(xx, r.y0 - 3, c)) / 3;
                Bc[c][x] = (px(xx, r.y1, c) + px(xx, r.y1 + 1, c) + px(xx, r.y1 + 2, c)) / 3;
            }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const sx = (x + 0.5) / w, ty = (y + 0.5) / h;
            for (let c = 0; c < 3; c++) {
                const tl = Tc[c][0], tr = Tc[c][w - 1], bl = Bc[c][0], br = Bc[c][w - 1];
                const v = (1 - sx) * Lc[c][y] + sx * Rc[c][y] + (1 - ty) * Tc[c][x] + ty * Bc[c][x]
                    - ((1 - sx) * (1 - ty) * tl + sx * (1 - ty) * tr + (1 - sx) * ty * bl + sx * ty * br);
                data[((r.y0 + y) * W + (r.x0 + x)) * 4 + c] = Math.max(0, Math.min(255, v));
            }
        }
    }
    console.log('text found', JSON.stringify(info2));

    // 3) crop to the shape (+4 px) and resize
    const pad = 4;
    const cx0 = Math.max(0, minX - pad), cy0 = Math.max(0, minY - pad), cw = Math.min(W - 1, maxX + pad) - cx0 + 1, ch = Math.min(H - 1, maxY + pad) - cy0 + 1;
    const frac = {
        cropW: cw, cropH: ch, aspect: cw / ch,
        day: { cx: (((info2.day.x0 + info2.day.x1) / 2) - cx0) / cw, cy: (((info2.day.y0 + info2.day.y1) / 2) - cy0) / ch, h: (info2.day.y1 - info2.day.y0) / ch, w: (info2.day.x1 - info2.day.x0) / cw, color: info2.day.color },
        num: { cx: (((info2.num.x0 + info2.num.x1) / 2) - cx0) / cw, cy: (((info2.num.y0 + info2.num.y1) / 2) - cy0) / ch, h: (info2.num.y1 - info2.num.y0) / ch, w: (info2.num.x1 - info2.num.x0) / cw, color: info2.num.color }
    };
    console.log('FRAC', JSON.stringify(frac));
    fs.writeFileSync(__dirname + '/tray-v2-frac.json', JSON.stringify(frac, null, 1));
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract({ left: cx0, top: cy0, width: cw, height: ch }).resize({ height: 420, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out);
    const m = await sharp(out).metadata();
    console.log('written', out, m.width + 'x' + m.height, fs.statSync(out).size + ' bytes');
})();
