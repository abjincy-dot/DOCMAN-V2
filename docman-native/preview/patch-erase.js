const fs = require('fs');
let s = fs.readFileSync('make-tray-v2.js', 'utf8');
const a = s.indexOf('    // 2) erase the baked text');
const b = s.indexOf('    // 3) crop to the shape');
if (a < 0 || b < 0) throw new Error('markers');
const step2 = `    // 2) erase the baked text: measure it first (dark pixels inside a safe rectangle), then replace the WHOLE rectangle by a smooth gradient (a Coons patch built
    //    from the colours just outside its four edges), so no ghost of the letters or their glow is left.
    const rects = [{ name: 'day', x0: 505, y0: 150, x1: 790, y1: 252 }, { name: 'num', x0: 470, y0: 280, x1: 830, y1: 476 }];
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

`;
s = s.slice(0, a) + step2 + s.slice(b);
fs.writeFileSync('make-tray-v2.js', s);
console.log('patched');
