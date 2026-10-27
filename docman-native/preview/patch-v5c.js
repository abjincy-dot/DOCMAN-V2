const fs = require('fs');
let s = fs.readFileSync('make-tray-v5.js', 'utf8');
const a = s.indexOf('    // 2) keep only the largest shape');
if (a < 0) throw new Error('marker');
const pass2 = `    // 1b) second pass: dim leftovers of the backdrop's own glow (a brown smudge top-right, an orange haze on the left) that are connected to the outside are
    //     removed too; the calendar's bright rim (and everything inside it) stops the fill.
    {
        const DIM = Number(process.env.DIM || 150);
        const out2 = new Uint8Array(W * H); let sp2 = 0;
        const dimPx = (i) => data[i * 4 + 3] > 0 && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) * (data[i * 4 + 3] / 255) < DIM;
        const push = (i) => { if (!out2[i] && (data[i * 4 + 3] === 0 || dimPx(i))) { out2[i] = 1; stack[sp2++] = i; } };
        for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
        while (sp2) { const i = stack[--sp2], x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
        let removed = 0;
        for (let i = 0; i < W * H; i++) if (out2[i] && data[i * 4 + 3] > 0) { data[i * 4 + 3] = 0; removed++; }
        console.log('second pass removed', removed);
    }

`;
s = s.slice(0, a) + pass2 + s.slice(a);
fs.writeFileSync('make-tray-v5.js', s); console.log('patched');
