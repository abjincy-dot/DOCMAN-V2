// usage: node expiry-lifecycle-test.js <port>   A made-up document ('__audit/audit.pdf', in memory only, saving stubbed) with a real expiry date: arms its real alarms, then "Done" (acknowledgeExpiry), a relaunch re-arm,
// and "tomorrow" (the acknowledgement stamp of yesterday), and checks the banner days. Removes every alarm and the document at the end.
const port = process.argv[2] || '9222';
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const ev = (e) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); }).then(d => d.result.exceptionDetails ? 'EXC ' + d.result.exceptionDetails.exception.description : d.result.result.value);
    const H = `window.__e=window.__e||{};window.__e.mine=async()=>{const p=window.Capacitor.Plugins.LocalNotifications;return ((await p.getPending()).notifications||[]).filter(n=>n.extra&&n.extra.folderPath==='__audit'&&n.extra.fileName==='audit.pdf');};window.__e.sum=async()=>{const a=await window.__e.mine();const t=new Date();const sd=n=>new Date(n.schedule.at).toDateString()===t.toDateString();return {total:a.length,today:a.filter(sd).length,later:a.filter(n=>!sd(n)).length};};1`;
    const iso = (n) => `(()=>{const d=new Date();d.setDate(d.getDate()+${n});const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());})()`;
    const cleanup = `(async()=>{const p=window.Capacitor.Plugins.LocalNotifications;await imgScheduleExpiryNotification('__audit','audit.pdf',null,{noRefresh:true});delete allFiles['__audit'];if(window.__e&&window.__e.realSave)window.saveFilesForFolder=window.__e.realSave;const left=await window.__e.mine();return JSON.stringify({auditAlarmsLeft:left.length,pending:(await p.getPending()).notifications.length,inFiles:!!allFiles['__audit']});})()`;
    try {
        await ev(H);
        console.log('setup        ', await ev(`(async()=>{window.__e.realSave=window.saveFilesForFolder;window.saveFilesForFolder=async()=>{};const p=window.Capacitor.Plugins.LocalNotifications;window.__e.before=(await p.getPending()).notifications.length;allFiles['__audit']=[{name:'audit.pdf',expiryDate:${iso(3)}}];await imgScheduleExpiryNotification('__audit','audit.pdf',allFiles['__audit'][0].expiryDate,{noRefresh:true});return JSON.stringify({pendingBefore:window.__e.before,armed:await window.__e.sum(),days:getExpiryStatus(allFiles['__audit'][0]).days});})()`));
        console.log('banner 3 days', await ev(`JSON.stringify({inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit'),ackedNow:isExpiryAcknowledged(allFiles['__audit'][0])})`));
        console.log('Done         ', await ev(`(async()=>{await acknowledgeExpiry('__audit','audit.pdf');const f=allFiles['__audit'][0];return JSON.stringify({stamp:f.expiryAckFor,acked:isExpiryAcknowledged(f),alarms:await window.__e.sum(),inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit')});})()`));
        console.log('relaunch arm ', await ev(`(async()=>{const f=allFiles['__audit'][0];await imgScheduleExpiryNotification('__audit','audit.pdf',f.expiryDate,{noRefresh:true,acknowledged:isExpiryAcknowledged(f)});return JSON.stringify(await window.__e.sum());})()`));
        console.log('next morning ', await ev(`(async()=>{const f=allFiles['__audit'][0];f.expiryAckFor=f.expiryDate+'@2000-01-01';return JSON.stringify({acked:isExpiryAcknowledged(f),inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit')});})()`));
        console.log('2 days left  ', await ev(`(async()=>{allFiles['__audit'][0].expiryDate=${iso(2)};allFiles['__audit'][0].expiryAckFor=null;return JSON.stringify({days:getExpiryStatus(allFiles['__audit'][0]).days,inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit')});})()`));
        console.log('7 days left  ', await ev(`(async()=>{allFiles['__audit'][0].expiryDate=${iso(7)};return JSON.stringify({days:getExpiryStatus(allFiles['__audit'][0]).days,inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit')});})()`));
        console.log('expired 2d   ', await ev(`(async()=>{allFiles['__audit'][0].expiryDate=${iso(-2)};return JSON.stringify({days:getExpiryStatus(allFiles['__audit'][0]).days,inBanner:getAttentionSets().expiring.some(e=>e.folderPath==='__audit')});})()`));
    } catch (e) { console.log('ERROR', e); }
    console.log('cleanup      ', await ev(cleanup));
    ws.close(); process.exit(0);
})();
