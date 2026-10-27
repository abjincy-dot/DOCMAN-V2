// Measures / styles the REAL app on the phone over the devtools bridge (layout only: no personal data is read).
// usage: node phone-devtools.js <port> [css-file]   (adb forward must already point <port> at the webview socket)
const fs = require('fs');
const port = process.argv[2];
const cssFile = process.argv[3];
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const page = list.find(t => t.type === 'page' && /localhost|docman/i.test(t.url + t.title)) || list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {};
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const ev = (expression) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })); }).then(d => d.result && d.result.result && d.result.result.value);
    if (cssFile) {
        const css = fs.readFileSync(cssFile, 'utf8');
        await ev(`(()=>{let s=document.getElementById('__tmpcss'); if(!s){s=document.createElement('style');s.id='__tmpcss';document.head.appendChild(s);} s.textContent=${JSON.stringify(css)};})()`);
    }
    const out = await ev(`(()=>{const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left*10)/10,Math.round(b.right*10)/10,Math.round(b.width*10)/10,Math.round(b.top*10)/10,Math.round(b.height*10)/10];};
      return JSON.stringify({vw:innerWidth, panel:r(document.querySelector('.xc-panel')), ico:r(document.querySelector('.xc-ico')), title:r(document.querySelector('.xc-title')), pill:r(document.getElementById('expdocSyncCal')), close:r(document.getElementById('expiringDocsCloseX')), fontScale:getComputedStyle(document.documentElement).fontSize})})()`);
    console.log(out);
    ws.close();
    process.exit(0);
})();
