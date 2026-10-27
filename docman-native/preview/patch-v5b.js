const fs = require('fs');
let s = fs.readFileSync('make-tray-v5.js', 'utf8');
const a = s.indexOf('    const T = [[], [], []], L = [[], [], []], Rt = [[], [], []];');
const b = s.indexOf("    console.log('text found', JSON.stringify(info2));");
if (a < 0 || b < 0) throw new Error('markers');
const fill = `    // a smooth surface (degree 4 in x, 2 in y, with cross terms) fitted to the calendar face AROUND the text: the face goes from dark (left) to orange (right)
    // and darkens toward the bottom-left, which a single row or a rectangle patch cannot follow. Excluded from the fit: the text area and its glow, the ring
    // eyelets, the bright rim near the edge, the folders, anything see-through.
    const basis = (x, y) => { const X = (x - 625) / 450, Y = (y - 430) / 250; return [1, X, X * X, X * X * X, X * X * X * X, Y, X * Y, X * X * Y, X * X * X * Y, Y * Y, X * Y * Y, X * X * Y * Y]; };
    const NB = 12;
    const eyelets = [[370, 212], [878, 212]];
    const useForFit = (x, y) => {
        if (data[(y * W + x) * 4 + 3] < 250) return false;
        if (x >= R.x0 - 12 && x < R.x1 + 12 && y >= R.y0 - 8 && y < 615) return false;
        for (const [ex, ey] of eyelets) if ((x - ex) * (x - ex) + (y - ey) * (y - ey) < 75 * 75) return false;
        if (isFolder(x, y)) return false;
        for (let d = 1; d <= 22; d += 7) if (data[(y * W + x - d) * 4 + 3] < 250 || data[(y * W + x + d) * 4 + 3] < 250) return false;
        return true;
    };
    const fitC = [];
    for (let c = 0; c < 3; c++) {
        const M = Array.from({ length: NB }, () => new Float64Array(NB)); const v = new Float64Array(NB);
        for (let y = 215; y < 660; y += 2) for (let x = 170; x < 1085; x += 2) {
            if (!useForFit(x, y)) continue;
            const f = basis(x, y), t = px(x, y, c);
            for (let i = 0; i < NB; i++) { v[i] += f[i] * t; for (let j = 0; j < NB; j++) M[i][j] += f[i] * f[j]; }
        }
        for (let i = 0; i < NB; i++) { let p = i; for (let r = i + 1; r < NB; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [v[i], v[p]] = [v[p], v[i]];
            for (let r = i + 1; r < NB; r++) { const k = M[r][i] / M[i][i]; for (let j = i; j < NB; j++) M[r][j] -= k * M[i][j]; v[r] -= k * v[i]; } }
        const k = new Float64Array(NB); for (let i = NB - 1; i >= 0; i--) { let sum = v[i]; for (let j = i + 1; j < NB; j++) sum -= M[i][j] * k[j]; k[i] = sum / M[i][i]; }
        fitC[c] = k;
    }
    const FE = 18;
    for (let x = R.x0 - FE; x < R.x1 + FE; x++) for (let y = R.y0 - 6; y < bot[Math.max(R.x0, Math.min(R.x1 - 1, x))]; y++) {
        const f = basis(x, y);
        const inside = Math.min(x - (R.x0 - FE), (R.x1 + FE - 1) - x, y - (R.y0 - 6));
        const wgt = Math.max(0, Math.min(1, inside / FE));
        for (let c = 0; c < 3; c++) {
            let val = 0; for (let i = 0; i < NB; i++) val += fitC[c][i] * f[i];
            const i4 = (y * W + x) * 4 + c;
            data[i4] = Math.max(0, Math.min(255, wgt * val + (1 - wgt) * data[i4]));
        }
    }
`;
s = s.slice(0, a) + fill + s.slice(b);
fs.writeFileSync('make-tray-v5.js', s); console.log('patched');
