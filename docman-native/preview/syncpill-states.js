const base = `entitlement.purchased=true; showExpiringDocumentsPanel('reminders'); await new Promise(r=>setTimeout(r,500));
  const b=document.getElementById('expdocSyncCal'); b.querySelector('.xc-sync-sep').style.cssText='display:inline-block;width:1px;height:16px;background:rgba(255,255,255,0.35);margin:0 1px';`;
const act = (inner) => `(async()=>{ ${base} ${inner} })();`;
const sets = {
  idle: `b.querySelector('i').className='fas fa-rotate';`,
  syncing: `const i=b.querySelector('i'); i.className='fas fa-rotate'; i.style.animation='spin 1s linear infinite'; i.style.transform='rotate(40deg)'; b.querySelector('span').textContent='Syncing…';`,
  done: `const i=b.querySelector('i'); i.className='fas fa-check'; b.querySelector('span').textContent='Synced'; b.style.borderColor='#22c55e';`,
  hint: `b.querySelector('i').className='fas fa-rotate'; const h=document.createElement('div'); h.style.cssText='position:absolute;left:30px;right:14px;top:78px;z-index:50;background:#2a2a36;border:1.5px solid #ff8a1f;border-radius:12px;padding:8px 10px;font:600 0.72rem Inter,sans-serif;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.5)'; h.innerHTML='<b style="color:#ffb26b">Tap Sync Calendar</b> to import now.<br><b style="color:#ffb26b">AUTO</b> syncs by itself.<span style="position:absolute;top:-7px;right:70px;width:12px;height:12px;background:#2a2a36;border-left:1.5px solid #ff8a1f;border-top:1.5px solid #ff8a1f;transform:rotate(45deg)"></span>'; document.querySelector('.xc-panel').appendChild(h);`
};
const fs = require('fs');
for (const k in sets) fs.writeFileSync(__dirname + '/sp-' + k + '.txt', act(sets[k]));
