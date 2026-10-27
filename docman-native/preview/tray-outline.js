// Makes the tray stand out cleanly: a smooth, anti-aliased thin WHITE outline along the drawer box (left side, bottom V, right side), with a dark band just outside
// it so the box separates from the calendar behind. Full-size picture (841 wide, rings raised: 841 x 1048).
// usage: node tray-outline.js in.png out.png   env: LW (line width, default 5), BAND (dark band outside, default 14)
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const LW = Number(process.env.LW || 5), BAND = Number(process.env.BAND || 14);
    // the outline path (points along the box's outer edge, with rounded corners made by extra points)
    const P = [[99, 728], [99, 918], [108, 934], [415, 1042], [430, 1046], [445, 1042], [762, 952], [772, 938], [774, 740]];
    // distance from a point to the polyline, and which side (outside = left/below/right of the box)
    const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); const qx = ax + t * dx, qy = ay + t * dy; return [Math.hypot(px - qx, py - qy), (px - ax) * dy - (py - ay) * dx]; };
    const dist = (x, y) => { let best = 1e9, side = 0; for (let k = 0; k < P.length - 1; k++) { const [d, s] = segDist(x, y, P[k][0], P[k][1], P[k + 1][0], P[k + 1][1]); if (d < best) { best = d; side = s; } } return [best, side]; };
    const white = [238, 240, 246], dark = [14, 16, 22];
    for (let y = 700; y < Math.min(H, 1060); y++) for (let x = 80; x < 800; x++) {
        const [d, side] = dist(x, y);
        if (d > LW / 2 + BAND + 1.5) continue;
        const i = (y * W + x) * 4;
        // the polyline runs clockwise from the top-left going down: "side > 0" is the outside of the box
        const outside = side > 0;
        if (d <= LW / 2 + 1) {                                   // the white line, anti-aliased on both edges
            const a = Math.max(0, Math.min(1, LW / 2 + 0.5 - d + 0.5));
            for (let c = 0; c < 3; c++) data[i + c] = Math.round(white[c] * a + data[i + c] * (1 - a));
            data[i + 3] = Math.max(data[i + 3], Math.round(255 * a));
        } else if (outside && data[i + 3] > 20) {                // dark band just outside, fading out
            const t = Math.max(0, Math.min(1, 1 - (d - LW / 2 - 1) / BAND));
            for (let c = 0; c < 3; c++) data[i + c] = Math.round(dark[c] * t + data[i + c] * (1 - t));
        }
    }
    await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
    console.log('outline drawn', LW, BAND);
})();
