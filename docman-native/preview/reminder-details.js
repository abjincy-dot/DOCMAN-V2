const fs = require("fs");
let j = fs.readFileSync("../www/app.js", "utf8");
function rep(a, b) { if (j.split(a).length !== 2) { console.log("anchor count", j.split(a).length - 1, a.slice(0, 70)); process.exit(1); } j = j.replace(a, b); }

// 1) Open: anchor the note to the new card (not the old row) and do not mark the reminder done just by opening it
rep(`    setTimeout(() => {
        const row = reminderRowEl(r.id);
        if (!row) { showToast(r.title || 'Reminder', false); return; }
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Placed after the smooth scroll settles, against where the row ends
        // up rather than where it started.
        setTimeout(() => showReminderStickyNote(r, row), 380);
    }, 320);`,
`    setTimeout(() => {
        const safeId = (window.CSS && CSS.escape) ? CSS.escape(r.id) : r.id;
        const row = document.querySelector('.xc-card[data-rem-id="' + safeId + '"]') || reminderRowEl(r.id);
        if (!row) { showToast(r.title || 'Reminder', false); return; }
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Placed after the smooth scroll settles, against where the card ends
        // up rather than where it started. Opening a reminder does not mark it done (Done does that).
        setTimeout(() => showReminderStickyNote(r, row, { keepWaiting: true }), 380);
    }, 320);`);

rep(`function showReminderStickyNote(reminder, anchorEl) {`, `function showReminderStickyNote(reminder, anchorEl, opts = {}) {`);
rep(`    settleSeenReminder(reminder);
    saveReminders();

    const when = reminder.dueAt`, `    if (!opts.keepWaiting) {
        settleSeenReminder(reminder);
        saveReminders();
    }

    const when = reminder.dueAt`);
rep("                ${reminder.place ? `<div class=\"rnote-place\">",
    "                ${reminder.details ? `<div class=\"rnote-details\">${escapeHtml(reminder.details)}</div>` : ''}\n                ${reminder.place ? `<div class=\"rnote-place\">");

// 2) Add flow: a Details step between the title and the date
rep(`        if (title === null || title === undefined || !title.trim()) return;
        showDateModal('Due date & time', presetDateIso || '', async (result) => {`,
`        if (title === null || title === undefined || !title.trim()) return;
        showTextareaPromptModal('Details (optional):', '', (detailsRaw) => {
        // Skip / X / tapping outside = no details; the reminder carries on to the date step.
        const details = (detailsRaw || '').trim();
        showDateModal('Due date & time', presetDateIso || '', async (result) => {`);
rep(`                noteRef: noteRef || null,
                place: null,
                createdAt: Date.now()`, `                noteRef: noteRef || null,
                place: null,
                details: details || null,
                createdAt: Date.now()`);
rep(`        }, { disallowPast: true, withTime: true, withEndTime: true, requireDate: true, withRepeat: true });
    }, { icon: 'fa-bell', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'What would you like to be reminded about?', placeholder: 'Reminder title' });`,
`        }, { disallowPast: true, withTime: true, withEndTime: true, requireDate: true, withRepeat: true });
        }, { icon: 'fa-note-sticky', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'Anything you want to remember with it. You can leave this empty.', placeholder: 'Write something...', okLabel: 'Next', cancelLabel: 'Skip' });
    }, { icon: 'fa-bell', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'What would you like to be reminded about?', placeholder: 'Reminder title' });`);

// 3) Edit flow: the same Details step, pre-filled
rep(`        showDateModal('Due date & time (optional)', startDate, async (result) => {`,
`        showTextareaPromptModal('Details (optional):', reminder.details || '', (detailsRaw) => {
        // Skip keeps what was there; saving an empty box clears the details.
        if (detailsRaw !== null && detailsRaw !== undefined) reminder.details = detailsRaw.trim() || null;
        showDateModal('Due date & time (optional)', startDate, async (result) => {`);
rep(`defaultTime: startTime, defaultEndTime: startEnd, withRepeat: true, defaultRepeat: reminder.repeat || 'none' });
    }, { icon: 'fa-bell', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'Update the reminder title'`,
`defaultTime: startTime, defaultEndTime: startEnd, withRepeat: true, defaultRepeat: reminder.repeat || 'none' });
        }, { icon: 'fa-note-sticky', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'Anything you want to remember with it. You can leave this empty.', placeholder: 'Write something...', okLabel: 'Next', cancelLabel: 'Skip' });
    }, { icon: 'fa-bell', iconGradient: 'linear-gradient(135deg,#ff8a1f,#f2570a)', subtitle: 'Update the reminder title'`);
fs.writeFileSync("../www/app.js", j);

let css = fs.readFileSync("../www/style.css", "utf8");
css = css.replace(/\s*$/, "\n") + `
/* Reminder details (optional text written with the reminder), shown in the note that Open pops up. */
.rnote-details { margin-top: 6px; font-size: 0.82rem; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 28vh; overflow-y: auto; opacity: 0.92; }
`;
fs.writeFileSync("../www/style.css", css);
console.log("ok");
