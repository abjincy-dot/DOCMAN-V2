// Tray move, done cleanly: the tray (folders + drawer) is copied as a layer, moved DOWN by D1 and its lower part stretched E px further down (taller front),
// then laid over the UNTOUCHED calendar, so the calendar's own outline never gets steps. The tray layer covers the tray columns from the row above the folders
// (gap filled by stretching the plain plate above) down to the drawer's bottom V line, moved. Then the tray's bright rims are dimmed and a hair-thin orange
// line (anti-aliased) is drawn along its outer edge. Coordinates are for the full-size picture with the rings already raised (841 x 1048).
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data: base, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const D1 = Number(process.env.D1 || 42), E = Number(process.env.E || 54), HAIR = Number(process.env.HAIR || 6);
    const X0 = Number(process.env.X0 || 101), X1 = Number(process.env.X1 || 778), Y0 = 516, BAND = 70, YS = 800;               // tray columns; row just above the folders; plate band; start of the stretch
    const V = (x) => x <= 400 ? 915 + (x - 95) * (1042 - 915) / (400 - 95) : 1042 + (x - 400) * (950 - 1042) / (785 - 400);   // drawer bottom line
    const NH = H + D1 + E;
    const o = Buffer.alloc(W * NH * 4);
    const get = (x, yf, c) => { if (yf < 0 || yf > H - 1) return 0; const y0 = Math.floor(yf), y1 = Math.min(H - 1, y0 + 1), t = yf - y0; return base[(y0 * W + x) * 4 + c] * (1 - t) + base[(y1 * W + x) * 4 + c] * t; };
    // 1) the untouched calendar
    for (let y = 0; y < H; y++) base.copy(o, y * W * 4, y * W * 4, (y + 1) * W * 4);
    // 2) the tray layer over it
    for (let x = X0; x <= X1; x++) {
        const v = V(Math.max(95, Math.min(785, x)));
        const yEnd = v + D1 + E;
        for (let y = Y0 - BAND; y < Math.min(NH, yEnd + 3); y++) {
            let ys;
            if (y < Y0 + D1) ys = (Y0 - BAND) + (y - (Y0 - BAND)) * BAND / (BAND + D1);            // stretched plate
            else if (y < YS + D1) ys = y - D1;                                                       // moved down
            else ys = YS + (y - YS - D1) * (v - YS) / (v - YS + E);                                  // lower part stretched E further
            // blend the last 3 rows into the calendar below, so the tray's own anti-aliased edge stays soft
            const k = y <= yEnd ? 1 : Math.max(0, 1 - (y - yEnd) / 3);
            const i = (y * W + x) * 4;
            const a = get(x, ys, 3) / 255 * k;
            for (let c = 0; c < 3; c++) o[i + c] = Math.round(get(x, ys, c) * a + o[i + c] * (1 - a) * (o[i + 3] / 255) / Math.max(0.001, a + (1 - a) * o[i + 3] / 255));
            o[i + 3] = Math.round(255 * (a + (1 - a) * o[i + 3] / 255));
        }
    }
    // 3) tray rims: dim the bright ones, hair-thin orange line on the outer edge (anti-aliased)
    const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= NH) ? 0 : o[(y * W + x) * 4 + 3];
    const lum = (x, y) => { const i = (y * W + x) * 4; return 0.3 * o[i] + 0.59 * o[i + 1] + 0.11 * o[i + 2]; };
    const outD = (x, y) => { for (let d = 1; d <= HAIR + 2; d++) if (A(x, y + d) < 30 || A(x - d, y + d) < 30 || A(x + d, y + d) < 30) return d; return 99; };
    const nearBlack = (x, y, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < NH && A(xx, yy) > 200 && lum(xx, yy) < 40) return true; } return false; };
    const handle = { x0: 425, x1: 690, y0: 840 + D1, y1: 980 + D1 + E };
    const src2 = Buffer.from(o);
    let dim = 0, hair = 0;
    for (let x = X0; x <= X1; x++) {
        const v = V(Math.max(95, Math.min(785, x)));
        for (let y = 690 + D1; y <= Math.min(NH - 1, v + D1 + E + 2); y++) {
            if (x >= handle.x0 && x <= handle.x1 && y >= handle.y0 && y <= handle.y1) continue;
            const i = (y * W + x) * 4; if (src2[i + 3] < 30) continue;
            const r = src2[i], g = src2[i + 1], b = src2[i + 2];
            if (!(r > 150 && g > 70 && r > b * 2)) continue;
            const d = outD(x, y);
            if (d <= HAIR) { const t = d <= HAIR - 2 ? 1 : (HAIR - d + 1) / 3; o[i] = Math.round(255 * t + 20 * (1 - t)); o[i + 1] = Math.round(140 * t + 20 * (1 - t)); o[i + 2] = Math.round(30 * t + 26 * (1 - t)); hair++; continue; }
            if (nearBlack(x, y, 14)) { const k = 0.28; o[i] = Math.round(20 + (r - 20) * k); o[i + 1] = Math.round(20 + (g - 20) * k); o[i + 2] = Math.round(26 + (b - 26) * k); dim++; }
        }
    }
    // drop the faint glow just below the tray
    for (let x = X0; x <= X1; x++) for (let y = 0; y < NH; y++) { const i = (y * W + x) * 4; if (y > 900 && o[i + 3] > 0 && o[i + 3] < 70) o[i + 3] = 0; }
    await sharp(o, { raw: { width: W, height: NH, channels: 4 } }).png().toFile(out);
    console.log('tray down', D1, '+ taller', E, 'dimmed', dim, 'hair', hair, 'size', W + 'x' + NH);
})();
