// Standalone page with the app's own splash markup and styles (index.html head <style> + style.css).
// usage: node make-splash-page.js now|svg|real [opacity]
//   now  = current splash with no floating documents; svg = the drawn SVG documents; real = documents cut from the user's reference picture
const fs = require('fs');
const mode = process.argv[2] || 'now';
const op = process.argv[3];
const idx = fs.readFileSync(__dirname + '/../www/index.html', 'utf8');
const headStyles = (idx.match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
const a = idx.indexOf('<div id="splashScreen">');
let depth = 0, end = -1;
const re = /<div\b|<\/div>/g; re.lastIndex = a;
let m; while ((m = re.exec(idx))) { if (m[0] === '</div>') { depth--; if (depth === 0) { end = m.index + 6; break; } } else depth++; }
let splash = idx.slice(a, end);
// drop any floating-documents layer already in index.html, then add the one asked for
splash = splash.replace(/<div class="splash-docs[^"]*"[^>]*>[\s\S]*?<\/div>\s*/, '');
let link = '';
if (mode === 'svg') { splash = splash.replace('<div id="splashScreen">', '<div id="splashScreen">' + fs.readFileSync(__dirname + '/splash-docs.html', 'utf8')); link = '<link rel="stylesheet" href="splash-docs.css">'; }
if (mode === 'real') { splash = splash.replace('<div id="splashScreen">', '<div id="splashScreen">' + fs.readFileSync(__dirname + '/splash-docs-real.html', 'utf8')); link = '<link rel="stylesheet" href="splash-docs-real.css">'; }
if (op) link += '<style>.splash-docs-real{--sd-op:' + op + '}</style>';
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../www/style.css">${headStyles}${link}
<style>.splash-icon-wrapper{opacity:1!important;transform:none!important}.splash-title span,.splash-sub,.splash-loader{opacity:1!important;transform:none!important;filter:none!important}</style></head><body>${splash.replace(/src="Images\//g, 'src="../www/Images/')}</body></html>`;
const out = __dirname + '/splash-page-' + mode + (op ? '-' + op : '') + '.html';
fs.writeFileSync(out, html);
console.log('written', out.split(/[\\/]/).pop());
