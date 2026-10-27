// Removes the orange rim (and its glow) along the LEFT side and the BOTTOM-LEFT of the calendar sheet: orange pixels within RD px of the outside, in that area only
// (left strip, and the bottom strip left of the drawer), are turned into the dark sheet colour; their transparency is kept so the edge stays smooth.
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const RD = Math.round(W * 0.03);                         // ~25 px at 841 wide
    const outside = (x, y) => x < 0 || y < 0 || x >= W || y >= H || data[(y * W + x) * 4 + 3] < 30;
    const near = (x, y) => { for (let d = 1; d <= RD; d++) { if (outside(x - d, y) || outside(x, y + d) || outside(x - d, y + d)) return true; } return false; };
    const inArea = (x, y) => (x < W * 0.13 && y > H * 0.22) || (x < W * 0.30 && y > H * 0.80);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (data[i + 3] < 30 || !inArea(x, y)) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const orange = r > 90 && r > g * 1.35 && r > b * 2.2;
        if (!orange || !near(x, y)) continue;
        // the dark sheet colour, a little lighter at the very edge so the shape still reads
        const dark = [22, 22, 28];
        const t = Math.min(1, (r - 60) / 140);
        data[i] = Math.round(r * (1 - t) + dark[0] * t); data[i + 1] = Math.round(g * (1 - t) + dark[1] * t); data[i + 2] = Math.round(b * (1 - t) + dark[2] * t);
        n++;
    }
    await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
    console.log('recoloured', n);
})();
