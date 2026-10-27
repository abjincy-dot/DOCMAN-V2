// Header picture v2 (24 Oct): the user's alarm-clock artwork with its PAINTED time ("10:24") and PAINTED clock hands removed, so the app can draw the real time
// (live text + live hands). usage: node make-alarm-v2.js <source.png> <out.png>
// Prints the hub / text positions (in output pixels) that preview/alarm-live.css is built from.
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);

const HUB = [385, 328], HOUR_TIP = [345, 293], MIN_TIP = [442, 383];   // measured on the 523 x 477 source
const HAND_R = 11.5, SAMPLE_FROM = 15, HUB_R = 14;
const TEXT = { x0: 138, x1: 356, y0: 64, y1: 136, refTop: 58, refBot: 139 };

function distSeg(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
}

(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const px = (x, y) => (y * W + x) * 4;

    // 1. the painted time: each column is filled by blending the band colour just above the text with the band colour just below it
    // (each ROW is blended from the band colour left of the text to the band colour right of it: the band's gradient runs vertically)
    for (let y = TEXT.y0 - 3; y <= TEXT.y1 + 3; y++) {
        const a = px(TEXT.x0 - 16, y), b = px(TEXT.x1 + 16, y);
        for (let x = TEXT.x0 - 12; x <= TEXT.x1 + 12; x++) {
            const t = (x - (TEXT.x0 - 16)) / ((TEXT.x1 + 16) - (TEXT.x0 - 16)), p = px(x, y);
            for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[a + c] * (1 - t) + data[b + c] * t);
        }
    }

    // 2. the painted hands: pixels along both hands (not the hub) become the cream of the face around them
    const mask = new Uint8Array(W * H);
    for (let y = 200; y < 440; y++) for (let x = 280; x < 480; x++) {
        const d = Math.min(distSeg(x, y, HUB, HOUR_TIP), distSeg(x, y, HUB, MIN_TIP));
        if (d <= HAND_R && Math.hypot(x - HUB[0], y - HUB[1]) > HUB_R) mask[y * W + x] = 1;
    }
    // each masked pixel is blended across the hand: the face colour found by walking out perpendicular to the hand on both sides
    const dseg = (x, y) => Math.min(distSeg(x, y, HUB, HOUR_TIP), distSeg(x, y, HUB, MIN_TIP));
    const segs = [[HUB, HOUR_TIP], [HUB, MIN_TIP]];
    const fills = [];
    for (let y = 200; y < 440; y++) for (let x = 280; x < 480; x++) {
        if (!mask[y * W + x]) continue;
        const s = distSeg(x, y, ...segs[0]) < distSeg(x, y, ...segs[1]) ? segs[0] : segs[1];
        const vx = s[1][0] - s[0][0], vy = s[1][1] - s[0][1], L = Math.hypot(vx, vy), nx = -vy / L, ny = vx / L;
        const walk = (sg) => {
            for (let k = 1; k < 40; k++) {
                const X = Math.round(x + nx * sg * k), Y = Math.round(y + ny * sg * k), p = px(X, Y);
                if (mask[Y * W + X] || dseg(X, Y) < HAND_R + 3) continue;
                if (data[p] > 185 && data[p + 1] > 180 && data[p + 2] > 170) return { k, c: [data[p], data[p + 1], data[p + 2]] };
            }
            return null;
        };
        const A = walk(1), B = walk(-1);
        if (A && B) { const w = A.k / (A.k + B.k); fills.push([x, y, A.c[0] * (1 - w) + B.c[0] * w, A.c[1] * (1 - w) + B.c[1] * w, A.c[2] * (1 - w) + B.c[2] * w]); }
        else if (A || B) { const c = (A || B).c; fills.push([x, y, c[0], c[1], c[2]]); }
    }
    for (const [x, y, r, g, b] of fills) { const p = px(x, y); data[p] = r; data[p + 1] = g; data[p + 2] = b; }

    // 3. same trim + scale to 420 tall as v1
    const clean = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const trimmed = await sharp(clean).trim().toBuffer({ resolveWithObject: true });
    const left = -trimmed.info.trimOffsetLeft, top = -trimmed.info.trimOffsetTop;
    const k = 420 / trimmed.info.height;
    const res = await sharp(trimmed.data).resize({ height: 420 }).png({ palette: false }).toFile(out);
    const o = (p) => [+((p[0] - left) * k).toFixed(1), +((p[1] - top) * k).toFixed(1)];
    console.log(JSON.stringify({ outW: res.width, outH: res.height, scale: +k.toFixed(4), hub: o(HUB), hourTip: o(HOUR_TIP), minTip: o(MIN_TIP),
        textCentre: o([(TEXT.x0 + TEXT.x1) / 2 + 3, 99.5]), textW: +(210 * k).toFixed(1), textH: +(65 * k).toFixed(1), hubR: +(HUB_R * k).toFixed(1), handW: +(HAND_R * 2 * k).toFixed(1) }));
})();
