// Recolours the orange calendar SHEET of calendar-tray-v3.png into the settings gear's theme (dark navy / graphite with a steel sheen),
// keeping the folders, the drawer and the rings as they are, and keeping an orange rim along the sheet's edge.
// Variant A: graphite sheet + orange rim.  Variant B: the same + a warm orange glow in the lower-right corner, like the gear's orange teeth.
const sharp = require('../node_modules/sharp');
const src = process.argv[2], outA = process.argv[3], outB = process.argv[4];
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const hsv = (i) => {
        const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
    };
    const isOrange = (i) => { if (data[i * 4 + 3] < 40) return false; const c = hsv(i); return c.h >= 5 && c.h <= 48 && c.s > 0.55 && c.v > 0.45; };
    // per column: the sheet runs from the top down to the first non-orange run below the date area (the folders / drawer); columns beside the drawer run to the bottom
    const startY = Math.round(H * 0.36);
    const stopY = new Int32Array(W).fill(H);
    for (let x = 0; x < W; x++) {
        let run = 0;
        for (let y = startY; y < H; y++) {
            const i = y * W + x;
            if (data[i * 4 + 3] < 40) { stopY[x] = H; break; }      // reached the outside: no drawer in this column
            if (!isOrange(i)) { if (++run >= 2) { stopY[x] = y - 1; break; } } else run = 0;
        }
    }
    const lastBlue = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (data[i * 4 + 3] > 40 && data[i * 4 + 2] > data[i * 4] + 40 && data[i * 4 + 2] > 110) { lastBlue[x] = y; break; } }
    const isSheet = (x, y) => { const i = y * W + x; if (y < stopY[x]) return isOrange(i); if (lastBlue[x] >= 0 && y > lastBlue[x] + 2 && isOrange(i)) return hsv(i).h <= 32; return false; };
    // distance to the outside (for the orange rim)
    const alphaOut = (x, y) => x < 0 || y < 0 || x >= W || y >= H || data[(y * W + x) * 4 + 3] < 40;
    const nearEdge = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && alphaOut(x + dx, y + dy)) return true; return false; };

    const make = async (variant, out) => {
        const d2 = Buffer.from(data);
        // mean brightness of the sheet, to keep its 3D shading
        let sum = 0, cnt = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (isSheet(x, y)) { sum += hsv(i).v; cnt++; } }
        const vAvg = sum / cnt;
        const lerp = (a, b, t) => a + (b - a) * t;
        const navy = [11, 18, 34], steel = [128, 136, 152], copper = [196, 120, 70], orange = [255, 140, 20];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!isSheet(x, y)) continue;
            if (nearEdge(x, y, 4)) continue;                                   // keep the orange rim
            const shade = Math.max(0.55, Math.min(1.35, hsv(i).v / vAvg));
            // diagonal sheen like the gear: dark lower-left, steel upper-right
            const t = Math.max(0, Math.min(1, 0.65 * (x / W) + 0.35 * (1 - y / H)));
            let c = [0, 1, 2].map(k => lerp(navy[k], steel[k], Math.pow(t, 1.6)));
            if (variant === 'B') {                                              // warm orange corner, lower right
                const dx = x / W - 1, dy = y / H - 0.75; const g = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.55);
                c = [0, 1, 2].map(k => lerp(c[k], lerp(copper[k], orange[k], g), Math.min(1, g * 1.2)));
            }
            for (let k = 0; k < 3; k++) d2[i * 4 + k] = Math.max(0, Math.min(255, c[k] * shade));
        }
        await sharp(d2, { raw: { width: W, height: H, channels: 4 } }).png({ palette: true, quality: 92, effort: 10 }).toFile(out);
    };
    await make('A', outA);
    await make('B', outB);
    console.log('written', outA, outB);
})();
