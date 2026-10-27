const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  entitlement.purchased = true; reminders.length = 0; try { localStorage.removeItem('docman_cal_auto_v1'); } catch(e){}
  let calls = 0; const T = new Date(); const at = (n,h,m) => { const x = new Date(T); x.setDate(x.getDate()+n); x.setHours(h,m,0,0); return x.getTime(); };
  window.Capacitor.Plugins.CalendarImport = { checkPermissions: async()=>({calendar:'granted'}), requestPermissions: async()=>({calendar:'granted'}),
    getEvents: async()=>{ calls++; return {events:[{eventId:'1',begin:at(2,10,0),end:at(2,11,0),title:'Dentist',allDay:false,location:'',calendar:'F',recurring:false,rrule:''}]}; } };
  showExpiringDocumentsPanel('reminders'); await new Promise(r=>setTimeout(r,600));
  const r = {};
  document.getElementById('expdocSyncCal').click(); await new Promise(r2=>setTimeout(r2,800));
  r.callsManual = calls; r.remindersManual = reminders.length; r.disabledInManual = document.getElementById('expdocSyncCal').classList.contains('xc-sync-disabled');
  document.getElementById('expdocAutoSw').click(); await new Promise(r2=>setTimeout(r2,1500));
  r.mode = document.getElementById('expdocAutoSw').textContent; r.disabledInAuto = document.getElementById('expdocSyncCal').classList.contains('xc-sync-disabled');
  const before = calls;
  document.getElementById('expdocSyncCal').click(); await new Promise(r2=>setTimeout(r2,600));
  r.callsAfterTapInAuto = calls - before;
  document.getElementById('expdocAutoSw').click(); await new Promise(r2=>setTimeout(r2,400));
  r.backToManual = document.getElementById('expdocAutoSw').textContent; r.enabledAgain = !document.getElementById('expdocSyncCal').classList.contains('xc-sync-disabled');
  document.getElementById('expdocAutoSw').click(); await new Promise(r2=>setTimeout(r2,1200));
  document.title = JSON.stringify(r);
})();`;
const stripped = act.split('\n').map(l => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i).trimEnd() : l; }).join('\n');
require('fs').writeFileSync(__dirname + '/cal-test7-act.txt', stripped);
