    // 26 Oct: the "Needs your attention" list is now ONE glass card at a time (swipe sideways for the next one). View (the old Open) and Done
    // sit to the right of the description. Done = acknowledged on this list and the bell only, it never cancels an alarm (user rule).
    let idx = 0;
    const GLASS_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffc83d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></svg>';
    const shortDate = (iso) => {
        const [y, m, d] = (iso || '').split('-').map(Number);
        return y ? new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '-';
    };
    const glassData = (it) => {
        if (it.kind === 'rem') {
            const r = it.r, w = reminderWhen(r, now);
            const rep = REMINDER_REPEAT_LABELS[r.repeat] || '';
            const time = r.dueTime ? (r.endTime ? formatTimeOfDay(r.dueTime) + '-' + formatTimeOfDay(r.endTime) : formatTimeOfDay(r.dueTime)) : '-';
            return { ring: GLASS_BELL, name: r.title || 'Reminder', kind: 'Reminder' + (rep ? ' · ' + rep : ''),
                     pill: w.words + (r.dueTime && w.words !== 'Overdue' ? ' · ' + formatTimeOfDay(r.dueTime) : ''), tone: w.tone === 'red' ? 'red' : 'amber',
                     stats: [[shortDate(r.dueAt), 'date'], [time, 'time'], [rep || 'Once', 'repeats']],
                     desc: (r.details || '').trim() || 'No details written for this reminder.' };
        }
        const e = it.e, f = e.file, ext = ((f.name.match(/\.([^.]+)$/) || [])[1] || 'file').toUpperCase();
        const left = e.days < 0 ? Math.abs(e.days) + (Math.abs(e.days) === 1 ? ' day' : ' days') + ' ago' : e.days === 0 ? 'Today' : e.days + (e.days === 1 ? ' day' : ' days');
        return { ring: '<div class="gl-doc">' + docPictureHtml(f, e.folderPath) + '</div>', raw: true,
                 name: f.name.replace(/\.[^.]+$/, '') || f.name, kind: (e.folderPath || '').split('/').join(' / ') || 'Root',
                 pill: docExpiryWords(e.days), tone: e.days <= 0 ? 'red' : 'amber',
                 stats: [[shortDate(f.expiryDate), e.days < 0 ? 'expired' : 'expires'], [left, e.days < 0 ? 'overdue' : 'left'], [ext, 'type']],
                 desc: e.days < 0 ? 'This document has expired. Open it to renew or replace it.' : 'This document expires soon. Open it to check the dates or renew it.' };
    };

    const render = () => {
        if (!items.length) { close(); return; }
        if (idx >= items.length) idx = items.length - 1;
        if (idx < 0) idx = 0;
        const it = items[idx], g = glassData(it);
        overlay.innerHTML = '<div class="gl-card" role="dialog" aria-modal="true" aria-label="Needs your attention">' +
            '<button type="button" class="gl-x" aria-label="Close"><i class="fas fa-times"></i></button>' +
            '<div class="gl-head"><div class="gl-ring">' + (g.raw ? g.ring : '<div>' + g.ring + '</div>') + '</div>' +
            '<div class="gl-id"><div class="gl-name">' + escapeHtml(g.name) + '</div><div class="gl-kind">' + escapeHtml(g.kind) + '</div>' +
            '<div class="gl-pill gl-' + g.tone + '">' + escapeHtml(g.pill) + '</div></div></div>' +
            '<div class="gl-stats">' + g.stats.map(s => '<div><b>' + escapeHtml(String(s[0])) + '</b><span>' + escapeHtml(s[1]) + '</span></div>').join('') + '</div>' +
            '<div class="gl-body"><div class="gl-desc">' + escapeHtml(g.desc) + '</div>' +
            '<div class="gl-btns"><button type="button" class="gl-btn" data-act="open"><span>' + DOC_CARD_ICONS.view + '</span>View</button>' +
            '<button type="button" class="gl-btn gl-done" data-act="done"><span>' + DOC_CARD_ICONS.done + '</span>Done</button></div></div>' +
            '<div class="gl-foot"><div class="gl-dots">' + items.map((x, i) => '<i class="' + (i === idx ? 'on' : '') + '"></i>').join('') + '</div>' +
            '<div>' + (idx + 1) + ' of ' + items.length + ' &nbsp;&middot;&nbsp; <button type="button" class="gl-more">All reminders &amp; expiry dates ›</button></div></div></div>';

        const card = overlay.querySelector('.gl-card');
        overlay.querySelector('.gl-x').onclick = () => { haptic.press(); close(); };
        overlay.querySelector('.gl-more').onclick = () => { haptic.press(); close(); showExpiringDocumentsPanel(); };

        // swipe sideways = next / previous item (a mostly vertical drag does nothing)
        let sx = 0, sy = 0, tracking = false;
        card.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; sx = t.clientX; sy = t.clientY; tracking = items.length > 1; }, { passive: true });
        card.addEventListener('touchend', (ev) => {
            if (!tracking) return;
            tracking = false;
            const t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            idx = (idx + (dx < 0 ? 1 : -1) + items.length) % items.length;
            render();
        }, { passive: true });

        card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            haptic.press();
            const act = btn.dataset.act;
            if (act === 'done') {
                if (it.kind === 'doc') {
                    await acknowledgeExpiry(it.e.folderPath, it.e.file.name);
                    showToast('Done');
                } else {
                    const r = reminders.find(x => x.id === it.r.id);
                    if (r) {
                        r.dueAckFor = reminderOccurrenceKey(r);
                        saveReminders();
                    }
                    showToast('Reminder done');
                }
                items = items.filter(x => x !== it);
                updateAttentionBell();
                render();
                return;
            }
            close();
            if (it.kind === 'doc') revealFileInFolder(it.e.file.name, it.e.folderPath);
            else {
                const r = reminders.find(x => x.id === it.r.id);
                if (!r) { showToast('That reminder has been deleted', true); return; }
                openReminderStickyNote(r.id);
            }
        }));
    };
