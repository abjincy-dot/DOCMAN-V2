// LEFT side of the calendar sheet (the whole left edge and the bottom-left): the thick orange rim and its glow are removed (turned into the dark sheet colour),
// then a HAIR-THIN orange line (HAIR px at this size, about 0.4 css px on the phone) is drawn along the very edge.
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const RD = Math.round(W * 0.035), HAIR = Number(process.env.HAIR || 7);
    const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : data[(y * W + x) * 4 + 3];
    const outside = (x, y) => A(x, y) < 30;
    const dist = (x, y) => { for (let d = 1; d <= RD; d++) if (outside(x - d, y) || outside(x, y + d) || outside(x - d, y + d) || outside(x - d, y - d)) return d; return 99; };
    const inArea = (x, y) => (x < W * 0.14 && y > H * 0.03) || (x < W * 0.40 && y > H * 0.78);
    const dark = [20, 20, 26], line = [236, 238, 244];
    const src2 = Buffer.from(data);
    let nd = 0, nl = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (src2[i + 3] < 30 || !inArea(x, y)) continue;
        const d = dist(x, y);
        if (d > RD) continue;
        const r = src2[i], g = src2[i + 1], b = src2[i + 2];
        const warm = r > 60 && r > g * 1.2 && r > b * 1.8;
        if (d <= HAIR) { const t = d <= HAIR - 2 ? 1 : (HAIR - d + 1) / 3; for (let c = 0; c < 3; c++) data[i + c] = Math.round(line[c] * t + dark[c] * (1 - t)); nl++; }
        else { const t = Math.min(1, (d - HAIR) / 3); for (let c = 0; c < 3; c++) data[i + c] = Math.round(src2[i + c] * (1 - t) + dark[c] * t); nd++; }   // everything just inside the line goes dark: ONE line only
    }
    // the outer glow that sat just OUTSIDE that edge (semi-transparent orange) goes too
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4; const a = data[i + 3];
        if (a === 0 || a >= 30 || !inArea(x, y)) continue;
        data[i + 3] = 0;
    }
    await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
    console.log('darkened', nd, 'hair line px', nl);
})();
