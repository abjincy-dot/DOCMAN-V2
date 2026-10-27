// usage: node phone-eval.js <port> <css-file|-> <js expression>   (layout only; used to test CSS live on the phone)
const fs = require('fs');
const [port, cssFile, expr] = process.argv.slice(2);
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {};
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const ev = e => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true, awaitPromise: true } })); }).then(d => d.result && (d.result.exceptionDetails ? 'EXC ' + JSON.stringify(d.result.exceptionDetails.exception.description) : d.result.result.value));
    if (cssFile !== '-') await ev(`(()=>{let s=document.getElementById('__tmpcss');if(!s){s=document.createElement('style');s.id='__tmpcss';document.head.appendChild(s);}s.textContent=${JSON.stringify(fs.readFileSync(cssFile, 'utf8'))};})()`);
    if (expr) console.log(await ev(expr));
    ws.close(); process.exit(0);
})();
