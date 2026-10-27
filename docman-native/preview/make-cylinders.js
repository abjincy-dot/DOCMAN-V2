// Writes two "more colour spread" versions of the Storage cylinder icon: storage-cylinder-A.svg and storage-cylinder-B.svg
const fs = require('fs');
const path = require('path');

const shape = (fillTop, fillMid, fillBot, capTop, capMid, capBot, extra) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" width="100%" height="100%" aria-hidden="true">
${extra.defs}
<path d="M10 70 V88 C10 97 28 103 50 103 C72 103 90 97 90 88 V70 Z" fill="${fillBot}"/>
<ellipse cx="50" cy="70" rx="40" ry="13" fill="${capBot}"/>
<path d="M14 72 C24 80 76 80 86 72" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1.6" stroke-linecap="round"/>
<path d="M10 46 V64 C10 73 28 79 50 79 C72 79 90 73 90 64 V46 Z" fill="${fillMid}"/>
<ellipse cx="50" cy="46" rx="40" ry="13" fill="${capMid}"/>
<path d="M14 48 C24 56 76 56 86 48" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.6" stroke-linecap="round"/>
<path d="M10 22 V40 C10 49 28 55 50 55 C72 55 90 49 90 40 V22 Z" fill="${fillTop}"/>
<ellipse cx="50" cy="22" rx="40" ry="13" fill="${capTop}"/>
<path d="M16 20 C28 12 50 9 62 11" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const lin = (id, a, b, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
const cap = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

// A: every layer carries its own colour: amber/pink/magenta, lilac/violet, cyan/blue/indigo.
const A = shape('url(#a1)', 'url(#a2)', 'url(#a3)', 'url(#c1)', 'url(#c2)', 'url(#c3)', {
    defs: '<defs>' + lin('a1', '#ffb347', '#ff5a7a', '#c23a9e') + lin('a2', '#efe0ff', '#b48cf5', '#7b55d6') + lin('a3', '#4fd8ff', '#2f6bf0', '#5a2bd0')
        + cap('c1', '#ffd98a', '#ff7a90') + cap('c2', '#f7ecff', '#cdb2ff') + cap('c3', '#9fe6ff', '#6a9bff') + '</defs>'
});

// B: ONE spectrum sweeps down the whole stack, orange > pink > violet > blue > cyan.
const sweep = '<linearGradient id="sw" gradientUnits="userSpaceOnUse" x1="8" y1="10" x2="92" y2="104"><stop offset="0" stop-color="#ffb347"/><stop offset="0.25" stop-color="#ff5a7a"/><stop offset="0.5" stop-color="#b45be8"/><stop offset="0.75" stop-color="#4f7bff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>'
    + '<linearGradient id="swl" gradientUnits="userSpaceOnUse" x1="8" y1="10" x2="92" y2="104"><stop offset="0" stop-color="#ffd98a"/><stop offset="0.25" stop-color="#ff9aae"/><stop offset="0.5" stop-color="#d9a8ff"/><stop offset="0.75" stop-color="#9ab4ff"/><stop offset="1" stop-color="#8ff0ff"/></linearGradient>';
const B = shape('url(#sw)', 'url(#sw)', 'url(#sw)', 'url(#swl)', 'url(#swl)', 'url(#swl)', { defs: '<defs>' + sweep + '</defs>' });

fs.writeFileSync(path.join(__dirname, 'storage-cylinder-A.svg'), A);
fs.writeFileSync(path.join(__dirname, 'storage-cylinder-B.svg'), B);
console.log('ok');
