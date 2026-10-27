const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const page = path.resolve(process.argv[2]).split(path.sep).join('/'), out = process.argv[3];
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = path.join(process.env.TEMP, 'edge-page-' + Date.now()); const port = 9800 + Math.floor(Math.random() * 150);
const p = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=420,900', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (tabs.length) break; } catch (e) {} await sleep(250); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: 384, height: 823, deviceScaleFactor: 2.6667, mobile: true });
  await send('Page.enable'); await send('Page.navigate', { url: 'file:///' + page }); await sleep(Number(process.env.WAIT || 2500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); ws.close(); p.kill(); setTimeout(() => process.exit(0), 300);
})();
