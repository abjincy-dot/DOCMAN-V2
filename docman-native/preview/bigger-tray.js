// Enlarge the tray (with its files) on the calendar picture, leaving the calendar as it is.
// usage: node bigger-tray.js <scratchpad dir> <scale> <out name>
// input: <dir>/full-trans.png (1254x1254, transparent background, glow already removed)
const sharp = require("sharp");
const S = process.argv[2], SC = +process.argv[3] || 1.2, OUT = process.argv[4] || "tray-big.png";
const AX = 655, AY = 700, STROKE = 4;
const pts = [[398,770],[716,668],[724,690],[777,706],[780,722],[838,727],[842,746],[868,760],[872,774],[934,768],[938,880],[994,882],[995,1086],[850,1148],[660,1212],[620,1214],[500,1170],[322,1062],[316,874],[398,874]];
(async () => {
  const { data, info } = await sharp(S + "/full-trans.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = 4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${pts.map(p => p.join(",")).join(" ")}" fill="#fff" stroke="#fff" stroke-width="${STROKE}" stroke-linejoin="round"/></svg>`;
  const mk = await sharp({ create: { width: W, height: H, channels: 3, background: "#000" } }).composite([{ input: Buffer.from(svg) }]).greyscale().raw().toBuffer();
  const M = new Float32Array(W * H); for (let i = 0; i < W * H; i++) M[i] = mk[i] / 255;
  const TR = new Float32Array(W * H); for (let i = 0; i < W * H; i++) TR[i] = M[i];
  // near the traced outline, glass-coloured (peach / pink) pixels are card, not tray: drop them until the first real tray pixel
  const glassLike = i => { const r = data[i * 4], b = data[i * 4 + 2]; return b >= 110 && r >= 225 && r > b + 8; };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) { const i = y * W + x; if (M[i] < 0.03) continue; if (glassLike(i)) TR[i] = 0; else break; } }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) { const i = y * W + x; if (M[i] < 0.03) continue; if (glassLike(i)) TR[i] = 0; else break; }
    for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (M[i] < 0.03) continue; if (glassLike(i)) TR[i] = 0; else break; }
  }
  const inM = (x, y) => y >= 0 && y < H && x >= 0 && x < W && M[y * W + x] >= 0.03;
  const NH = Math.ceil(AY + (1220 - AY) * SC) + 8;
  // tray layer (premultiplied), scaled about (AX, AY), sampled bilinearly
  const tr = new Float32Array(W * NH * 4);
  const samp = (sx, sy) => {
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0; let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const x = x0 + dx, y = y0 + dy; if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x, al = TR[i] * data[i * 4 + 3] / 255; r += data[i * 4] * al * w; g += data[i * 4 + 1] * al * w; b += data[i * 4 + 2] * al * w; a += al * w;
    }
    return [r, g, b, a];
  };
  for (let y = 0; y < NH; y++) for (let x = 0; x < W; x++) {
    const sx = (x - AX) / SC + AX, sy = (y - AY) / SC + AY; if (sx < -1 || sx > W || sy < -1 || sy > H) continue;
    const p = samp(sx, sy); if (p[3] <= 0) continue; const k = (y * W + x) * 4; tr[k] = p[0]; tr[k + 1] = p[1]; tr[k + 2] = p[2]; tr[k + 3] = p[3];
  }
  // calendar layer = the original picture on a taller canvas
  const out = Buffer.alloc(W * NH * C);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * C; for (let c = 0; c < 4; c++) out[i + c] = data[i + c]; }
  const CARD_BOTTOM = 1030;
  // where the old tray stood and the bigger one does not: card above its bottom edge (filled in smoothly), nothing below it
  const vac = new Uint8Array(W * H), idx = [], clear = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inM(x, y) && tr[(y * W + x) * 4 + 3] < 0.995) {
    if (y < CARD_BOTTOM - 6) { vac[y * W + x] = 1; idx.push(y * W + x); } else clear.push(y * W + x);
  }
  for (const i of idx.slice()) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < W && yy >= 0 && yy < H && !vac[yy * W + xx] && inM(xx, yy) && yy < CARD_BOTTOM - 6) { vac[yy * W + xx] = 1; idx.push(yy * W + xx); } } }
  const f = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) { f[i * 3] = data[i * 4]; f[i * 3 + 1] = data[i * 4 + 1]; f[i * 3 + 2] = data[i * 4 + 2]; }
  for (let x = 0; x < W; x++) { let last = null; for (let y = 0; y < H; y++) { const k = y * W + x; if (!inM(x, y)) { last = [f[k * 3], f[k * 3 + 1], f[k * 3 + 2]]; } else if (vac[k] && last) { f[k * 3] = last[0]; f[k * 3 + 1] = last[1]; f[k * 3 + 2] = last[2]; } } }
  for (let it = 0; it < 500; it++) {
    for (const i of idx) {
      const x = i % W, y = (i / W) | 0; let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue; const j = yy * W + xx; if (vac[j] || !inM(xx, yy)) { r += f[j * 3]; g += f[j * 3 + 1]; b += f[j * 3 + 2]; n++; } }
      if (n) { f[i * 3] = r / n; f[i * 3 + 1] = g / n; f[i * 3 + 2] = b / n; }
    }
  }
  for (const i of idx) { out[i * 4] = Math.round(f[i * 3]); out[i * 4 + 1] = Math.round(f[i * 3 + 1]); out[i * 4 + 2] = Math.round(f[i * 3 + 2]); out[i * 4 + 3] = 255; }
  for (const i of clear) out[i * 4 + 3] = 0;
  // the bigger tray on top
  for (let y = 0; y < NH; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, sa = tr[k + 3]; if (sa <= 0) continue; const j = (y * W + x) * C, da = out[j + 3] / 255, oa = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) out[j + c] = Math.round((tr[k + c] + out[j + c] * da * (1 - sa)) / oa); out[j + 3] = Math.round(oa * 255);
  }
  await sharp(out, { raw: { width: W, height: NH, channels: 4 } }).png().toFile(S + "/" + OUT);
  console.log("ok", W, NH);
})();
