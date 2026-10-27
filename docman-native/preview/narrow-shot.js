// usage: node narrow-shot.js <port> <width> <out.png> [light]   Shows the glass card with long made-up names at a narrow width on the phone's WebView (layout only), saves a PNG, restores the size.
const fs = require('fs');
const [port, w, out, mode] = process.argv.slice(2);
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: 760, deviceScaleFactor: 2.5, mobile: true });
    if (mode === 'light') await ev(`document.body.classList.add('light-mode')`);
    await ev(`(()=>{document.getElementById('expiryCardsPopup')?.remove();const t=localTodayIso();const mk=(i,ti,rep)=>({id:'nw'+i,title:ti,details:'A long description that should wrap on a narrow screen without pushing the Done button out of the card.',dueAt:t,dueTime:'09:0'+i,endTime:'10:30',repeat:rep||'none'});showExpiryCardsPopup([{file:{name:'Very long document name for the passport renewal.pdf',expiryDate:t},folderPath:'Personal/IDs',days:-3}],[mk(1,'Pay the quarterly electricity and water bill','monthly'),mk(2,'Call the school')]);return 1;})()`);
    await new Promise(r => setTimeout(r, 2600));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    await ev(`(()=>{document.getElementById('expiryCardsPopup')?.remove();document.body.classList.remove('light-mode');return 1;})()`);
    await send('Emulation.clearDeviceMetricsOverride');
    ws.close(); process.exit(0);
})();
