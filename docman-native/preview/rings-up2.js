// Rings raised WITHOUT breaking the page lines behind them: the whole picture is moved down by PAD (nothing stretched), then each ring's metal (silver pixels only)
// is stretched upward from the original and laid OVER it. Behind the ring the page lines stay whole, so no jagged bright steps (they flickered while floating).
// usage: node rings-up2.js in.png out.png   env: PAD (rows at 420 scale, default 20). Output keeps the full size.
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, k = H / 420;
    const PAD = Math.round(Number(process.env.PAD || 20) * k), S = Math.round(26 * k);
    const rings = [[71, 101], [266, 293]].map(([a, b]) => [Math.round((a - 6) * k), Math.round((b + 6) * k)]);
    const NH = H + PAD;
    const o = Buffer.alloc(W * NH * 4);
    for (let y = 0; y < H; y++) data.copy(o, (y + PAD) * W * 4, y * W * 4, (y + 1) * W * 4);
    const get = (x, yf, c) => { const y0 = Math.max(0, Math.min(H - 1, Math.floor(yf))), y1 = Math.min(H - 1, y0 + 1), t = yf - Math.floor(yf); return data[(y0 * W + x) * 4 + c] * (1 - t) + data[(y1 * W + x) * 4 + c] * t; };
    // erase the OLD ring top (now shifted down) so it does not show as a second arc inside the new ring
    for (const [a, b] of rings) for (let x = a; x <= b; x++) for (let ny = PAD; ny <= PAD + S; ny++) {
        const i = (ny * W + x) * 4; const mx = Math.max(o[i], o[i + 1], o[i + 2]), mn = Math.min(o[i], o[i + 1], o[i + 2]);
        const silver = Math.max(0, Math.min(1, (70 - (mx - mn)) / 35)) * Math.max(0, Math.min(1, (mx - 70) / 40));
        if (silver > 0) o[i + 3] = Math.round(o[i + 3] * (1 - silver));
    }
    for (const [a, b] of rings) for (let x = a; x <= b; x++) for (let ny = 0; ny <= S + PAD; ny++) {
        const ys = ny * S / (S + PAD);
        const r = get(x, ys, 0), g = get(x, ys, 1), bl = get(x, ys, 2), al = get(x, ys, 3) / 255;
        const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
        const silver = Math.max(0, Math.min(1, (70 - (mx - mn)) / 35)) * Math.max(0, Math.min(1, (mx - 70) / 40)) * al;
        if (silver <= 0) continue;
        const i = (ny * W + x) * 4, da = o[i + 3] / 255;
        const outA = silver + da * (1 - silver);
        o[i] = Math.round((r * silver + o[i] * da * (1 - silver)) / Math.max(outA, 0.001));
        o[i + 1] = Math.round((g * silver + o[i + 1] * da * (1 - silver)) / Math.max(outA, 0.001));
        o[i + 2] = Math.round((bl * silver + o[i + 2] * da * (1 - silver)) / Math.max(outA, 0.001));
        o[i + 3] = Math.round(outA * 255);
    }
    await sharp(o, { raw: { width: W, height: NH, channels: 4 } }).png().toFile(out);
    console.log('rings raised by', PAD, 'size', W + 'x' + NH);
})();
