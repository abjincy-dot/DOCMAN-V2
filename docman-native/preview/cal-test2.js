const head = require('fs').readFileSync(__dirname + '/cal-test-act.txt', 'utf8').split('showExpiringDocumentsPanel')[0];
const act = head + `
  showExpiringDocumentsPanel('reminders');
  await new Promise(r=>setTimeout(r,600));
  await syncPhoneCalendar();
  const n1 = reminders.length;
  ev[1].title = 'Dentist (moved)'; ev[1].begin = at(2,14,0); ev[1].end = at(2,15,0);
  await new Promise(r=>setTimeout(r,300));
  await syncPhoneCalendar();
  const dentist = reminders.filter(r=>r.calKey==='cal:2');
  const team = reminders.find(r=>r.title==='Team meeting');
  const mine = reminders.find(r=>r.title==='Gym');
  mine.title = 'My own Gym name';
  await new Promise(r=>setTimeout(r,300));
  calRememberDismissed(team.calKey); reminders = reminders.filter(r=>r!==team); saveReminders();
  await syncPhoneCalendar();
  document.title = JSON.stringify({afterFirst:n1, afterMove:dentist.length, dentistTitle:dentist[0].title, dentistTime:dentist[0].dueTime, teamBack: reminders.some(r=>r.title==='Team meeting'), userEditSurvived: reminders.some(r=>r.title==='My own Gym name'), total: reminders.length});
})();`;
require('fs').writeFileSync(__dirname + '/cal-test2-act.txt', act);
