const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  entitlement.purchased = true; reminders.length = 0; try { localStorage.removeItem('docman_cal_auto_v1'); localStorage.removeItem('docman_cal_last_sync_v1'); } catch(e){}
  const T = new Date(); const at = (n,h,m) => { const x = new Date(T); x.setDate(x.getDate()+n); x.setHours(h,m,0,0); return x.getTime(); };
  let calls = 0, granted = true;
  window.Capacitor.Plugins.CalendarImport = {
    checkPermissions: async()=>({calendar: granted ? 'granted' : 'denied'}), requestPermissions: async()=>({calendar:'granted'}),
    getEvents: async()=>{ calls++; return {events:[{eventId:'1',begin:at(2,10,0),end:at(2,11,0),title:'Dentist',allDay:false,location:'',calendar:'Family',recurring:false,rrule:''}]}; }
  };
  showExpiringDocumentsPanel('reminders');
  await new Promise(r=>setTimeout(r,500));
  const r0 = {on0: calAutoOn()};
  document.getElementById('expdocAutoSw').click();            // the switch itself (must toggle, not run the normal sync)
  await new Promise(r=>setTimeout(r,1200));
  r0.onAfterToggle = calAutoOn(); r0.callsAfterToggle = calls; r0.remindersAfter = reminders.length; r0.swClass = document.getElementById('expdocAutoSw') ? document.getElementById('expdocAutoSw').className : 'gone';
  autoSyncCalendarIfDue(); await new Promise(r=>setTimeout(r,500));
  r0.callsThrottled = calls;                                   // still 1: it ran less than 6 hours ago
  localStorage.setItem('docman_cal_last_sync_v1', String(Date.now() - 7*3600000));
  autoSyncCalendarIfDue(); await new Promise(r=>setTimeout(r,800));
  r0.callsAfter7h = calls;                                     // 2
  granted = false; localStorage.setItem('docman_cal_last_sync_v1', String(Date.now() - 7*3600000));
  autoSyncCalendarIfDue(); await new Promise(r=>setTimeout(r,800));
  r0.autoAfterRevoke = calAutoOn();                            // false
  entitlement.purchased = false; granted = true; calSetAuto(true); localStorage.setItem('docman_cal_last_sync_v1', '0');
  autoSyncCalendarIfDue(); await new Promise(r=>setTimeout(r,500));
  r0.callsWhenNotPro = calls;                                  // unchanged (3? no: stays 2)
  document.title = JSON.stringify(r0);
})();`;
const stripped = act.split('\n').map(l => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i).trimEnd() : l; }).join('\n');
require('fs').writeFileSync(__dirname + '/cal-test5-act.txt', stripped);
