const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  entitlement.purchased = true; reminders.length = 0;
  const T = new Date();
  const at = (n,h,m) => { const x = new Date(T); x.setDate(x.getDate()+n); x.setHours(h,m,0,0); return x.getTime(); };
  const ev = [{eventId:'2',begin:at(1,10,0),end:at(1,11,0),title:'Dentist',allDay:false,location:'',calendar:'Family',recurring:false,rrule:''}];
  for (let k=0;k<12;k++) { const d=new Date(T.getFullYear(),T.getMonth()+k,28,9,0,0).getTime(); if (d>Date.now()) ev.push({eventId:'7',begin:d,end:d+3600000,title:'Pay rent',allDay:false,location:'',calendar:'Home',recurring:true,rrule:'FREQ=MONTHLY;INTERVAL=1'}); }
  for (let k=0;k<5;k++) ev.push({eventId:'5',begin:at(2+7*k,8,0),end:at(2+7*k,8,30),title:'Gym',allDay:false,location:'',calendar:'Personal',recurring:true,rrule:'FREQ=WEEKLY'});
  for (let k=0;k<3;k++) ev.push({eventId:'8',begin:at(5+30*k,12,0),end:at(5+30*k,13,0),title:'Second Tuesday meet',allDay:false,location:'',calendar:'Work',recurring:true,rrule:'FREQ=MONTHLY;BYDAY=2TU'});
  ev.sort((a,b)=>a.begin-b.begin);
  window.Capacitor.Plugins.CalendarImport = { checkPermissions: async()=>({calendar:'granted'}), requestPermissions: async()=>({calendar:'granted'}), getEvents: async()=>({events: ev}) };
  for (let k=0;k<6;k++) reminders.push({id:'old'+k,title:'Pay rent',dueAt:'2026-1'+(k%3)+'-28',dueTime:'09:00',repeat:'none',calKey:'cal:7:2026-1'+(k%3)+'-2'+k,calSnap:'x',source:'calendar'});
  showExpiringDocumentsPanel('reminders');
  await new Promise(r=>setTimeout(r,600));
  await syncPhoneCalendar();
  const rent = reminders.filter(r=>r.title==='Pay rent');
  const gym = reminders.filter(r=>r.title==='Gym');
  const second = reminders.filter(r=>r.title==='Second Tuesday meet');
  const before = reminders.length;
  await new Promise(r=>setTimeout(r,300));
  await syncPhoneCalendar();
  document.title = JSON.stringify({rentCount:rent.length, rentRepeat:rent[0]&&rent[0].repeat, gymCount:gym.length, gymRepeat:gym[0]&&gym[0].repeat, secondCount:second.length, secondRepeat:second[0]&&second[0].repeat, total:before, afterSecondSync:reminders.length});
})();`;
require('fs').writeFileSync(__dirname + '/cal-test3-act.txt', act);
