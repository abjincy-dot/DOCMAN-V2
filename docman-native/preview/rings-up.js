// Lifts the two binder rings higher above the calendar: adds PAD rows on top; in the ring columns the slice from the top down to just below the sheet's top edge
// is stretched to fill the extra height (only the part of the ring above the sheet gets longer); every other column just moves down by PAD.
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, k = H / 420;
    const PAD = Math.round(Number(process.env.PAD || 12) * k);           // extra height, in 420-px units
    const S = Math.round(26 * k);                                         // stretched slice: rows 0..S (ring above + into the sheet top)
    const rings = [[71, 101], [266, 293]].map(([a, b]) => [Math.round((a - 4) * k), Math.round((b + 4) * k)]);
    const NH = H + PAD;
    const outBuf = Buffer.alloc(W * NH * 4);
    const get = (x, yf, c) => {           // linear sample in y
        const y0 = Math.max(0, Math.min(H - 1, Math.floor(yf))), y1 = Math.min(H - 1, y0 + 1), t = yf - Math.floor(yf);
        return data[(y0 * W + x) * 4 + c] * (1 - t) + data[(y1 * W + x) * 4 + c] * t;
    };
    for (let x = 0; x < W; x++) {
        let w = 0;                          // 0 = plain shift, 1 = stretch; feathered 6 px at each side of a ring band
        for (const [a, b] of rings) { const f = Math.round(6 * k); if (x >= a - f && x <= b + f) w = Math.max(w, Math.min(1, (x - (a - f)) / f, ((b + f) - x) / f)); }
        for (let ny = 0; ny < NH; ny++) {
            const ys = ny - PAD;                                               // plain shift source row
            const yt = ny <= S + PAD ? ny * S / (S + PAD) : ys;                // stretched source row
            for (let c = 0; c < 4; c++) {
                const vs = ys < 0 ? (c === 3 ? 0 : 0) : get(x, ys, c);
                const vt = get(x, yt, c);
                outBuf[(ny * W + x) * 4 + c] = Math.round(w * vt + (1 - w) * vs);
            }
        }
    }
    await sharp(outBuf, { raw: { width: W, height: NH, channels: 4 } }).resize({ height: process.env.KEEP ? NH : Math.round(420 * NH / H), kernel: 'lanczos3' }).png().toFile(out);
    const m = await sharp(out).metadata(); console.log('written', m.width + 'x' + m.height, 'pad(px@420)', process.env.PAD || 12);
})();
