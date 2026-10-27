    // 26 Oct (stack): every pending item is a full glass card, stacked top to bottom, the list scrolls vertically. Cards rise in one after another on first show.
    // Done folds that one card away (the rest move up). With one item it looks as before (close button and footer inside the card).
    const cardHtml = (it, i) => {
        const g = glassData(it), many = items.length > 1;
        const fly = glFirstShow ? ' gl-fly' : '';
        const delay = glFirstShow ? ' style="animation-delay:' + (Math.min(i, 4) * 0.14).toFixed(2) + 's"' : '';
        return '<div class="gl-card' + fly + '" data-i="' + i + '"' + delay + ' role="dialog" aria-label="Needs your attention">' +
            (many ? '' : '<button type="button" class="gl-x" aria-label="Close"><i class="fas fa-times"></i></button>') +
            '<div class="gl-head"><div class="gl-ring">' + (g.raw ? g.ring : '<div>' + g.ring + '</div>') + '</div>' +
            '<div class="gl-id"><div class="gl-name">' + escapeHtml(g.name) + '</div><div class="gl-thumb">' + g.thumb + '</div></div></div>' +
            '<div class="gl-sub"><span class="gl-kind">' + escapeHtml(g.kind) + '</span><span class="gl-pill gl-' + g.tone + '"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>' + escapeHtml(g.pill) + '</span>' +
            '<span class="gl-round"><button type="button" class="gl-rbtn" data-act="open" aria-label="View"><span>' + DOC_CARD_ICONS.view + '</span></button>' +
            '<button type="button" class="gl-rbtn" data-act="edit" aria-label="Edit"><span>' + DOC_CARD_ICONS.edit + '</span></button></span></div>' +
            '<div class="gl-body"><div class="gl-desc">' + escapeHtml(g.desc) + '</div>' +
            '<button type="button" class="gl-btn gl-done" data-act="done"><span>' + DOC_CARD_ICONS.done + '</span>Done</button></div>' +
            (many ? '' : '<div class="gl-foot"><div class="gl-dots"><i class="on"></i></div><div>1 of 1 &nbsp;&middot;&nbsp; <button type="button" class="gl-more">All reminders &amp; expiry dates ›</button></div></div>') +
            '</div>';
    };

    const render = () => {
        if (!items.length) { close(); return; }
        const many = items.length > 1;
        overlay.innerHTML = '<div class="gl-wrap' + (many ? ' gl-many' : '') + '">' +
            (many ? '<div class="gl-top"><span>' + items.length + ' items need attention</span><button type="button" class="gl-x gl-x-top" aria-label="Close"><i class="fas fa-times"></i></button></div>' : '') +
            '<div class="gl-list">' + items.map(cardHtml).join('') + '</div>' +
            (many ? '<div class="gl-foot gl-foot-shared"><button type="button" class="gl-more">All reminders &amp; expiry dates ›</button></div>' : '') + '</div>';
        glFirstShow = false;

        overlay.querySelector('.gl-x').onclick = () => { haptic.press(); close(); };
        overlay.querySelector('.gl-more').onclick = () => { haptic.press(); close(); showExpiringDocumentsPanel(); };

        overlay.querySelectorAll('.gl-card').forEach(card => {
            const it = items[Number(card.dataset.i)];
            if (!it) return;
            card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                haptic.press();
                const act = btn.dataset.act;
                if (act === 'done') {
                    // Done = acknowledged on this list and the bell only. It never cancels an alarm (user rule).
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
                    card.classList.remove('gl-fly');
                    card.classList.add('gl-out');
                    setTimeout(render, 260);
                    return;
                }
                close();
                if (it.kind === 'doc') {
                    if (act === 'open') revealFileInFolder(it.e.file.name, it.e.folderPath);
                    else {
                        // Edit on a document = the same steps as Add reminder (title, details, date & time), as on the Expiring tab
                        const today = localTodayIso(), fn = it.e.file.name;
                        addReminderFlow(it.e.file.expiryDate && it.e.file.expiryDate >= today ? it.e.file.expiryDate : undefined, null, 'Renew ' + (fn.replace(/\.[^.]+$/, '') || fn));
                    }
                } else {
                    const r = reminders.find(x => x.id === it.r.id);
                    if (!r) { showToast('That reminder has been deleted', true); return; }
                    if (act === 'open') openReminderStickyNote(r.id);
                    else editReminderFlow(r.id);
                }
            }));
        });
    };
