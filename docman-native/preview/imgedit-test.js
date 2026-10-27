// usage: node imgedit-test.js <port> [shotPath]
// The image editor on a generated test picture inside a throwaway folder "ZZ AUDIT2" (removed at the end, counts compared before / after): rotate, flip, grayscale, auto enhance, document mode, crop, text, undo / redo / reset, save as new, save as PDF.
const fs = require('fs');
const port = process.argv[2] || '9222', shot = process.argv[3];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }).then(d => d.result.exceptionDetails ? 'EXC ' + d.result.exceptionDetails.exception.description : d.result.result.value);
    const step = async (label, body) => console.log(label.padEnd(24), await ev('(async()=>{try{' + body + '}catch(e){return "THROWN "+e.message}})()'));
    await ev('window.__snap=async()=>{const p=window.Capacitor.Plugins.LocalNotifications;return {depts:Object.keys(fileSystem).length,files:Object.values(allFiles).reduce((a,x)=>a+x.length,0),notes:Object.values(allNotes).reduce((a,x)=>a+x.length,0),bin:recycleBin.length,reminders:reminders.length,pending:(await p.getPending()).notifications.length};};window.__fp="ZZ AUDIT2";window.__wh=()=>{const c=imgEditor.workingCanvas;return c.width+"x"+c.height;};1');
    await step('baseline', 'window.__base=await window.__snap();return JSON.stringify(window.__base);');
    await step('setup picture', 'fileSystem["ZZ AUDIT2"]={};saveFolderStructure();const c=document.createElement("canvas");c.width=600;c.height=400;const x=c.getContext("2d");const g=x.createLinearGradient(0,0,600,400);g.addColorStop(0,"#ff7a18");g.addColorStop(1,"#3b2f9e");x.fillStyle=g;x.fillRect(0,0,600,400);x.fillStyle="#fff";x.font="48px Arial";x.fillText("DOCMAN TEST",120,210);const blob=await new Promise(r=>c.toBlob(r,"image/png"));const f=new File([blob],"audit.png",{type:"image/png"});await addFileToCurrentFolder(f,window.__fp);const e=allFiles[window.__fp][0];window.__blob=blob;return JSON.stringify({added:e.name,size:e.size});');
    await step('open viewer + editor', 'openImageViewer(window.__blob,"audit.png",window.__fp);await openImageEditor();await new Promise(r=>setTimeout(r,600));return JSON.stringify({editorOpen:!document.getElementById("imageEditor").classList.contains("hidden"),size:window.__wh()});');
    await step('rotate right', 'imgEditorRotate("right");await new Promise(r=>setTimeout(r,300));return window.__wh();');
    await step('flip horizontal', 'imgEditorFlip("horizontal");await new Promise(r=>setTimeout(r,300));return window.__wh();');
    await step('grayscale', 'imgEditorApplyGrayscale();await new Promise(r=>setTimeout(r,500));const d=imgEditor.workingCanvas.getContext("2d").getImageData(10,10,1,1).data;return JSON.stringify({pixel:[d[0],d[1],d[2]],isGray:d[0]===d[1]&&d[1]===d[2]});');
    await step('auto enhance', 'imgEditorApplyAutoEnhance();await new Promise(r=>setTimeout(r,500));return "ok "+window.__wh();');
    await step('document mode', 'imgEditorApplyDocumentMode();await new Promise(r=>setTimeout(r,600));return "ok "+window.__wh();');
    await step('undo x2 / redo', 'const h0=imgEditor.historyIndex;imgEditorUndo();imgEditorUndo();const h1=imgEditor.historyIndex;imgEditorRedo();return JSON.stringify({before:h0,afterUndo2:h1,afterRedo:imgEditor.historyIndex});');
    await step('crop tool', 'imgEditorSetTool("crop");await new Promise(r=>setTimeout(r,500));const b=window.__wh();imgEditorApplyCrop();await new Promise(r=>setTimeout(r,500));return JSON.stringify({before:b,after:window.__wh()});');
    await step('text tool', 'imgEditorSetTool("text");await new Promise(r=>setTimeout(r,500));imgEditorApplyText();await new Promise(r=>setTimeout(r,500));return "ok "+window.__wh();');
    if (shot) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shot, Buffer.from(s.result.data, 'base64')); console.log('screenshot'.padEnd(24), shot); }
    await step('save as new', 'const before=(allFiles[window.__fp]||[]).length;await imgEditorSaveAsNew();await new Promise(r=>setTimeout(r,1500));const names=(allFiles[window.__fp]||[]).map(f=>f.name+":"+f.size);return JSON.stringify({before,after:names});');
    await step('save as PDF', 'const before=(allFiles[window.__fp]||[]).length;if(document.getElementById("imageEditor").classList.contains("hidden")){openImageViewer(window.__blob,"audit.png",window.__fp);await openImageEditor();imgEditorRotate("right");}await imgEditorSaveAsPdf();await new Promise(r=>setTimeout(r,2500));const names=(allFiles[window.__fp]||[]).map(f=>f.name+":"+f.size);return JSON.stringify({before,after:names});');
    await step('close editor/viewer', 'try{closeImageEditor();}catch(e){}try{closeImageViewer();}catch(e){}return "closed";');
    await step('cleanup', 'currentPath=[];await moveFolderToRecycleBin(["ZZ AUDIT2"]);const ids=recycleBin.filter(r=>r.name==="ZZ AUDIT2"||(r.payload&&String(r.payload.fullPath).indexOf("ZZ AUDIT2")===0)).map(r=>r.id);for(const i of ids)await permanentlyDeleteRecycleBinItem(i,{silent:true});await new Promise(r=>setTimeout(r,800));render();const now=await window.__snap();return JSON.stringify({purged:ids.length,same:JSON.stringify(window.__base)===JSON.stringify(now),after:now});');
    ws.close(); process.exit(0);
})();
