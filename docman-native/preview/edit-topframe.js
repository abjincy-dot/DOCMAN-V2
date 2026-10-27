const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const a = `            <div class="xc-head"><div class="xc-ico"><i class="fas \${iconHtml}"></i></div><div class="xc-ht"><div class="xc-title">\${titleHtml}</div><div class="xc-sub">\${escapeHtml(subtitleText)}</div></div>`;
const i = s.indexOf(a);
if (i < 0 || s.indexOf(a, i + 1) >= 0) throw new Error('head anchor');
// from the head to the end of statsHtml: wrap in .xc-top
const b = "            ${tabRowHtml}\n            ${statsHtml}\n            ${bulkHtml}\n";
const j = s.indexOf(b, i);
if (j < 0 || j - i > 2500) throw new Error('tab/stats anchor');
s = s.slice(0, i) + '            <div class="xc-top">\n' + s.slice(i, j) + "            ${tabRowHtml}\n            ${statsHtml}\n            </div>\n            ${bulkHtml}\n" + s.slice(j + b.length);
fs.writeFileSync(f, s);
console.log('wrapped');
