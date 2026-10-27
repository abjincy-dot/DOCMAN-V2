// usage: node err-sweep.js <port>   Read-only walk through the main screens of the app on the phone; prints every JS exception and console error/warning.
// Nothing is saved or changed: it only opens and closes panels and calls the view functions. The popup test uses made-up items.
const port = process.argv[2] || '9222';
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; const problems = []; let cur = 'start';
    ws.onmessage = m => {
        const d = JSON.parse(m.data);
        if (d.id && pend[d.id]) { pend[d.id](d); return; }
        if (d.method === 'Runtime.exceptionThrown') { const e = d.params.exceptionDetails; problems.push('EXCEPTION during [' + cur + '] ' + (e.exception && e.exception.description || e.text) + ' @' + e.lineNumber + ':' + e.columnNumber); }
        if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) problems.push(d.params.type.toUpperCase() + ' ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (label, expr, wait) => {
        const before = problems.length; cur = label;
        const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (res.result && res.result.exceptionDetails) problems.push('EVAL-EXC in ' + label + ': ' + (res.result.exceptionDetails.exception && res.result.exceptionDetails.exception.description));
        await new Promise(r => setTimeout(r, wait || 900));
        console.log((problems.length > before ? '!! ' : 'ok ') + label + (res.result && res.result.result && res.result.result.value !== undefined ? '  -> ' + JSON.stringify(res.result.result.value) : ''));
    };
    await send('Runtime.enable'); await send('Log.enable');
    const click = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing ${sel}';e.click();return 'clicked';})()`;
    await ev('clean slate', `(()=>{['expiryCardsPopup','expiringDocsOverlay','customDateModal','customPrompt'].forEach(i=>document.getElementById(i)?.remove());return 'ok';})()`);
    await ev('Reminders panel', `showExpiringDocumentsPanel('reminders'); 'open'`, 1400);
    await ev('  tab Expiring', `(()=>{const b=[...document.querySelectorAll('#expiringDocsOverlay button')].find(x=>/Expiring/.test(x.textContent));if(!b)return 'no tab';b.click();return 'ok';})()`, 1400);
    await ev('  tab Reminders', `(()=>{const b=[...document.querySelectorAll('#expiringDocsOverlay button')].find(x=>/Reminders/.test(x.textContent));if(!b)return 'no tab';b.click();return 'ok';})()`, 1400);
    await ev('  scroll list', `(()=>{const l=document.getElementById('expiringDocsList');if(l){l.scrollTop=l.scrollHeight;l.scrollTop=0;}return !!l;})()`);
    await ev('  close panel', click('#expiringDocsCloseX'), 900);
    await ev('Dashboard', `openDashboardView(); 'open'`, 1500);
    await ev('  back', `goHome(); 'ok'`, 900);
    await ev('Recent', `openRecentsView(); 'open'`, 1200);
    await ev('  back', `goHome(); 'ok'`, 900);
    await ev('Recycle bin', `openRecycleBinView(); 'open'`, 1200);
    await ev('  back', `goHome(); 'ok'`, 900);
    await ev('Settings page', `openSettingsPage(); 'open'`, 1200);
    await ev('  back', `(()=>{const b=document.querySelector('.settings-back, #settingsBackBtn, .settings-page-back');if(b){b.click();return 'back clicked';}goHome();return 'goHome';})()`, 900);
    await ev('Info (i) modal', `showInfo(); 'open'`, 1000);
    await ev('  close info', `closeDeptInfo(); 'ok'`, 600);
    const todayIso = `localTodayIso()`;
    await ev('Glass stack: 4 made-up items', `(()=>{document.getElementById('expiryCardsPopup')?.remove();const t=${todayIso};const mk=(i,ti)=>({id:'sw'+i,title:ti,details:'detail '+i,dueAt:t,dueTime:'09:0'+i,endTime:null,repeat:i===2?'monthly':'none'});const exp=[{file:{name:'Sweep passport.pdf',expiryDate:t},folderPath:'__sweep',days:0},{file:{name:'Sweep licence.pdf',expiryDate:t},folderPath:'__sweep',days:-2}];showExpiryCardsPopup(exp,[mk(1,'Sweep one'),mk(2,'Sweep two')]);return document.querySelectorAll('.gl-card').length;})()`, 1800);
    await ev('  tap a strip (to front)', `(()=>{const s=document.querySelector('.gl-strip');if(!s)return 'no strip';s.click();return 'clicked';})()`, 800);
    await ev('  scroll the stack', `(()=>{const l=document.querySelector('.gl-list');l.scrollTop=l.scrollHeight;l.scrollTop=0;return 'ok';})()`);
    await ev('  close stack', click('.gl-x'), 600);
    await ev('Glass single card', `(()=>{document.getElementById('expiryCardsPopup')?.remove();const t=${todayIso};showExpiryCardsPopup([],[{id:'sw9',title:'Sweep single',details:'',dueAt:t,dueTime:'09:00',endTime:null,repeat:'none'}]);return document.querySelectorAll('.gl-card').length;})()`, 1600);
    await ev('  close single', click('.gl-x'), 600);
    await ev('Add reminder window (then cancel)', `(()=>{showExpiringDocumentsPanel('reminders');return 'panel';})()`, 1200);
    await ev('  press Add reminder', click('#expdocAddReminder'), 900);
    await ev('  dismiss the title window', `(()=>{const x=document.querySelector('.modal-close, #customPrompt .modal-close, #promptModal .modal-close');if(x){x.click();return 'closed via X';}const c=[...document.querySelectorAll('button')].find(b=>/^Cancel$/.test(b.textContent.trim()));if(c){c.click();return 'closed via Cancel';}return 'nothing to close';})()`, 900);
    await ev('  close panel', `(()=>{document.getElementById('expiringDocsOverlay')?.remove();return 'ok';})()`, 500);
    console.log('\n==== ' + problems.length + ' problem(s) ====');
    problems.forEach(p => console.log(p));
    ws.close(); process.exit(0);
})();
