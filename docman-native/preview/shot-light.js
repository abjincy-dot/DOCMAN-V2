// Renders the real Reminders panel in headless Edge. usage: node shot-light.js <out.png> [light|dark] [extra.css] [tab]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const out = process.argv[2], mode = process.argv[3] || 'light', extra = process.argv[4], tab = process.argv[5] || 'reminders';
const www = path.resolve(__dirname, '../www/index.html').replace(/\\/g, '/');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = path.join(process.env.TEMP, 'edge-shot-' + Date.now());
const port = 9333 + Math.floor(Math.random() * 300);
const p = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=420,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    let tabs;
    for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (tabs.length) break; } catch (e) {} await sleep(250); }
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pending = {};
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) pending[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) console.log('EXC', JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description)); return r.result && r.result.result && r.result.result.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: Number(process.env.VW) || 420, height: Number(process.env.VH) || 900, deviceScaleFactor: Number(process.env.DPR) || 2, mobile: true });
    await send('Page.enable');
    await send('Page.navigate', { url: 'file:///' + www });
    await sleep(8000);
    const today = new Date(); const iso = d => { const x = new Date(today); x.setDate(x.getDate() + d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const css = extra ? fs.readFileSync(extra, 'utf8') : '';
    await ev(`(async()=>{
      ['introOverlay','alertSetupOverlay'].forEach(i=>{const e=document.getElementById(i);if(e)e.remove();}); const killPop=()=>document.querySelectorAll('.intro-overlay,.dc-popup-overlay,#expiryCardsPopup').forEach(e=>e.remove()); killPop(); await new Promise(r=>setTimeout(r,400)); killPop();
      document.body.classList.toggle('light-mode', ${mode === 'light'});
      ${css ? 'const s=document.createElement("style");s.textContent=' + JSON.stringify(css) + ';document.head.appendChild(s);' : ''}
      reminders.length=0;
      reminders.push(
        {id:'a',title:'Jj',dueAt:'${iso(-2)}',dueTime:'09:00',repeat:'none'},
        {id:'b',title:'Je',dueAt:'${iso(-2)}',dueTime:'09:00',repeat:'none'},
        {id:'c',title:'Kd',dueAt:'${iso(0)}',dueTime:'23:00',repeat:'none'},
        {id:'d',title:'Pay rent',dueAt:'${iso(5)}',dueTime:'10:00',repeat:'none'});
      ${process.argv[6] || ("showExpiringDocumentsPanel('" + tab + "');")}
    })()`);
    await sleep(process.argv[7] ? Number(process.argv[7]) : 1800);
    if (!process.argv[6]) await ev(`document.querySelectorAll('.dc-popup-overlay,#expiryCardsPopup').forEach(e=>e.remove())`);
    await sleep(600);
    console.log('TITLE', await ev('document.title'));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    ws.close(); p.kill();
    setTimeout(() => process.exit(0), 300);
})();
