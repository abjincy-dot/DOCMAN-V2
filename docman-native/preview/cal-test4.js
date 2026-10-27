const act = `(async()=>{
  window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  const sched = []; let cancelled = 0;
  window.Capacitor.Plugins.LocalNotifications = {
    checkPermissions: async()=>({display:'granted'}), requestPermissions: async()=>({display:'granted'}),
    getPending: async()=>({notifications: []}), cancel: async(o)=>{cancelled += o.notifications.length;},
    schedule: async(o)=>{ sched.push(...o.notifications); }
  };
  window.isNativePlatform = () => true;
  const pad = n => String(n).padStart(2,'0');
  const day = n => { const x = new Date(); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
  reminders.length = 0;
  reminders.push(
    {id:'t1',title:'Today late',dueAt:day(0),dueTime:'23:30',repeat:'none',calKey:'cal:1'},
    {id:'t2',title:'Tomorrow 3pm',dueAt:day(1),dueTime:'15:00',repeat:'none',calKey:'cal:2'},
    {id:'t3',title:'In 3 days all day',dueAt:day(3),dueTime:'09:00',repeat:'none',calKey:'cal:3'},
    {id:'t4',title:'Past done',dueAt:day(-1),dueTime:'10:00',repeat:'none',calKey:'cal:4'},
    {id:'m1',title:'Mine',dueAt:day(2),dueTime:'10:00',repeat:'none'}
  );
  for (let k=0;k<60;k++) reminders.push({id:'x'+k,title:'Far '+k,dueAt:day(10+k),dueTime:'10:00',repeat:'none',calKey:'cal:f'+k});
  await armCalendarReminders(true);
  const byId = {}; for (const n of sched) { const rid = n.extra.reminderId; (byId[rid] = byId[rid] || []).push(new Date(n.schedule.at).toTimeString().slice(0,5)); }
  const events = Object.keys(byId).length;
  await scheduleReminderNotification(reminders.find(r=>r.id==='t2'));
  document.title = JSON.stringify({total: sched.length, events, cancelledFirst: cancelled, today: byId.t1, tomorrow: byId.t2, threeDays: byId.t3, pastDone: byId.t4 || null, mine: byId.m1 || null, far0: byId.x0 && byId.x0.length, farLast: byId['x'+(events-5)] ? 'armed' : 'not armed', x59: byId.x59 || null});
})();`;
require('fs').writeFileSync(__dirname + '/cal-test4-act.txt', act);
