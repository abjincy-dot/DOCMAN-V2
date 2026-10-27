const mk = (inner) => `(async()=>{ entitlement.purchased=true; reminders.length=0;
  const pad = n => String(n).padStart(2,'0'); const day = n => { const x = new Date(); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
  reminders.push({id:'a',title:'Rent',dueAt:day(0),dueTime:'00:01',repeat:'none'},{id:'b',title:'Phone bill',dueAt:day(0),dueTime:'00:02',repeat:'none'},{id:'c',title:'Gym',dueAt:day(3),dueTime:'08:00',repeat:'none'});
  ${inner} })();`;
const fs = require('fs');
fs.writeFileSync(__dirname + '/surf-panel.txt', mk(`showExpiringDocumentsPanel('reminders');`));
fs.writeFileSync(__dirname + '/surf-popup.txt', mk(`showExpiryCardsPopup([], reminders.slice(0,2));`));
fs.writeFileSync(__dirname + '/surf-modal.txt', mk(`showExpiringDocumentsPanel('reminders'); await new Promise(r=>setTimeout(r,500)); addReminderFlow();`));
