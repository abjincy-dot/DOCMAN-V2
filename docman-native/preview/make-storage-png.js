// Cuts the user's cylinder picture out of its solid dark background -> transparent PNG for www/Images/storage-cylinder.png
const sharp = require('../node_modules/sharp');
const src = process.argv[2];
const out = process.argv[3];
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    // background colour = average of the four corner patches
    let br = 0, bg = 0, bb = 0, n = 0;
    for (const [cx, cy] of [[0, 0], [w - 40, 0], [0, h - 40], [w - 40, h - 40]]) {
        for (let y = cy; y < cy + 40; y++) for (let x = cx; x < cx + 40; x++) { const i = (y * w + x) * 4; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n++; }
    }
    br /= n; bg /= n; bb /= n;
    console.log('background', Math.round(br), Math.round(bg), Math.round(bb), w + 'x' + h);
    const buf = Buffer.alloc(w * h * 4);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            // distance from the background; fully opaque once clearly different
            const d = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
            let a = Math.max(0, Math.min(1, (d - 6) / 34));
            if (a <= 0) { buf[i + 3] = 0; continue; }
            // un-mix the background out of the edge pixels so no dark fringe remains
            let nr = r, ng = g, nb = b;
            if (a < 1) { nr = (r - br * (1 - a)) / a; ng = (g - bg * (1 - a)) / a; nb = (b - bb * (1 - a)) / a; }
            buf[i] = Math.max(0, Math.min(255, nr)); buf[i + 1] = Math.max(0, Math.min(255, ng)); buf[i + 2] = Math.max(0, Math.min(255, nb));
            buf[i + 3] = Math.round(a * 255);
            if (a > 0.3) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
    }
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    console.log('crop', minX, minY, cw, ch);
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
        .extract({ left: minX, top: minY, width: cw, height: ch })
        .resize({ height: 200, kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toFile(out);
    const meta = await sharp(out).metadata();
    console.log('written', out, meta.width + 'x' + meta.height);
})();
