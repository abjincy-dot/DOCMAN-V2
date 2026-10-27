const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  entitlement.purchased = true; reminders.length = 0; try { localStorage.removeItem('docman_cal_dismissed_v1'); } catch(e){}
  const T = new Date(); const at = (n,h,m) => { const x = new Date(T); x.setDate(x.getDate()+n); x.setHours(h,m,0,0); return x.getTime(); };
  window.Capacitor.Plugins.CalendarImport = { checkPermissions: async()=>({calendar:'granted'}), requestPermissions: async()=>({calendar:'granted'}),
    getEvents: async()=>({events:[
      {eventId:'1',begin:at(2,10,0),end:at(2,11,0),title:'Dentist',allDay:false,location:'',calendar:'F',recurring:false,rrule:''},
      {eventId:'2',begin:at(3,15,0),end:at(3,16,0),title:'Meeting',allDay:false,location:'',calendar:'W',recurring:false,rrule:''},
      {eventId:'3',begin:at(4,9,0),end:at(4,10,0),title:'Gym',allDay:false,location:'',calendar:'P',recurring:false,rrule:''}]}) };
  showExpiringDocumentsPanel('reminders'); await new Promise(r=>setTimeout(r,500));
  await syncPhoneCalendar();
  const n1 = reminders.length;
  for (const r of reminders.slice()) { calRememberDismissed(r.calKey); }
  reminders.length = 0; saveReminders();
  await syncPhoneCalendar({auto:true});
  const afterAuto = reminders.length;
  await syncPhoneCalendar();
  const afterManual = reminders.length;
  for (const r of reminders.slice()) { calRememberDismissed(r.calKey); }
  reminders.length = 0; saveReminders();
  await syncPhoneCalendar({auto:true});
  document.title = JSON.stringify({first:n1, afterAutoWhenDeleted:afterAuto, afterManualPress:afterManual, afterDeleteThenAuto:reminders.length});
})();`;
const stripped = act.split('\n').map(l => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i).trimEnd() : l; }).join('\n');
require('fs').writeFileSync(__dirname + '/cal-test6-act.txt', stripped);
