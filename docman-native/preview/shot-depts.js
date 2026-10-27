// Prints the logo box in the real app (headless Edge) and screenshots the header corner.
// usage: node measure-logo.js <out.png> [extra.css]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const out = process.argv[2], extra = process.argv[3];
const www = path.resolve(__dirname, '../www/index.html').replace(/\\/g, '/');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = path.join(process.env.TEMP, 'edge-logo-' + Date.now());
const port = 9700 + Math.floor(Math.random() * 200);
const p = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=420,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    let tabs;
    for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (tabs.length) break; } catch (e) {} await sleep(250); }
    const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {};
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
    await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 900, deviceScaleFactor: 2, mobile: true });
    await send('Page.enable');
    await send('Page.navigate', { url: 'file:///' + www });
    await sleep(8000);
    const css = extra ? fs.readFileSync(extra, 'utf8') : '';
    await ev(`(()=>{
      document.querySelectorAll('.intro-overlay,.dc-popup-overlay,#expiryCardsPopup').forEach(e=>e.remove());
      ${css ? 'const s=document.createElement("style");s.textContent=' + JSON.stringify(css) + ';document.head.appendChild(s);' : ''}
      const st=document.createElement('style');st.textContent='.logo .logo-tray-icon, .logo .logo-tray-icon *, .logo .logo-tray-icon::after{animation:none !important;translate:none !important}';document.head.appendChild(st);
    })()`);
    await sleep(500);
    const info = await ev(`(()=>{const l=document.querySelector('.logo-tray-icon');const r=l.getBoundingClientRect();const cs=getComputedStyle(l);const lg=document.querySelector('.logo').getBoundingClientRect();return JSON.stringify({box:[r.x,r.y,r.width,r.height],transform:cs.transform,logo:[lg.x,lg.y,lg.width,lg.height],dpr:devicePixelRatio,vw:innerWidth})})()`);
    console.log(info);
    const clip = [0, 0, 330, 700];
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 150, width: 412, height: 520, scale: 1 } });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    ws.close(); p.kill();
    setTimeout(() => process.exit(0), 300);
})();
