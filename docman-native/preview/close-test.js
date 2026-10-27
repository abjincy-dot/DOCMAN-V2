const act = `(async()=>{
  entitlement.purchased = true; reminders.length = 0;
  const out = {};
  for (const tab of ['reminders','expiring']) {
    showExpiringDocumentsPanel(tab); await new Promise(r=>setTimeout(r,600));
    const x = document.getElementById('expiringDocsCloseX'); const b = x.getBoundingClientRect();
    const top = document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
    out[tab] = { topIsTheButton: top === x || x.contains(top) };
    x.click(); await new Promise(r=>setTimeout(r,500));
    out[tab].closed = !document.getElementById('expiringDocsOverlay');
  }
  document.title = JSON.stringify(out);
})();`;
require('fs').writeFileSync(__dirname + '/close-test-act.txt', act);
