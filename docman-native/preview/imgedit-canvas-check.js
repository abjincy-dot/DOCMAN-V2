// usage: node imgedit-canvas-check.js <port>  After each editor step, reads the VISIBLE canvas (#imgEditorCanvas): size and how many pixels are non-transparent. Cleans up (closes the editor, removes the test folder).
const port = process.argv[2] || '9222';
(async () => {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
    const ev = (e) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: e, awaitPromise: true, returnByValue: true } })); }).then(d => d.result.exceptionDetails ? 'EXC ' + d.result.exceptionDetails.exception.description : d.result.result.value);
    const vis = 'const c=document.getElementById("imgEditorCanvas");const x=c.getContext("2d");const d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return JSON.stringify({canvas:c.width+"x"+c.height,work:imgEditor.workingCanvas.width+"x"+imgEditor.workingCanvas.height,opaqueShare:Math.round(100*n/(c.width*c.height))+"%",tool:imgEditor.activeTool});';
    const step = async (label, body) => console.log(label.padEnd(18), await ev('(async()=>{try{' + body + ';await new Promise(r=>setTimeout(r,500));' + vis + '}catch(e){return "THROWN "+e.message}})()'));
    await ev('window.__fp="ZZ AUDIT3";1');
    await step('open', 'currentPath=["ZZ AUDIT3"];fileSystem["ZZ AUDIT3"]={};const tc=document.createElement("canvas");tc.width=600;tc.height=400;const tx=tc.getContext("2d");tx.fillStyle="#ff7a18";tx.fillRect(0,0,600,400);tx.fillStyle="#fff";tx.font="48px Arial";tx.fillText("DOCMAN",120,210);const b=await new Promise(r=>tc.toBlob(r,"image/png"));window.__b=b;openImageViewer(b,"t.png","ZZ AUDIT3");await openImageEditor()');
    await step('rotate', 'imgEditorRotate("right")');
    await step('flip', 'imgEditorFlip("horizontal")');
    await step('grayscale', 'imgEditorApplyGrayscale()');
    await step('auto enhance', 'imgEditorApplyAutoEnhance()');
    await step('document mode', 'imgEditorApplyDocumentMode()');
    await step('crop tool', 'imgEditorSetTool("crop")');
    await step('crop apply', 'imgEditorApplyCrop()');
    await step('text tool', 'imgEditorSetTool("text")');
    await step('text apply', 'imgEditorApplyText()');
    await step('undo', 'imgEditorUndo()');
    await step('reset original', 'imgEditorResetToOriginal()');
    console.log('cleanup'.padEnd(18), await ev('(async()=>{try{closeImageEditor();}catch(e){}try{closeImageViewer();}catch(e){}currentPath=[];delete fileSystem["ZZ AUDIT3"];saveFolderStructure();render();return JSON.stringify({leftover:Object.keys(fileSystem).filter(k=>k.indexOf("ZZ AUDIT")===0).length,files:Object.values(allFiles).reduce((a,x)=>a+x.length,0)});})()'));
    ws.close(); process.exit(0);
})();
