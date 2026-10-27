const act = `(async()=>{
  entitlement.purchased = true; reminders.length = 0;
  const pad = n => String(n).padStart(2,'0');
  const day = n => { const x = new Date(); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
  reminders.push({id:'a',title:'HDFC LOAN',dueAt:day(1),dueTime:'08:00',repeat:'monthly'});
  const m = () => { const q = s => document.querySelector(s); const r = e => e ? Math.round(e.getBoundingClientRect().top*10)/10 : null; return { tabs: r(q('.expdoc-tab-row')), add: r(q('#expdocAddReminder')), stats: r(q('.xc-stats')), x: r(q('#expiringDocsCloseX')), frame: r(q('.xc-top')) }; };
  showExpiringDocumentsPanel('reminders'); await new Promise(r=>setTimeout(r,700)); const a = m();
  showExpiringDocumentsPanel('expiring'); await new Promise(r=>setTimeout(r,700)); const b = m();
  document.title = JSON.stringify({reminders:a, expiring:b, shift:{tabs:Math.round((b.tabs-a.tabs)*10)/10, stats:Math.round((b.stats-a.stats)*10)/10, x:Math.round((b.x-a.x)*10)/10}});
})();`;
require('fs').writeFileSync(__dirname + '/jerk-test-act.txt', act);
