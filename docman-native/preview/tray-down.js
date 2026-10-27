// Tray (drawer + folders) of the calendar picture: (1) moved DOWN by D px so it hangs further below the calendar; the gap above the folders is filled by
// stretching the plain plate band just above them; the shift fades out over FEATHER px at the tray's sides. (2) its bright, thick orange rims are dimmed and
// (3) a HAIR-thin orange line is drawn along its outer edge, like the calendar's left side. Works on the full-size picture (841 wide).
// usage: node tray-down.js in.png out.png   env: OFFY = rows added on top by rings-up (default 0), D (default 42), HAIR (default 7)
const sharp = require('../node_modules/sharp');
const [src, out] = process.argv.slice(2);
(async () => {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const OFFY = Number(process.env.OFFY || 0), D = Number(process.env.D || 42), HAIR = Number(process.env.HAIR || 7), FEATHER = 40;
    const X0 = 95, X1 = 785, Y0 = 468 + OFFY, BAND = 70;      // tray columns; first row above the folders; plate band stretched into the gap
    const NH = H + D;
    const o = Buffer.alloc(W * NH * 4);
    const get = (x, yf, c) => { const y0 = Math.max(0, Math.min(H - 1, Math.floor(yf))), y1 = Math.min(H - 1, y0 + 1), t = yf - Math.floor(yf); return data[(y0 * W + x) * 4 + c] * (1 - t) + data[(y1 * W + x) * 4 + c] * t; };
    for (let x = 0; x < W; x++) {
        const s = x < X0 - FEATHER || x > X1 + FEATHER ? 0 : x < X0 ? (x - (X0 - FEATHER)) / FEATHER : x > X1 ? ((X1 + FEATHER) - x) / FEATHER : 1;
        const d = D * s;
        for (let ny = 0; ny < NH; ny++) {
            let ys;
            if (ny < Y0 - BAND) ys = ny;
            else if (ny < Y0 + d) ys = (Y0 - BAND) + (ny - (Y0 - BAND)) * BAND / (BAND + d);   // stretched plate band
            else ys = ny - d;
            for (let c = 0; c < 4; c++) o[(ny * W + x) * 4 + c] = ys >= H ? 0 : Math.round(get(x, ys, c));
        }
    }
    // (2) + (3) on the shifted tray
    const T = { x0: X0 - 10, x1: X1 + 10, y0: 640 + OFFY + D, y1: NH - 1 };                    // drawer zone (below the folders' faces)
    const handle = { x0: 425, x1: 690, y0: 790 + OFFY + D, y1: 925 + OFFY + D };               // keep the handle and its dot as they are
    const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= NH) ? 0 : o[(y * W + x) * 4 + 3];
    const lum = (x, y) => { const i = (y * W + x) * 4; return 0.3 * o[i] + 0.59 * o[i + 1] + 0.11 * o[i + 2]; };
    const nearOut = (x, y, r) => { for (let d2 = 1; d2 <= r; d2++) if (A(x, y + d2) < 30 || A(x - d2, y) < 30 || A(x + d2, y) < 30) return true; return false; };
    const nearBlack = (x, y, r) => { for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < NH && A(xx, yy) > 200 && lum(xx, yy) < 40) return true; } return false; };
    const src2 = Buffer.from(o);
    let dim = 0, hair = 0;
    for (let y = T.y0; y <= T.y1; y++) for (let x = T.x0; x <= T.x1; x++) {
        if (x >= handle.x0 && x <= handle.x1 && y >= handle.y0 && y <= handle.y1) continue;
        const i = (y * W + x) * 4; if (src2[i + 3] < 30) continue;
        const r = src2[i], g = src2[i + 1], b = src2[i + 2];
        const warm = r > 150 && g > 70 && r > b * 2;
        if (!warm) continue;
        if (nearOut(x, y, HAIR)) { o[i] = 255; o[i + 1] = 140; o[i + 2] = 30; o[i + 3] = 255; hair++; continue; }   // outer hair line
        if (nearBlack(x, y, 14)) { const k = 0.28; o[i] = Math.round(20 + (r - 20) * k); o[i + 1] = Math.round(20 + (g - 20) * k); o[i + 2] = Math.round(26 + (b - 26) * k); dim++; }
    }
    // glow just outside the tray's lower edge
    for (let y = T.y0; y < NH; y++) for (let x = T.x0; x <= T.x1; x++) { const i = (y * W + x) * 4; if (o[i + 3] > 0 && o[i + 3] < 90) o[i + 3] = 0; }
    await sharp(o, { raw: { width: W, height: NH, channels: 4 } }).png().toFile(out);
    console.log('tray down', D, 'dimmed', dim, 'hair', hair, 'size', W + 'x' + NH);
})();
