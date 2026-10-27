// Takes ONLY the tray (navy drawer with gold base + its folders) from the user's red-calendar picture and lays it in front of our dark-orange calendar
// (full-size, rings raised: __w2.png, 841 x 1048), lower so it hangs below the calendar. The cut is a polygon along the tray's outline (folder tops included),
// feathered 1 px. Output: the composed full-size picture.
// usage: node tray-swap.js tray-source.png calendar-big.png out.png   env: LEFT (default 30), WIDTH (default 780), BOTTOM (default 1135)
const sharp = require('../node_modules/sharp');
const [srcTray, srcCal, out] = process.argv.slice(2);
(async () => {
    const OX = 150, OY = 480;   // the polygon below is in the grid picture's coordinates (source minus this offset)
    const poly = [
        [38, 330], [45, 292], [108, 282], [108, 170], [118, 152], [530, 42], [546, 50], [552, 62], [552, 99], [670, 64], [682, 70], [686, 88],
        [745, 92], [752, 100], [752, 136], [775, 138], [784, 148], [785, 166], [858, 167], [870, 178], [872, 290], [930, 296], [955, 312], [959, 335],
        [959, 538], [950, 560], [420, 742], [398, 742], [60, 556], [38, 522]
    ].map(([x, y]) => [x + OX, y + OY]);
    const meta = await sharp(srcTray).metadata();
    const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><polygon points="${poly.map(p => p.join(',')).join(' ')}" fill="#fff"/></svg>`;
    const mask = await sharp(Buffer.from(svg)).blur(0.8).extractChannel(0).raw().toBuffer();
    const { data, info } = await sharp(srcTray).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0, p = 0; p < mask.length; i += 4, p++) data[i + 3] = Math.round(data[i + 3] * mask[p] / 255);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const bx0 = Math.min(...xs) - 2, by0 = Math.min(...ys) - 2, bw = Math.max(...xs) - bx0 + 4, bh = Math.max(...ys) - by0 + 4;
    const LEFT = Number(process.env.LEFT || 30), WIDTH = Number(process.env.WIDTH || 780), BOTTOM = Number(process.env.BOTTOM || 1135);
    const k = WIDTH / bw, th = Math.round(bh * k);
    const tray = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .extract({ left: bx0, top: by0, width: bw, height: bh }).resize({ width: WIDTH, height: th, kernel: 'lanczos3' }).png().toBuffer();
    const cm = await sharp(srcCal).metadata();
    const NH = Math.max(cm.height, BOTTOM + 4);
    const canvas = await sharp(srcCal).extend({ bottom: NH - cm.height, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(canvas).composite([{ input: tray, left: LEFT, top: BOTTOM - th }]).png().toFile(out);
    console.log('tray', WIDTH + 'x' + th, 'at', LEFT, BOTTOM - th, 'canvas', cm.width + 'x' + NH);
})();
