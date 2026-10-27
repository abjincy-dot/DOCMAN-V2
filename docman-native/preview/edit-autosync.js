// Auto-sync for Sync Calendar: a switch inside the Sync Calendar pill. ON = DOCMAN syncs by itself whenever the app is opened or
// comes back to the front, at most once every 6 hours. Pro only. Needs the calendar permission already granted.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) {
    if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80));
    s = s.replace(a, () => b);
}

// ---- sync function: silent "auto" mode ----
rep(`async function syncPhoneCalendar() {
    if (calSyncBusy) return;
    const cal = window.Capacitor?.Plugins?.CalendarImport;
    if (!cal || !cal.getEvents) { showToast('Calendar sync is not available in this version', true); return; }
    // Pro, with one free try (spent only after a sync that worked).
    if (!requireProTool('calsync')) return;
    calSyncBusy = true;
    haptic.press();
    const btn = document.getElementById('expdocSyncCal');
    if (btn) { btn.disabled = true; btn.classList.add('xc-sync-busy'); }
    try {
        let perm = await cal.checkPermissions();
        if (perm.calendar !== 'granted') {
            expectNativeReturn();
            perm = await cal.requestPermissions();
        }
        if (perm.calendar !== 'granted') {
            showToast('Allow calendar access for DOCMAN (phone Settings > Apps > DOCMAN > Permissions) to sync', true);
            return;
        }`,
`// opts.auto = the silent run started by the Auto switch: Pro only, never asks for anything, no free try, speaks only when it changed something.
async function syncPhoneCalendar(opts) {
    const auto = !!(opts && opts.auto);
    if (calSyncBusy) return;
    const cal = window.Capacitor?.Plugins?.CalendarImport;
    if (!cal || !cal.getEvents) { if (!auto) showToast('Calendar sync is not available in this version', true); return; }
    if (auto) {
        if (!entitlement.purchased) return;
    } else if (!requireProTool('calsync')) {   // Pro, with one free try (spent only after a sync that worked).
        return;
    }
    calSyncBusy = true;
    if (!auto) haptic.press();
    const btn = document.getElementById('expdocSyncCal');
    if (btn && !auto) { btn.disabled = true; btn.classList.add('xc-sync-busy'); }
    try {
        let perm = await cal.checkPermissions();
        if (perm.calendar !== 'granted' && auto) {
            // The permission was taken away in Android's settings: say so once and stop trying.
            calSetAuto(false);
            showToast('Auto-sync turned off: DOCMAN no longer has calendar access', true);
            return;
        }
        if (perm.calendar !== 'granted') {
            expectNativeReturn();
            perm = await cal.requestPermissions();
        }
        if (perm.calendar !== 'granted') {
            showToast('Allow calendar access for DOCMAN (phone Settings > Apps > DOCMAN > Permissions) to sync', true);
            return;
        }`);

rep(`        saveReminders();
        await spendFreeTry('calsync');
        // One exact-alarm check for the whole batch, then one alarm per nearby reminder.
        try { await ensureExactAlarmAllowed(); } catch (e) { /* alarms are then inexact */ }
        await armCalendarReminders(true);

        remindersCalMode = false;
        showExpiringDocumentsPanel('reminders', { rerender: true });
        if (!events.length) showToast('No upcoming events found in your phone calendar');
        else if (!added && !updated && !removed) showToast('Calendar is already up to date');
        else showToast('Calendar synced: ' + added + ' added' + (updated ? ', ' + updated + ' updated' : '') + (removed ? ', ' + removed + ' duplicates removed' : '') + (wanted.length >= CAL_MAX_REMINDERS ? ' (nearest ' + CAL_MAX_REMINDERS + ')' : ''));
    } catch (e) {
        console.warn('Calendar sync failed:', e);
        showToast('Could not read the calendar: ' + ((e && e.message) || 'unknown error'), true);
    } finally {
        calSyncBusy = false;
        const b = document.getElementById('expdocSyncCal');
        if (b) { b.disabled = false; b.classList.remove('xc-sync-busy'); }
    }
}`,
`        saveReminders();
        try { localStorage.setItem(CAL_LAST_SYNC_KEY, String(Date.now())); } catch (e) { /* the next check just runs sooner */ }
        if (!auto) {
            await spendFreeTry('calsync');
            // One exact-alarm check for the whole batch (it can open a system screen, so never from the silent run).
            try { await ensureExactAlarmAllowed(); } catch (e) { /* alarms are then inexact */ }
        }
        await armCalendarReminders(!auto);

        const changed = added + updated + removed;
        const detail = added + ' added' + (updated ? ', ' + updated + ' updated' : '') + (removed ? ', ' + removed + ' duplicates removed' : '') + (wanted.length >= CAL_MAX_REMINDERS ? ' (nearest ' + CAL_MAX_REMINDERS + ')' : '');
        if (auto) {
            // Redraw only a Reminders list that is on screen and not in the middle of "Add reminder".
            if (changed && document.getElementById('expdocSyncCal') && !remindersCalMode) showExpiringDocumentsPanel('reminders', { rerender: true });
            if (changed) showToast('Calendar auto-synced: ' + detail);
        } else {
            remindersCalMode = false;
            showExpiringDocumentsPanel('reminders', { rerender: true });
            if (!events.length) showToast('No upcoming events found in your phone calendar');
            else if (!changed) showToast('Calendar is already up to date');
            else showToast('Calendar synced: ' + detail);
        }
    } catch (e) {
        console.warn('Calendar sync failed:', e);
        if (!auto) showToast('Could not read the calendar: ' + ((e && e.message) || 'unknown error'), true);
    } finally {
        calSyncBusy = false;
        const b = document.getElementById('expdocSyncCal');
        if (b) { b.disabled = false; b.classList.remove('xc-sync-busy'); }
    }
}

// ---- Auto-sync switch (inside the Sync Calendar button) -----------------------------------------------------------------
const CAL_AUTO_KEY = 'docman_cal_auto_v1';
const CAL_LAST_SYNC_KEY = 'docman_cal_last_sync_v1';
const CAL_AUTO_EVERY_MS = 6 * 3600000;      // at most one automatic sync every 6 hours
function calAutoOn() {
    try { return localStorage.getItem(CAL_AUTO_KEY) === '1'; } catch (e) { return false; }
}
function calSetAuto(on) {
    try { if (on) localStorage.setItem(CAL_AUTO_KEY, '1'); else localStorage.removeItem(CAL_AUTO_KEY); } catch (e) { /* not remembered */ }
    const sw = document.getElementById('expdocAutoSw');
    if (sw) { sw.classList.toggle('on', !!on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); }
}
async function toggleCalAuto() {
    haptic.press();
    if (calAutoOn()) { calSetAuto(false); showToast('Auto-sync is off'); return; }
    if (!entitlement.purchased) { showPaywall('calauto'); return; }
    const cal = window.Capacitor?.Plugins?.CalendarImport;
    if (!cal || !cal.getEvents) { showToast('Calendar sync is not available in this version', true); return; }
    try {
        let perm = await cal.checkPermissions();
        if (perm.calendar !== 'granted') { expectNativeReturn(); perm = await cal.requestPermissions(); }
        if (perm.calendar !== 'granted') {
            showToast('Allow calendar access for DOCMAN (phone Settings > Apps > DOCMAN > Permissions) to use Auto-sync', true);
            return;
        }
    } catch (e) { showToast('Could not turn Auto-sync on', true); return; }
    calSetAuto(true);
    showToast('Auto-sync is on');
    syncPhoneCalendar({ auto: true });          // the first one now
}
// Called shortly after launch and whenever the app comes back to the front.
function autoSyncCalendarIfDue() {
    if (!calAutoOn() || !entitlement.purchased || calSyncBusy) return;
    let last = 0;
    try { last = Number(localStorage.getItem(CAL_LAST_SYNC_KEY)) || 0; } catch (e) { /* treated as never */ }
    if (Date.now() - last < CAL_AUTO_EVERY_MS) return;
    syncPhoneCalendar({ auto: true });
}`);

// ---- header button markup ----
rep(`'<button id="expdocSyncCal" class="xc-sync" type="button"><i class="fas fa-calendar-days"></i><span>Sync Calendar</span></button>'`,
    `'<button id="expdocSyncCal" class="xc-sync" type="button"><i class="fas fa-calendar-days"></i><span>Sync Calendar</span><span class="xc-sync-sep"></span><span class="xc-sync-auto">AUTO</span><span id="expdocAutoSw" class="xc-autosw' + (calAutoOn() ? ' on' : '') + '" role="switch" aria-label="Auto-sync" aria-checked="' + (calAutoOn() ? 'true' : 'false') + '"></span></button>'`);

// ---- wiring ----
rep(`if (syncBtn) syncBtn.addEventListener('click', () => syncPhoneCalendar());`,
    `if (syncBtn) syncBtn.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('#expdocAutoSw')) { ev.stopPropagation(); toggleCalAuto(); return; }
        syncPhoneCalendar();
    });`);

// ---- paywall chip ----
rep(`        expiry: 'You have set your ' + FREE_EXPIRY_DATES + ' free expiry dates'
    };`, `        expiry: 'You have set your ' + FREE_EXPIRY_DATES + ' free expiry dates',
        calauto: 'Auto-sync is part of DOCMAN Pro'
    };`);

// ---- triggers: launch and coming back to the app ----
rep(`                setTimeout(() => armCalendarReminders(false), 4000);   // after the document alerts, so the alarm budget is counted right`,
    `                setTimeout(() => armCalendarReminders(false), 4000);   // after the document alerts, so the alarm budget is counted right
                setTimeout(() => autoSyncCalendarIfDue(), 7000);`);
rep(`document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLogoDate(); });`,
    `document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateLogoDate(); setTimeout(() => autoSyncCalendarIfDue(), 1500); } });`);

fs.writeFileSync(f, s);
console.log('autosync edited');
