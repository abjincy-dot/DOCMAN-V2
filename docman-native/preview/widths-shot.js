// usage: node widths-shot.js <port> <outDir>   Renders the main screens of the real app at several phone widths (CDP size emulation on the phone's WebView, layout only) and saves one PNG per screen and width.
const fs = require('fs'); const [port, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const WIDTHS = [320, 360, 412, 600], H = 820;
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const clean = `['expiryCardsPopup','expiringDocsOverlay','customDateModal','customPrompt'].forEach(i=>document.getElementById(i)?.remove());document.getElementById('deptInfoModal') && (document.getElementById('deptInfoModal').style.display='none');`;
    const screens = {
        home: `goHome(); 1`,
        reminders: `showExpiringDocumentsPanel('reminders'); 1`,
        expiring: `showExpiringDocumentsPanel('expiring'); 1`,
        glass: `(()=>{const t=localTodayIso();const mk=(i,ti)=>({id:'wd'+i,title:ti,details:'Details for the card',dueAt:t,dueTime:'09:0'+i,endTime:null,repeat:'none'});showExpiryCardsPopup([{file:{name:'Passport.pdf',expiryDate:t},folderPath:'Personal/IDs',days:0}],[mk(1,'Pay the electricity bill'),mk(2,'Call the school')]);return 1;})()`,
        info: `showInfo(); 1`,
    };
    for (const w of WIDTHS) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: H, deviceScaleFactor: 2, mobile: true });
        await wait(700);
        for (const [name, js] of Object.entries(screens)) {
            await ev(clean); await ev(`goHome(); 1`); await wait(500); await ev(js); await wait(name === 'glass' ? 2600 : 1200);
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(outDir + '/' + name + '-' + w + '.png', Buffer.from(shot.result.data, 'base64'));
        }
        await ev(clean);
    }
    await send('Emulation.clearDeviceMetricsOverride');
    ws.close(); process.exit(0);
})();
