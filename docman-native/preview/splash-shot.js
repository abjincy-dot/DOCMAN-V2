// Screenshot the START-UP screen of the real app (headless Edge, 384 px phone width). usage: node splash-shot.js out.png [extra.css] [docs.html]
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const out = process.argv[2], extra = process.argv[3], docs = process.argv[4];
const www = path.resolve(__dirname, '../www/index.html').split(path.sep).join('/');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = path.join(process.env.TEMP, 'edge-splash-' + Date.now()); const port = 9500 + Math.floor(Math.random() * 300);
const p = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=420,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (tabs.length) break; } catch (e) {} await sleep(250); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result;
  await send('Emulation.setDeviceMetricsOverride', { width: 384, height: 823, deviceScaleFactor: 2.6667, mobile: true });
  const css0 = extra ? fs.readFileSync(extra, 'utf8') : ''; const html0 = docs ? fs.readFileSync(docs, 'utf8') : '';
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'document.addEventListener("DOMContentLoaded",()=>{const sp=document.getElementById("splashScreen"); if(!sp) return; sp.remove=()=>{}; const st=document.createElement("style"); st.textContent="#splashScreen.hidden{opacity:1!important;visibility:visible!important}.intro-overlay{display:none!important}"+' + JSON.stringify(css0) + '; document.head.appendChild(st); ' + (html0 ? 'sp.insertAdjacentHTML("afterbegin",' + JSON.stringify(html0) + ');' : '') + '});' });
  await send('Page.navigate', { url: 'file:///' + www }); await sleep(Number(process.env.WAIT || 3500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); ws.close(); p.kill(); setTimeout(() => process.exit(0), 300);
})();
