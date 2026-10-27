// usage: node cdp-shot.js <port> <out.png> "<js to run first>" [wait ms]   Runs the JS in the app's WebView and saves a CDP screenshot of the page (the phone screen itself is not touched or captured).
const fs = require('fs'); const [port, out, js, wait] = process.argv.slice(2);
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
    console.log(r.result.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception.description : JSON.stringify(r.result.result.value));
    await new Promise(r => setTimeout(r, Number(wait || 1500)));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); ws.close(); process.exit(0);
})();
