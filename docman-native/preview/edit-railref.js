const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const a = `data-ract="open"><span>' + DOC_CARD_ICONS.view + '</span>Open</button>`;
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, () => `data-ract="open"><span>' + DOC_CARD_ICONS.view + '</span>View</button>`);
fs.writeFileSync(f, s); console.log('label edited');
