const act = `(async()=>{
  entitlement.purchased = true; reminders.length = 0;
  const pad = n => String(n).padStart(2,'0');
  const day = n => { const x = new Date(); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
  reminders.push(
    {id:'a',title:'HDFC LOAN',dueAt:day(1),dueTime:'08:00',endTime:'09:00',repeat:'monthly'},
    {id:'b',title:'AMACHI CASH SENT',dueAt:day(3),dueTime:'08:00',endTime:'09:00',repeat:'monthly'},
    {id:'c',title:'Chachan cash sent',dueAt:day(4),dueTime:'06:00',endTime:'10:05',repeat:'monthly'},
    {id:'d',title:'OK',dueAt:day(5),dueTime:'08:00',endTime:'09:00',repeat:'none'});
  showExpiringDocumentsPanel('reminders');
})();`;
require('fs').writeFileSync(__dirname + '/rail-sample-act.txt', act);
