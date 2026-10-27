// Cuts the documents out of the user's reference splash picture (856 x 1836) into separate WebP tiles for the floating background,
// writes the markup (splash-docs-real.html) and the CSS (splash-docs-real.css). Each tile's position on screen = its position in the reference,
// so the layout matches the reference; the soft feathered edge comes from a CSS radial mask.
const sharp = require('../node_modules/sharp');
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
const outDir = path.join(__dirname, '../www/Images/splash');
fs.mkdirSync(outDir, { recursive: true });
const W = 856, H = 1836;
// name, left, top, width, height (in reference pixels), rotation drift, move x / y (px), duration (s)
const tiles = [
    ['drawing-top', 0, 0, 445, 420, 3, 14, 10, 3.2],
    ['pdf-top', 405, 0, 220, 250, -4, -10, 14, 2.8],
    ['passport', 585, 155, 271, 375, 4, -12, -10, 3.4],
    ['photo-icon', 455, 315, 200, 190, -3, 10, 12, 3.0],
    ['folder', 0, 400, 305, 300, -3, 14, -10, 3.3],
    ['notebook', 640, 535, 216, 370, 3, -12, 12, 3.1],
    ['word', 0, 705, 195, 250, -4, 12, 10, 2.9],
    ['pdf-acrobat', 0, 1015, 175, 230, 3, 12, -12, 3.2],
    ['pump-photos', 0, 1185, 345, 330, -3, 14, 10, 3.5],
    ['signed-page', 655, 990, 201, 380, 4, -12, 12, 3.0],
    ['excel', 585, 1355, 271, 380, -3, -12, -12, 3.3],
    ['drawing-bottom', 0, 1355, 700, 481, 2, 10, -12, 3.6]
];
(async () => {
    let html = '<div class="splash-docs splash-docs-real" aria-hidden="true">\n';
    let css = '';
    let bytes = 0;
    for (const [name, l, t, w, h, rot, mx, my, dur] of tiles) {
        const file = path.join(outDir, name + '.webp');
        await sharp(src).extract({ left: l, top: t, width: w, height: h }).webp({ quality: 72 }).toFile(file);
        bytes += fs.statSync(file).size;
        html += `  <img class="sdr sdr-${name}" src="Images/splash/${name}.webp" alt="">\n`;
        css += `.splash-docs-real .sdr-${name} { left: ${(l / W * 100).toFixed(2)}%; top: ${(t / H * 100).toFixed(2)}%; width: ${(w / W * 100).toFixed(2)}%; ` +
            `--rr: ${rot}deg; --mx: ${mx}px; --my: ${my}px; --d: ${dur}s; }\n`;
    }
    html += '</div>\n';
    fs.writeFileSync(path.join(__dirname, 'splash-docs-real.html'), html);
    fs.writeFileSync(path.join(__dirname, 'splash-docs-real.tiles.css'), css);
    console.log('tiles', tiles.length, 'total', Math.round(bytes / 1024) + ' KB');
})();
