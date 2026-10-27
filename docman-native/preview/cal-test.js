// Fake native calendar for the Edge render: one-off, all-day, weekly (5 occurrences), past, and a second one-off.
const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  entitlement.purchased = true; reminders.length = 0;
  const T = new Date();
  const at = (n,h,m) => { const x = new Date(T); x.setDate(x.getDate()+n); x.setHours(h,m,0,0); return x.getTime(); };
  const utcDay = n => Date.UTC(T.getFullYear(), T.getMonth(), T.getDate()+n);
  const ev = [
    {eventId:'1',begin:at(-1,9,0),end:at(-1,10,0),title:'Yesterday meeting',allDay:false,location:'',calendar:'Work',recurring:false},
    {eventId:'2',begin:at(1,10,0),end:at(1,11,30),title:'Dentist',allDay:false,location:'Muscat Clinic',calendar:'Family',recurring:false},
    {eventId:'3',begin:utcDay(2),end:utcDay(3),title:'Ayaan birthday',allDay:true,location:'',calendar:'Family',recurring:false},
    {eventId:'4',begin:at(3,15,30),end:at(3,16,0),title:'Team meeting',allDay:false,location:'Room 4',calendar:'Work',recurring:false},
    ...[0,7,14,21,28].map(k => ({eventId:'5',begin:at(4+k,8,0),end:at(4+k,8,30),title:'Gym',allDay:false,location:'',calendar:'Personal',recurring:true})),
    {eventId:'6',begin:at(40,12,0),end:at(40,13,0),title:'Car service',allDay:false,location:'Garage',calendar:'Personal',recurring:false}
  ];
  window.Capacitor.Plugins.CalendarImport = {
    checkPermissions: async()=>({calendar:'granted'}), requestPermissions: async()=>({calendar:'granted'}),
    getEvents: async()=>({events: ev})
  };
  showExpiringDocumentsPanel('reminders');
  await new Promise(r=>setTimeout(r,600));
  await syncPhoneCalendar();
  await new Promise(r=>setTimeout(r,500));
  await syncPhoneCalendar();
})();`;
require('fs').writeFileSync(__dirname + '/cal-test-act.txt', act);
