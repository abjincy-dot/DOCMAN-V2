const fs = require("fs");
const app = fs.readFileSync("../www/app.js", "latin1");
const bell = /const XC_BELL = '(<svg[\s\S]*?<\/svg>)';/.exec(app)[1];
const eye = '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const pen = '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>';
const trash = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
const cal = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
const btn = (i, l) => `<button class="xc-act"><span>${i}</span>${l}</button>`;
const card = (n, t, i) => `<div class="dc-stk" style="--i:${i}"><div class="xc-card xc-rem${i === 0 ? " xc-active" : ""}"><div class="xc-rail">${btn(eye, "Open")}${btn(pen, "Edit")}${btn(trash, "Delete")}</div><div class="xc-body"><div class="xc-bell">${bell}</div><div class="xc-mid"><div class="dc-name">${n}</div><div class="dc-where">${t}</div><div class="dc-exp dc-red">${cal}<span>Overdue</span></div><div class="dc-bar dc-red"><b style="width:100%"></b></div><div class="xc-foot"><span class="xc-left">Overdue</span></div></div></div></div></div>`;
const col = (label, cardH, note) => `<div class="col"><p class="lab">${label}</p><div class="pnl"><div id="expiringDocsList" class="xc-has-rail" style="--xc-card-h:${cardH}px"><div class="xc-shared-rail" style="height:${cardH}px;padding:${cardH < 140 ? 5 : 9}px 0">${btn(eye, "Open")}${btn(pen, "Edit")}${btn(trash, "Delete")}</div><div class="xc-cards">${card("T", "Due Yesterday, 22:21", 0)}${card("Ee", "Due Yesterday, 22:24", 1)}${card("Rr", "Due Yesterday, 22:29", 2)}</div></div></div><p class="note">${note}</p></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../www/style.css?v=753"><style>
body{margin:0!important;background:#0b0b10!important;color:#bbb;font:12px Inter,Arial;display:flex;gap:26px;padding:20px}
.col{width:400px}.lab{margin:0 0 8px;font-weight:700;color:#fff;font-size:13px}.note{margin:8px 0 0;font-size:11px;color:#999}
.pnl{background:linear-gradient(160deg,#25252d,#15151b);border:1.5px solid #d4631a;border-radius:20px;padding:14px 12px;height:520px;overflow:hidden}
#expiringDocsList{overflow:visible}
.xc-card{margin-bottom:5px}
.dc-stk{position:static!important}
.col:nth-child(1) .xc-card{min-height:0;height:131px}
.col:nth-child(1) .xc-shared-rail{padding:6px 0;justify-content:space-evenly}
.col:nth-child(1) .xc-shared-rail .xc-act span{width:34px;height:34px}
.col:nth-child(1) .xc-shared-rail .xc-act{font-size:0}
.col:nth-child(2) .xc-card{min-height:0;height:176px}
.col:nth-child(2) .xc-shared-rail .xc-act span{width:32px;height:32px}
.col:nth-child(3) .xc-card{min-height:0;height:150px}
.col:nth-child(3) .xc-shared-rail{padding:5px 0;gap:2px;justify-content:space-evenly}
.col:nth-child(3) .xc-shared-rail .xc-act span{width:28px;height:28px}
.col:nth-child(3) .xc-shared-rail .xc-act{font-size:.5rem;gap:1px}
.col:nth-child(3) .xc-shared-rail .xc-act svg{width:14px;height:14px}
</style></head><body>
${col("Option 1: icons only (no labels), short cards 131 px", 131, "Same height bar and cards. Buttons stay round and a bit bigger, but there is no text under them.")}
${col("Option 2: labels kept, cards 176 px (the original size)", 176, "Needs tall cards: fewer cards on screen.")}
${col("Option 3: small labels, cards 150 px", 150, "Round 28 px buttons with tiny labels. Middle ground.")}
</body></html>`;
fs.writeFileSync("bar-options.html", html);
console.log("written");
