// usage: node err-peek.js <port>   Only listens (Runtime.enable replays what the page already threw); touches nothing.
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + process.argv[2] + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') { const e = d.params.exceptionDetails; console.log('EXCEPTION', e.exception && e.exception.description, '| url', e.url, 'line', e.lineNumber, 'col', e.columnNumber, JSON.stringify((e.stackTrace && e.stackTrace.callFrames || []).slice(0, 4).map(f => f.functionName + '@' + f.url.split('/').pop() + ':' + f.lineNumber))); } };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    await new Promise(r => setTimeout(r, 1500)); ws.close(); process.exit(0);
})();
