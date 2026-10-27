const fs = require("fs");
let j = fs.readFileSync("../www/app.js", "utf8");
function rep(a, b) { if (j.split(a).length !== 2) { console.log("anchor count", j.split(a).length - 1, a.slice(0, 80)); process.exit(1); } j = j.replace(a, b); }

// 1) Open from the open panel: no rebuild, no scroll; the note sits on the chosen card
rep(`    reminderBannerId = r.id;
    // noAck: opening the panel this way must NOT mark the reminder seen.`,
`    // Already looking at the Reminders list (the Open button on the bar): nothing is rebuilt or scrolled, the list stays
    // exactly as it is and the note appears ON the chosen card.
    const livePanel = document.getElementById('expiringDocsOverlay');
    if (livePanel) {
        const sid = (window.CSS && CSS.escape) ? CSS.escape(r.id) : r.id;
        const liveCard = livePanel.querySelector('.xc-card[data-rem-id="' + sid + '"]');
        if (liveCard) { showReminderStickyNote(r, liveCard, { keepWaiting: true, cover: true }); return; }
    }
    reminderBannerId = r.id;
    // noAck: opening the panel this way must NOT mark the reminder seen.`);

// 2) Note placement: covering mode = same size and place as the card
rep(`        const bw = sticky.offsetWidth, bh = sticky.offsetHeight;
        // innerHeight runs to the bottom of the SCREEN`,
`        if (opts.cover && anchorEl && anchorEl.getBoundingClientRect) {
            sticky.style.width = r.width + 'px';
            sticky.style.minHeight = r.height + 'px';
        }
        const bw = sticky.offsetWidth, bh = sticky.offsetHeight;
        // innerHeight runs to the bottom of the SCREEN`);
rep(`        sticky.style.left = left + 'px';
        sticky.style.top = top + 'px';
        sticky.classList.toggle('rnote-above', above);`,
`        if (opts.cover) { left = r.left; top = r.top; above = false; arrow.style.display = 'none'; }
        sticky.style.left = left + 'px';
        sticky.style.top = top + 'px';
        sticky.classList.toggle('rnote-above', above);`);
fs.writeFileSync("../www/app.js", j);
console.log("ok");
