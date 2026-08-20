// ============================================================
// DOCMAN - Document Manager
// Version: 1.0.0
// ============================================================

const APP_VERSION = '1.0.0';

const SETTINGS_KEY = 'docman_settings_v2';
const RECENTS_KEY = 'docman_recents_v1';
const SEARCH_HISTORY_KEY = 'docman_search_history_v1';
const PIN_KEY = 'docman_pin_v2';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

async function hashPin(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// HTML-safe highlighting of the first occurrence of `query` inside `text`.
// Always escapes first, then wraps the match — never trusts raw text.
function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<mark class="search-highlight">${match}</mark>${after}`;
}

const DEPT_COLOR_PALETTE = [
    'linear-gradient(135deg, #2048f9, #142fb7)',
    'linear-gradient(135deg, #3db388, #227a5b)',
    'linear-gradient(135deg, #7f15e4, #4e098f)',
    'linear-gradient(135deg, #d01883, #8e0e56)',
    'linear-gradient(135deg, #dc500c, #a03703)',
    'linear-gradient(135deg, #d39d18, #9a6c03)',
    'linear-gradient(135deg, #368d59, #20663d)',
    'linear-gradient(135deg, #1339dc, #0a2293)'
];
let deptColorCycleIndex = 0;
function getRandomGradient() {
    const color = DEPT_COLOR_PALETTE[deptColorCycleIndex % DEPT_COLOR_PALETTE.length];
    deptColorCycleIndex++;
    return color;
}

function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': 'fa-file-pdf',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'webp': 'fa-file-image',
        'svg': 'fa-file-image',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'csv': 'fa-file-excel'
    };
    return iconMap[ext] || 'fa-file';
}

// Brand-style metadata for the bigger "proper" file badge (folded-corner
// card + extension label), matching Adobe Reader red / Word blue /
// Excel green -- the recognizable colors without using their logos.
function getFileIconMeta(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return { label: 'PDF', color: '#e2483d' };
    if (['doc', 'docx'].includes(ext)) return { label: ext.toUpperCase(), color: '#2b7de9' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: ext.toUpperCase(), color: '#21a366' };
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'heif'].includes(ext)) return { label: ext.toUpperCase(), color: '#a855f7', isImage: true };
    return { label: ext.slice(0, 4).toUpperCase() || 'FILE', color: '#64748b' };
}

// A single inline SVG (generic page-with-fold-and-lines) reused for
// every non-image file type -- inline SVG renders instantly and
// doesn't depend on an icon font finishing its own load, unlike the
// FontAwesome glyphs used elsewhere in the app.
const FILE_ICON_BADGE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>';

// Renders the bigger, brand-colored "proper" file icon badge (folded
// top-right corner + extension label) used by createFileCard. Images
// show a CSS-drawn placeholder (mountains + sun) until their real photo
// thumbnail loads asynchronously and swaps in -- see
// wireFileIconThumbnail. Kept as its own function since a few other
// places that build file rows outside createFileCard can reuse it too.
function renderFileIconBadge(fileName) {
    const meta = getFileIconMeta(fileName);
    if (meta.isImage) {
        return `
            <div class="file-icon-badge file-icon-badge-photo">
                <div class="file-icon-badge-fold"></div>
                <div class="photo-sun"></div>
                <div class="photo-mtn1"></div>
                <div class="photo-mtn2"></div>
                <img class="file-icon-badge-thumb" alt="">
            </div>`;
    }
    return `
        <div class="file-icon-badge" style="--badge-color:${meta.color}">
            <div class="file-icon-badge-fold"></div>
            ${FILE_ICON_BADGE_SVG}
            <span class="file-icon-badge-label">${meta.label}</span>
        </div>`;
}

// Asynchronously loads an image file's actual pixel data and swaps it
// in as the badge's thumbnail (progressive enhancement -- the CSS
// mountain/sun placeholder shows first so the row isn't empty while
// this loads). Call this right after inserting a card built with
// renderFileIconBadge() for an image file.
async function wireFileIconThumbnail(cardEl, file, folderPath) {
    const imgEl = cardEl.querySelector('.file-icon-badge-thumb');
    if (!imgEl) return;
    try {
        let blob = file.fileData instanceof Blob ? file.fileData : null;
        if (!blob && file.dataUrl) {
            imgEl.src = file.dataUrl;
            imgEl.classList.add('file-icon-badge-thumb-loaded');
            return;
        }
        if (!blob) blob = await loadFileData(folderPath, file.name);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        imgEl.onload = () => imgEl.classList.add('file-icon-badge-thumb-loaded');
        imgEl.src = url;
    } catch (e) {
        // Leave the mountain/sun placeholder showing -- not worth
        // surfacing an error just for a thumbnail.
    }
}

function getFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['heic', 'heif'].includes(ext)) return 'heic'; // needs conversion -- browsers can't decode these natively
    if (['pdf'].includes(ext)) return 'pdf';
    if (['docx'].includes(ext)) return 'word';
    if (['doc'].includes(ext)) return 'word-legacy';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
    if (['txt'].includes(ext)) return 'text';
    return 'other';
}

// Raw byte size for a file entry, regardless of where its data actually
// lives (native fsPath entries carry an explicit size, in-memory Blobs
// report their own size, legacy base64 dataUrl entries are estimated).
function getFileBytes(file) {
    if (!file) return 0;
    if (file.size) return file.size;
    if (file.fileData instanceof Blob) return file.fileData.size;
    if (file.dataUrl && typeof file.dataUrl === 'string') return Math.round((file.dataUrl.length * 3) / 4);
    return 0;
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileSizeLabel(file) {
    if (!file) return '';
    return formatBytes(getFileBytes(file));
}

// Recursively sums the byte size of every file inside a folder subtree.
// folderObj is a node from the `fileSystem` tree; pathArr is the full path
// array to that node (used to look up allFiles by its joined key).
function computeFolderSizeBytes(folderObj, pathArr) {
    let total = 0;
    const key = pathArr.join('/');
    if (allFiles[key]) {
        for (const f of allFiles[key]) total += getFileBytes(f);
    }
    for (const k in folderObj) {
        if (folderObj[k] && typeof folderObj[k] === 'object') {
            total += computeFolderSizeBytes(folderObj[k], [...pathArr, k]);
        }
    }
    return total;
}

// ============================================================
// HAPTIC FEEDBACK
// ============================================================

const haptic = (() => {
    const cap = () => window.Capacitor?.Plugins?.Haptics;
    // vibrate() with an explicit short duration is reliably supported on
    // both platforms (unlike selectionChanged, which is mostly an iOS
    // concept and silently no-ops on many Android Haptics plugin
    // implementations -- and since it still returns a Promise, the "??"
    // fallback below never even fired when that happened, so it felt
    // like haptics had gone completely silent).
    const imp = () => {
        const h = cap();
        if (h?.vibrate) { h.vibrate({ duration: 8 }); return; }
        navigator.vibrate?.(8);
    };
    return {
        press:     () => imp(),
        longPress: () => imp(),
        success:   () => imp(),
        warning:   () => imp(),
        toggle:    () => imp(),
    };
})();

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

let toastTimeout = null;

function showToast(msg, isErr = false) {
    const toast = document.getElementById('toast');
    if (!toast) { console.warn('Toast element not found'); return; }

    const span = toast.querySelector('span');
    if (span) span.textContent = msg;

    toast.style.background = isErr
        ? "linear-gradient(135deg, #ef4444, #dc2626)"
        : "linear-gradient(135deg, #10b981, #059669)";

    toast.classList.remove('hidden', 'show');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

// ============================================================
// MODAL SYSTEM
// ============================================================

function showModal({ type = 'confirm', message, defaultVal = '', okLabel, okColor, callback }) {
    const isPrompt = type === 'prompt';
    const id = isPrompt ? 'customPrompt' : 'customConfirm';
    const borderColor = isPrompt ? 'rgba(100,150,255,0.3)' : 'rgba(255,80,80,0.3)';
    const resolvedOkLabel = okLabel || (isPrompt ? 'OK' : 'Delete');
    const resolvedOkColor = okColor || (isPrompt
        ? 'linear-gradient(135deg,#ff6b4a,#e91e8c)'
        : 'linear-gradient(135deg,#ef4444,#dc2626)');

    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(6px);padding:20px;padding-top:12vh;overflow-y:auto;';
    overlay.innerHTML = `
        <div style="position:relative;background:#1a1a1a;border:1px solid ${borderColor};border-radius:20px;padding:28px 24px;width:100%;max-width:360px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
            <button id="modalCloseX" aria-label="Close" style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#e2e8f0;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>
            <p style="color:#ffffff;font-size:0.95rem;font-weight:600;margin-bottom:${isPrompt ? 16 : 24}px;margin-right:26px;font-family:Inter,sans-serif;line-height:1.5;">${message}</p>
            ${isPrompt ? `<input id="modalInput" type="text" value="${defaultVal}" style="width:100%;box-sizing:border-box;padding:12px 16px;border-radius:12px;border:1px solid rgba(100,150,255,0.4);background:rgba(255,255,255,0.06);color:#ffffff;font-size:16px;font-family:Inter,sans-serif;outline:none;margin-bottom:20px;">` : ''}
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="modalCancel" style="padding:10px 22px;border-radius:40px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ffffff;cursor:pointer;font-family:Inter,sans-serif;font-size:0.85rem;">Cancel</button>
                <button id="modalOk" style="padding:10px 22px;border-radius:40px;border:none;background:${resolvedOkColor};color:#fff;cursor:pointer;font-weight:600;font-family:Inter,sans-serif;font-size:0.85rem;">${resolvedOkLabel}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#modalInput');
    if (input) { input.focus();
        input.select(); }

    const close = (val) => { overlay.remove();
        callback(val); };

    overlay.querySelector('#modalOk').onclick = () => close(isPrompt ? input?.value : true);
    overlay.querySelector('#modalCancel').onclick = () => close(isPrompt ? null : false);
    overlay.querySelector('#modalCloseX').onclick = () => close(isPrompt ? null : false);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(isPrompt ? null : false); });
    if (input) input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
    });
}

function showPromptModal(message, defaultVal, callback) {
    showModal({ type: 'prompt', message, defaultVal, callback });
}

function showConfirmModal(message, callback, opts = {}) {
    showModal({ type: 'confirm', message, callback, okLabel: opts.okLabel, okColor: opts.okColor });
}

// Date-picker modal for Expiry Date -- callback receives an ISO date
// string ('YYYY-MM-DD'), or null if cleared/cancelled. Separate from
// showModal since that one only supports a plain text input.
function showDateModal(message, defaultVal, callback) {
    const existing = document.getElementById('customDateModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customDateModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-start;justify-content:center;backdrop-filter:blur(6px);padding:20px;padding-top:12vh;overflow-y:auto;';
    overlay.innerHTML = `
        <div style="position:relative;background:#1a1a1a;border:1px solid rgba(245,158,11,0.35);border-radius:20px;padding:28px 24px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
            <button id="dateModalCloseX" aria-label="Close" style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#e2e8f0;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>
            <p style="color:#ffffff;font-size:0.95rem;font-weight:600;margin-bottom:16px;margin-right:26px;font-family:Inter,sans-serif;line-height:1.5;">${message}</p>
            <input id="dateModalInput" type="date" value="${defaultVal || ''}" style="width:100%;box-sizing:border-box;padding:12px 16px;border-radius:12px;border:1px solid rgba(245,158,11,0.4);background:rgba(255,255,255,0.06);color:#ffffff;font-size:16px;font-family:Inter,sans-serif;outline:none;margin-bottom:20px;color-scheme:dark;">
            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
                ${defaultVal ? `<button id="dateModalClear" style="padding:10px 18px;border-radius:40px;border:1px solid rgba(239,68,68,0.4);background:transparent;color:#f87171;cursor:pointer;font-family:Inter,sans-serif;font-size:0.85rem;">Clear</button>` : ''}
                <button id="dateModalCancel" style="padding:10px 22px;border-radius:40px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ffffff;cursor:pointer;font-family:Inter,sans-serif;font-size:0.85rem;">Cancel</button>
                <button id="dateModalOk" style="padding:10px 22px;border-radius:40px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;cursor:pointer;font-weight:600;font-family:Inter,sans-serif;font-size:0.85rem;">Save</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#dateModalInput');
    const close = (val) => { overlay.remove(); callback(val); };

    overlay.querySelector('#dateModalOk').onclick = () => close(input.value || null);
    overlay.querySelector('#dateModalCancel').onclick = () => close(undefined); // undefined = no change
    overlay.querySelector('#dateModalCloseX').onclick = () => close(undefined);
    const clearBtn = overlay.querySelector('#dateModalClear');
    if (clearBtn) clearBtn.onclick = () => close(null); // null = explicitly cleared
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(undefined); });
}

// ============================================================
// SETTINGS
// ============================================================

const defaultSettings = {
    enableAnimations: true,
    enableParticles: true,
    theme: 'dark',
    pdfOpen: 'docman',  // Internal by default
    pdfThreshold: 50,   // 50MB threshold
    showRecents: true,
    showFavorites: true,
    recentsLimit: 20,
    searchNotes: true,
    searchFileNames: true,
    searchFolderNames: true,
    appLock: false,
    biometricUnlock: false,
    // Seconds of being backgrounded/idle before Auto Lock re-triggers the
    // PIN screen. 0 = lock immediately, -1 = never (only PIN-on-startup
    // applies). Doubles as the Session Timeout duration while foregrounded.
    autoLockSeconds: 0,
    sortMode: 'manual'   // manual | name_asc | name_desc | date_new | date_old | size_large | size_small
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch (e) { return { ...defaultSettings }; }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(docmanSettings));
}

let docmanSettings = loadSettings();

// ============================================================
// INDEXEDDB SETUP
// ============================================================

const DB_NAME = 'DocmanDB';
const DB_VERSION = 12;
let db = null;
let allFiles = {};
let allNotes = {};
let fileSystem = {};
let deptColors = {};
// Per-folder metadata keyed by full path (e.g. "REMELT/FURNACE 1"), kept as a
// sibling map rather than new keys on the fileSystem tree nodes (that tree's
// shape is load-bearing elsewhere). Currently holds { createdAt }, used for
// Date sorting of folders.
let folderMeta = {};
// Soft-deleted items (files/notes/folders) awaiting restore or permanent
// purge. Deleting something normally now moves it here instead of touching
// its actual blob/fsPath data at all — the blob is only ever really removed
// by a Secure Delete (permanentlyDeleteRecycleBinItem). Kept as one more key
// in the existing 'folderStructure' IndexedDB store, same pattern as
// folderMeta/deptColors, so this needs no schema/version bump.
let recycleBin = [];
let currentPath = [];
let isSearchMode = false;
let currentActiveTab = 'pdfs';
let editingNoteId = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            db = req.result;
            resolve();
        };
        req.onupgradeneeded = e => {
            const db2 = e.target.result;
            if (!db2.objectStoreNames.contains('files')) {
                db2.createObjectStore('files', { keyPath: 'id' });
            }
            if (!db2.objectStoreNames.contains('folderStructure')) {
                db2.createObjectStore('folderStructure', { keyPath: 'key' });
            }
            if (!db2.objectStoreNames.contains('notes')) {
                db2.createObjectStore('notes', { keyPath: 'id' });
            }
            if (!db2.objectStoreNames.contains('blobs')) {
                db2.createObjectStore('blobs', { keyPath: 'blobId' });
            }
        };
    });
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

function saveFolderStructure() {
    const tx = db.transaction('folderStructure', 'readwrite');
    tx.objectStore('folderStructure').put({ key: 'structure', value: fileSystem });
}

async function saveDeptColors() {
    try {
        const tx = db.transaction('folderStructure', 'readwrite');
        const store = tx.objectStore('folderStructure');
        await new Promise((resolve, reject) => {
            const req = store.put({ key: 'deptColors', value: deptColors });
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    } catch (e) {
        console.warn('Failed to save dept colors:', e);
    }
}

async function saveFolderMeta() {
    try {
        const tx = db.transaction('folderStructure', 'readwrite');
        const store = tx.objectStore('folderStructure');
        await new Promise((resolve, reject) => {
            const req = store.put({ key: 'folderMeta', value: folderMeta });
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    } catch (e) {
        console.warn('Failed to save folder meta:', e);
    }
}

// Renames every folderMeta entry under oldPath (itself and all descendants)
// to live under newPath, preserving each entry's contents. Used whenever a
// folder is renamed so Date-sort metadata (and future per-folder flags)
// follow the folder instead of being orphaned under the old path.
function migrateFolderMetaPath(oldPath, newPath) {
    const updates = {};
    for (const k of Object.keys(folderMeta)) {
        if (k === oldPath) {
            updates[newPath] = folderMeta[k];
        } else if (k.startsWith(oldPath + '/')) {
            updates[newPath + k.slice(oldPath.length)] = folderMeta[k];
        }
    }
    for (const k of Object.keys(folderMeta)) {
        if (k === oldPath || k.startsWith(oldPath + '/')) delete folderMeta[k];
    }
    Object.assign(folderMeta, updates);
}

// Deletes folderMeta for a folder and all of its descendants. Used when a
// folder is permanently deleted so metadata doesn't accumulate forever.
function deleteFolderMetaPath(path) {
    const prefix = path + '/';
    for (const k of Object.keys(folderMeta)) {
        if (k === path || k.startsWith(prefix)) delete folderMeta[k];
    }
}

// ============================================================
// RECYCLE BIN
// ============================================================
// Deleting a file/note/folder normally moves it here rather than touching
// its blob data at all -- the entry keeps everything needed to splice it
// back into allFiles/allNotes/fileSystem exactly as it was. Only Secure
// Delete (permanentlyDeleteRecycleBinItem) actually removes the underlying
// blob/fsPath data, and only from here.

const RECYCLE_BIN_RETENTION_DAYS = 30;

function genRecycleId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

async function saveRecycleBin() {
    try {
        const tx = db.transaction('folderStructure', 'readwrite');
        const store = tx.objectStore('folderStructure');
        await new Promise((resolve, reject) => {
            const req = store.put({ key: 'recycleBin', value: recycleBin });
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    } catch (e) {
        console.warn('Failed to save recycle bin:', e);
    }
}

// Recreates any missing folder nodes along a path (e.g. the parent folder
// itself was renamed or deleted after this item was trashed) so a restore
// always has somewhere valid to land instead of silently failing.
function ensureFolderPathExists(folderPath) {
    if (!folderPath) return;
    const parts = folderPath.split('/');
    let node = fileSystem;
    for (const part of parts) {
        if (!node[part] || typeof node[part] !== 'object') node[part] = {};
        node = node[part];
    }
}

function uniqueNameFor(name, existingNames) {
    if (!existingNames.includes(name)) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 1;
    let candidate;
    do { candidate = `${base} (restored ${n})${ext}`; n++; } while (existingNames.includes(candidate));
    return candidate;
}

async function moveFileToRecycleBin(folderPath, fileName) {
    const arr = allFiles[folderPath];
    if (!arr) return;
    const idx = arr.findIndex(f => f.name === fileName);
    if (idx === -1) return;
    const [entry] = arr.splice(idx, 1);
    if (!arr.length) delete allFiles[folderPath];
    recycleBin.unshift({ id: genRecycleId(), kind: 'file', name: fileName, folderPath, deletedAt: Date.now(), payload: entry });
    await saveFilesForFolder(folderPath);
    await saveRecycleBin();
}

async function moveNoteToRecycleBin(folderPath, noteId) {
    const arr = allNotes[folderPath];
    if (!arr) return;
    const idx = arr.findIndex(n => n.id === noteId);
    if (idx === -1) return;
    const [entry] = arr.splice(idx, 1);
    if (!arr.length) delete allNotes[folderPath];
    recycleBin.unshift({ id: genRecycleId(), kind: 'note', name: entry.title, folderPath, deletedAt: Date.now(), payload: entry });
    await saveNotesForFolder(folderPath);
    await saveRecycleBin();
}

// pathArr is the full path to the folder being deleted (e.g. ["REMELT","FURNACE 1"]).
async function moveFolderToRecycleBin(pathArr) {
    const path = pathArr.join('/');
    const prefix = path + '/';
    const filesSnapshot = {};
    const notesSnapshot = {};
    const folderMetaSnapshot = {};

    for (const k of Object.keys(allFiles)) {
        if (k === path || k.startsWith(prefix)) { filesSnapshot[k] = allFiles[k];
            delete allFiles[k]; }
    }
    for (const k of Object.keys(allNotes)) {
        if (k === path || k.startsWith(prefix)) { notesSnapshot[k] = allNotes[k];
            delete allNotes[k]; }
    }
    for (const k of Object.keys(folderMeta)) {
        if (k === path || k.startsWith(prefix)) { folderMetaSnapshot[k] = folderMeta[k];
            delete folderMeta[k]; }
    }

    const parentPathArr = pathArr.slice(0, -1);
    const name = pathArr[pathArr.length - 1];
    const parent = parentPathArr.length ? parentPathArr.reduce((o, p) => o?.[p], fileSystem) : fileSystem;
    const treeSnapshot = parent ? parent[name] : {};
    if (parent) delete parent[name];

    recycleBin.unshift({
        id: genRecycleId(),
        kind: 'folder',
        name,
        folderPath: parentPathArr.join('/'),
        deletedAt: Date.now(),
        payload: { fullPath: path, treeSnapshot, filesSnapshot, notesSnapshot, folderMetaSnapshot }
    });

    deleteFolderMetaPath(path);
    await saveFolderStructure();
    await saveAllFilesToDB();
    await saveAllNotesToDB();
    await saveFolderMeta();
    await saveRecycleBin();
}

async function restoreRecycleBinItem(id) {
    const idx = recycleBin.findIndex(r => r.id === id);
    if (idx === -1) return;
    const item = recycleBin[idx];

    if (item.kind === 'file') {
        ensureFolderPathExists(item.folderPath);
        if (!allFiles[item.folderPath]) allFiles[item.folderPath] = [];
        const existingNames = allFiles[item.folderPath].map(f => f.name);
        item.payload.name = uniqueNameFor(item.payload.name, existingNames);
        allFiles[item.folderPath].push(item.payload);
        await saveFilesForFolder(item.folderPath);
    } else if (item.kind === 'note') {
        ensureFolderPathExists(item.folderPath);
        if (!allNotes[item.folderPath]) allNotes[item.folderPath] = [];
        allNotes[item.folderPath].push(item.payload);
        await saveNotesForFolder(item.folderPath);
    } else if (item.kind === 'folder') {
        ensureFolderPathExists(item.folderPath);
        const parent = item.folderPath ? item.folderPath.split('/').reduce((o, p) => o?.[p], fileSystem) : fileSystem;
        const existingNames = Object.keys(parent);
        const restoredName = uniqueNameFor(item.name, existingNames);
        parent[restoredName] = item.payload.treeSnapshot || {};

        const renamed = restoredName !== item.name;
        const newFullPath = (item.folderPath ? item.folderPath + '/' : '') + restoredName;
        for (const k of Object.keys(item.payload.filesSnapshot || {})) {
            const newKey = renamed ? newFullPath + k.slice(item.payload.fullPath.length) : k;
            allFiles[newKey] = item.payload.filesSnapshot[k];
        }
        for (const k of Object.keys(item.payload.notesSnapshot || {})) {
            const newKey = renamed ? newFullPath + k.slice(item.payload.fullPath.length) : k;
            allNotes[newKey] = item.payload.notesSnapshot[k];
        }
        for (const k of Object.keys(item.payload.folderMetaSnapshot || {})) {
            const newKey = renamed ? newFullPath + k.slice(item.payload.fullPath.length) : k;
            folderMeta[newKey] = item.payload.folderMetaSnapshot[k];
        }

        await saveFolderStructure();
        await saveAllFilesToDB();
        await saveAllNotesToDB();
        await saveFolderMeta();
    }

    recycleBin.splice(idx, 1);
    await saveRecycleBin();
    render();
    updateStats();
    showToast('Restored');
}

// Secure Delete — the only path in the whole app that actually removes a
// file's blob/fsPath data once it's in the recycle bin. Irreversible.
//
// The native/blob deletions are explicitly awaited (Promise.all for a
// folder's many files) BEFORE the recycle-bin entry itself is removed and
// saved. Previously these were fire-and-forget: the function could return
// (and the recycle-bin entry disappear) before the underlying delete
// actually completed. If the app was killed in that window, the native
// file/blob would leak forever as a true orphan -- with no recycle-bin
// entry left to even know it needed cleaning up. Waiting for completion
// first, and only then committing the recycle-bin removal, means a kill
// mid-operation leaves the item still in the recycle bin (safe to retry),
// never a silently orphaned file with no record of it anywhere.
async function permanentlyDeleteRecycleBinItem(id, { silent = false } = {}) {
    const idx = recycleBin.findIndex(r => r.id === id);
    if (idx === -1) return;
    const item = recycleBin[idx];

    let failures = 0;
    if (item.kind === 'file') {
        const f = item.payload;
        const ok = f.fsPath ? await deleteFileFromFS(f.fsPath) : await deleteBlobFromDB(item.folderPath, f.name);
        if (!ok) {
            console.warn('Secure Delete: failed to remove file data', f.name);
            failures++;
        }
    } else if (item.kind === 'folder') {
        const deletions = [];
        for (const k of Object.keys(item.payload.filesSnapshot || {})) {
            for (const f of item.payload.filesSnapshot[k]) {
                deletions.push((async () => {
                    const ok = f.fsPath ? await deleteFileFromFS(f.fsPath) : await deleteBlobFromDB(k, f.name);
                    if (!ok) {
                        console.warn('Secure Delete: failed to remove file data', f.name);
                        failures++;
                    }
                })());
            }
        }
        await Promise.all(deletions);
    }
    // Notes carry no separate blob -- their content lives entirely in the
    // recycle bin entry itself, nothing extra to purge.

    recycleBin.splice(idx, 1);
    await saveRecycleBin();
    if (!silent) {
        render();
        updateStats();
        if (failures) {
            showToast('Deleted, but ' + failures + ' file(s) could not be fully removed — check console', true);
        } else {
            showToast('Permanently deleted');
        }
    } else if (failures) {
        console.warn('Secure Delete (silent): completed with', failures, 'failure(s) for item', id);
    }
}

async function emptyRecycleBin() {
    const ids = recycleBin.map(r => r.id);
    for (const id of ids) {
        await permanentlyDeleteRecycleBinItem(id, { silent: true });
    }
    render();
    updateStats();
    showToast('Recycle bin emptied');
}

// Auto-purge on load — anything older than the retention window is gone for
// good, same as most desktop OS recycle bins. Silent (no toasts) since this
// runs unattended at startup.
function purgeExpiredRecycleBinItems() {
    const cutoff = Date.now() - RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const expired = recycleBin.filter(r => r.deletedAt < cutoff);
    if (!expired.length) return;
    (async () => {
        for (const item of expired) {
            await permanentlyDeleteRecycleBinItem(item.id, { silent: true });
        }
    })();
}

function serializeFileEntry(folderPath, f, blobStore) {
    if (f.fsPath) {
        return {
            name: f.name,
            type: f.type,
            uploadedAt: f.uploadedAt || Date.now(),
            favourite: f.favourite || false,
            locked: f.locked || false,
            size: f.size || 0,
            fsPath: f.fsPath,
            expiryDate: f.expiryDate || null
        };
    }
    if (f.fileData instanceof Blob) {
        const blobId = folderPath + '/' + f.name;
        if (blobStore) blobStore.put({ blobId, blob: f.fileData });
        return {
            name: f.name,
            type: f.type,
            uploadedAt: f.uploadedAt || Date.now(),
            favourite: f.favourite || false,
            locked: f.locked || false,
            size: f.fileData.size || 0,
            expiryDate: f.expiryDate || null
        };
    }
    if (f.dataUrl) {
        return {
            name: f.name,
            type: f.type,
            dataUrl: f.dataUrl,
            uploadedAt: f.uploadedAt || Date.now(),
            favourite: f.favourite || false,
            locked: f.locked || false,
            size: f.size || 0,
            expiryDate: f.expiryDate || null
        };
    }
    return {
        name: f.name,
        type: f.type,
        uploadedAt: f.uploadedAt || Date.now(),
        favourite: f.favourite || false,
        locked: f.locked || false,
        size: f.size || 0,
        expiryDate: f.expiryDate || null
    };
}

// Full rewrite of the files metadata store. Used only for bulk operations
// (folder rename/delete, restore/import) that touch many folders at once.
// IMPORTANT: this must NOT clear the 'blobs' store. Blob content is written
// independently (by cacheFileAsBlob / serializeFileEntry) and almost never
// lives in memory as a real Blob for files that were already saved in a
// previous session (they're lazy-loaded on demand). Clearing 'blobs' here
// would delete every file's actual content the moment any single file's
// metadata changes.
async function saveAllFilesToDB(clearBlobs = false) {
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    const fileStore = tx.objectStore('files');
    const blobStore = tx.objectStore('blobs');
    await fileStore.clear();
    // clearBlobs is only safe when every file's blob is guaranteed to be a
    // live Blob in memory right now (e.g. a full backup restore, where the
    // whole in-memory state was just rebuilt from the zip). Never pass true
    // from a normal single-file operation — most files are lazy-loaded and
    // would silently lose their content.
    if (clearBlobs) await blobStore.clear();

    for (const folderPath in allFiles) {
        if (allFiles[folderPath]?.length) {
            const files = allFiles[folderPath].map(f => serializeFileEntry(folderPath, f, blobStore));
            fileStore.put({ id: folderPath, folderPath, files });
        }
    }
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// Scoped save: rewrites only ONE folder's file-metadata record instead of
// clearing and rebuilding the entire 'files' store. This is what favourite
// toggle / rename / delete / add should use — it's what makes those feel
// instant instead of touching every document in the app.
async function saveFilesForFolder(folderPath) {
    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    const fileStore = tx.objectStore('files');
    const blobStore = tx.objectStore('blobs');
    const files = allFiles[folderPath];
    if (!files || !files.length) {
        fileStore.delete(folderPath);
    } else {
        const serialized = files.map(f => serializeFileEntry(folderPath, f, blobStore));
        fileStore.put({ id: folderPath, folderPath, files: serialized });
    }
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// Removes a single file's blob. Call this whenever a file is actually
// deleted (not just renamed/favourited) so blobs don't leak forever.
// Returns true on success (including "already gone" -- nothing left to
// clean up counts as success for the caller), false only on a genuine
// unexpected error, so callers that need to know can actually find out
// instead of this being silently swallowed.
async function deleteBlobFromDB(folderPath, fileName) {
    try {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(folderPath + '/' + fileName);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        return true;
    } catch (e) {
        console.warn('Failed to delete blob:', e);
        return false;
    }
}

// Moves a single file's blob to a new key. Required whenever a file name
// (or its folder path) changes, since the blob is keyed by "folderPath/name".
async function renameBlobInDB(oldFolderPath, oldName, newFolderPath, newName) {
    try {
        const oldId = oldFolderPath + '/' + oldName;
        const newId = newFolderPath + '/' + newName;
        if (oldId === newId) return;
        const tx = db.transaction('blobs', 'readwrite');
        const store = tx.objectStore('blobs');
        const existing = await new Promise((resolve) => {
            const req = store.get(oldId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (existing?.blob) {
            store.put({ blobId: newId, blob: existing.blob });
            store.delete(oldId);
        }
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('Failed to move blob:', e);
    }
}

async function saveAllNotesToDB() {
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    await store.clear();
    for (const folderPath in allNotes) {
        if (allNotes[folderPath]?.length) {
            store.put({ id: folderPath, folderPath, notes: allNotes[folderPath] });
        }
    }
    tx.commit();
}

// Scoped save for a single folder's notes — avoids clearing/rewriting the
// notes of every other folder for a one-note favourite/rename/delete.
async function saveNotesForFolder(folderPath) {
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    const notes = allNotes[folderPath];
    if (!notes || !notes.length) {
        store.delete(folderPath);
    } else {
        store.put({ id: folderPath, folderPath, notes });
    }
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// ============================================================
// FILE DATA LOADING (LAZY)
// ============================================================

async function loadFileData(folderPath, fileName) {
    try {
        // Native storage first — this is the fast path on Android/iOS builds.
        const meta = allFiles[folderPath]?.find(f => f.name === fileName);
        if (meta?.fsPath) {
            const blob = await readBlobFromFS(meta.fsPath);
            if (blob instanceof Blob) return blob;
            // fsPath recorded but the read failed (e.g. file missing) —
            // fall through to the IndexedDB paths below as a safety net.
        }

        // Try the dedicated blobs store first
        const blobId = folderPath + '/' + fileName;
        const blobTx = db.transaction('blobs', 'readonly');
        const blobResult = await new Promise((resolve, reject) => {
            const req = blobTx.objectStore('blobs').get(blobId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (blobResult?.blob instanceof Blob) {
            return blobResult.blob;
        }

        // Fall back to files store (legacy base64 or old inline blob)
        const tx = db.transaction('files', 'readonly');
        const result = await new Promise((resolve, reject) => {
            const req = tx.objectStore('files').get(folderPath);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const fileEntry = result?.files?.find(f => f.name === fileName);
        if (!fileEntry) return null;

        if (fileEntry.fileData instanceof Blob) {
            await cacheFileAsBlob(folderPath, fileName, fileEntry.fileData, fileEntry);
            return fileEntry.fileData;
        }

        if (fileEntry.dataUrl && typeof fileEntry.dataUrl === 'string') {
            try {
                const response = await fetch(fileEntry.dataUrl);
                const blob = await response.blob();
                await cacheFileAsBlob(folderPath, fileName, blob, fileEntry);
                return blob;
            } catch (e) {
                console.warn('Failed to convert base64 to blob:', e);
                return null;
            }
        }

        return null;
    } catch (e) {
        console.warn('Failed to load file data:', e);
        return null;
    }
}

async function cacheFileAsBlob(folderPath, fileName, blob, existingEntry) {
    try {
        // Write blob to dedicated store
        const blobId = folderPath + '/' + fileName;
        const blobTx = db.transaction('blobs', 'readwrite');
        blobTx.objectStore('blobs').put({ blobId, blob });
        await new Promise((resolve, reject) => {
            blobTx.oncomplete = resolve;
            blobTx.onerror = () => reject(blobTx.error);
        });

        // Update files record — strip blob/dataUrl, keep only metadata
        const fileTx = db.transaction('files', 'readwrite');
        const fileStore = fileTx.objectStore('files');
        const result = await new Promise((resolve, reject) => {
            const req = fileStore.get(folderPath);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        if (result) {
            const fileIndex = result.files.findIndex(f => f.name === fileName);
            if (fileIndex !== -1) {
                result.files[fileIndex] = {
                    name: fileName,
                    type: blob.type || existingEntry?.type || 'application/octet-stream',
                    uploadedAt: existingEntry?.uploadedAt || Date.now(),
                    favourite: existingEntry?.favourite || false,
                    locked: existingEntry?.locked || false,
                    size: blob.size,
                    expiryDate: existingEntry?.expiryDate || null
                };
                fileStore.put(result);
            }
        }
        await new Promise((resolve, reject) => {
            fileTx.oncomplete = resolve;
            fileTx.onerror = () => reject(fileTx.error);
        });

        // Update in-memory allFiles
        if (allFiles[folderPath]) {
            const idx = allFiles[folderPath].findIndex(f => f.name === fileName);
            if (idx !== -1) {
                allFiles[folderPath][idx] = {
                    name: fileName,
                    type: blob.type || existingEntry?.type || 'application/octet-stream',
                    fileData: blob,
                    uploadedAt: existingEntry?.uploadedAt || Date.now(),
                    favourite: existingEntry?.favourite || false,
                    locked: existingEntry?.locked || false,
                    size: blob.size,
                    expiryDate: existingEntry?.expiryDate || null,
                    _hasData: true,
                    _isBase64: false
                };
            }
        }
    } catch (e) {
        console.warn('Failed to cache file as blob:', e);
    }
}

// Overwrites an existing file's content in place (same name, same folder)
// with a new blob -- used by the image editor's "Replace Original" action.
// Mirrors the native-fsPath vs IndexedDB-blob split used everywhere else
// in this file: try the fast native path first, fall back to the
// IndexedDB blob cache if there's no fsPath or the native write fails.
async function replaceFileContent(folderPath, fileName, newBlob) {
    const meta = allFiles[folderPath]?.find(f => f.name === fileName);
    if (meta?.fsPath) {
        const fsPath = await writeFileToFS(folderPath, fileName, newBlob);
        if (fsPath) {
            meta.fsPath = fsPath;
            meta.size = newBlob.size;
            meta.type = newBlob.type || meta.type;
            await saveFilesForFolder(folderPath);
            trackActivity('modified', { name: fileName, folderPath, kind: 'file' });
            return true;
        }
        // Native write failed -- fall through to IndexedDB so the edit
        // isn't silently lost.
    }
    await cacheFileAsBlob(folderPath, fileName, newBlob, meta);
    trackActivity('modified', { name: fileName, folderPath, kind: 'file' });
    return true;
}

// Days before expiry to treat a document as "soon" (badge/dashboard
// threshold) -- separate from the two native-notification lead times.
const EXPIRY_SOON_DAYS = 7;

// Returns null if the file has no expiry date, otherwise
// { status: 'overdue'|'soon'|'ok', days } where days is how many days
// remain (negative if already overdue). 'ok' means it has a date set
// but it's further out than EXPIRY_SOON_DAYS -- not shown as a badge,
// but still listed if the caller wants every file with a date.
function getExpiryStatus(file) {
    if (!file.expiryDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(file.expiryDate + 'T00:00:00');
    if (isNaN(expiry.getTime())) return null;
    const days = Math.round((expiry - today) / 86400000);
    const status = days < 0 ? 'overdue' : (days <= EXPIRY_SOON_DAYS ? 'soon' : 'ok');
    return { status, days };
}

// Scans every folder for files with an expiry date within
// thresholdDays (or already overdue). Returns an array of
// { file, folderPath, status, days }, sorted soonest/most-overdue first.
function getAllExpiringFiles(thresholdDays = EXPIRY_SOON_DAYS) {
    const results = [];
    for (const folderPath in allFiles) {
        const files = allFiles[folderPath];
        if (!files) continue;
        for (const file of files) {
            const info = getExpiryStatus(file);
            if (info && info.days <= thresholdDays) {
                results.push({ file, folderPath, status: info.status, days: info.days });
            }
        }
    }
    results.sort((a, b) => a.days - b.days);
    return results;
}

// Sets (or clears, if dateStr is null) a file's expiry date, persists
// it, refreshes the UI, and (re)schedules the native reminder
// notifications for it.
async function setFileExpiryDate(folderPath, fileName, dateStr) {
    const files = allFiles[folderPath];
    if (!files) return;
    const f = files.find(x => x.name === fileName);
    if (!f) return;

    f.expiryDate = dateStr || null;
    await saveFilesForFolder(folderPath);
    await imgScheduleExpiryNotification(folderPath, fileName, dateStr);
    render();
    showToast(dateStr ? `Expiry date set: ${dateStr}` : 'Expiry date cleared');
}

// Native local notifications for expiry reminders (3 days before, and
// on the day itself). Requires @capacitor/local-notifications to be
// installed and synced in the native project -- if it isn't, this is a
// silent no-op (the in-app badge/dashboard/summary-popup reminders
// still work regardless, since those don't depend on this plugin).
function imgNotificationIdFor(folderPath, fileName, offset) {
    // Deterministic small-int ID from the path+file+offset so the same
    // document always maps to the same notification IDs (lets us
    // cancel/reschedule cleanly).
    let hash = 0;
    const s = `${folderPath}/${fileName}/${offset}`;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return hash % 2000000000;
}

async function imgScheduleExpiryNotification(folderPath, fileName, dateStr) {
    const plugin = window.Capacitor?.Plugins?.LocalNotifications;
    if (!plugin) return; // plugin not installed -- in-app reminders still work

    const idThreeDay = imgNotificationIdFor(folderPath, fileName, 3);
    const idOnDay = imgNotificationIdFor(folderPath, fileName, 0);

    try {
        await plugin.cancel({ notifications: [{ id: idThreeDay }, { id: idOnDay }] });
    } catch (e) { /* nothing scheduled yet -- fine */ }

    if (!dateStr) return;

    const expiry = new Date(dateStr + 'T09:00:00'); // 9am local
    const threeDayBefore = new Date(expiry.getTime() - 3 * 86400000);
    const notifications = [];
    if (threeDayBefore > new Date()) {
        notifications.push({
            id: idThreeDay,
            title: 'Document expiring soon',
            body: `${fileName} expires in 3 days`,
            schedule: { at: threeDayBefore },
        });
    }
    if (expiry > new Date()) {
        notifications.push({
            id: idOnDay,
            title: 'Document expires today',
            body: `${fileName} expires today`,
            schedule: { at: expiry },
        });
    }
    if (notifications.length) {
        try {
            const perm = await plugin.checkPermissions();
            if (perm.display !== 'granted') await plugin.requestPermissions();
            await plugin.schedule({ notifications });
        } catch (e) {
            console.warn('Could not schedule expiry notification:', e);
        }
    }
}

// Shown once per app session (see DOMContentLoaded) if any documents
// are expiring soon or overdue.
function checkExpiringDocumentsOnLoad() {
    const expiring = getAllExpiringFiles(EXPIRY_SOON_DAYS);
    if (!expiring.length) return;
    const overdueCount = expiring.filter(e => e.status === 'overdue').length;
    const soonCount = expiring.length - overdueCount;
    let msg;
    if (overdueCount && soonCount) msg = `⚠️ ${overdueCount} expired, ${soonCount} expiring soon`;
    else if (overdueCount) msg = `⚠️ ${overdueCount} document${overdueCount > 1 ? 's' : ''} expired`;
    else msg = `${soonCount} document${soonCount > 1 ? 's' : ''} expiring soon`;
    showConfirmModal(msg, (viewDashboard) => {
        if (viewDashboard) openDashboardView();
    }, { okLabel: 'View', okColor: 'linear-gradient(135deg,#f59e0b,#d97706)' });
}


async function loadAllFileMetadata() {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const results = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    allFiles = {};
    for (const item of results) {
        allFiles[item.folderPath] = item.files.map(f => {
            let size = f.size || 0;
            if (!size && f.fileData instanceof Blob) {
                size = f.fileData.size;
            } else if (!size && f.dataUrl && typeof f.dataUrl === 'string') {
                size = Math.round((f.dataUrl.length * 3) / 4);
            }

            return {
                name: f.name,
                type: f.type,
                uploadedAt: f.uploadedAt || Date.now(),
                favourite: f.favourite || false,
                locked: f.locked || false,
                size: size,
                fsPath: f.fsPath || null,
                fileData: f.fileData instanceof Blob ? f.fileData : null,
                dataUrl: f.dataUrl || null,
                expiryDate: f.expiryDate || null,
                _hasData: !!(f.fsPath || f.fileData instanceof Blob || f.dataUrl),
                _isBase64: !!(f.dataUrl && typeof f.dataUrl === 'string')
            };
        });
    }
}

// ============================================================
// MIGRATION: Convert Base64 to Blob
// ============================================================

async function migrateBase64ToBlob() {
    console.log('Checking for files to migrate...');
    let migrated = 0;

    const tx = db.transaction(['files', 'blobs'], 'readwrite');
    const fileStore = tx.objectStore('files');
    const blobStore = tx.objectStore('blobs');

    const results = await new Promise((resolve, reject) => {
        const req = fileStore.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    for (const item of results) {
        const files = item.files || [];
        let folderChanged = false;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const blobId = item.folderPath + '/' + file.name;

            if (file.dataUrl && typeof file.dataUrl === 'string' && file.dataUrl.startsWith('data:')) {
                try {
                    const response = await fetch(file.dataUrl);
                    const blob = await response.blob();
                    blobStore.put({ blobId, blob });
                    files[i] = {
                        name: file.name,
                        type: file.type || blob.type || 'application/octet-stream',
                        uploadedAt: file.uploadedAt || Date.now(),
                        favourite: file.favourite || false,
                        locked: file.locked || false,
                        size: blob.size
                    };
                    migrated++;
                    folderChanged = true;
                } catch (e) {
                    console.warn('Failed to migrate file:', file.name, e);
                }
            } else if (file.fileData instanceof Blob) {
                blobStore.put({ blobId, blob: file.fileData });
                files[i] = {
                    name: file.name,
                    type: file.type || file.fileData.type || 'application/octet-stream',
                    uploadedAt: file.uploadedAt || Date.now(),
                    favourite: file.favourite || false,
                    locked: file.locked || false,
                    size: file.fileData.size || file.size || 0
                };
                migrated++;
                folderChanged = true;
            }
        }

        if (folderChanged) {
            fileStore.put({ id: item.folderPath, folderPath: item.folderPath, files });
        }
    }

    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });

    if (migrated > 0) {
        console.log(`✅ Migrated ${migrated} files to separate Blob store`);
        showToast(`Migrated ${migrated} files to optimised storage`);
    } else {
        console.log('No files needed migration');
    }

    await loadAllFileMetadata();
    render();
}

// ============================================================
// NATIVE FILE STORAGE (Capacitor Filesystem)
// ------------------------------------------------------------
// Large PDFs used to live entirely inside IndexedDB's blob store.
// Android WebView's IndexedDB implementation is slow for big binaries
// (every read/write goes through structured-clone), which is a real
// contributor to sluggish opens/zoom on large files. On native builds
// we now store the actual PDF bytes as real files in the app's private
// storage (Directory.Data) and keep IndexedDB for metadata only.
// On the PWA/web build (no Capacitor Filesystem), everything falls
// back to the existing IndexedDB blob path unchanged.
// ============================================================

function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function getFilesystemPlugin() {
    return isNativePlatform() ? window.Capacitor?.Plugins?.Filesystem : null;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Single choke point for turning a display filename into a safe native
// filesystem path segment. Filenames come from the OS file picker, camera,
// or Google Drive -- all of which hand back whatever name the source file
// actually has, which is NOT trustworthy input. A crafted name containing
// '..' or '/' could otherwise let a native write escape the app's own
// docs/ directory (path traversal) into other files this app's private
// storage happens to contain (e.g. its own IndexedDB/cache files).
// The display name (f.name, shown in the UI) is left completely
// untouched -- only the physical path actually written to disk is
// sanitized, so this never changes what the user sees.
function sanitizePathSegment(segment) {
    let s = String(segment == null ? '' : segment).trim();
    if (/^\.*$/.test(s)) return '_'; // empty or all-dots ('', '.', '..', '...') -> safe placeholder
    s = s
        .replace(/[\/\\]/g, '_')      // no path separators
        .replace(/\.\./g, '_')        // no traversal sequences
        .replace(/[\x00-\x1f]/g, ''); // no control characters
    if (!s || /^\.*$/.test(s)) s = '_'; // re-check in case replacements left nothing but dots
    if (s.length > 150) s = s.slice(0, 150); // stay well under typical 255-byte filesystem limits
    return s;
}
function fsPathFor(folderPath, fileName) {
    const safeFolder = (folderPath || '').split('/').map(sanitizePathSegment).join('/');
    const safeName = sanitizePathSegment(fileName);
    return 'docs/' + safeFolder + '/' + safeName;
}

// Folder/department names become tree keys that are joined/split on '/'
// throughout the app (folderPath = [...segments].join('/')) -- unlike file
// names, a folder name containing '/' or '\\' would silently corrupt
// navigation by injecting extra tree levels that don't actually exist as
// separate folder objects, not just a native-storage risk. This is the
// single validation point for every folder/department name the user can
// type: New Folder, New Department, and every rename entry point.
function isValidFolderName(name) {
    if (!name || !name.trim()) return false;
    const trimmed = name.trim();
    if (trimmed.length > 100) return false;
    if (/^\.+$/.test(trimmed)) return false; // '.', '..', '...' etc -- not a meaningful name
    // Allowlist, not a blocklist: English letters, digits, spaces, and a
    // small set of basic punctuation. An allowlist is safer here -- with
    // the earlier blocklist approach a single escaping slip let backslash
    // through unnoticed, whereas anything not explicitly allowed here is
    // simply rejected, so there's no character that can be missed.
    return /^[A-Za-z0-9 _\-().&]+$/.test(trimmed);
}

// Writes a blob to native storage. Returns the fsPath on success, or null
// if unavailable/failed — callers should fall back to the IndexedDB blob
// store when this returns null.
async function writeFileToFS(folderPath, fileName, blob) {
    const Filesystem = getFilesystemPlugin();
    if (!Filesystem) return null;
    try {
        const base64 = await blobToBase64(blob);
        const path = fsPathFor(folderPath, fileName);
        await Filesystem.writeFile({ path, data: base64, directory: 'DATA', recursive: true });

        // Verify: read it straight back before trusting this write. If this
        // fails, the caller must NOT delete any existing copy of the file —
        // better to leave it on IndexedDB than lose it to a silent native
        // write failure (seen on some devices/WebView configs).
        const verifyBlob = await readBlobFromFS(path);
        if (!(verifyBlob instanceof Blob) || verifyBlob.size !== blob.size) {
            console.warn('Native write verification failed for', path, '— keeping existing copy.');
            try { await Filesystem.deleteFile({ path, directory: 'DATA' }); } catch (e) { /* best effort cleanup */ }
            return null;
        }
        return path;
    } catch (e) {
        console.warn('Native file write failed, falling back to IndexedDB:', e);
        return null;
    }
}

// Reads a blob back from native storage using Capacitor.convertFileSrc +
// fetch, which hands back a real Blob without a base64 decode round-trip
// in JS — this is the actual speed win over IndexedDB for big PDFs.
async function readBlobFromFS(fsPath) {
    const Filesystem = getFilesystemPlugin();
    if (!Filesystem || !fsPath) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const uriResult = await Filesystem.getUri({ path: fsPath, directory: 'DATA' });
            const fileSrc = window.Capacitor.convertFileSrc(uriResult.uri);
            const resp = await fetch(fileSrc);
            if (!resp.ok) throw new Error('fetch failed: ' + resp.status);
            return await resp.blob();
        } catch (e) {
            if (attempt === 0) {
                await new Promise(r => setTimeout(r, 150));
                continue;
            }
            console.warn('Native file read failed:', e);
            return null;
        }
    }
    return null;
}

// Returns true on success, false on a genuine failure -- callers that only
// want best-effort cleanup can ignore the return value (same as before);
// callers that need to know whether data was actually removed (Erase All
// Data, Restore, Secure Delete) can now check it instead of always
// silently assuming success.
async function deleteFileFromFS(fsPath) {
    const Filesystem = getFilesystemPlugin();
    if (!Filesystem || !fsPath) return false;
    try {
        await Filesystem.deleteFile({ path: fsPath, directory: 'DATA' });
        return true;
    } catch (e) {
        // File may already be gone — not fatal, but still reported as a
        // non-success so callers that count failures see it if it matters.
        console.warn('Native file delete failed (may not exist):', e);
        return false;
    }
}

// Background, one-file-at-a-time migration of existing IndexedDB-stored
// blobs onto native storage. Runs after startup on native builds only.
// Deliberately sequential with no artificial delay removed between awaits
// so it never blocks the main thread for a long stretch — each file's
// write yields back to the event loop naturally via await.
let migrationInProgress = false;
async function migrateFilesToNativeStorage() {
    if (!isNativePlatform() || migrationInProgress) return;
    migrationInProgress = true;
    let migrated = 0;
    try {
        for (const folderPath of Object.keys(allFiles)) {
            const files = allFiles[folderPath] || [];
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (f.fsPath) continue; // already migrated
                const blob = await loadFileData(folderPath, f.name);
                if (!(blob instanceof Blob)) continue;
                const fsPath = await writeFileToFS(folderPath, f.name, blob);
                if (!fsPath) continue; // FS unavailable/failed — leave on IndexedDB
                const oldName = f.name;
                files[i] = {
                    name: f.name,
                    type: f.type || blob.type || 'application/octet-stream',
                    uploadedAt: f.uploadedAt || Date.now(),
                    favourite: f.favourite || false,
                    size: blob.size,
                    fsPath
                };
                // Persist the pointer to the new copy BEFORE touching the old
                // one. If the app is killed between these two lines, the
                // worst case is a harmless orphaned IndexedDB blob -- never
                // a file whose only saved location has already been erased.
                await saveFilesForFolder(folderPath);
                await deleteBlobFromDB(folderPath, oldName);
                migrated++;
            }
        }
        if (migrated > 0) {
            console.log(`✅ Migrated ${migrated} file(s) to native storage`);
        }
    } catch (e) {
        console.warn('Background migration to native storage failed:', e);
    } finally {
        migrationInProgress = false;
    }
}



// ============================================================
// RECENT DOCUMENTS — unified activity log
// ============================================================
// Every open/add/modify of a file or note appends one entry here. Kept
// separate from the old docman_recents_v1 key (left untouched/orphaned for
// backward compatibility — nothing reads it as the source of truth anymore,
// but nothing deletes it either) so this is purely additive.
const ACTIVITY_KEY = 'docman_activity_log_v1';
const ACTIVITY_MAX = 300; // hard cap on raw log length, independent of the user's display limit setting

function loadActivityLog() {
    try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || []; } catch (e) { return []; }
}

function saveActivityLog(list) {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list.slice(0, ACTIVITY_MAX)));
}

// action: 'opened' | 'added' | 'modified'. kind: 'file' | 'note'.
function trackActivity(action, { name, folderPath, kind, noteId }) {
    if (!docmanSettings.showRecents) return;
    const list = loadActivityLog();
    list.unshift({ name, folderPath: folderPath || '', kind, action, noteId, time: Date.now() });
    saveActivityLog(list);
}

// Returns up to `limit` most-recent, de-duplicated entries for one action,
// filtered to items that still actually exist (so a deleted/renamed file
// silently drops out of Recent Documents instead of showing a dead link).
function getRecentByAction(action, limit) {
    const cap = limit || docmanSettings.recentsLimit || 20;
    const seen = new Set();
    const out = [];
    for (const r of loadActivityLog()) {
        if (r.action !== action) continue;
        const key = r.kind + ':' + r.folderPath + ':' + r.name;
        if (seen.has(key)) continue;
        seen.add(key);

        const exists = r.kind === 'note'
            ? !!(allNotes[r.folderPath] && allNotes[r.folderPath].some(n => n.title === r.name || n.id === r.noteId))
            : !!(allFiles[r.folderPath] && allFiles[r.folderPath].some(f => f.name === r.name));
        if (!exists) continue;

        out.push(r);
        if (out.length >= cap) break;
    }
    return out;
}

// Backward-compatible shims for the old single-signal "recents" API, now
// backed by the richer activity log. Old call sites that only pass a file
// name (no folder) still work, just without folder disambiguation.
// ============================================================
// BETTER SEARCH — recent searches + live suggestions
// ============================================================

function loadSearchHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || []; } catch (e) { return []; }
}

function saveSearchHistory(list) {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, 15)));
}

function addSearchHistory(term) {
    term = (term || '').trim();
    if (!term || term.length < 2) return;
    const list = loadSearchHistory().filter(t => t.toLowerCase() !== term.toLowerCase());
    list.unshift(term);
    saveSearchHistory(list);
}

// A search only "counts" as history-worthy once the person has paused on it
// for a moment — avoids saving every half-typed keystroke as its own entry.
let searchHistoryCaptureTimer = null;
function scheduleSearchHistoryCapture(term) {
    clearTimeout(searchHistoryCaptureTimer);
    searchHistoryCaptureTimer = setTimeout(() => addSearchHistory(term), 1200);
}

// Live name-only suggestions (folders/files/notes) as the person types,
// capped and deduped — used to populate the dropdown under the search box.
function getSearchSuggestions(query, limit = 8) {
    const q = query.toLowerCase();
    const out = [];
    const seen = new Set();

    const push = (name, path, icon, kind) => {
        const key = kind + ':' + path + ':' + name;
        if (seen.has(key) || out.length >= limit) return;
        seen.add(key);
        out.push({ name, path, icon, kind });
    };

    const scopeRoot = getCurrentFolderObject() || fileSystem;
    (function walk(obj, pathArr) {
        for (const key in obj) {
            if (!obj[key] || typeof obj[key] !== 'object') continue;
            if (key.toLowerCase().includes(q)) push(key, [...pathArr, key].join('/'), 'fa-folder', 'folder');
            walk(obj[key], [...pathArr, key]);
        }
    })(scopeRoot, [...currentPath]);

    for (const path in allFiles) {
        if (!isWithinSearchScope(path)) continue;
        if (!allFiles[path]) continue;
        for (const f of allFiles[path]) {
            if (f.name.toLowerCase().includes(q)) push(f.name, path, getFileIcon(f.name), 'file');
        }
    }
    for (const path in allNotes) {
        if (!isWithinSearchScope(path)) continue;
        if (!allNotes[path]) continue;
        for (const n of allNotes[path]) {
            if (n.title.toLowerCase().includes(q)) push(n.title, path, 'fa-sticky-note', 'note');
        }
    }
    return out;
}

function renderSearchSuggestions() {
    const box = document.getElementById('searchSuggestions');
    if (!box) return;
    const input = document.getElementById('searchInput');
    const query = input.value.trim();

    let itemsHtml = '';
    if (!query) {
        const history = loadSearchHistory();
        if (!history.length) { box.classList.add('hidden');
            return; }
        itemsHtml = '<div class="search-suggest-heading search-history-heading">' +
                '<span>Recent searches</span>' +
                '<button type="button" class="search-history-clear" id="searchHistoryClearBtn" aria-label="Clear recent searches">Clear</button>' +
            '</div>' +
            history.map(term => `
                <div class="search-suggest-item search-history-item" data-fill="${escapeHtml(term)}">
                    <i class="fas fa-clock-rotate-left"></i>
                    <span>${escapeHtml(term)}</span>
                </div>
            `).join('');
    } else {
        const suggestions = getSearchSuggestions(query);
        if (!suggestions.length) { box.classList.add('hidden');
            return; }
        itemsHtml = suggestions.map(s => `
            <div class="search-suggest-item" data-fill="${escapeHtml(s.name)}">
                <i class="fas ${s.icon}"></i>
                <span>${highlightMatch(s.name, query)}</span>
                <span class="search-suggest-path">${escapeHtml(s.path)}</span>
            </div>
        `).join('');
    }

    box.innerHTML = itemsHtml;
    box.classList.remove('hidden');
    box.querySelectorAll('.search-suggest-item').forEach(el => {
        el.addEventListener('mousedown', (e) => {
            // mousedown (not click) fires before the input's blur, so the
            // suggestion is still in the DOM to read from when tapped.
            e.preventDefault();
            input.value = el.dataset.fill;
            box.classList.add('hidden');
            render();
        });
    });
    const clearBtn = document.getElementById('searchHistoryClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            saveSearchHistory([]);
            box.classList.add('hidden');
        });
    }
}

function loadRecents() {
    return getRecentByAction('opened', docmanSettings.recentsLimit || 20);
}

function trackRecentFile(fileName, folderPath) {
    trackActivity('opened', { name: fileName, folderPath: folderPath || '', kind: 'file' });
}

// ============================================================
// COUNT FUNCTIONS
// ============================================================

function countDepartmentFiles(obj, path = []) {
    let total = 0;
    const folderKey = path.join('/');

    if (allFiles[folderKey]) {
        total += allFiles[folderKey].length;
    }

    for (const key in obj) {
        if (typeof obj[key] === 'object') {
            total += countDepartmentFiles(obj[key], [...path, key]);
        }
    }
    return total;
}

// ============================================================
// NAVIGATION
// ============================================================

function selectDepartment(d) {
    guardFolderEntry([d], () => {
        navigateWithPageTurn(() => {
            currentPath = [d];
            render();
        }, 'forward');
    });
}

// Lock Selected Folders — checked at every point a NEW (not-yet-open)
// folder is about to be entered. Navigating back/up out of a folder you're
// already inside never re-checks; only the forward "open this folder" jump
// does, matching how the feature is meant to feel (like a locked door, not
// a repeated re-prompt on every breadcrumb click).
function guardFolderEntry(pathArr, onAllowed) {
    const path = pathArr.join('/');
    if (folderMeta[path]?.locked) {
        showPinVerifyModal('Locked Folder', (ok) => { if (ok) onAllowed(); });
    } else {
        onAllowed();
    }
}

function goBack() {
    if (currentPath.length && !isSearchMode) {
        navigateWithPageTurn(() => {
            currentPath.pop();
            render();
        }, 'back');
    } else if (isSearchMode) {
        clearSearch();
    }
}

function goHome() {
    if (currentPath.length === 0 && !isSearchMode) return;
    if (isSearchMode) { clearSearch(); return; }
    navigateWithPageTurn(() => {
        currentPath = [];
        render();
    }, 'back');
}

function navigateToBreadcrumb(idx) {
    if (idx === -1 && currentPath.length === 0) return;
    if (idx >= 0 && idx === currentPath.length - 1) return;
    const isGoingBack = idx < currentPath.length - 1;
    navigateWithPageTurn(() => {
        if (idx === -1) currentPath = [];
        else currentPath = currentPath.slice(0, idx + 1);
        render();
    }, isGoingBack ? 'back' : 'forward');
}

function getCurrentFolderObject() {
    return currentPath.reduce((o, p) => o?.[p], fileSystem);
}

function getFilesForCurrentFolder() {
    return allFiles[currentPath.join('/')] || [];
}

function getNotesForCurrentFolder() {
    return allNotes[currentPath.join('/')] || [];
}

// Returns true if folderPathStr (e.g. "REMELT/Motors") is the current
// folder or a sub-folder of it. When currentPath is empty (root), every
// folder is considered in scope — search behaves the same as before at root.
function isWithinSearchScope(folderPathStr) {
    const scope = currentPath.join('/');
    if (!scope) return true;
    return folderPathStr === scope || folderPathStr.startsWith(scope + '/');
}

// ============================================================
// PAGE TRANSITIONS
// ============================================================

// Set on every path-changing navigation (entering a folder, going back,
// jumping via breadcrumb). Used by file/note cards to recognize and ignore
// a stray trailing click below -- see the comment there for why that
// happens.
let lastNavigationAt = 0;

function navigateWithPageTurn(navigationFn, direction = 'forward') {
    lastNavigationAt = Date.now();
    const isForward = direction !== 'back';
    const appEl = document.querySelector('.app');
    if (!appEl) { navigationFn(); return; }

    const contentEl = document.getElementById('content');
    const deptSection = document.getElementById('departmentsSection');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const searchInfoEl = document.getElementById('searchInfo');

    const dynamicEls = [];
    if (contentEl && contentEl.offsetParent !== null) dynamicEls.push(contentEl);
    if (deptSection && deptSection.offsetParent !== null && deptSection.innerHTML.trim()) dynamicEls.push(deptSection);
    if (breadcrumbEl && breadcrumbEl.offsetParent !== null && breadcrumbEl.innerHTML.trim()) dynamicEls.push(breadcrumbEl);
    if (searchInfoEl && searchInfoEl.offsetParent !== null && !searchInfoEl.classList.contains('hidden')) dynamicEls.push(searchInfoEl);

    const originalStyles = dynamicEls.map(el => ({
        el: el,
        transition: el.style.transition,
        transform: el.style.transform,
        opacity: el.style.opacity
    }));

    dynamicEls.forEach(el => {
        el.style.transition = 'none';
    });

    navigationFn();

    const newContentEl = document.getElementById('content');
    const newDeptSection = document.getElementById('departmentsSection');
    const newBreadcrumb = document.getElementById('breadcrumb');
    const newSearchInfo = document.getElementById('searchInfo');

    const newDynamicEls = [];
    if (newContentEl && newContentEl.offsetParent !== null) newDynamicEls.push(newContentEl);
    if (newDeptSection && newDeptSection.offsetParent !== null && newDeptSection.innerHTML.trim()) newDynamicEls.push(newDeptSection);
    if (newBreadcrumb && newBreadcrumb.offsetParent !== null && newBreadcrumb.innerHTML.trim()) newDynamicEls.push(newBreadcrumb);
    if (newSearchInfo && newSearchInfo.offsetParent !== null && !newSearchInfo.classList.contains('hidden')) newDynamicEls.push(newSearchInfo);

    newDynamicEls.forEach(el => {
        el.style.transition = 'none';
        el.style.transform = isForward ? 'translateX(55%)' : 'translateX(-55%)';
        el.style.opacity = '0';
    });

    appEl.offsetHeight;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';
            const dur = '260ms';

            originalStyles.forEach(item => {
                item.el.style.transition = `transform ${dur} ${ease}, opacity ${dur} ${ease}`;
                item.el.style.transform = isForward ? 'translateX(-30%)' : 'translateX(30%)';
                item.el.style.opacity = '0';
            });

            newDynamicEls.forEach(el => {
                el.style.transition = `transform ${dur} ${ease}, opacity ${dur} ${ease}`;
                el.style.transform = 'translateX(0)';
                el.style.opacity = '1';
            });

            setTimeout(() => {
                originalStyles.forEach(item => {
                    item.el.style.transition = item.transition;
                    item.el.style.transform = item.transform;
                    item.el.style.opacity = item.opacity;
                });
                newDynamicEls.forEach(el => {
                    el.style.transition = '';
                    el.style.transform = '';
                    el.style.opacity = '';
                });
            }, 300);
        });
    });
}

// ============================================================
// FILE OPERATIONS
// ============================================================

async function addFileToCurrentFolder(file) {
    const folderPath = currentPath.join('/');
    if (!allFiles[folderPath]) allFiles[folderPath] = [];

    const fsPath = await writeFileToFS(folderPath, file.name, file);
    const fileObj = fsPath
        ? {
            name: file.name,
            type: file.type || 'application/octet-stream',
            uploadedAt: Date.now(),
            favourite: false,
            size: file.size,
            fsPath
        }
        : {
            name: file.name,
            type: file.type || 'application/octet-stream',
            fileData: file,
            uploadedAt: Date.now(),
            favourite: false,
            size: file.size
        };
    allFiles[folderPath].push(fileObj);
    await saveFilesForFolder(folderPath);
    trackActivity('added', { name: fileObj.name, folderPath, kind: 'file' });
    haptic.success();
}

function deleteFileFromFolder(folderPath, fileName) {
    showConfirmModal(`Move "<b>${escapeHtml(fileName)}</b>" to Recycle Bin?`, async (confirmed) => {
        if (confirmed) {
            haptic.warning();
            if (allFiles[folderPath]) {
                await moveFileToRecycleBin(folderPath, fileName);
                render();
                updateStats();
                showToast('Moved to Recycle Bin');
            }
        }
    });
}

// Renaming a file only ever changes its display name -- the underlying
// native fsPath (an explicit stored field, never recomputed from name
// elsewhere) is deliberately left untouched. Same reasoning as
// migrateFilesAndNotesPath: zero native I/O on rename means zero risk to
// the file. Only IndexedDB-blob-stored files (no fsPath) need their
// storage key actually moved, since that key IS reconstructed from
// folderPath+name elsewhere.
async function renameFileInFolder(folderPath, oldName, newName) {
    if (!newName?.trim()) return showToast("Name empty", true);
    if (allFiles[folderPath]) {
        const idx = allFiles[folderPath].findIndex(f => f.name === oldName);
        if (idx !== -1) {
            const entry = allFiles[folderPath][idx];
            if (!entry.fsPath) {
                await renameBlobInDB(folderPath, oldName, folderPath, newName);
            }
            entry.name = newName;
            await saveFilesForFolder(folderPath);
            trackActivity('modified', { name: newName, folderPath, kind: 'file' });
            render();
        }
    }
}

// ============================================================
// NOTE OPERATIONS
// ============================================================

async function addNoteToCurrentFolder(title, content) {
    const folderPath = currentPath.join('/');
    if (!allNotes[folderPath]) allNotes[folderPath] = [];
    const note = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        title: title.trim(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        favourite: false
    };
    allNotes[folderPath].push(note);
    await saveNotesForFolder(folderPath);
    trackActivity('added', { name: note.title, folderPath, kind: 'note', noteId: note.id });
    render();
}

async function updateNote(folderPath, noteId, title, content) {
    const idx = allNotes[folderPath]?.findIndex(n => n.id === noteId);
    if (idx !== -1) {
        allNotes[folderPath][idx].title = title.trim();
        allNotes[folderPath][idx].content = content.trim();
        allNotes[folderPath][idx].updatedAt = new Date().toISOString();
        await saveNotesForFolder(folderPath);
        trackActivity('modified', { name: allNotes[folderPath][idx].title, folderPath, kind: 'note', noteId });
        render();
        return true;
    }
    return false;
}

async function renameNote(folderPath, noteId, newTitle) {
    if (!newTitle?.trim()) return showToast("Title empty", true);
    const idx = allNotes[folderPath]?.findIndex(n => n.id === noteId);
    if (idx !== -1) {
        allNotes[folderPath][idx].title = newTitle.trim();
        await saveNotesForFolder(folderPath);
        trackActivity('modified', { name: allNotes[folderPath][idx].title, folderPath, kind: 'note', noteId });
        render();
    }
}

async function deleteNoteFromFolder(folderPath, noteId) {
    if (allNotes[folderPath]) {
        await moveNoteToRecycleBin(folderPath, noteId);
        render();
        updateStats();
        showToast('Moved to Recycle Bin');
    }
}

async function openNote(note) {
    const folderPath = note.folder || currentPath.join('/');
    if (!(await requirePinIfNoteLocked(folderPath, note.id))) return;
    trackActivity('opened', { name: note.title, folderPath, kind: 'note', noteId: note.id });
    const modal = document.getElementById('noteModal');
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    editingNoteId = note.id;
    document.getElementById('saveNoteBtn').onclick = async () => {
        const newTitle = document.getElementById('noteTitle').value;
        const newContent = document.getElementById('noteContent').value;
        if (newTitle.trim()) {
            await updateNote(note.folder || currentPath.join('/'), note.id, newTitle, newContent);
            closeNoteModal();
        } else showToast("Title empty", true);
    };
    modal.classList.add('show');
}

function openNewNoteModal() {
    editingNoteId = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('saveNoteBtn').onclick = async () => {
        const title = document.getElementById('noteTitle').value;
        const content = document.getElementById('noteContent').value;
        if (title.trim()) { await addNoteToCurrentFolder(title, content);
            closeNoteModal(); } else showToast("Title empty", true);
    };
    document.getElementById('noteModal').classList.add('show');
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('show');
    editingNoteId = null;
}

// ============================================================
// KEYBOARD-AWARE MODAL SIZING
// ============================================================
// On Android, the WebView's layout height doesn't always shrink when the
// on-screen keyboard opens, so a centered modal (sized off the full,
// pre-keyboard viewport) can end up with its footer buttons hidden behind
// the keyboard -- e.g. "Save Note" on the note editor. The Visual Viewport
// API reports the *actually visible* height even when the layout viewport
// doesn't change, so we use it to shrink the open modal to fit whatever
// space is really available, keyboard included.
if (window.visualViewport) {
    const adjustModalsForKeyboard = () => {
        const visibleHeight = window.visualViewport.height;
        const keyboardLikelyOpen = visibleHeight < window.innerHeight * 0.75;
        document.querySelectorAll('.modal.show').forEach(modalEl => {
            modalEl.classList.toggle('keyboard-open', keyboardLikelyOpen);
            const contentEl = modalEl.querySelector('.modal-content');
            if (contentEl) {
                contentEl.style.maxHeight = Math.max(200, visibleHeight - 40) + 'px';
            }
        });
    };
    window.visualViewport.addEventListener('resize', adjustModalsForKeyboard);
    window.visualViewport.addEventListener('scroll', adjustModalsForKeyboard);
}

// ============================================================
// FILE VIEWING / OPENING
// ============================================================

// ============================================================
// GESTURE-SAFE PDF OPEN (Samsung Internet fix)
// ============================================================
// Samsung Internet drops the user-gesture trust after any await.
// So for external PDF mode we must call navigator.share() synchronously
// on the tap, before any async DB reads.
// Strategy:
//   If blob is already in allFiles memory → share immediately (synchronous).
//   If blob needs to be loaded from DB → share() with a Promise trick:
//     We call share() with a File whose data is loaded async. This works
//     because the share() call itself is synchronous (gesture is preserved)
//     even if the file data resolves later.

// Lock Selected PDFs — checked before a locked file is actually opened, via
// either open path (in-app viewer or share/external). Resolves false (and
// leaves the caller to bail out) if the person cancels the PIN prompt.
//
// Guarded against re-entrancy: input can be briefly unreliable right after
// returning from a native Activity (the PDF viewer, in particular), and a
// single tap occasionally firing this twice in quick succession would
// otherwise create a second overlay that immediately replaces the first
// one's -- which looks exactly like the prompt "flashing and disappearing"
// even though nothing was actually wrong with the prompt itself. While one
// is already showing, a second call is simply ignored rather than starting
// a competing one.
let pinVerifyInProgress = false;

function requirePinIfLocked(folderPath, fileName) {
    const f = allFiles[folderPath]?.find(x => x.name === fileName);
    if (!f?.locked) return Promise.resolve(true);
    if (pinVerifyInProgress) return Promise.resolve(false);
    pinVerifyInProgress = true;
    return new Promise((resolve) => {
        showPinVerifyModal('Locked File', (ok) => {
            pinVerifyInProgress = false;
            resolve(!!ok);
        });
    });
}

function requirePinIfNoteLocked(folderPath, noteId) {
    const n = allNotes[folderPath]?.find(x => x.id === noteId);
    if (!n?.locked) return Promise.resolve(true);
    if (pinVerifyInProgress) return Promise.resolve(false);
    pinVerifyInProgress = true;
    return new Promise((resolve) => {
        showPinVerifyModal('Locked Note', (ok) => {
            pinVerifyInProgress = false;
            resolve(!!ok);
        });
    });
}

async function openFileWithGesture(fileEntry, folderPath) {
    if (!(await requirePinIfLocked(folderPath, fileEntry.name))) return;
    trackRecentFile(fileEntry.name, folderPath);

    // Inside the Capacitor Android WebView, navigator.share() is unreliable —
    // on many WebView builds it either doesn't exist, or silently no-ops
    // (no resolve, no reject, no native chooser). The native Capacitor Share
    // plugin (Filesystem.writeFile + Share.share) is what actually works, so
    // on native platforms we go straight there and skip navigator.share().
    if (isNativePlatform()) {
        const fileData = fileEntry.fileData instanceof Blob
            ? fileEntry.fileData
            : await loadFileData(folderPath, fileEntry.name);
        if (!fileData) { showToast('File not found or could not be loaded', true); return; }
        await nativeDownload(fileData, fileEntry.name);
        return;
    }

    // If blob is already in memory, share immediately — zero async gap
    if (fileEntry.fileData instanceof Blob) {
        const file = new File([fileEntry.fileData], fileEntry.name, { type: 'application/pdf' });
        if (navigator.share) {
            try {
                await navigator.share({ files: [file], title: fileEntry.name });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                // fall through to normal openFile
            }
        }
        await handlePdfFile(fileEntry.fileData, fileEntry.name, folderPath);
        return;
    }

    // Blob not in memory yet — load from DB then share
    // We still call navigator.share() as fast as possible after load
    const fileData = await loadFileData(folderPath, fileEntry.name);
    if (!fileData) { showToast('File not found or could not be loaded', true); return; }

    if (navigator.share) {
        const file = new File([fileData], fileEntry.name, { type: 'application/pdf' });
        try {
            await navigator.share({ files: [file], title: fileEntry.name });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }

    // Fallback: blob URL
    const url = URL.createObjectURL(fileData);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function openFile(fileName, folderPath) {
    if (!(await requirePinIfLocked(folderPath, fileName))) return;
    trackRecentFile(fileName, folderPath);

    const fileData = await loadFileData(folderPath, fileName);
    if (!fileData) {
        showToast('File not found or could not be loaded', true);
        return;
    }

    const fileType = getFileType(fileName);

    if (fileType === 'image') {
        openImageViewer(fileData, fileName, folderPath);
    } else if (fileType === 'pdf') {
        await handlePdfFile(fileData, fileName, folderPath);
    } else if (fileType === 'word') {
        openWordViewer(fileData, fileName);
    } else if (fileType === 'excel') {
        openExcelViewer(fileData, fileName);
    } else if (fileType === 'text') {
        openTextViewer(fileData, fileName);
    } else if (fileType === 'word-legacy') {
        showConfirmModal(`Older .doc files can't be previewed in DOCMAN (only .docx).<br>Download "<b>${escapeHtml(fileName)}</b>" to open it in another app?`, (confirmed) => {
            if (confirmed) {
                nativeDownload(fileData, fileName).catch(err => {
                    console.error('Download failed:', err);
                    showToast('Could not download file', true);
                });
            }
        }, { okLabel: 'Download', okColor: 'linear-gradient(135deg,#3b82f6,#2563eb)' });
    } else {
        showConfirmModal(`This file type may not be supported.<br>Download "<b>${escapeHtml(fileName)}</b>"?`, (confirmed) => {
            if (confirmed) {
                nativeDownload(fileData, fileName).catch(err => {
                    console.error('Download failed:', err);
                    showToast('Could not download file', true);
                });
            }
        }, { okLabel: 'Download', okColor: 'linear-gradient(135deg,#3b82f6,#2563eb)' });
    }
}

// ============================================================
// IMAGE VIEWER
// ============================================================

function openImageViewer(fileData, fileName, folderPath) {
    const viewer = document.getElementById('imageViewer');
    const viewerImage = document.getElementById('viewerImage');

    const url = URL.createObjectURL(fileData);
    viewerImage.src = url;
    viewerImage.alt = fileName;

    viewer._currentUrl = url;
    viewer._currentData = fileData;
    viewer._currentName = fileName;
    viewer._currentFolder = folderPath;

    viewer.classList.remove('hidden');

    const img = viewerImage;
    img.style.transform = '';
    img.style.cursor = 'default';
}

function closeImageViewer() {
    const viewer = document.getElementById('imageViewer');
    const img = document.getElementById('viewerImage');

    if (viewer._currentUrl) {
        URL.revokeObjectURL(viewer._currentUrl);
        viewer._currentUrl = null;
    }
    viewer._currentData = null;

    img.src = '';
    img.style.transform = '';
    viewer.classList.add('hidden');
}

// ============================================================
// IMAGE EDITOR (Phase 1: crop, rotate, flip, brightness, contrast,
// undo/redo, reset, zoom/pan, save-as-new / replace-original)
//
// Design: a single "working canvas" holds the current committed pixel
// state. Rotate/flip/crop redraw it directly and are pushed to a small
// history stack (array of canvas clones) for undo/redo. Brightness/
// contrast are applied live via canvas ctx.filter as a *preview* on
// top of the working canvas and only get baked into a new working
// canvas (and pushed to history) right before another discrete action
// or before saving -- so dragging a slider doesn't spam the history.
// ============================================================

const imgEditor = {
    workingCanvas: null,   // current committed pixel state
    history: [],           // array of canvas clones
    historyIndex: -1,
    // Every Adjust slider's CURRENT value is what the handle visually
    // shows -- it never resets to a hidden "0 delta" after a commit.
    // adjustBase (below) tracks what was already baked into
    // workingCanvas last time, so the actual filter applied for preview
    // is (current - base): dragging the handle further changes the
    // image from where it visually is now, while the number on screen
    // always matches the real cumulative value.
    brightness: 0,
    contrast: 0,
    exposure: 0,
    saturation: 0,
    hue: 0,        // 0..360, direct degrees, default 0
    blur: 0,       // 0..20, direct px, default 0
    sepia: 0,      // 0..100, direct %, default 0
    opacity: 100,  // 0..100, direct %, default 100 (fully opaque)
    invert: 0,     // 0..100, direct %, default 0
    sharpen: 0,    // 0..100, direct %, default 0 (convolution-based, not a CSS filter)
    adjustBase: {},   // filled in below from IMG_ADJUST_PROPS defaults
    activeTool: null,
    mimeType: 'image/png',
    zoomScale: 1,
    zoomTranslate: { x: 0, y: 0 },
    textColor: '#ffffff',
    textSize: 36,
    textFont: 'Arial, sans-serif',
    toggleFilterActive: null,     // null | 'grayscale' | 'bw' -- which one-tap filter is currently on
    toggleFilterBefore: null,     // canvas snapshot to restore to when toggled off
};

function imgCloneCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
}

function imgEditorPushHistory() {
    imgEditor.history = imgEditor.history.slice(0, imgEditor.historyIndex + 1);
    imgEditor.history.push({
        canvas: imgCloneCanvas(imgEditor.workingCanvas),
        // adjustBase always matches "current" right after a commit (or
        // was never touched by a pure geometry op like rotate/crop) --
        // snapshotting it here lets Undo/Redo restore the sliders to
        // exactly what they showed at this point, instead of wiping
        // every slider back to 0 regardless of what's actually baked in.
        adjustSnapshot: { ...imgEditor.adjustBase },
    });
    imgEditor.historyIndex = imgEditor.history.length - 1;
    imgEditorUpdateHistoryButtons();
}

// Restores both the pixels AND the slider display values from a given
// history entry -- used by Undo/Redo/Reset so sliders always show the
// true cumulative value for whatever state you've jumped to.
function imgEditorRestoreHistoryEntry(entry) {
    imgEditor.workingCanvas = imgCloneCanvas(entry.canvas);
    IMG_ADJUST_PROPS.forEach(p => {
        const val = entry.adjustSnapshot[p.prop];
        imgEditor[p.prop] = val;
        imgEditor.adjustBase[p.prop] = val;
        imgSetSliderDisplay(p, val);
    });
}

// Config for every Adjust-panel slider: prop (imgEditor state key), elId
// (DOM element), default (neutral value), and toFilter (how a DELTA
// value maps into a CSS filter function -- always fed current-base, so
// this doesn't need to know about baselines itself). Driving everything
// off this list keeps the has-pending/reset/filter-string logic in
// sync as sliders get added.
const IMG_ADJUST_PROPS = [
    { prop: 'brightness', elId: 'imgSliderBrightness', default: 0, toFilter: d => `brightness(${100 + d}%)` },
    { prop: 'contrast',   elId: 'imgSliderContrast',   default: 0, toFilter: d => `contrast(${100 + d}%)` },
    { prop: 'exposure',   elId: 'imgSliderExposure',   default: 0, toFilter: d => `brightness(${100 + d}%)` },
    { prop: 'saturation', elId: 'imgSliderSaturation', default: 0, toFilter: d => `saturate(${100 + d}%)` },
    { prop: 'hue',        elId: 'imgSliderHue',        default: 0, toFilter: d => `hue-rotate(${d}deg)` },
    // blur/sepia/invert are one-directional CSS filters -- there's no
    // negative blur/sepia/invert to "undo" an already-baked amount, so
    // once committed, these can only be increased further, never
    // reduced, through this delta approach. floorOnly marks that; the
    // floor is enforced by clamping the value in the 'input' handler
    // (NOT by moving the slider's `min` attribute -- that broke the
    // thumb's visual position, since a range input renders its thumb
    // at (value-min)/(max-min), and setting min===value always puts
    // the thumb at the very left regardless of the real number).
    { prop: 'blur',       elId: 'imgSliderBlur',       default: 0, toFilter: d => `blur(${Math.max(0, d)}px)`, floorOnly: true },
    { prop: 'sepia',      elId: 'imgSliderSepia',      default: 0, toFilter: d => `sepia(${Math.max(0, d)}%)`, floorOnly: true },
    { prop: 'opacity',    elId: 'imgSliderOpacity',    default: 100, toFilter: d => `opacity(${100 + d}%)` },
    { prop: 'invert',     elId: 'imgSliderInvert',     default: 0, toFilter: d => `invert(${Math.max(0, d)}%)`, floorOnly: true },
    // Sharpen has no CSS filter equivalent -- it's applied as a real
    // convolution pass in imgEditorRender/imgEditorCommitPending
    // (pixelOp marks that; toFilter is a no-op so it's skipped when
    // building the CSS filter string). One-directional like blur/sepia.
    { prop: 'sharpen',    elId: 'imgSliderSharpen',    default: 0, toFilter: () => '', floorOnly: true, pixelOp: true },
];

// Unsharp-mask-style sharpen kernel, strength 0..1. Classic 3x3 kernel:
// center = 1 + 4*strength, orthogonal neighbors = -strength.
function imgApplySharpenConvolution(canvas, strength) {
    if (strength <= 0) return;
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const s = src.data, d = out.data;
    const center = 1 + 4 * strength;
    const edge = -strength;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) {
                const up = y > 0 ? s[i - w * 4 + c] : s[i + c];
                const down = y < h - 1 ? s[i + w * 4 + c] : s[i + c];
                const left = x > 0 ? s[i - 4 + c] : s[i + c];
                const right = x < w - 1 ? s[i + 4 + c] : s[i + c];
                const v = center * s[i + c] + edge * (up + down + left + right);
                d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
            }
            d[i + 3] = s[i + 3];
        }
    }
    ctx.putImageData(out, 0, 0);
}

// Populate the starting baseline once the config (and its defaults) exists.
IMG_ADJUST_PROPS.forEach(p => { imgEditor.adjustBase[p.prop] = p.default; });

// Sets a slider's DOM value AND its numeric value-display span next to
// it in one call -- every place that sets a slider's value
// programmatically (presets, undo/redo, reset) needs both kept in sync.
function imgSetSliderDisplay(p, val) {
    const el = document.getElementById(p.elId);
    if (el) el.value = val;
    const valEl = document.getElementById(p.elId + 'Val');
    if (valEl) valEl.textContent = imgFormatSliderValue(p, val);
}

// Offset-style sliders (brightness/contrast/exposure/saturation) show a
// +/- sign since 0 is their neutral center; direct-style ones (hue,
// blur, sepia, opacity, invert, sharpen) just show the raw number.
function imgFormatSliderValue(p, val) {
    const n = Math.round(val);
    if (p.default === 0 && !p.floorOnly && !p.pixelOp && p.prop !== 'hue') {
        return (n > 0 ? '+' : '') + n;
    }
    return String(n);
}

function imgEditorHasPendingAdjust() {
    return IMG_ADJUST_PROPS.some(p => imgEditor[p.prop] !== imgEditor.adjustBase[p.prop]);
}

// Discards an in-progress drag by snapping the handle back to what's
// already baked into workingCanvas (its base) -- NOT to the slider's
// neutral default, which would misrepresent an image that already has
// a previous commit applied.
function imgEditorRevertPendingToBase() {
    IMG_ADJUST_PROPS.forEach(p => {
        imgEditor[p.prop] = imgEditor.adjustBase[p.prop];
        imgSetSliderDisplay(p, imgEditor.adjustBase[p.prop]);
    });
}

// Full reset to neutral -- both the displayed value AND the baseline go
// back to default. Used when workingCanvas itself is being replaced
// wholesale (fresh editor session, Undo/Redo history jump, Reset to
// Original) since none of the old baseline applies to the new pixels.
function imgEditorZeroAdjustSliders() {
    IMG_ADJUST_PROPS.forEach(p => {
        imgEditor[p.prop] = p.default;
        imgEditor.adjustBase[p.prop] = p.default;
        imgSetSliderDisplay(p, p.default);
    });
}

function imgEditorFilterString() {
    return IMG_ADJUST_PROPS.filter(p => !p.pixelOp)
        .map(p => p.toFilter(imgEditor[p.prop] - imgEditor.adjustBase[p.prop]))
        .join(' ');
}

// Preset combinations of the Adjust sliders. "original" just clears back
// to neutral; the rest set a fixed look. Applying a preset only updates
// the pending slider values (live preview) -- it commits through the
// exact same path as manually dragging a slider (leaving the Adjust
// tool, another discrete edit, or save), so the user can still tweak
// further before it's baked in.
const IMG_PRESETS = {
    original: {},
    vintage: { sepia: 40, saturation: -20, contrast: -10, brightness: 5 },
    cold: { hue: 200, saturation: -10, brightness: 5, contrast: 5 },
    warm: { hue: 340, sepia: 20, saturation: 10, brightness: 5 },
    dramatic: { contrast: 40, saturation: -10, brightness: -5 },
    darken: { brightness: -30, contrast: 10 },
};

function imgEditorApplyPreset(name) {
    if (name === 'original') {
        // A math-based "cancel the filter" approach can't work here:
        // blur/sepia/invert have no negative CSS value to undo what's
        // baked in, and even the reversible properties (brightness/
        // contrast/...) don't perfectly cancel once pixel values have
        // clipped at 0/255. Jumping straight to the very first history
        // entry is the only way to guarantee the TRUE original image,
        // pixel for pixel -- same as pressing Reset.
        imgEditorResetToOriginal();
        return;
    }
    const preset = IMG_PRESETS[name];
    if (!preset) return;
    IMG_ADJUST_PROPS.forEach(p => {
        // Presets are absolute looks, applied on top of whatever's
        // already baked in -- so they set the displayed value to
        // (base + preset amount), same "cumulative" meaning as a
        // manual drag.
        const delta = preset[p.prop] !== undefined ? preset[p.prop] : 0;
        const val = imgEditor.adjustBase[p.prop] + delta;
        imgEditor[p.prop] = val;
        imgSetSliderDisplay(p, val);
    });
    imgEditorRender();
    imgEditorUpdateHistoryButtons();
}

function imgEditorUpdateHistoryButtons() {
    const undoBtn = document.getElementById('imgEditorUndoBtn');
    const redoBtn = document.getElementById('imgEditorRedoBtn');
    if (undoBtn) undoBtn.disabled = imgEditor.historyIndex <= 0 && !imgEditorHasPendingAdjust();
    if (redoBtn) redoBtn.disabled = imgEditor.historyIndex >= imgEditor.history.length - 1;
}

// Applies the ctx.filter preview onto #imgEditorCanvas without touching
// workingCanvas -- called on every slider input for a live preview.
function imgEditorRender() {
    const canvas = document.getElementById('imgEditorCanvas');
    if (!canvas || !imgEditor.workingCanvas) return;
    canvas.width = imgEditor.workingCanvas.width;
    canvas.height = imgEditor.workingCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.filter = imgEditorFilterString();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEditor.workingCanvas, 0, 0);
    ctx.filter = 'none';
    const sharpenDelta = imgEditor.sharpen - imgEditor.adjustBase.sharpen;
    if (sharpenDelta > 0) imgApplySharpenConvolution(canvas, sharpenDelta / 100);
}

// Bakes the pending delta into a new working canvas and commits it as
// ONE history step. The slider handles are left exactly where they
// are (still showing the true cumulative value) -- only their
// baseline moves to match, so nothing visually snaps and re-entering
// Adjust later still shows the real applied numbers. Safe to call even
// if nothing is pending (no-op). Always call this before rotate/flip/
// crop/grayscale/document-mode/text/save so those operations act on
// the true current pixels.
function imgEditorCommitPending() {
    if (!imgEditorHasPendingAdjust()) return;
    const baked = imgCloneCanvas(imgEditor.workingCanvas);
    const ctx = baked.getContext('2d');
    ctx.filter = imgEditorFilterString();
    ctx.drawImage(imgEditor.workingCanvas, 0, 0);
    ctx.filter = 'none';
    const sharpenDelta = imgEditor.sharpen - imgEditor.adjustBase.sharpen;
    if (sharpenDelta > 0) imgApplySharpenConvolution(baked, sharpenDelta / 100);
    imgEditor.workingCanvas = baked;
    IMG_ADJUST_PROPS.forEach(p => { imgEditor.adjustBase[p.prop] = imgEditor[p.prop]; });
    imgEditorInvalidateToggleFilter();
    imgEditorPushHistory();
}

// Grayscale/Document-mode are "toggle" tools: pressing the same button
// again reverts to the pixels from right before it was applied. That
// revert target only makes sense until something else touches the
// canvas -- call this from every other discrete edit (rotate, flip,
// crop, text, undo/redo/reset) so a stale "before" snapshot can never
// be restored on top of a different image state.
function imgEditorInvalidateToggleFilter() {
    imgEditor.toggleFilterActive = null;
    imgEditor.toggleFilterBefore = null;
}

function imgEditorRotate(direction) {
    imgEditorCommitPending();
    imgEditorInvalidateToggleFilter();
    const src = imgEditor.workingCanvas;
    const out = document.createElement('canvas');
    out.width = src.height;
    out.height = src.width;
    const ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((direction === 'left' ? -90 : 90) * Math.PI / 180);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    imgEditor.workingCanvas = out;
    imgEditorPushHistory();
    imgEditorRender();
}

function imgEditorFlip(axis) {
    imgEditorCommitPending();
    imgEditorInvalidateToggleFilter();
    const src = imgEditor.workingCanvas;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.translate(axis === 'h' ? out.width : 0, axis === 'v' ? out.height : 0);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(src, 0, 0);
    imgEditor.workingCanvas = out;
    imgEditorPushHistory();
    imgEditorRender();
}

// One-click grayscale -- desaturates the current pixels and commits
// immediately (a discrete action, same pattern as rotate/flip).
// Toggleable: pressing it again while active reverts to the pixels
// from right before it was applied, instead of requiring Undo.
function imgEditorApplyGrayscale() {
    if (imgEditor.toggleFilterActive === 'grayscale') {
        imgEditor.workingCanvas = imgEditor.toggleFilterBefore;
        imgEditor.toggleFilterActive = null;
        imgEditor.toggleFilterBefore = null;
        imgEditorPushHistory();
        imgEditorRender();
        return;
    }
    imgEditorCommitPending();
    const src = imgEditor.workingCanvas;
    const before = imgCloneCanvas(src);
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    imgEditor.workingCanvas = out;
    imgEditor.toggleFilterActive = 'grayscale';
    imgEditor.toggleFilterBefore = before;
    imgEditorPushHistory();
    imgEditorRender();
}

// One-click "Document mode" -- grayscale + hard black/white threshold,
// for a clean scanned-document look. Fixed threshold, done via manual
// pixel manipulation since CSS has no threshold filter. Toggleable,
// same pattern as grayscale above.
function imgEditorApplyDocumentMode() {
    if (imgEditor.toggleFilterActive === 'bw') {
        imgEditor.workingCanvas = imgEditor.toggleFilterBefore;
        imgEditor.toggleFilterActive = null;
        imgEditor.toggleFilterBefore = null;
        imgEditorPushHistory();
        imgEditorRender();
        return;
    }
    imgEditorCommitPending();
    const src = imgEditor.workingCanvas;
    const before = imgCloneCanvas(src);
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;
    const THRESHOLD = 150;
    for (let i = 0; i < d.length; i += 4) {
        const luminance = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = luminance >= THRESHOLD ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
    imgEditor.workingCanvas = out;
    imgEditor.toggleFilterActive = 'bw';
    imgEditor.toggleFilterBefore = before;
    imgEditorPushHistory();
    imgEditorRender();
}

// One-click "Auto Enhance" -- a simple auto-levels contrast stretch:
// finds the darkest/lightest luminance in the image and stretches that
// range out to the full 0-255 range, per RGB channel. Toggleable, same
// pattern as grayscale/document mode.
function imgEditorApplyAutoEnhance() {
    if (imgEditor.toggleFilterActive === 'autoEnhance') {
        imgEditor.workingCanvas = imgEditor.toggleFilterBefore;
        imgEditor.toggleFilterActive = null;
        imgEditor.toggleFilterBefore = null;
        imgEditorPushHistory();
        imgEditorRender();
        return;
    }
    imgEditorCommitPending();
    const src = imgEditor.workingCanvas;
    const before = imgCloneCanvas(src);
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const imgData = ctx.getImageData(0, 0, out.width, out.height);
    const d = imgData.data;
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] < minR) minR = d[i]; if (d[i] > maxR) maxR = d[i];
        if (d[i + 1] < minG) minG = d[i + 1]; if (d[i + 1] > maxG) maxG = d[i + 1];
        if (d[i + 2] < minB) minB = d[i + 2]; if (d[i + 2] > maxB) maxB = d[i + 2];
    }
    const rangeR = Math.max(1, maxR - minR);
    const rangeG = Math.max(1, maxG - minG);
    const rangeB = Math.max(1, maxB - minB);
    for (let i = 0; i < d.length; i += 4) {
        d[i] = ((d[i] - minR) / rangeR) * 255;
        d[i + 1] = ((d[i + 1] - minG) / rangeG) * 255;
        d[i + 2] = ((d[i + 2] - minB) / rangeB) * 255;
    }
    ctx.putImageData(imgData, 0, 0);
    imgEditor.workingCanvas = out;
    imgEditor.toggleFilterActive = 'autoEnhance';
    imgEditor.toggleFilterBefore = before;
    imgEditorPushHistory();
    imgEditorRender();
}

function imgEditorUndo() {
    if (imgEditorHasPendingAdjust()) {
        // Pending, uncommitted slider change -- discard it first rather
        // than consuming a history step. Reverts to the last-committed
        // baseline, not to 0.
        imgEditorRevertPendingToBase();
        imgEditorRender();
        imgEditorUpdateHistoryButtons();
        return;
    }
    if (imgEditor.historyIndex <= 0) return;
    imgEditor.historyIndex--;
    imgEditorRestoreHistoryEntry(imgEditor.history[imgEditor.historyIndex]);
    imgEditorInvalidateToggleFilter();
    imgEditorRender();
    imgEditorUpdateHistoryButtons();
}

function imgEditorRedo() {
    if (imgEditor.historyIndex >= imgEditor.history.length - 1) return;
    imgEditor.historyIndex++;
    imgEditorRestoreHistoryEntry(imgEditor.history[imgEditor.historyIndex]);
    imgEditorInvalidateToggleFilter();
    imgEditorRender();
    imgEditorUpdateHistoryButtons();
}

function imgEditorResetToOriginal() {
    if (!imgEditor.history.length) return;
    imgEditor.historyIndex = 0;
    imgEditorRestoreHistoryEntry(imgEditor.history[0]);
    imgEditorInvalidateToggleFilter();
    imgEditorRender();
    imgEditorUpdateHistoryButtons();
}

function imgEditorSetTool(tool) {
    // Leaving the Adjust panel for any other tool (or closing it)
    // commits the whole brightness/contrast/saturation session as ONE
    // history step -- this is the only place pending adjustments get
    // baked outside of another discrete edit or save, so a full
    // "Adjust" visit is one undo step, not one per slider.
    if (imgEditor.activeTool === 'adjust' && tool !== 'adjust') {
        imgEditorCommitPending();
    }
    imgEditor.activeTool = tool;
    document.querySelectorAll('.img-editor-tool').forEach(btn => {
        const isToggleActive = (btn.dataset.tool === 'grayscale' && imgEditor.toggleFilterActive === 'grayscale')
            || (btn.dataset.tool === 'bw' && imgEditor.toggleFilterActive === 'bw')
            || (btn.dataset.tool === 'autoEnhance' && imgEditor.toggleFilterActive === 'autoEnhance');
        btn.classList.toggle('active', btn.dataset.tool === tool || isToggleActive);
    });
    const sliderPanel = document.getElementById('imgEditorSliderPanel');
    const textPanel = document.getElementById('imgEditorTextPanel');
    const brushPanel = document.getElementById('imgEditorBrushPanel');
    const cropOverlay = document.getElementById('imgEditorCropOverlay');
    const cropConfirm = document.getElementById('imgEditorCropConfirm');
    const textConfirm = document.getElementById('imgEditorTextConfirm');
    const textOverlay = document.getElementById('imgTextOverlay');
    const scanOverlay = document.getElementById('imgScanOverlay');
    const scanConfirm = document.getElementById('imgEditorScanConfirm');
    const canvas = document.getElementById('imgEditorCanvas');

    sliderPanel.classList.toggle('visible', tool === 'adjust');
    textPanel.classList.toggle('visible', tool === 'text');
    brushPanel.classList.toggle('visible', tool === 'draw' || tool === 'highlight' || tool === 'blurarea');
    cropOverlay.classList.toggle('hidden', tool !== 'crop');
    cropConfirm.classList.toggle('hidden', tool !== 'crop');
    textConfirm.classList.toggle('hidden', tool !== 'text');
    textOverlay.classList.toggle('hidden', tool !== 'text');
    scanOverlay.classList.toggle('hidden', tool !== 'scan');
    scanConfirm.classList.toggle('hidden', tool !== 'scan');
    if (tool !== 'scan') document.getElementById('imgScanStatus').classList.add('hidden');
    // Color swatches don't apply to the blur brush -- there's nothing to
    // pick a color for.
    document.getElementById('imgBrushSwatches').classList.toggle('hidden', tool === 'blurarea');

    // Crop/text/brush/scan math assumes a 1:1 (unzoomed) view -- reset
    // any pinch-zoom pan whenever entering any of those, since
    // pinch-zoom is always available the rest of the time (no separate
    // "Zoom" tool).
    if (tool === 'crop' || tool === 'text' || tool === 'draw' || tool === 'highlight' || tool === 'blurarea' || tool === 'scan') {
        imgEditor.zoomScale = 1;
        imgEditor.zoomTranslate = { x: 0, y: 0 };
        canvas.style.transform = '';
    }

    if (tool === 'crop') {
        imgEditorInitCropBox();
    } else if (tool === 'text') {
        imgEditorInitTextOverlay();
    } else if (tool === 'scan') {
        imgEditorCommitPending();
        imgEditorRender();
        imgEditorWireScanHandles();
        imgEditorInitScanOverlay();
    } else if (tool === 'draw' || tool === 'highlight' || tool === 'blurarea') {
        imgEditorCommitPending();
        imgEditorRender();
    } else if (tool === 'rotate') {
        imgEditorRotate('right');
        imgEditorSetTool(null);
    } else if (tool === 'flip-h') {
        imgEditorFlip('h');
        imgEditorSetTool(null);
    } else if (tool === 'grayscale') {
        imgEditorApplyGrayscale();
        imgEditorSetTool(null);
    } else if (tool === 'bw') {
        imgEditorApplyDocumentMode();
        imgEditorSetTool(null);
    } else if (tool === 'autoEnhance') {
        imgEditorApplyAutoEnhance();
        imgEditorSetTool(null);
    }
}

// ---- Crop box drag/resize ----

function imgEditorInitCropBox() {
    const wrap = document.getElementById('imgEditorCanvasWrap');
    const canvas = document.getElementById('imgEditorCanvas');
    const box = document.getElementById('imgCropBox');
    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const marginX = canvasRect.width * 0.1;
    const marginY = canvasRect.height * 0.1;
    const left = (canvasRect.left - wrapRect.left) + marginX;
    const top = (canvasRect.top - wrapRect.top) + marginY;
    const width = canvasRect.width - marginX * 2;
    const height = canvasRect.height - marginY * 2;

    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = width + 'px';
    box.style.height = height + 'px';
}

function imgEditorWireCropBox() {
    const box = document.getElementById('imgCropBox');
    if (!box || box._wired) return;
    box._wired = true;
    const wrap = document.getElementById('imgEditorCanvasWrap');

    let dragMode = null; // 'move' | 'tl' | 'tr' | 'bl' | 'br'
    let startX = 0, startY = 0, startBox = null;

    function getBoxRect() {
        return { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) };
    }

    function onPointerDown(e, mode) {
        e.preventDefault();
        e.stopPropagation();
        dragMode = mode;
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
        startBox = getBoxRect();
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
        if (!dragMode) return;
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        const wrapRect = wrap.getBoundingClientRect();
        const MIN = 40;

        let { left, top, width, height } = startBox;

        if (dragMode === 'move') {
            left = startBox.left + dx;
            top = startBox.top + dy;
        } else {
            if (dragMode === 'tl') { left = startBox.left + dx; top = startBox.top + dy; width = startBox.width - dx; height = startBox.height - dy; }
            if (dragMode === 'tr') { top = startBox.top + dy; width = startBox.width + dx; height = startBox.height - dy; }
            if (dragMode === 'bl') { left = startBox.left + dx; width = startBox.width - dx; height = startBox.height + dy; }
            if (dragMode === 'br') { width = startBox.width + dx; height = startBox.height + dy; }
        }

        width = Math.max(MIN, width);
        height = Math.max(MIN, height);
        left = Math.max(0, Math.min(left, wrapRect.width - width));
        top = Math.max(0, Math.min(top, wrapRect.height - height));

        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
    }

    function onPointerUp() {
        dragMode = null;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
    }

    box.addEventListener('mousedown', (e) => onPointerDown(e, 'move'));
    box.addEventListener('touchstart', (e) => onPointerDown(e, 'move'), { passive: false });
    box.querySelectorAll('.img-crop-handle').forEach(handle => {
        const mode = handle.dataset.handle;
        handle.addEventListener('mousedown', (e) => onPointerDown(e, mode));
        handle.addEventListener('touchstart', (e) => onPointerDown(e, mode), { passive: false });
    });
}

function imgEditorApplyCrop() {
    const canvas = document.getElementById('imgEditorCanvas');
    const box = document.getElementById('imgCropBox');
    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    const scale = imgEditor.workingCanvas.width / canvasRect.width;
    const sx = Math.max(0, (boxRect.left - canvasRect.left) * scale);
    const sy = Math.max(0, (boxRect.top - canvasRect.top) * scale);
    const sw = Math.min(imgEditor.workingCanvas.width - sx, boxRect.width * scale);
    const sh = Math.min(imgEditor.workingCanvas.height - sy, boxRect.height * scale);

    if (sw < 5 || sh < 5) { imgEditorSetTool(null); return; }

    imgEditorCommitPending();
    imgEditorInvalidateToggleFilter();
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(imgEditor.workingCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    imgEditor.workingCanvas = out;
    imgEditorPushHistory();
    imgEditorRender();
    imgEditorSetTool(null);
}

// ---- Add Text tool ----
// A draggable overlay div sits on top of the canvas reflecting the
// current text/color/size; the user drags it to position, then "Apply
// Text" bakes it into the working canvas at the equivalent pixel
// position (same canvasRect-based scale math as crop).

function imgEditorInitTextOverlay() {
    const overlay = document.getElementById('imgTextOverlay');
    const input = document.getElementById('imgTextInput');
    overlay.textContent = input.value || 'Text';
    overlay.style.color = imgEditor.textColor;
    overlay.style.fontSize = imgEditor.textSize + 'px';
    overlay.style.fontFamily = imgEditor.textFont;
    // Center it over the canvas wrap on first open; if the user already
    // dragged it this session, leave its position alone.
    if (!overlay.style.left) {
        overlay.style.left = '50%';
        overlay.style.top = '50%';
        overlay.style.transform = 'translate(-50%, -50%)';
    }
}

function imgEditorWireTextOverlay() {
    const overlay = document.getElementById('imgTextOverlay');
    if (!overlay || overlay._wired) return;
    overlay._wired = true;
    const wrap = document.getElementById('imgEditorCanvasWrap');

    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function onDown(e) {
        e.preventDefault();
        dragging = true;
        const pt = e.touches ? e.touches[0] : e;
        const rect = overlay.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        startX = pt.clientX;
        startY = pt.clientY;
        startLeft = rect.left - wrapRect.left;
        startTop = rect.top - wrapRect.top;
        // Switch from % + translate centering to absolute px, anchored
        // at the overlay's current on-screen position, so dragging
        // doesn't jump.
        overlay.style.transform = 'none';
        overlay.style.left = startLeft + 'px';
        overlay.style.top = startTop + 'px';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        overlay.style.left = (startLeft + (pt.clientX - startX)) + 'px';
        overlay.style.top = (startTop + (pt.clientY - startY)) + 'px';
    }

    function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
    }

    overlay.addEventListener('mousedown', onDown);
    overlay.addEventListener('touchstart', onDown, { passive: false });
}

function imgEditorApplyText() {
    const canvas = document.getElementById('imgEditorCanvas');
    const overlay = document.getElementById('imgTextOverlay');
    const input = document.getElementById('imgTextInput');
    const text = (input.value || '').trim();
    if (!text) { imgEditorSetTool(null); return; }

    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const scale = imgEditor.workingCanvas.width / canvasRect.width;

    // Overlay has ~6-10px CSS padding around the text baseline -- account
    // for it roughly so the baked text lands where it visually appeared.
    const px = (overlayRect.left - canvasRect.left + 10) * scale;
    const py = (overlayRect.top - canvasRect.top + overlayRect.height / 2) * scale;
    const fontSize = imgEditor.textSize * scale;

    imgEditorCommitPending();
    imgEditorInvalidateToggleFilter();
    const out = imgCloneCanvas(imgEditor.workingCanvas);
    const ctx = out.getContext('2d');
    ctx.font = `700 ${fontSize}px ${imgEditor.textFont}`;
    ctx.fillStyle = imgEditor.textColor;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4 * scale;
    ctx.fillText(text, px, py);
    imgEditor.workingCanvas = out;
    imgEditorPushHistory();
    imgEditorRender();

    // Reset overlay position for next use.
    overlay.style.left = '';
    overlay.style.top = '';
    imgEditorSetTool(null);
}

// ---- Brush tools: Draw, Highlight, Blur Area ----
// All three draw directly onto #imgEditorCanvas as the user drags (so
// the stroke is visible immediately), then on release the canvas's
// current pixels (committed image + finished stroke) become the new
// workingCanvas and get pushed as ONE history step -- each stroke is
// its own undo step, same granularity as everything else in this editor.

const imgBrush = {
    color: '#ff3b30',
    size: 18,
    drawing: false,
    lastX: 0,
    lastY: 0,
};

function imgEditorInitBrushPanel() {
    document.querySelectorAll('.img-brush-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === imgBrush.color);
    });
    const sizeEl = document.getElementById('imgBrushSize');
    if (sizeEl) sizeEl.value = imgBrush.size;
}

function imgBrushCanvasPoint(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (pt.clientX - rect.left) * scaleX, y: (pt.clientY - rect.top) * scaleY };
}

// For the blur brush: stamps a blurred copy of the working image
// (as it was before this stroke started) at the given point, so
// dragging smears a blurred patch along the path instead of drawing a
// solid color.
function imgBrushStampBlur(ctx, canvas, x, y, radius, sourceCanvas) {
    const size = radius * 2;
    const patch = document.createElement('canvas');
    patch.width = size;
    patch.height = size;
    const pctx = patch.getContext('2d');
    pctx.filter = 'blur(6px)';
    pctx.drawImage(sourceCanvas, x - radius, y - radius, size, size, 0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.filter = 'none';
    ctx.drawImage(patch, x - radius, y - radius, size, size);
    ctx.restore();
}

function imgEditorWireBrush() {
    const canvas = document.getElementById('imgEditorCanvas');
    if (!canvas || canvas._brushWired) return;
    canvas._brushWired = true;
    let strokeSourceCanvas = null; // snapshot of the image before this stroke, for the blur brush to sample from

    function isBrushToolActive() {
        return imgEditor.activeTool === 'draw' || imgEditor.activeTool === 'highlight' || imgEditor.activeTool === 'blurarea';
    }

    function strokeAt(ctx, x, y) {
        const tool = imgEditor.activeTool;
        if (tool === 'blurarea') {
            imgBrushStampBlur(ctx, canvas, x, y, imgBrush.size, strokeSourceCanvas);
            return;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = imgBrush.size;
        ctx.strokeStyle = imgBrush.color;
        ctx.globalAlpha = tool === 'highlight' ? 0.35 : 1;
        ctx.globalCompositeOperation = tool === 'highlight' ? 'multiply' : 'source-over';
        ctx.beginPath();
        ctx.moveTo(imgBrush.lastX, imgBrush.lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    function onDown(e) {
        if (!isBrushToolActive()) return;
        e.preventDefault();
        imgBrush.drawing = true;
        strokeSourceCanvas = imgCloneCanvas(imgEditor.workingCanvas);
        const p = imgBrushCanvasPoint(e, canvas);
        imgBrush.lastX = p.x;
        imgBrush.lastY = p.y;
        const ctx = canvas.getContext('2d');
        // A tap without any drag should still leave a dot.
        strokeAt(ctx, p.x, p.y);
    }

    function onMove(e) {
        if (!imgBrush.drawing) return;
        e.preventDefault();
        const p = imgBrushCanvasPoint(e, canvas);
        const ctx = canvas.getContext('2d');
        strokeAt(ctx, p.x, p.y);
        imgBrush.lastX = p.x;
        imgBrush.lastY = p.y;
    }

    function onUp() {
        if (!imgBrush.drawing) return;
        imgBrush.drawing = false;
        strokeSourceCanvas = null;
        // The canvas now shows the committed image plus the finished
        // stroke -- that becomes the new committed pixels.
        imgEditor.workingCanvas = imgCloneCanvas(canvas);
        imgEditorInvalidateToggleFilter();
        imgEditorPushHistory();
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

// ---- Scan: perspective correction (manual corners) ----
// Pure JavaScript -- no external library. An earlier version used
// OpenCV.js for automatic edge detection, but the ~13MB library took
// too long to parse/initialize on many devices (some devices never
// finished within any reasonable timeout), which also meant Straighten
// silently did nothing since it depended on the same library. This
// version has no auto-detect, but Straighten always works instantly:
// the user drags the 4 corners onto the document by hand, and a
// hand-rolled homography warp (solved from the 4 point correspondences,
// then sampled with bilinear interpolation) rectifies it.

const imgScan = {
    corners: null, // [{x,y} x4] in canvas-pixel space, order TL,TR,BR,BL
};

function imgScanUpdateOverlayFromCorners() {
    const wrap = document.getElementById('imgEditorCanvasWrap');
    const canvas = document.getElementById('imgEditorCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scale = canvasRect.width / canvas.width;
    const offX = canvasRect.left - wrapRect.left;
    const offY = canvasRect.top - wrapRect.top;

    const handles = [
        document.getElementById('imgScanHandleTL'),
        document.getElementById('imgScanHandleTR'),
        document.getElementById('imgScanHandleBR'),
        document.getElementById('imgScanHandleBL'),
    ];
    imgScan.corners.forEach((pt, i) => {
        const left = offX + pt.x * scale;
        const top = offY + pt.y * scale;
        handles[i].style.left = left + 'px';
        handles[i].style.top = top + 'px';
    });

    const svg = document.getElementById('imgScanSvg');
    svg.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);
    const polygon = document.getElementById('imgScanPolygon');
    polygon.setAttribute('points', imgScan.corners
        .map(pt => `${offX + pt.x * scale},${offY + pt.y * scale}`)
        .join(' '));
}

// Fits y = m*x + c to a set of {x,y} points via least-squares.
function imgFitLineY(points) {
    const n = points.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-6) return null;
    const m = (n * sxy - sx * sy) / denom;
    const c = (sy - m * sx) / n;
    return { m, c, vertical: false }; // y = m*x + c
}

// Fits x = m*y + c (for near-vertical left/right edges, where fitting
// y-as-function-of-x would be unstable).
function imgFitLineX(points) {
    const n = points.length;
    let sx = 0, sy = 0, sxy = 0, syy = 0;
    for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; syy += p.y * p.y; }
    const denom = n * syy - sy * sy;
    if (Math.abs(denom) < 1e-6) return null;
    const m = (n * sxy - sx * sy) / denom;
    const c = (sx - m * sy) / n;
    return { m, c, vertical: true }; // x = m*y + c
}

// Intersection of a horizontal-ish line (y=m1*x+c1) and a vertical-ish
// line (x=m2*y+c2).
function imgIntersectHV(hLine, vLine) {
    // y = m1*x + c1 ; x = m2*y + c2  ->  x = m2*(m1*x+c1) + c2
    const denom = 1 - hLine.m * vLine.m;
    if (Math.abs(denom) < 1e-6) return null;
    const x = (vLine.m * hLine.c + vLine.c) / denom;
    const y = hLine.m * x + hLine.c;
    return { x, y };
}

// Scans a set of rays inward from one side of a small grayscale buffer,
// returning the {x,y} point of strongest gradient per ray (downscaled
// coordinates). side: 'top'|'bottom'|'left'|'right'.
function imgScanSideEdges(gray, w, h, side, count = 20) {
    const points = [];
    const isHorizontalScan = side === 'top' || side === 'bottom';
    const perpLen = isHorizontalScan ? w : h;
    const scanLen = isHorizontalScan ? h : w;
    const maxDepth = Math.floor(scanLen * 0.45);
    const margin = perpLen * 0.08; // skip near corners, edges are noisy there

    for (let i = 0; i < count; i++) {
        const t = margin + (perpLen - 2 * margin) * (i / (count - 1));
        let bestGrad = 0, bestDepth = -1;
        let prev = null;
        for (let d = 1; d < maxDepth; d++) {
            let x, y;
            if (side === 'top')    { x = t; y = d; }
            else if (side === 'bottom') { x = t; y = h - 1 - d; }
            else if (side === 'left')   { x = d; y = t; }
            else /* right */            { x = w - 1 - d; y = t; }
            x = Math.round(x); y = Math.round(y);
            const v = gray[y * w + x];
            if (prev !== null) {
                const grad = Math.abs(v - prev);
                if (grad > bestGrad) { bestGrad = grad; bestDepth = d; }
            }
            prev = v;
        }
        if (bestGrad > 14 && bestDepth > 0) {
            let x, y;
            if (side === 'top')    { x = t; y = bestDepth; }
            else if (side === 'bottom') { x = t; y = h - 1 - bestDepth; }
            else if (side === 'left')   { x = bestDepth; y = t; }
            else /* right */            { x = w - 1 - bestDepth; y = t; }
            points.push({ x, y });
        }
    }
    return points;
}

// Lightweight document-edge detection -- no external library. Works on
// a small downscaled copy for speed, scans inward from each of the 4
// sides to find the strongest brightness transition (the document's
// edge against the background), fits a line per side, and intersects
// them for the 4 corners. Returns null (caller falls back to the
// default inset rectangle) if the result doesn't look trustworthy --
// e.g. a cluttered background or a document that fills the whole frame
// can make this unreliable, and a bad automatic guess is worse than an
// honest "couldn't tell, drag it yourself".
function imgDetectDocumentCornersLite(canvas) {
    const maxSide = 340;
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * scale));
    const h = Math.max(1, Math.round(canvas.height * scale));

    const small = document.createElement('canvas');
    small.width = w; small.height = h;
    const sctx = small.getContext('2d');
    sctx.drawImage(canvas, 0, 0, w, h);
    const data = sctx.getImageData(0, 0, w, h).data;

    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }

    const topPts = imgScanSideEdges(gray, w, h, 'top');
    const bottomPts = imgScanSideEdges(gray, w, h, 'bottom');
    const leftPts = imgScanSideEdges(gray, w, h, 'left');
    const rightPts = imgScanSideEdges(gray, w, h, 'right');

    // Need most rays per side to have found a real edge, or the fitted
    // line is just noise.
    if (topPts.length < 12 || bottomPts.length < 12 || leftPts.length < 12 || rightPts.length < 12) {
        return null;
    }

    const topLine = imgFitLineY(topPts);
    const bottomLine = imgFitLineY(bottomPts);
    const leftLine = imgFitLineX(leftPts);
    const rightLine = imgFitLineX(rightPts);
    if (!topLine || !bottomLine || !leftLine || !rightLine) return null;

    const tl = imgIntersectHV(topLine, leftLine);
    const tr = imgIntersectHV(topLine, rightLine);
    const br = imgIntersectHV(bottomLine, rightLine);
    const bl = imgIntersectHV(bottomLine, leftLine);
    if (!tl || !tr || !br || !bl) return null;

    // Sanity check: corners should be roughly within frame (allow a
    // small overshoot) and the quad should cover a meaningful area --
    // a sliver or wildly out-of-bounds result means the fit failed.
    const pts = [tl, tr, br, bl];
    const pad = Math.max(w, h) * 0.15;
    for (const p of pts) {
        if (p.x < -pad || p.x > w + pad || p.y < -pad || p.y > h + pad) return null;
    }
    const area = Math.abs(
        (tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y)
    ) + Math.abs(
        (br.x - tr.x) * (bl.y - tr.y) - (bl.x - tr.x) * (br.y - tr.y)
    );
    if (area < w * h * 0.18) return null;

    const inv = 1 / scale;
    const clampPt = (p) => ({
        x: Math.max(0, Math.min(canvas.width, p.x * inv)),
        y: Math.max(0, Math.min(canvas.height, p.y * inv)),
    });
    return [clampPt(tl), clampPt(tr), clampPt(br), clampPt(bl)];
}

function imgEditorInitScanOverlay() {
    const overlay = document.getElementById('imgScanOverlay');
    const canvas = imgEditor.workingCanvas;

    const detected = imgDetectDocumentCornersLite(canvas);
    if (detected) {
        imgScan.corners = detected;
    } else {
        // Fallback: a rectangle inset ~10% from the full image, so
        // there's visibly something to drag onto the document's actual
        // edges, rather than corners sitting exactly on the frame border.
        const mx = canvas.width * 0.1;
        const my = canvas.height * 0.1;
        imgScan.corners = [
            { x: mx, y: my }, { x: canvas.width - mx, y: my },
            { x: canvas.width - mx, y: canvas.height - my }, { x: mx, y: canvas.height - my },
        ];
    }
    overlay.classList.remove('hidden');
    imgScanUpdateOverlayFromCorners();
}

function imgEditorWireScanHandles() {
    const handles = ['imgScanHandleTL', 'imgScanHandleTR', 'imgScanHandleBR', 'imgScanHandleBL']
        .map(id => document.getElementById(id));
    if (!handles[0] || handles[0]._wired) return;
    handles.forEach(h => { h._wired = true; });

    const wrap = document.getElementById('imgEditorCanvasWrap');
    const canvas = document.getElementById('imgEditorCanvas');
    let dragIndex = -1;

    function onDown(e, index) {
        e.preventDefault();
        e.stopPropagation();
        dragIndex = index;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
    }

    function onMove(e) {
        if (dragIndex < 0) return;
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        const canvasRect = canvas.getBoundingClientRect();
        const scale = canvas.width / canvasRect.width;
        let x = (pt.clientX - canvasRect.left) * scale;
        let y = (pt.clientY - canvasRect.top) * scale;
        x = Math.max(0, Math.min(canvas.width, x));
        y = Math.max(0, Math.min(canvas.height, y));
        imgScan.corners[dragIndex] = { x, y };
        imgScanUpdateOverlayFromCorners();
    }

    function onUp() {
        dragIndex = -1;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
    }

    handles.forEach((h, i) => {
        h.addEventListener('mousedown', (e) => onDown(e, i));
        h.addEventListener('touchstart', (e) => onDown(e, i), { passive: false });
    });
}

// Solves the 8-unknown linear system for a 2D projective transform
// mapping each fromPts[i] -> toPts[i] (4 point correspondences).
// Returns [a,b,c,d,e,f,g,h] such that:
//   toX = (a*x + b*y + c) / (g*x + h*y + 1)
//   toY = (d*x + e*y + f) / (g*x + h*y + 1)
// via straightforward Gaussian elimination with partial pivoting.
function imgSolveProjective(fromPts, toPts) {
    const A = [];
    const B = [];
    for (let i = 0; i < 4; i++) {
        const { x, y } = fromPts[i];
        const { x: X, y: Y } = toPts[i];
        A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push(X);
        A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push(Y);
    }
    // Augment and eliminate.
    for (let i = 0; i < 8; i++) A[i].push(B[i]);
    for (let col = 0; col < 8; col++) {
        let pivot = col;
        for (let r = col + 1; r < 8; r++) {
            if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        }
        [A[col], A[pivot]] = [A[pivot], A[col]];
        const pv = A[col][col] || 1e-12;
        for (let r = 0; r < 8; r++) {
            if (r === col) continue;
            const factor = A[r][col] / pv;
            for (let c = col; c <= 8; c++) A[r][c] -= factor * A[col][c];
        }
    }
    return A.map((row, i) => row[8] / (A[i][i] || 1e-12));
}

// Warps srcCanvas so that the quad `corners` becomes the full
// outW x outH rectangle, using bilinear-sampled inverse mapping (walk
// every OUTPUT pixel, find where it came from in the source -- avoids
// gaps that a forward/"push" warp would leave).
function imgWarpPerspective(srcCanvas, corners, outW, outH) {
    const [tl, tr, br, bl] = corners;
    const rectPts = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
    // Map OUTPUT rectangle -> SOURCE quad directly, so each output pixel
    // gives us exactly the source coordinate to sample (no matrix
    // inversion needed).
    const [a, b, c, d, e, f, g, h] = imgSolveProjective(rectPts, corners);

    const sctx = srcCanvas.getContext('2d');
    const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
    const sw = srcCanvas.width, sh = srcCanvas.height;

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(outW, outH);
    const od = outImg.data;

    for (let Y = 0; Y < outH; Y++) {
        for (let X = 0; X < outW; X++) {
            const denom = g * X + h * Y + 1;
            const sx = (a * X + b * Y + c) / denom;
            const sy = (d * X + e * Y + f) / denom;
            const oi = (Y * outW + X) * 4;
            if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
                od[oi + 3] = 0; // outside the source -- transparent
                continue;
            }
            // Bilinear interpolation between the 4 nearest source pixels.
            const x0 = sx | 0, y0 = sy | 0;
            const fx = sx - x0, fy = sy - y0;
            const i00 = (y0 * sw + x0) * 4;
            const i10 = i00 + 4;
            const i01 = i00 + sw * 4;
            const i11 = i01 + 4;
            for (let ch = 0; ch < 4; ch++) {
                const top = srcData[i00 + ch] * (1 - fx) + srcData[i10 + ch] * fx;
                const bot = srcData[i01 + ch] * (1 - fx) + srcData[i11 + ch] * fx;
                od[oi + ch] = top * (1 - fy) + bot * fy;
            }
        }
    }
    octx.putImageData(outImg, 0, 0);
    return out;
}

function imgEditorApplyScan() {
    if (!imgScan.corners) { imgEditorSetTool(null); return; }
    imgEditorCommitPending();
    const src = imgEditor.workingCanvas;
    const [tl, tr, br, bl] = imgScan.corners;

    const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
    const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);
    const outW = Math.max(1, Math.round(Math.max(widthTop, widthBottom)));
    const outH = Math.max(1, Math.round(Math.max(heightLeft, heightRight)));

    try {
        const out = imgWarpPerspective(src, [tl, tr, br, bl], outW, outH);
        imgEditor.workingCanvas = out;
        imgEditorInvalidateToggleFilter();
        imgEditorPushHistory();
        imgEditorRender();
    } catch (e) {
        console.error('imgEditorApplyScan failed:', e);
        showToast('Could not straighten image', true);
    }
    imgEditorSetTool(null);
}

// ---- Zoom / pan (view-only, resets before crop) ----

function imgEditorWireZoomPan() {
    const wrap = document.getElementById('imgEditorCanvasWrap');
    const canvas = document.getElementById('imgEditorCanvas');
    if (!wrap || wrap._zoomWired) return;
    wrap._zoomWired = true;

    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let panOrigin = { x: 0, y: 0 };

    function applyTransform() {
        canvas.style.transform = `translate(${imgEditor.zoomTranslate.x}px, ${imgEditor.zoomTranslate.y}px) scale(${imgEditor.zoomScale})`;
    }

    wrap.addEventListener('wheel', (e) => {
        if (imgEditor.activeTool === 'crop' || imgEditor.activeTool === 'text' || imgEditor.activeTool === 'draw' || imgEditor.activeTool === 'highlight' || imgEditor.activeTool === 'blurarea' || imgEditor.activeTool === 'scan') return;
        e.preventDefault();
        imgEditor.zoomScale = Math.min(4, Math.max(1, imgEditor.zoomScale - e.deltaY * 0.0015));
        applyTransform();
    }, { passive: false });

    wrap.addEventListener('touchstart', (e) => {
        if (imgEditor.activeTool === 'crop' || imgEditor.activeTool === 'text' || imgEditor.activeTool === 'draw' || imgEditor.activeTool === 'highlight' || imgEditor.activeTool === 'blurarea' || imgEditor.activeTool === 'scan') return;
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDist = Math.hypot(dx, dy);
            pinchStartScale = imgEditor.zoomScale;
        } else if (e.touches.length === 1 && imgEditor.zoomScale > 1) {
            panning = true;
            panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            panOrigin = { ...imgEditor.zoomTranslate };
        }
    }, { passive: true });

    wrap.addEventListener('touchmove', (e) => {
        if (imgEditor.activeTool === 'crop' || imgEditor.activeTool === 'text' || imgEditor.activeTool === 'draw' || imgEditor.activeTool === 'highlight' || imgEditor.activeTool === 'blurarea' || imgEditor.activeTool === 'scan') return;
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            imgEditor.zoomScale = Math.min(4, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
            applyTransform();
        } else if (panning && e.touches.length === 1) {
            e.preventDefault();
            imgEditor.zoomTranslate = {
                x: panOrigin.x + (e.touches[0].clientX - panStart.x),
                y: panOrigin.y + (e.touches[0].clientY - panStart.y)
            };
            applyTransform();
        }
    }, { passive: false });

    wrap.addEventListener('touchend', () => { panning = false; });
}

// ---- Open / close / save ----

async function openImageEditor() {
    const viewer = document.getElementById('imageViewer');
    const editor = document.getElementById('imageEditor');
    if (!viewer._currentData) return;
    // Guard against re-entry: if the editor is already open, a duplicate
    // trigger (e.g. a stray click reaching the "Edit" button underneath)
    // must NOT re-run this and silently wipe out all edits made so far.
    if (!editor.classList.contains('hidden')) return;

    imgEditor.mimeType = viewer._currentData.type || 'image/png';

    const bitmap = await createImageBitmap(viewer._currentData);
    const base = document.createElement('canvas');
    base.width = bitmap.width;
    base.height = bitmap.height;
    base.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close?.();

    imgEditor.workingCanvas = base;
    imgEditor.historyIndex = 0;
    imgEditorZeroAdjustSliders();
    imgEditor.history = [{ canvas: imgCloneCanvas(base), adjustSnapshot: { ...imgEditor.adjustBase } }];
    imgEditor.activeTool = null;
    imgEditor.zoomScale = 1;
    imgEditor.zoomTranslate = { x: 0, y: 0 };
    imgEditor.textColor = '#ffffff';
    imgEditor.textSize = 36;
    imgEditor.textFont = 'Arial, sans-serif';
    imgEditor.toggleFilterActive = null;
    imgEditor.toggleFilterBefore = null;

    document.getElementById('imgEditorCanvas').style.transform = '';

    const textOverlay = document.getElementById('imgTextOverlay');
    textOverlay.style.left = '';
    textOverlay.style.top = '';
    const textInput = document.getElementById('imgTextInput');
    if (textInput) textInput.value = 'Text';
    const textSize = document.getElementById('imgTextSize');
    if (textSize) textSize.value = 36;
    document.querySelectorAll('.img-text-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.color === '#ffffff'));
    document.querySelectorAll('.img-text-font').forEach(fb => fb.classList.toggle('active', fb.dataset.font === 'Arial, sans-serif'));

    editor.classList.remove('hidden');
    document.getElementById('imgExitModal').classList.add('hidden');
    // Belt-and-braces: the editor is a full-screen opaque overlay and
    // should already block every click to whatever is behind it, but
    // disabling pointer-events on the viewer underneath removes any
    // possibility of a click reaching its Close/Edit buttons while the
    // editor is up, regardless of any stacking/layout edge case.
    viewer.style.pointerEvents = 'none';
    imgEditorSetTool(null);
    imgEditorRender();
    imgEditorUpdateHistoryButtons();
    imgEditorWireCropBox();
    imgEditorWireZoomPan();
    imgEditorWireTextOverlay();
    imgEditorWireBrush();
    imgEditorInitBrushPanel();
}

function closeImageEditor() {
    document.getElementById('imageEditor').classList.add('hidden');
    document.getElementById('imageViewer').style.pointerEvents = '';
    imgEditor.workingCanvas = null;
    imgEditor.history = [];
    imgEditor.historyIndex = -1;
}

function imgEditorHasEdits() {
    return imgEditor.historyIndex > 0 || imgEditorHasPendingAdjust();
}

function imgEditorCancel() {
    if (imgEditorHasEdits()) {
        document.getElementById('imgExitModal').classList.remove('hidden');
    } else {
        closeImageEditor();
    }
}

function imgEditorExitModalHide() {
    document.getElementById('imgExitModal').classList.add('hidden');
}

function imgEditorExportBlob() {
    imgEditorCommitPending();
    return new Promise((resolve) => {
        imgEditor.workingCanvas.toBlob((blob) => resolve(blob), imgEditor.mimeType, 0.92);
    });
}

async function imgEditorSaveAsNew() {
    const viewer = document.getElementById('imageViewer');
    const folderPath = viewer._currentFolder;
    const originalName = viewer._currentName || 'image.png';
    if (folderPath === undefined || folderPath === null) {
        showToast('Could not determine folder to save to', true);
        return;
    }

    const blob = await imgEditorExportBlob();
    if (!blob) { showToast('Could not export edited image', true); return; }

    const dotIdx = originalName.lastIndexOf('.');
    const base = dotIdx > -1 ? originalName.slice(0, dotIdx) : originalName;
    const ext = dotIdx > -1 ? originalName.slice(dotIdx) : '';
    let newName = `${base}_edited${ext}`;
    let n = 2;
    const existingNames = new Set((allFiles[folderPath] || []).map(f => f.name));
    while (existingNames.has(newName)) {
        newName = `${base}_edited(${n})${ext}`;
        n++;
    }

    const file = new File([blob], newName, { type: blob.type });
    await addFileToCurrentFolder(file);
    render();
    updateStats();
    showToast('Saved as new image');
    closeImageEditor();
    closeImageViewer();
}

async function imgEditorSaveAsPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library not available', true);
        return;
    }
    const viewer = document.getElementById('imageViewer');
    const folderPath = viewer._currentFolder;
    const originalName = viewer._currentName || 'image';
    if (folderPath === undefined || folderPath === null) {
        showToast('Could not determine folder to save to', true);
        return;
    }

    imgEditorCommitPending();
    const canvas = imgEditor.workingCanvas;
    // JPEG keeps the PDF a reasonable size for photos; quality 0.92 is
    // visually lossless for document/photo use at this app's scale.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Page sized to the image itself (in points, 72pt = 1in, treating
    // the image at 96dpi) rather than forcing it onto a fixed A4/Letter
    // page -- keeps the PDF page proportioned exactly like the photo,
    // which is what "convert this image to PDF" usually means here.
    const pageW = canvas.width * 72 / 96;
    const pageH = canvas.height * 72 / 96;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: pageW > pageH ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pageW, pageH],
    });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
    const blob = pdf.output('blob');

    const dotIdx = originalName.lastIndexOf('.');
    const base = dotIdx > -1 ? originalName.slice(0, dotIdx) : originalName;
    let newName = `${base}.pdf`;
    let n = 2;
    const existingNames = new Set((allFiles[folderPath] || []).map(f => f.name));
    while (existingNames.has(newName)) {
        newName = `${base}(${n}).pdf`;
        n++;
    }

    const file = new File([blob], newName, { type: 'application/pdf' });
    await addFileToCurrentFolder(file);
    render();
    updateStats();
    showToast('Saved as PDF');
    closeImageEditor();
    closeImageViewer();
}

// ============================================================
// "MERGE TO PDF" SELECTION MODE -- tap "Merge to PDF" on any image to
// enter a selection mode where every image card in the current folder
// shows a selectable dot; tapping a card toggles it in/out instead of
// opening it. The existing bottom-left badge (pdfQueueFab) doubles as
// both the live count and the "Combine" trigger.
// ============================================================

let pdfQueue = []; // array of { folderPath, fileName }
let pdfSelectMode = false;

function imgUpdatePdfQueueBadge() {
    const fab = document.getElementById('pdfQueueFab');
    const countEl = document.getElementById('pdfQueueCount');
    if (!fab || !countEl) return;
    fab.classList.toggle('hidden', pdfQueue.length === 0);
    countEl.textContent = pdfQueue.length;
}

function imgIsInPdfQueue(folderPath, fileName) {
    return pdfQueue.some(q => q.folderPath === folderPath && q.fileName === fileName);
}

function imgEnterPdfSelectMode(folderPath, fileName) {
    pdfSelectMode = true;
    if (!imgIsInPdfQueue(folderPath, fileName)) {
        pdfQueue.push({ folderPath, fileName });
    }
    imgUpdatePdfQueueBadge();
    render();
}

// Tapping a card's dot while in select mode -- add if not present,
// remove if already selected.
function imgTogglePdfSelection(folderPath, fileName) {
    const idx = pdfQueue.findIndex(q => q.folderPath === folderPath && q.fileName === fileName);
    if (idx === -1) {
        pdfQueue.push({ folderPath, fileName });
    } else {
        pdfQueue.splice(idx, 1);
    }
    imgUpdatePdfQueueBadge();
    render();
}

function imgAddToPdfQueue(folderPath, fileName) {
    imgEnterPdfSelectMode(folderPath, fileName);
}

function imgExitPdfSelectMode() {
    pdfSelectMode = false;
    pdfQueue = [];
    imgUpdatePdfQueueBadge();
    render();
}

function imgClearPdfQueue() {
    imgExitPdfSelectMode();
}


async function imgCombinePdfQueue() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library not available', true);
        return;
    }
    if (!pdfQueue.length) return;

    showPromptModal('Name for the combined PDF:', 'Combined', async (name) => {
        if (name === null) { imgClearPdfQueue(); return; } // Cancel/X/backdrop -- exit selection mode entirely, this is now the only way to back out
        if (!name.trim()) { showToast('Please enter a name', true); return; } // OK pressed with an empty field -- let them retry, don't exit
        const folderPath = currentPath.join('/');
        const { jsPDF } = window.jspdf;
        let pdf = null;

        for (const entry of pdfQueue) {
            let blob;
            try {
                blob = await loadFileData(entry.folderPath, entry.fileName);
            } catch (e) {
                continue; // skip a file that failed to load rather than aborting the whole PDF
            }
            if (!blob) continue;

            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            bitmap.close?.();
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

            const pageW = canvas.width * 72 / 96;
            const pageH = canvas.height * 72 / 96;
            const orientation = pageW > pageH ? 'landscape' : 'portrait';

            if (!pdf) {
                pdf = new jsPDF({ orientation, unit: 'pt', format: [pageW, pageH] });
            } else {
                pdf.addPage([pageW, pageH], orientation);
            }
            pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
        }

        if (!pdf) {
            showToast('Could not load any of the selected images', true);
            return;
        }

        const blob = pdf.output('blob');
        const base = name.trim().replace(/\.pdf$/i, '');
        let newName = `${base}.pdf`;
        let n = 2;
        const existingNames = new Set((allFiles[folderPath] || []).map(f => f.name));
        while (existingNames.has(newName)) {
            newName = `${base}(${n}).pdf`;
            n++;
        }

        const file = new File([blob], newName, { type: 'application/pdf' });
        await addFileToCurrentFolder(file);
        render();
        updateStats();
        showToast(`Combined ${pdfQueue.length} images into ${newName}`);
        imgClearPdfQueue();
    });
}

// "Convert to PDF" -- a single image, straight from its file card's
// context menu, becomes its own single-page PDF immediately. No queue,
// no editor -- distinct from "Merge to PDF" (imgAddToPdfQueue), which
// collects several images to combine into one multi-page PDF later.
async function imgConvertSingleFileToPdf(folderPath, fileName) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library not available', true);
        return;
    }
    let blob;
    try {
        blob = await loadFileData(folderPath, fileName);
    } catch (e) {
        showToast('Could not load image', true);
        return;
    }
    if (!blob) { showToast('Could not load image', true); return; }

    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const pageW = canvas.width * 72 / 96;
    const pageH = canvas.height * 72 / 96;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: pageW > pageH ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pageW, pageH],
    });
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageW, pageH);
    const pdfBlob = pdf.output('blob');

    const dotIdx = fileName.lastIndexOf('.');
    const base = dotIdx > -1 ? fileName.slice(0, dotIdx) : fileName;
    let newName = `${base}.pdf`;
    let n = 2;
    const existingNames = new Set((allFiles[folderPath] || []).map(f => f.name));
    while (existingNames.has(newName)) {
        newName = `${base}(${n}).pdf`;
        n++;
    }

    const pdfFile = new File([pdfBlob], newName, { type: 'application/pdf' });
    await addFileToCurrentFolder(pdfFile);
    render();
    updateStats();
    showToast(`Converted to ${newName}`);
}

async function imgEditorReplaceOriginal() {
    const viewer = document.getElementById('imageViewer');
    const folderPath = viewer._currentFolder;
    const fileName = viewer._currentName;
    if (folderPath === undefined || folderPath === null || !fileName) {
        showToast('Could not determine file to replace', true);
        return;
    }

    const blob = await imgEditorExportBlob();
    if (!blob) { showToast('Could not export edited image', true); return; }

    await replaceFileContent(folderPath, fileName, blob);

    // Refresh the viewer image behind the editor to the new content.
    if (viewer._currentUrl) URL.revokeObjectURL(viewer._currentUrl);
    const newUrl = URL.createObjectURL(blob);
    viewer._currentUrl = newUrl;
    viewer._currentData = blob;
    document.getElementById('viewerImage').src = newUrl;

    render();
    updateStats();
    showToast('Original image replaced');
    closeImageEditor();
}



// Reuses the existing docViewer modal shell (used for Word/Excel) to
// show plain-text file content in a simple monospace <pre> block.
async function openTextViewer(fileData, fileName) {
    const viewer = document.getElementById('docViewer');
    const body = document.getElementById('docViewerBody');
    const title = document.getElementById('docViewerTitle');

    title.textContent = fileName;
    body.innerHTML = '<div class="doc-viewer-unsupported"><i class="fas fa-spinner fa-spin"></i><p>Loading document…</p></div>';
    viewer._currentData = fileData;
    viewer._currentName = fileName;
    viewer.classList.remove('hidden');

    document.getElementById('textZoomInBtn').classList.remove('hidden');
    document.getElementById('textZoomOutBtn').classList.remove('hidden');
    textViewerZoom = 1;

    try {
        const text = await fileData.text();
        body.innerHTML = `<pre class="text-viewer-content" id="textViewerContent" style="font-size:${0.85 * textViewerZoom}rem">${escapeHtml(text)}</pre>`;
        wireTextViewerZoom();
    } catch (e) {
        console.error('Text preview failed:', e);
        body.innerHTML = `
            <div class="doc-viewer-unsupported">
                <i class="fas fa-file-lines"></i>
                <p>Couldn't preview this file.</p>
            </div>`;
    }
}

// ---- Text viewer zoom: pinch gesture + +/- buttons, both adjusting
// font-size. A plain scale-transform zoom would either clip the text or
// need extra scroll-area math to stay legible; resizing the actual font
// keeps line-wrapping and scrolling correct at every zoom level. ----
let textViewerZoom = 1;
const TEXT_ZOOM_MIN = 0.6;
const TEXT_ZOOM_MAX = 3;

function applyTextViewerZoom() {
    const el = document.getElementById('textViewerContent');
    const body = document.getElementById('docViewerBody');
    if (!el || !body) return;

    // Changing font-size reflows the content to a different total
    // height. If we don't compensate, the container's scrollTop stays
    // the same in pixels while the content height keeps changing every
    // frame of the pinch, so the visible text appears to jump/shift
    // instead of zooming in place. Preserving the scroll *ratio*
    // (not the absolute pixel offset) keeps the same relative reading
    // position stable through the reflow.
    const maxScrollBefore = body.scrollHeight - body.clientHeight;
    const ratio = maxScrollBefore > 0 ? body.scrollTop / maxScrollBefore : 0;

    el.style.fontSize = (0.85 * textViewerZoom) + 'rem';

    const maxScrollAfter = body.scrollHeight - body.clientHeight;
    if (maxScrollAfter > 0) body.scrollTop = ratio * maxScrollAfter;
}

function wireTextViewerZoom() {
    const body = document.getElementById('docViewerBody');
    const zoomInBtn = document.getElementById('textZoomInBtn');
    const zoomOutBtn = document.getElementById('textZoomOutBtn');
    if (!body || body._textZoomWired) {
        if (zoomInBtn) zoomInBtn.onclick = () => { textViewerZoom = Math.min(TEXT_ZOOM_MAX, textViewerZoom + 0.15); applyTextViewerZoom(); };
        if (zoomOutBtn) zoomOutBtn.onclick = () => { textViewerZoom = Math.max(TEXT_ZOOM_MIN, textViewerZoom - 0.15); applyTextViewerZoom(); };
        return;
    }
    body._textZoomWired = true;

    if (zoomInBtn) zoomInBtn.onclick = () => { textViewerZoom = Math.min(TEXT_ZOOM_MAX, textViewerZoom + 0.15); applyTextViewerZoom(); };
    if (zoomOutBtn) zoomOutBtn.onclick = () => { textViewerZoom = Math.max(TEXT_ZOOM_MIN, textViewerZoom - 0.15); applyTextViewerZoom(); };

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    body.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && document.getElementById('textViewerContent')) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDist = Math.hypot(dx, dy);
            pinchStartZoom = textViewerZoom;
        }
    }, { passive: false });
    body.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && pinchStartDist > 0 && document.getElementById('textViewerContent')) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            textViewerZoom = Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, pinchStartZoom * (dist / pinchStartDist)));
            applyTextViewerZoom();
        }
    }, { passive: false });
    body.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) pinchStartDist = 0;
    });
}

async function openWordViewer(fileData, fileName) {
    const viewer = document.getElementById('docViewer');
    const body = document.getElementById('docViewerBody');
    const title = document.getElementById('docViewerTitle');

    title.textContent = fileName;
    body.innerHTML = '<div class="doc-viewer-unsupported"><i class="fas fa-spinner fa-spin"></i><p>Loading document…</p></div>';
    viewer._currentData = fileData;
    viewer._currentName = fileName;
    viewer.classList.remove('hidden');
    document.getElementById('textZoomInBtn').classList.add('hidden');
    document.getElementById('textZoomOutBtn').classList.add('hidden');

    try {
        const arrayBuffer = await fileData.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        body.innerHTML = result.value || '<p><em>(Empty document)</em></p>';
    } catch (e) {
        console.error('Word preview failed:', e);
        body.innerHTML = `
            <div class="doc-viewer-unsupported">
                <i class="fas fa-file-word"></i>
                <p>Couldn't preview this document.<br>It may be corrupted or in an unsupported format.</p>
            </div>`;
    }
}

function closeDocViewer() {
    const viewer = document.getElementById('docViewer');
    document.getElementById('docViewerBody').innerHTML = '';
    document.getElementById('textZoomInBtn').classList.add('hidden');
    document.getElementById('textZoomOutBtn').classList.add('hidden');
    viewer._currentData = null;
    viewer.classList.add('hidden');
}

// ============================================================
// EXCEL / SPREADSHEET VIEWER (.xls, .xlsx, .csv via SheetJS)
// ============================================================

async function openExcelViewer(fileData, fileName) {
    const viewer = document.getElementById('sheetViewer');
    const body = document.getElementById('sheetViewerBody');
    const tabs = document.getElementById('sheetViewerTabs');
    const title = document.getElementById('sheetViewerTitle');

    title.textContent = fileName;
    body.innerHTML = '<div class="doc-viewer-unsupported"><i class="fas fa-spinner fa-spin"></i><p>Loading spreadsheet…</p></div>';
    tabs.innerHTML = '';
    viewer._currentData = fileData;
    viewer._currentName = fileName;
    viewer.classList.remove('hidden');

    try {
        const arrayBuffer = await fileData.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetNames = workbook.SheetNames;

        const renderSheet = (name) => {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
            if (!rows.length) {
                body.innerHTML = '<div class="doc-viewer-unsupported"><i class="fas fa-table"></i><p>This sheet is empty.</p></div>';
                return;
            }
            let html = '<table class="doc-viewer-sheet-table"><thead><tr>';
            rows[0].forEach(cell => { html += `<th>${escapeHtml(String(cell))}</th>`; });
            html += '</tr></thead><tbody>';
            for (let i = 1; i < rows.length; i++) {
                html += '<tr>';
                rows[i].forEach(cell => { html += `<td>${escapeHtml(String(cell))}</td>`; });
                html += '</tr>';
            }
            html += '</tbody></table>';
            body.innerHTML = html;
        };

        if (sheetNames.length > 1) {
            tabs.innerHTML = sheetNames.map((name, i) =>
                `<button class="doc-viewer-sheet-tab${i === 0 ? ' active' : ''}" data-sheet="${escapeHtml(name)}">${escapeHtml(name)}</button>`
            ).join('');
            tabs.querySelectorAll('.doc-viewer-sheet-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    tabs.querySelectorAll('.doc-viewer-sheet-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderSheet(btn.dataset.sheet);
                });
            });
        }

        renderSheet(sheetNames[0]);
    } catch (e) {
        console.error('Excel preview failed:', e);
        body.innerHTML = `
            <div class="doc-viewer-unsupported">
                <i class="fas fa-file-excel"></i>
                <p>Couldn't preview this spreadsheet.<br>It may be corrupted or in an unsupported format.</p>
            </div>`;
    }
}

function closeSheetViewer() {
    const viewer = document.getElementById('sheetViewer');
    document.getElementById('sheetViewerBody').innerHTML = '';
    document.getElementById('sheetViewerTabs').innerHTML = '';
    viewer._currentData = null;
    viewer.classList.add('hidden');
}

// ============================================================
// PDF HANDLING - OPTIMIZED FOR LARGE PDFs
// ============================================================

let isSharing = false;
let shareTimeout = null;

async function handlePdfFile(fileData, fileName, folderPath) {
    const openMode = docmanSettings.pdfOpen || 'docman';

    // NATIVE ANDROID: hand off to the native PdfiumAndroid viewer. Renders
    // outside the WebView — smooth zoom, no lag, no WASM memory ceiling.
    if (openMode === 'docman' && isNativePlatform() && isAndroid() && window.Capacitor?.Plugins?.PdfNative) {
        await openPdfViewerNative(fileData, fileName, folderPath);
        return;
    }

    // User-configured size threshold — kept as a general safety net for
    // anything not going through the native viewer.
    const fileSizeMB = fileData.size / (1024 * 1024);
    const thresholdBytes = (docmanSettings.pdfThreshold || 50) * 1024 * 1024;
    if (fileData.size >= thresholdBytes) {
        showToast('PDF is ' + fileSizeMB.toFixed(1) + ' MB (over ' + (docmanSettings.pdfThreshold || 50) + ' MB threshold) — opening externally.', false);
        await sharePdfExternally(fileData, fileName);
        return;
    }

    // Everything else — External mode selected, non-Android platform, or the
    // native plugin isn't available — shares out to the system PDF app.
    await sharePdfExternally(fileData, fileName);
}

function isIOS() {
    // Covers iPhone/iPad Safari and Chrome-for-iOS (which is WebKit under the
    // hood too -- Apple requires all iOS browsers to use WebKit). Also catches
    // iPadOS 13+ which reports as "Macintosh" but exposes touch support, unlike
    // real Macs.
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroid() {
    return /android/i.test(navigator.userAgent);
}

function isSamsungBrowser() {
    return /SamsungBrowser/i.test(navigator.userAgent);
}

async function sharePdfExternally(fileData, fileName) {
    // On native (Capacitor) Android, the WebView's navigator.share() is
    // unreliable — it can silently no-op instead of throwing. The native
    // Capacitor Share plugin reliably triggers the OS chooser, so use that
    // directly whenever we're actually running as a native app.
    if (isNativePlatform()) {
        await nativeDownload(fileData, fileName);
        return;
    }

    // ── Android (mobile browser / PWA, not native wrapper) ──────────────────────
    // blob: URLs are origin-scoped; default Android browsers treat any attempt
    // to open one in a new tab as a download.  The only approach that reliably
    // triggers the OS "Open with…" chooser across Chrome, Samsung Internet,
    // MIUI browser, and standalone-PWA mode is Web Share API with a File object.
    // We try it unconditionally (not guarded by canShare) because some browsers
    // report canShare=false yet still execute share() correctly.
    if (isAndroid()) {
        const file = new File([fileData], fileName, { type: 'application/pdf' });

        // Try Web Share API — works on Chrome, Samsung Internet 12+, and PWA mode
        if (navigator.share) {
            try {
                await navigator.share({ files: [file], title: fileName });
                return;
            } catch (err) {
                if (err.name === 'AbortError') return; // user dismissed
                // NotAllowedError, DataError, etc — fall through to blob URL
                console.warn('navigator.share failed:', err.name, err.message);
            }
        }

        // Last resort: open blob URL in new tab.
        // On Chrome browser (non-standalone) this shows "Open with…".
        // On default browser it may download — but there is no better option
        // if share() is completely unavailable.
        // In Capacitor WebView, blob URLs in new tabs don't work — use nativeDownload
        if (window.Capacitor) {
            await nativeDownload(fileData, fileName);
        } else {
            try {
                const url = URL.createObjectURL(fileData);
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 30000);
            } catch (e) {
                downloadPdf(fileData, fileName);
            }
        }
        return;
    }

    // ── iOS / Desktop ─────────────────────────────────────────────────────────
    try {
        isSharing = true;
        const file = new File([fileData], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: fileName });
                showToast('Shared: ' + fileName);
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') {
                    console.log('Share cancelled by user');
                } else if (shareErr.name === 'NotAllowedError') {
                    showToast('Share not allowed. Downloading instead...');
                    downloadPdf(fileData, fileName);
                } else {
                    console.warn('Share error:', shareErr);
                    showToast('Opening in external app failed. Downloading instead...');
                    downloadPdf(fileData, fileName);
                }
            }
        } else {
            showToast('Share not available. Downloading...');
            downloadPdf(fileData, fileName);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Could not open PDF: ' + err.message, true);
            try {
                downloadPdf(fileData, fileName);
            } catch (downloadErr) {
                console.error('Download fallback failed:', downloadErr);
                showToast('Could not open or download file', true);
            }
        }
    } finally {
        isSharing = false;
        if (shareTimeout) {
            clearTimeout(shareTimeout);
            shareTimeout = null;
        }
    }
}

async function nativeDownload(blob, fileName) {
    const Filesystem = window.Capacitor?.Plugins?.Filesystem;
    const Share = window.Capacitor?.Plugins?.Share;

    if (Filesystem && Share) {
        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const result = await Filesystem.writeFile({
                path: fileName,
                data: base64,
                directory: 'CACHE'
            });
            expectNativeReturn();
            await Share.share({ title: fileName, url: result.uri });
            return;
        } catch (e) {
            console.warn('Capacitor download failed, falling back:', e);
        }
    }

    // PWA / browser fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadPdf(fileData, fileName) {
    nativeDownload(fileData, fileName)
        .then(() => showToast('Downloading: ' + fileName))
        .catch(err => {
            console.error('Download failed:', err);
            showToast('Could not download file', true);
        });
}

async function shareNote(note) {
    const text = note.content ? `${note.title}\n\n${note.content}` : note.title;
    const Share = window.Capacitor?.Plugins?.Share;

    if (Share) {
        try {
            expectNativeReturn();
            await Share.share({ title: note.title, text });
        } catch (e) {
            // User cancelling the share sheet also lands here -- not an error.
            console.warn('Note share failed or cancelled:', e);
        }
        return;
    }

    // PWA / browser fallback
    if (navigator.share) {
        try {
            await navigator.share({ title: note.title, text });
        } catch (e) { /* user cancelled */ }
    } else {
        showToast('Sharing not supported on this device', true);
    }
}

// ============================================================
// NATIVE ANDROID PDF VIEWER (PdfiumAndroid — renders outside WebView)
// ============================================================
async function openPdfViewerNative(fileData, fileName, folderPath) {
    const PdfNative = window.Capacitor?.Plugins?.PdfNative;
    const Filesystem = getFilesystemPlugin();
    if (!PdfNative || !Filesystem) { await sharePdfExternally(fileData, fileName); return; }
    try {
        const base64 = await blobToBase64(fileData);
        const tmpPath = 'docman-view.pdf';
        await Filesystem.writeFile({ path: tmpPath, data: base64, directory: 'CACHE' });
        const { uri } = await Filesystem.getUri({ path: tmpPath, directory: 'CACHE' });

        // Continue Reading — stable per-document key, independent of the
        // reusable cache file path above. See getPdfDocId() for format.
        const docId = getPdfDocId(folderPath, fileName);
        let initialPage = -1;
        if (docId) {
            try {
                const last = await PdfNative.getLastPage({ docId });
                if (last?.found && typeof last.page === 'number' && last.page >= 0) {
                    initialPage = last.page;
                }
            } catch (e) {
                // No saved progress yet, or plugin doesn't support it (older
                // native build) — just open at page 1 as before.
            }
        }

        expectNativeReturn();
        await PdfNative.openPdf({ path: uri, title: fileName, docId, initialPage });
    } catch (e) {
        console.warn('Native PDF viewer failed, falling back to external share:', e);
        await sharePdfExternally(fileData, fileName);
    }
}

// Stable identity for a PDF, used as the Continue Reading storage key on
// both the JS and native sides. Empty folderPath is allowed (root-level
// files), but a missing fileName means there's nothing to key on.
function getPdfDocId(folderPath, fileName) {
    if (!fileName) return '';
    return `${folderPath || ''}::${fileName}`;
}

// ============================================================
// PDF VIEWER — native Android viewer only (EmbedPDF/WASM removed)
// ============================================================

// Kept as a safe no-op for the global Escape-key handler below; the
// native viewer runs in its own Activity, not this #pdfViewer div, so
// there is normally nothing here to close.
function closePdfViewer() {
    const viewer = document.getElementById('pdfViewer');
    if (viewer) viewer.remove();
}
window.closePdfViewer = closePdfViewer;

// ============================================================
// CONTEXT MENU
// ============================================================

// Lock Selected Folders/PDFs requires a PIN to actually check against --
// without one, locking something would create a file/folder nobody could
// ever unlock again. If no PIN exists yet, this offers to set one first;
// onReady only runs if a PIN ends up in place (either it already existed,
// or the person just created one).
function ensurePinExistsForLock(onReady) {
    if (localStorage.getItem(PIN_KEY)) { onReady();
        return; }
    showModal({
        type: 'confirm',
        message: 'Locking needs a PIN set up first. Set one now?',
        okLabel: 'Set PIN',
        okColor: 'linear-gradient(135deg,#ff6b4a,#e91e8c)',
        callback: (ok) => {
            if (!ok) return;
            promptSetPin((success) => { if (success) onReady(); });
        }
    });
}

function showCardContextMenu({ title, isFav, onFav, onRename, onDelete, isLocked, onLock, onShare, onConvertToPdf, onAddToPdf, onSetExpiry, triggerEl }) {
    const existing = document.getElementById('ctxMenuOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ctxMenuOverlay';
    overlay.className = 'ctx-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = `
        <div class="ctx-menu-title">${escapeHtml(title)}</div>
        <div class="ctx-menu-divider"></div>
        <div class="ctx-menu-item" id="ctxFav">
            <i class="fas fa-star ctx-item-icon ctx-icon-fav"></i>
            <span class="ctx-menu-item-label">${isFav ? 'Unfavourite' : 'Favourite'}</span>
        </div>
        ${onLock ? `
        <div class="ctx-menu-item" id="ctxLock">
            <i class="fas fa-lock ctx-item-icon ctx-icon-lock"></i>
            <span class="ctx-menu-item-label">${isLocked ? 'Unlock' : 'Lock'}</span>
        </div>` : ''}
        ${onRename ? `
        <div class="ctx-menu-item" id="ctxRename">
            <i class="fas fa-pen ctx-item-icon ctx-icon-rename"></i>
            <span class="ctx-menu-item-label">Rename</span>
        </div>` : ''}
        ${onShare ? `
        <div class="ctx-menu-item" id="ctxShare">
            <i class="fas fa-share-nodes ctx-item-icon ctx-icon-share"></i>
            <span class="ctx-menu-item-label">Share</span>
        </div>` : ''}
        ${onConvertToPdf ? `
        <div class="ctx-menu-item" id="ctxConvertToPdf">
            <i class="fas fa-file-pdf ctx-item-icon ctx-icon-share"></i>
            <span class="ctx-menu-item-label">Convert to PDF</span>
        </div>` : ''}
        ${onAddToPdf ? `
        <div class="ctx-menu-item" id="ctxAddToPdf">
            <i class="fas fa-layer-group ctx-item-icon ctx-icon-share"></i>
            <span class="ctx-menu-item-label">Merge to PDF</span>
        </div>` : ''}
        ${onSetExpiry ? `
        <div class="ctx-menu-item" id="ctxSetExpiry">
            <i class="fas fa-calendar-days ctx-item-icon ctx-icon-share"></i>
            <span class="ctx-menu-item-label">Set Expiry Date</span>
        </div>` : ''}
        ${onDelete ? `
        <div class="ctx-menu-divider"></div>
        <div class="ctx-menu-item" id="ctxDelete">
            <i class="fas fa-trash ctx-item-icon ctx-icon-delete"></i>
            <span class="ctx-menu-item-label danger">Delete</span>
        </div>` : ''}
    `;

    const close = () => {
        menu.style.animation = 'ctxPopOut 0.15s ease forwards';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => overlay.remove(), 160);
    };

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        // Measure the menu's real rendered size -- it's already in the
        // DOM (appended above) at this point, so offsetWidth/offsetHeight
        // reflect its actual content, not a guess. A hardcoded height
        // estimate here previously went stale as menu items were added
        // over time, silently breaking the bottom-of-screen overflow
        // check below.
        const menuW = menu.offsetWidth || 200;
        const menuH = menu.offsetHeight || 180;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = rect.right - menuW;
        let top = rect.top - menuH - 8;

        if (left < 8) left = 8;
        if (left + menuW > vw - 8) left = vw - menuW - 8;
        if (top < 8) top = rect.bottom + 8;
        if (top + menuH > vh - 8) top = vh - menuH - 8;
        if (top < 8) top = 8; // menu taller than the viewport itself -- pin to top, its own scroll (if any) handles the rest

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('ctxFav').addEventListener('click', () => { haptic.press(); close();
        onFav(); });
    const lockEl = document.getElementById('ctxLock');
    if (lockEl) lockEl.addEventListener('click', () => { haptic.press(); close();
        onLock(); });
    const renameEl = document.getElementById('ctxRename');
    if (renameEl) renameEl.addEventListener('click', () => { haptic.press(); close();
        onRename(); });
    const shareEl = document.getElementById('ctxShare');
    if (shareEl) shareEl.addEventListener('click', () => { haptic.press(); close();
        onShare(); });
    const convertToPdfEl = document.getElementById('ctxConvertToPdf');
    if (convertToPdfEl) convertToPdfEl.addEventListener('click', () => { haptic.press(); close();
        onConvertToPdf(); });
    const addToPdfEl = document.getElementById('ctxAddToPdf');
    if (addToPdfEl) addToPdfEl.addEventListener('click', () => { haptic.press(); close();
        onAddToPdf(); });
    const setExpiryEl = document.getElementById('ctxSetExpiry');
    if (setExpiryEl) setExpiryEl.addEventListener('click', () => { haptic.press(); close();
        onSetExpiry(); });
    const deleteEl = document.getElementById('ctxDelete');
    if (deleteEl) deleteEl.addEventListener('click', () => { haptic.press(); close();
        onDelete(); });
}

// ============================================================
// CARD CREATION
// ============================================================

function createFileCard(file, folderPath, opts = {}) {
    const div = document.createElement('div');
    const isImage = getFileType(file.name) === 'image';
    const isSelected = pdfSelectMode && isImage && imgIsInPdfQueue(folderPath, file.name);
    div.className = 'card file-card' + (pdfSelectMode ? ' card-select-mode' : '') + (isSelected ? ' card-selected' : '') + (pdfSelectMode && !isImage ? ' card-not-selectable' : '');
    const sizeLabel = getFileSizeLabel(file);
    const nameHtml = opts.highlightQuery ? highlightMatch(file.name, opts.highlightQuery) : escapeHtml(file.name);
    const expiryInfo = getExpiryStatus(file);
    const expiryBadge = expiryInfo && expiryInfo.status !== 'ok'
        ? `<span class="card-expiry-badge card-expiry-${expiryInfo.status}">${
            expiryInfo.status === 'overdue' ? 'Expired' : `${expiryInfo.days}d left`
          }</span>`
        : '';
    const selectDot = pdfSelectMode && isImage
        ? `<div class="card-select-dot${isSelected ? ' card-select-dot-checked' : ''}">${isSelected ? '<i class="fas fa-check"></i>' : ''}</div>`
        : '';
    div.innerHTML = `
        ${selectDot}
        ${renderFileIconBadge(file.name)}
        <div class="card-info">
            <div class="card-filename" title="${escapeHtml(file.name)}">${nameHtml}</div>
            ${sizeLabel ? `<div class="card-meta">${sizeLabel}</div>` : ''}
        </div>
        ${expiryBadge}
        ${file.locked ? '<i class="fas fa-lock card-lock-indicator"></i>' : ''}
        <i class="fas fa-star card-fav-indicator${file.favourite ? '' : ' card-fav-hidden'}"></i>
    `;

    if (isImage) wireFileIconThumbnail(div, file, folderPath);

    // In selection mode, a tap toggles the image in/out of the PDF
    // queue instead of opening it -- short-circuit before any of the
    // normal press/tap wiring below.
    if (pdfSelectMode) {
        if (isImage) {
            div.addEventListener('click', () => { haptic.toggle(); imgTogglePdfSelection(folderPath, file.name); });
            div.addEventListener('touchend', (e) => {
                e.preventDefault();
                haptic.toggle();
                imgTogglePdfSelection(folderPath, file.name);
            }, { passive: false });
        }
        return div;
    }

    let pressTimer = null;
    let longPressTriggered = false;
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let isScrolling = false;
    let touchCount = 0;

    const startPress = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        touchStartTime = Date.now();
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        longPressTriggered = false;
        isScrolling = false;

        pressTimer = setTimeout(() => {
            if (isScrolling) return;
            longPressTriggered = true;
            haptic.longPress();

            const isFav = !!file.favourite;
            showCardContextMenu({
                title: file.name,
                isFav: isFav,
                triggerEl: div,
                onFav: async () => {
                    const files = allFiles[folderPath];
                    if (!files) return;
                    const f = files.find(x => x.name === file.name);
                    if (f) {
                        f.favourite = !f.favourite;
                        file.favourite = f.favourite;
                    }
                    const ind = div.querySelector('.card-fav-indicator');
                    if (ind) ind.classList.toggle('card-fav-hidden', !file.favourite);
                    haptic.toggle();
                    await saveFilesForFolder(folderPath);
                    updateStats();
                    render();
                    showToast(file.favourite ? '⭐ Added to favourites' : 'Removed from favourites');
                },
                onRename: () => showPromptModal('Rename file:', file.name, (newName) => {
                    if (newName?.trim()) renameFileInFolder(folderPath, file.name, newName.trim());
                }),
                onDelete: () => deleteFileFromFolder(folderPath, file.name),
                onShare: () => openFileWithGesture(file, folderPath),
                onConvertToPdf: getFileType(file.name) === 'image' ? () => imgConvertSingleFileToPdf(folderPath, file.name) : null,
                onAddToPdf: getFileType(file.name) === 'image' ? () => imgAddToPdfQueue(folderPath, file.name) : null,
                onSetExpiry: () => showDateModal(`Expiry date for "${file.name}":`, file.expiryDate || '', (val) => {
                    if (val === undefined) return; // cancelled, no change
                    setFileExpiryDate(folderPath, file.name, val);
                }),
                isLocked: !!file.locked,
                onLock: () => {
                    const files = allFiles[folderPath];
                    if (!files) return;
                    const f = files.find(x => x.name === file.name);
                    if (!f) return;

                    const applyLock = async (newLocked) => {
                        f.locked = newLocked;
                        file.locked = newLocked;
                        haptic.toggle();
                        await saveFilesForFolder(folderPath);
                        updateLockedItemsCountSub();
                        render();
                        showToast(newLocked ? '🔒 Locked' : 'Unlocked');
                    };

                    if (f.locked) {
                        // Unlocking must require the PIN too -- otherwise
                        // long-press > Unlock is a bypass that skips the
                        // very check the lock exists to enforce.
                        showPinVerifyModal('Enter PIN to unlock:', (ok) => {
                            if (ok) applyLock(false);
                        });
                        return;
                    }
                    ensurePinExistsForLock(() => applyLock(true));
                },
            });
        }, 500);
    };

    const cancelPress = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };

    const checkMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const dx = Math.abs(touch.clientX - touchStartPos.x);
        const dy = Math.abs(touch.clientY - touchStartPos.y);
        if (dx > 10 || dy > 10) {
            isScrolling = true;
            cancelPress();
        }
    };

    div.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchCount = e.touches.length;
            startPress(e);
        }
    }, { passive: true });

    div.addEventListener('touchmove', checkMove, { passive: true });

    let tappedByTouch = false;

    div.addEventListener('touchend', (e) => {
        cancelPress();
        if (Date.now() - lastNavigationAt < 400) return;
        if (!longPressTriggered && !isScrolling && Date.now() - touchStartTime < 300) {
            tappedByTouch = true;
            if (getFileType(file.name) === 'pdf' && (docmanSettings.pdfOpen || 'docman') === 'external') {
                openFileWithGesture(file, folderPath);
            } else {
                openFile(file.name, folderPath);
            }
        }
        longPressTriggered = false;
    }, { passive: true });

    div.addEventListener('touchcancel', cancelPress, { passive: true });

    div.addEventListener('mousedown', startPress);
    div.addEventListener('mouseup', cancelPress);
    div.addEventListener('mouseleave', cancelPress);

    div.addEventListener('click', (e) => {
        if (tappedByTouch) { tappedByTouch = false; return; }
        if (touchCount > 1) { touchCount = 0; return; }
        touchCount = 0;
        if (longPressTriggered) { longPressTriggered = false; return; }
        // A click landing here with no matching touchstart/touchend of its
        // own on THIS element is very likely a leftover synthetic click
        // from whatever was tapped just before this card existed -- e.g.
        // tapping a folder to open it, which re-renders the file list
        // (this card included) before that trailing click fires. Android
        // dispatches that click against whatever's now at the same screen
        // position, not against the element that was actually touched, so
        // it can land on a brand-new file card and silently open it a
        // moment after just entering the folder. Ignoring clicks for a
        // brief window after any navigation absorbs that leftover click
        // without blocking a genuine, deliberate fast tap afterward.
        if (Date.now() - lastNavigationAt < 400) return;
        if (getFileType(file.name) === 'pdf' && (docmanSettings.pdfOpen || 'docman') === 'external') {
            openFileWithGesture(file, folderPath);
        } else {
            openFile(file.name, folderPath);
        }
    });

    if (opts.siblingCount) {
        appendReorderControls(div, {
            isFirst: opts.isFirst,
            isLast: opts.isLast,
            siblingCount: opts.siblingCount,
            onUp: () => moveFileManual(folderPath, file.name, -1),
            onDown: () => moveFileManual(folderPath, file.name, 1)
        });
    }

    return div;
}

function createNoteCard(note, folderPath, opts = {}) {
    const div = document.createElement('div');
    div.className = 'card note-card';
    const titleHtml = opts.highlightQuery ? highlightMatch(note.title, opts.highlightQuery) : escapeHtml(note.title);
    div.innerHTML = `
        <div class="card-icon"><i class="fas fa-sticky-note"></i></div>
        <div class="card-info">
            <div class="card-filename" title="${escapeHtml(note.title)}">${titleHtml}</div>
        </div>
        ${note.locked ? '<i class="fas fa-lock card-lock-indicator"></i>' : ''}
        <i class="fas fa-star card-fav-indicator${note.favourite ? '' : ' card-fav-hidden'}"></i>
    `;

    let pressTimer = null;
    let longPressTriggered = false;
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let isScrolling = false;
    let touchCount = 0;

    const startPress = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        touchStartTime = Date.now();
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        longPressTriggered = false;
        isScrolling = false;

        pressTimer = setTimeout(() => {
            if (isScrolling) return;
            longPressTriggered = true;
            div.classList.add('card-long-press');
            setTimeout(() => div.classList.remove('card-long-press'), 300);
            haptic.longPress();

            const isFav = !!note.favourite;
            showCardContextMenu({
                title: note.title,
                isFav: isFav,
                triggerEl: div,
                onFav: async () => {
                    const notes = allNotes[folderPath];
                    if (!notes) return;
                    const n = notes.find(x => x.id === note.id);
                    if (n) {
                        n.favourite = !n.favourite;
                        note.favourite = n.favourite;
                    }
                    const ind = div.querySelector('.card-fav-indicator');
                    if (ind) ind.classList.toggle('card-fav-hidden', !note.favourite);
                    haptic.toggle();
                    await saveNotesForFolder(folderPath);
                    updateStats();
                    render();
                    showToast(note.favourite ? '⭐ Added to favourites' : 'Removed from favourites');
                },
                onRename: () => showPromptModal('Rename note:', note.title, (newTitle) => {
                    if (newTitle?.trim()) renameNote(folderPath, note.id, newTitle.trim());
                }),
                onDelete: () => showConfirmModal(`Delete note "<b>${escapeHtml(note.title)}</b>"?`, (confirmed) => {
                    if (confirmed) deleteNoteFromFolder(folderPath, note.id);
                }),
                onShare: () => shareNote(note),
                isLocked: !!note.locked,
                onLock: () => {
                    const notes = allNotes[folderPath];
                    if (!notes) return;
                    const n = notes.find(x => x.id === note.id);
                    if (!n) return;

                    const applyLock = async (newLocked) => {
                        n.locked = newLocked;
                        note.locked = newLocked;
                        haptic.toggle();
                        await saveNotesForFolder(folderPath);
                        updateLockedItemsCountSub();
                        render();
                        showToast(newLocked ? '🔒 Locked' : 'Unlocked');
                    };

                    if (n.locked) {
                        showPinVerifyModal('Enter PIN to unlock:', (ok) => {
                            if (ok) applyLock(false);
                        });
                        return;
                    }
                    ensurePinExistsForLock(() => applyLock(true));
                },
            });
        }, 500);
    };

    const cancelPress = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };

    const checkMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const dx = Math.abs(touch.clientX - touchStartPos.x);
        const dy = Math.abs(touch.clientY - touchStartPos.y);
        if (dx > 10 || dy > 10) {
            isScrolling = true;
            cancelPress();
        }
    };

    div.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchCount = e.touches.length;
            startPress(e);
        }
    }, { passive: true });

    div.addEventListener('touchmove', checkMove, { passive: true });

    let tappedByTouch = false;

    div.addEventListener('touchend', (e) => {
        cancelPress();
        if (Date.now() - lastNavigationAt < 400) return;
        if (!longPressTriggered && !isScrolling && Date.now() - touchStartTime < 300) {
            tappedByTouch = true;
            openNote({ ...note, folder: folderPath });
        }
        longPressTriggered = false;
    }, { passive: true });

    div.addEventListener('touchcancel', cancelPress, { passive: true });

    div.addEventListener('mousedown', startPress);
    div.addEventListener('mouseup', cancelPress);
    div.addEventListener('mouseleave', cancelPress);

    div.addEventListener('click', () => {
        if (tappedByTouch) { tappedByTouch = false; return; }
        if (touchCount > 1) { touchCount = 0; return; }
        touchCount = 0;
        if (longPressTriggered) { longPressTriggered = false; return; }
        if (Date.now() - lastNavigationAt < 400) return;
        openNote({ ...note, folder: folderPath });
    });

    if (opts.siblingCount) {
        appendReorderControls(div, {
            isFirst: opts.isFirst,
            isLast: opts.isLast,
            siblingCount: opts.siblingCount,
            onUp: () => moveNoteManual(folderPath, note.id, -1),
            onDown: () => moveNoteManual(folderPath, note.id, 1)
        });
    }

    return div;
}

// Search-only folder result — deliberately simpler than createCard() (no
// favourite long-press, no manual-reorder controls): it's a transient list
// item that just needs to show the highlighted match and navigate on tap.
function createFolderSearchResultCard(name, fullPath, query) {
    const div = document.createElement('div');
    div.className = 'card glow-folder';
    const nameHtml = query ? highlightMatch(name, query) : escapeHtml(name);
    div.innerHTML = `
        <div class="card-icon"><i class="fas fa-folder"></i></div>
        <div class="card-info">
            <div class="card-filename" title="${escapeHtml(name)}">${nameHtml}</div>
            <div class="card-meta">${escapeHtml(fullPath)}</div>
        </div>
    `;
    div.onclick = () => {
        guardFolderEntry(fullPath.split('/'), () => {
            clearSearch();
            currentPath = fullPath.split('/');
            render();
        });
    };
    return div;
}

function createCard(title, onClick, isFolder = false, fullPath = null) {
    const div = document.createElement('div');
    div.className = isFolder ? 'card glow-folder' : 'card';
    const isFav = isFolder && fullPath && !!(folderMeta[fullPath] && folderMeta[fullPath].favourite);
    const isLockedFolder = isFolder && fullPath && !!(folderMeta[fullPath] && folderMeta[fullPath].locked);
    div.innerHTML = `<div class="card-icon"><img src="Images/settings-tray.png" class="card-icon-tray-img" alt=""></div><div class="card-filename">${escapeHtml(title)}</div><div class="card-buttons"></div>` +
        (isLockedFolder ? '<i class="fas fa-lock card-lock-indicator"></i>' : '') +
        (isFolder && fullPath ? `<i class="fas fa-star card-fav-indicator${isFav ? '' : ' card-fav-hidden'}"></i>` : '');

    if (!isFolder || !fullPath) {
        div.onclick = onClick;
        return div;
    }

    // Folders support long-press → Favourite, same interaction language as
    // file/note cards, without disturbing the existing single-tap navigate.
    let pressTimer = null;
    let longPressTriggered = false;
    let touchStartTime = 0;
    let touchStartPos = { x: 0, y: 0 };
    let isScrolling = false;
    let touchCount = 0;

    const toggleFav = async () => {
        const meta = folderMeta[fullPath] || (folderMeta[fullPath] = {});
        meta.favourite = !meta.favourite;
        const ind = div.querySelector('.card-fav-indicator');
        if (ind) ind.classList.toggle('card-fav-hidden', !meta.favourite);
        haptic.toggle();
        await saveFolderMeta();
        render();
        showToast(meta.favourite ? '⭐ Added to favourites' : 'Removed from favourites');
    };

    // Rename/Delete here act ONLY on this specific subfolder (fullPath),
    // never on whatever folder happens to be currently open -- distinct
    // from the folder-toolbar's Rename/Delete buttons, which act on
    // currentPath (the folder you've navigated INTO). Long-pressing a
    // particular subfolder card and choosing Delete here removes just
    // that one subfolder and its own contents, not its parent.
    const renameThisFolder = () => {
        const pathArr = fullPath.split('/');
        const old = pathArr[pathArr.length - 1];
        showPromptModal('Rename folder:', old, async (newName) => {
            if (newName === null || newName === old) return;
            if (!isValidFolderName(newName)) { showToast("Folder name can only use letters, numbers, spaces, and - _ ( ) . &", true); return; }
            {
                const parentPathArr = pathArr.slice(0, -1);
                const parent = parentPathArr.length ? parentPathArr.reduce((o, p) => o?.[p], fileSystem) : fileSystem;
                if (!parent || !parent[old]) return;

                const rebuilt = {};
                for (const key of Object.keys(parent)) {
                    if (key === old) rebuilt[newName] = parent[old];
                    else rebuilt[key] = parent[key];
                }
                for (const key of Object.keys(parent)) delete parent[key];
                for (const key of Object.keys(rebuilt)) parent[key] = rebuilt[key];

                const oldPath = fullPath;
                const newPath = [...parentPathArr, newName].join('/');

                // Prefix-aware: also migrates every subfolder under oldPath,
                // and never touches native fsPath files (see
                // migrateFilesAndNotesPath for why that's the safe choice).
                await migrateFilesAndNotesPath(oldPath, newPath);
                migrateFolderMetaPath(oldPath, newPath);
                await saveFolderMeta();

                // If we're currently browsing inside the renamed subfolder
                // (or a descendant of it), keep currentPath pointing at the
                // right place instead of silently going stale.
                if (currentPath.length >= pathArr.length &&
                    pathArr.every((seg, i) => currentPath[i] === seg)) {
                    currentPath = [...newPath.split('/'), ...currentPath.slice(pathArr.length)];
                }

                saveFolderStructure();
                saveAllFilesToDB();
                saveAllNotesToDB();
                render();
            }
        });
    };

    const deleteThisFolder = () => {
        const pathArr = fullPath.split('/');
        const name = pathArr[pathArr.length - 1];
        showConfirmModal(`Move "<b>${escapeHtml(name)}</b>" and all its contents to Recycle Bin?`, async (confirmed) => {
            if (confirmed) {
                await moveFolderToRecycleBin(pathArr);
                // If we were browsing inside the deleted subfolder (or a
                // descendant of it), back out to its parent instead of
                // rendering a now-nonexistent path.
                if (currentPath.length >= pathArr.length &&
                    pathArr.every((seg, i) => currentPath[i] === seg)) {
                    currentPath = pathArr.slice(0, -1);
                }
                render();
                updateStats();
                showToast('Moved to Recycle Bin');
            }
        });
    };

    const startPress = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        touchStartTime = Date.now();
        touchStartPos = { x: touch.clientX, y: touch.clientY };
        longPressTriggered = false;
        isScrolling = false;

        pressTimer = setTimeout(() => {
            if (isScrolling) return;
            longPressTriggered = true;
            haptic.longPress();
            showCardContextMenu({
                title,
                isFav: !!(folderMeta[fullPath] && folderMeta[fullPath].favourite),
                triggerEl: div,
                onFav: toggleFav,
                isLocked: !!(folderMeta[fullPath] && folderMeta[fullPath].locked),
                onLock: () => {
                    const meta = folderMeta[fullPath] || (folderMeta[fullPath] = {});

                    const applyLock = async (newLocked) => {
                        meta.locked = newLocked;
                        haptic.toggle();
                        await saveFolderMeta();
                        updateLockedItemsCountSub();
                        render();
                        showToast(newLocked ? '🔒 Folder locked' : 'Folder unlocked');
                    };

                    if (meta.locked) {
                        showPinVerifyModal('Enter PIN to unlock:', (ok) => {
                            if (ok) applyLock(false);
                        });
                        return;
                    }
                    ensurePinExistsForLock(() => applyLock(true));
                },
                onRename: renameThisFolder,
                onDelete: deleteThisFolder
            });
        }, 500);
    };

    const cancelPress = () => {
        if (pressTimer) { clearTimeout(pressTimer);
            pressTimer = null; }
    };

    const checkMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const dx = Math.abs(touch.clientX - touchStartPos.x);
        const dy = Math.abs(touch.clientY - touchStartPos.y);
        if (dx > 10 || dy > 10) { isScrolling = true;
            cancelPress(); }
    };

    div.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { touchCount = e.touches.length;
            startPress(e); }
    }, { passive: true });
    div.addEventListener('touchmove', checkMove, { passive: true });

    let tappedByTouch = false;
    div.addEventListener('touchend', () => {
        cancelPress();
        if (Date.now() - lastNavigationAt < 400) return;
        if (!longPressTriggered && !isScrolling && Date.now() - touchStartTime < 300) {
            tappedByTouch = true;
            onClick();
        }
        longPressTriggered = false;
    }, { passive: true });
    div.addEventListener('touchcancel', cancelPress, { passive: true });

    div.addEventListener('mousedown', startPress);
    div.addEventListener('mouseup', cancelPress);
    div.addEventListener('mouseleave', cancelPress);

    div.addEventListener('click', () => {
        if (tappedByTouch) { tappedByTouch = false; return; }
        if (touchCount > 1) { touchCount = 0; return; }
        touchCount = 0;
        if (longPressTriggered) { longPressTriggered = false; return; }
        // Same leftover-synthetic-click guard as file/note cards: a click
        // landing here right after a navigation is very likely a stray
        // click meant for the folder that was just tapped, not this one
        // (which only exists because that tap's navigation re-rendered
        // the screen at the same position) -- e.g. tapping FURNACE 1
        // navigates into it, re-rendering its subfolder F in the same
        // spot, and the trailing click then lands on F and opens it too.
        if (Date.now() - lastNavigationAt < 400) return;
        onClick();
    });

    return div;
}

// ============================================================
// FOLDER OPERATIONS
// ============================================================

// Renames a file/note path key from oldPath to newPath, handling BOTH the
// folder itself and every descendant subfolder path (oldPath/..., matching
// the same prefix rule migrateFolderMetaPath already uses for folderMeta).
// Without the prefix pass, renaming a parent folder would silently orphan
// every subfolder's allFiles/allNotes entries under a path string the
// folder tree no longer has -- the data survives on disk/IndexedDB but
// becomes unreachable through normal navigation.
//
// IMPORTANT: this deliberately does NOT touch native fsPath files at all.
// A file's fsPath is an explicit stored field that is never recomputed
// from its folderPath anywhere else in the app (reads always go through
// the stored fsPath string directly) -- so there is no functional need to
// move the underlying native file when its folder is renamed, and every
// attempt to do so here (via Filesystem.rename, and later via a manual
// verified read/write/delete) turned out to have Android/WebView edge
// cases that could delete the source file. Leaving native files exactly
// where they physically are, and only moving the *metadata* key, is both
// simpler and strictly safer -- zero native I/O, zero risk to the file.
//
// IndexedDB-blob-stored files (no fsPath) are different: their storage key
// (blobId) is reconstructed as folderPath+'/'+fileName everywhere it's
// read, so those genuinely must be moved via renameBlobInDB or they'd
// become unreadable after the rename.
async function migrateFilesAndNotesPath(oldPath, newPath) {
    const prefix = oldPath + '/';
    const matchingFileKeys = Object.keys(allFiles).filter(k => k === oldPath || k.startsWith(prefix));
    for (const k of matchingFileKeys) {
        const newKey = k === oldPath ? newPath : newPath + k.slice(oldPath.length);
        const files = allFiles[k];
        delete allFiles[k];
        allFiles[newKey] = files;
        await Promise.all(files.map(async f => {
            if (!f.fsPath) {
                await renameBlobInDB(k, f.name, newKey, f.name);
            }
            // fsPath files: nothing to do -- see note above, the native
            // file stays exactly where it is.
        }));
    }

    const matchingNoteKeys = Object.keys(allNotes).filter(k => k === oldPath || k.startsWith(prefix));
    for (const k of matchingNoteKeys) {
        const newKey = k === oldPath ? newPath : newPath + k.slice(oldPath.length);
        allNotes[newKey] = allNotes[k];
        delete allNotes[k];
    }
}

function renameCurrentFolder() {
    haptic.press();
    if (!currentPath.length) return;
    const old = currentPath[currentPath.length - 1];
    showPromptModal('Rename folder:', old, async (newName) => {
        if (newName === null || newName === old) return;
        if (!isValidFolderName(newName)) { showToast("Folder name can only use letters, numbers, spaces, and - _ ( ) . &", true); return; }
        {
            const parent = currentPath.slice(0, -1).reduce((o, p) => o[p], fileSystem);

            const rebuilt = {};
            for (const key of Object.keys(parent)) {
                if (key === old) rebuilt[newName] = parent[old];
                else rebuilt[key] = parent[key];
            }

            for (const key of Object.keys(parent)) delete parent[key];
            for (const key of Object.keys(rebuilt)) parent[key] = rebuilt[key];

            const oldPath = currentPath.join('/');
            const newPath = [...currentPath.slice(0, -1), newName].join('/');

            // Prefix-aware: renames oldPath itself AND every subfolder under
            // it (oldPath/...), so nested subfolders keep their files/notes
            // reachable after the rename instead of being silently orphaned.
            await migrateFilesAndNotesPath(oldPath, newPath);
            migrateFolderMetaPath(oldPath, newPath);
            saveFolderMeta();

            currentPath[currentPath.length - 1] = newName;
            saveFolderStructure();
            saveAllFilesToDB();
            saveAllNotesToDB();
            render();
        }
    });
}

function deleteCurrentFolder() {
    haptic.press();
    if (!currentPath.length) return;
    const name = currentPath[currentPath.length - 1];
    showConfirmModal(`Move "<b>${escapeHtml(name)}</b>" and all its contents to Recycle Bin?`, async (confirmed) => {
        if (confirmed) {
            await moveFolderToRecycleBin([...currentPath]);
            currentPath.pop();
            render();
            updateStats();
            showToast('Moved to Recycle Bin');
        }
    });
}

function addNewFolder() {
    haptic.press();
    showPromptModal('New folder name:', '', (name) => {
        if (name === null) return;
        if (!isValidFolderName(name)) { showToast("Folder name can only use letters, numbers, spaces, and - _ ( ) . &", true); return; }
        const cur = getCurrentFolderObject();
        if (cur && !cur[name.trim()]) { cur[name.trim()] = {};
            folderMeta[[...currentPath, name.trim()].join('/')] = { createdAt: Date.now() };
            saveFolderMeta();
            saveFolderStructure();
            render(); } else showToast('Already exists', true);
    });
}

// Home-screen "Add Department" FAB: expands from a half-pill "+" icon into
// the full "ADD DEPARTMENT" pill on tap, then opens the New Department
// dialog once the expand animation has had a moment to play. If a
// department actually gets created, the next render() rebuilds this
// button from scratch (naturally back in its collapsed state) -- but if
// the dialog is cancelled, no render() happens, so a timed safety net
// below collapses it back manually after a few seconds either way.
// Keeps the "Add Department" FAB (a body-level element outside .app, see
// index.html) visible only on the true home/root department list --
// hidden while inside a folder, in search mode, or while any of the four
// full-screen overlay views (Favourites/Recent/Dashboard/Recycle Bin) are
// open, since "Add Department" doesn't make sense in any of those places.
function updateDeptAddFabVisibility() {
    const fab = document.getElementById('deptAddFab');
    if (!fab) return;
    const anyOverlayOpen = !!document.querySelector('.favourites-view.fav-view-visible');
    const atHomeRoot = currentPath.length === 0 && !isSearchMode;
    fab.classList.toggle('hidden', anyOverlayOpen || !atHomeRoot);
}

function onDeptAddFabTap() {
    const fab = document.getElementById('deptAddFab');
    if (fab) fab.classList.add('dept-add-fab-expanded');
    // Delay matches the .dept-add-fab width transition (0.42s in style.css)
    // plus extra buffer, so the expand animation is fully visible and
    // settles before the dialog opens on top of it.
    setTimeout(() => {
        addNewDepartment();
        // Dialog is open now, covering the FAB anyway -- collapse it back
        // to just the "+" icon right away instead of leaving it expanded.
        const f = document.getElementById('deptAddFab');
        if (f) f.classList.remove('dept-add-fab-expanded');
    }, 1200);
}

function addNewDepartment() {
    haptic.press();
    showPromptModal('New department name:', '', (name) => {
        if (name === null) return;
        if (!isValidFolderName(name)) { showToast("Department name can only use letters, numbers, spaces, and - _ ( ) . &", true); return; }
        {
            const trimmed = name.trim();
            if (!fileSystem[trimmed]) {
                fileSystem[trimmed] = {};
                folderMeta[trimmed] = { createdAt: Date.now() };
                saveFolderMeta();
                if (!deptColors[trimmed]) {
                    deptColors[trimmed] = getRandomGradient();
                    saveDeptColors();
                }
                saveFolderStructure();
                render();
            } else {
                showToast('Department already exists', true);
            }
        }
    });
}

// ============================================================
// LOADING SKELETON
// ============================================================

function showLoadingSkeleton() {
    const contentDiv = document.getElementById('content');
    if (!contentDiv) return;
    let html = '<div class="skeleton-grid">';
    for (let i = 0; i < 6; i++) {
        html += `<div class="skeleton-card">
            <div class="skeleton-icon shimmer"></div>
            <div class="skeleton-lines">
                <div class="skeleton-line skeleton-line-long shimmer"></div>
                <div class="skeleton-line skeleton-line-short shimmer"></div>
            </div>
        </div>`;
    }
    html += '</div>';
    contentDiv.innerHTML = html;
}

// ============================================================
// SEARCH
// ============================================================

let searchTimeout = null;

function clearSearch() {
    document.getElementById('searchInput').value = '';
    isSearchMode = false;
    document.getElementById('searchInfo').classList.add('hidden');
    document.getElementById('clearSearchBtn').classList.add('hidden');
    const suggestBox = document.getElementById('searchSuggestions');
    if (suggestBox) suggestBox.classList.add('hidden');
    render();
}

// ============================================================
// ADVANCED SORTING
// ============================================================
// A single global sort mode (docmanSettings.sortMode) controls the display
// order of subfolders, files, and notes everywhere they're listed. "Manual"
// mode is special: it does no sorting at all and simply returns items in
// their existing array/object order, which is exactly the order the move
// up/down controls (see moveFileManual/moveNoteManual/moveFolderManual)
// rearrange in place. This means manual mode never needs its own stored
// "order" field — the underlying data order IS the manual order, so nothing
// about existing saved data changes until the user actually reorders something.

const SORT_LABELS = {
    manual: 'Manual Order',
    name_asc: 'Name (A → Z)',
    name_desc: 'Name (Z → A)',
    date_new: 'Date (Newest First)',
    date_old: 'Date (Oldest First)',
    size_large: 'Size (Largest First)',
    size_small: 'Size (Smallest First)'
};

const SORT_ICONS = {
    manual: 'fa-hand',
    name_asc: 'fa-arrow-down-a-z',
    name_desc: 'fa-arrow-down-z-a',
    date_new: 'fa-clock-rotate-left',
    date_old: 'fa-clock',
    size_large: 'fa-arrow-down-wide-short',
    size_small: 'fa-arrow-down-short-wide'
};

function getSortMode() {
    return docmanSettings.sortMode || 'manual';
}

function setSortMode(mode) {
    if (!SORT_LABELS[mode]) return;
    docmanSettings.sortMode = mode;
    saveSettings();
    haptic.toggle();
    render();
    updateSortBtnState();
}

// Sorts an array of { ref, name, date, size } descriptors according to the
// current global sort mode and returns the `ref` values in the new order.
// Manual mode is a no-op (see comment above).
function applySortDescriptors(descriptors) {
    const mode = getSortMode();
    if (mode === 'manual') return descriptors.map(d => d.ref);
    const arr = descriptors.slice();
    switch (mode) {
        case 'name_asc':
            arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'name_desc':
            arr.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
            break;
        case 'date_new':
            arr.sort((a, b) => (b.date || 0) - (a.date || 0));
            break;
        case 'date_old':
            arr.sort((a, b) => (a.date || 0) - (b.date || 0));
            break;
        case 'size_large':
            arr.sort((a, b) => (b.size || 0) - (a.size || 0));
            break;
        case 'size_small':
            arr.sort((a, b) => (a.size || 0) - (b.size || 0));
            break;
    }
    return arr.map(d => d.ref);
}

function sortFileList(files) {
    if (getSortMode() === 'manual') return files;
    return applySortDescriptors(files.map(f => ({
        ref: f, name: f.name, date: f.uploadedAt || 0, size: getFileBytes(f)
    })));
}

function sortNoteList(notes) {
    if (getSortMode() === 'manual') return notes;
    return applySortDescriptors(notes.map(n => ({
        ref: n,
        name: n.title || '',
        date: Date.parse(n.updatedAt || n.createdAt || 0) || 0,
        size: (n.content || '').length
    })));
}

// keys: array of subfolder names inside folderObj. pathArr is the path to
// folderObj itself (NOT including the keys), used to resolve folderMeta and
// per-folder byte totals.
function sortFolderKeys(keys, folderObj, pathArr) {
    if (getSortMode() === 'manual') return keys;
    return applySortDescriptors(keys.map(k => {
        const fullPath = [...pathArr, k].join('/');
        const meta = folderMeta[fullPath] || {};
        return {
            ref: k,
            name: k,
            date: meta.createdAt || 0,
            size: computeFolderSizeBytes(folderObj[k], [...pathArr, k])
        };
    }));
}

function moveArrayItem(arr, index, dir) {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= arr.length) return false;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    return true;
}

async function moveFileManual(folderPath, fileName, dir) {
    const arr = allFiles[folderPath];
    if (!arr) return;
    const idx = arr.findIndex(f => f.name === fileName);
    if (idx === -1 || !moveArrayItem(arr, idx, dir)) return;
    haptic.toggle();
    await saveFilesForFolder(folderPath);
    render();
}

async function moveNoteManual(folderPath, noteId, dir) {
    const arr = allNotes[folderPath];
    if (!arr) return;
    const idx = arr.findIndex(n => n.id === noteId);
    if (idx === -1 || !moveArrayItem(arr, idx, dir)) return;
    haptic.toggle();
    await saveNotesForFolder(folderPath);
    render();
}

// pathArr is the path to the PARENT folder containing `key` (e.g. [] for a
// root department, or ["REMELT"] for a folder inside REMELT).
function moveFolderManual(pathArr, key, dir) {
    const parent = pathArr.length ? pathArr.reduce((o, p) => o?.[p], fileSystem) : fileSystem;
    if (!parent) return;
    const keys = Object.keys(parent);
    const idx = keys.indexOf(key);
    if (idx === -1 || !moveArrayItem(keys, idx, dir)) return;
    // Plain objects preserve string-key insertion order in JS, so a manual
    // reorder means rebuilding the object with keys in the new order.
    const rebuilt = {};
    for (const k of keys) rebuilt[k] = parent[k];
    for (const k of Object.keys(parent)) delete parent[k];
    for (const k of Object.keys(rebuilt)) parent[k] = rebuilt[k];
    haptic.toggle();
    saveFolderStructure();
    render();
}

// Appends small up/down chevron buttons to a card, but only while sort mode
// is "manual" and there's more than one sibling to reorder against. Buttons
// stop propagation so they don't trigger the card's own click/press handlers.
function appendReorderControls(cardEl, { onUp, onDown, isFirst, isLast, siblingCount }) {
    // Manual reorder (move up/down) controls removed by request -- no
    // longer rendered on any card, regardless of sort mode or how many
    // siblings are in the folder.
    return;
}

function updateSortBtnState() {
    const btn = document.getElementById('sortBtn');
    if (!btn) return;
    const mode = getSortMode();
    const icon = btn.querySelector('i');
    if (icon) icon.className = `fas ${SORT_ICONS[mode] || 'fa-sort'}`;
    btn.title = `Sort: ${SORT_LABELS[mode]}`;
}

function showSortMenu(triggerEl) {
    const existing = document.getElementById('sortMenuOverlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'sortMenuOverlay';
    overlay.className = 'ctx-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'ctx-menu sort-menu';
    const current = getSortMode();
    menu.innerHTML = `
        <div class="ctx-menu-title"><i class="fas fa-sort"></i> Sort By</div>
        <div class="ctx-menu-divider"></div>
        ${Object.keys(SORT_LABELS).map(mode => `
            <div class="ctx-menu-item sort-menu-item${mode === current ? ' sort-menu-item-active' : ''}" data-mode="${mode}">
                <i class="fas ${SORT_ICONS[mode]} ctx-item-icon"></i>
                <span class="ctx-menu-item-label">${SORT_LABELS[mode]}</span>
                ${mode === current ? '<i class="fas fa-check sort-menu-check"></i>' : ''}
            </div>
        `).join('')}
    `;

    const close = () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => overlay.remove(), 160);
    };

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const menuW = 220;
        const vw = window.innerWidth;
        let left = rect.right - menuW;
        if (left < 8) left = 8;
        if (left + menuW > vw - 8) left = vw - menuW - 8;
        menu.style.left = left + 'px';
        menu.style.top = (rect.bottom + 8) + 'px';
        menu.style.right = 'auto';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    menu.querySelectorAll('.sort-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            close();
            setSortMode(item.dataset.mode);
        });
    });
}

// ============================================================
// RENDER
// ============================================================

function render() {
    const rawQuery = document.getElementById('searchInput').value.trim();
    const query = rawQuery.toLowerCase();

    if (query) {
        isSearchMode = true;
        document.getElementById('clearSearchBtn').classList.remove('hidden');
        const results = [];

        if (docmanSettings.searchFileNames !== false) {
            for (const path in allFiles) {
                if (!isWithinSearchScope(path)) continue;
                if (allFiles[path]) {
                    allFiles[path].forEach(f => {
                        if (f.name.toLowerCase().includes(query)) {
                            results.push({ ...f, folder: path, type: 'file' });
                        }
                    });
                }
            }
        }

        if (docmanSettings.searchNotes !== false) {
            for (const path in allNotes) {
                if (!isWithinSearchScope(path)) continue;
                if (allNotes[path]) {
                    allNotes[path].forEach(n => {
                        if (n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)) {
                            results.push({ ...n, folder: path, type: 'note' });
                        }
                    });
                }
            }
        }

        const folderResults = [];
        if (docmanSettings.searchFolderNames !== false) {
            // Start the walk from the current folder's node (root node when
            // currentPath is empty) so sub-folder names outside the current
            // scope are never visited in the first place.
            const scopeRoot = getCurrentFolderObject() || fileSystem;
            (function walk(obj, pathArr) {
                for (const key in obj) {
                    if (!obj[key] || typeof obj[key] !== 'object') continue;
                    const fullPath = [...pathArr, key];
                    if (key.toLowerCase().includes(query)) {
                        folderResults.push({ name: key, path: fullPath.join('/') });
                    }
                    walk(obj[key], fullPath);
                }
            })(scopeRoot, [...currentPath]);
        }

        const totalResults = results.length + folderResults.length;
        document.getElementById('searchInfo').classList.remove('hidden');
        const scopeLabel = currentPath.length ? ` in "${escapeHtml(currentPath[currentPath.length - 1])}"` : '';
        document.getElementById('searchInfo').innerHTML = `<i class="fas fa-search"></i> Found ${totalResults} result(s) for "${escapeHtml(rawQuery)}"${scopeLabel} <button onclick="clearSearch()">Clear</button>`;

        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';
        document.getElementById('homeBtn').classList.remove('hidden');
        updateDeptAddFabVisibility();
        document.getElementById('uploadBtn').classList.add('hidden');
        document.getElementById('newNoteBtn').classList.add('hidden');
        document.getElementById('departmentsSection').innerHTML = '';
        document.getElementById('breadcrumb').innerHTML = '';
        document.querySelector('.type-selector').classList.add('hidden');

        if (!totalResults) {
            contentDiv.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No results found.</p></div>';
        } else {
            folderResults.forEach(fr => {
                contentDiv.appendChild(createFolderSearchResultCard(fr.name, fr.path, rawQuery));
            });
            results.forEach(item => {
                if (item.type === 'file') {
                    contentDiv.appendChild(createFileCard(item, item.folder, { highlightQuery: rawQuery }));
                } else {
                    contentDiv.appendChild(createNoteCard(item, item.folder, { highlightQuery: rawQuery }));
                }
            });
        }
        updateStats();
        attachPressEffects();
        scheduleSearchHistoryCapture(rawQuery);
        return;
    }

    isSearchMode = false;
    document.getElementById('clearSearchBtn').classList.add('hidden');
    document.getElementById('searchInfo').classList.add('hidden');

    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';

    const folder = getCurrentFolderObject();
    if (!folder) { currentPath = [];
        render(); return; }

    document.getElementById('homeBtn').classList.toggle('hidden', currentPath.length === 0);
    updateDeptAddFabVisibility();
    const isRoot = currentPath.length === 0;

    if (isRoot) {
        const deptIcons = {
            'Personal': 'fa-user',
            'Work': 'fa-briefcase',
            'Finance & Bills': 'fa-wallet',
            'Education': 'fa-graduation-cap',
            'Health & Medical': 'fa-heart-pulse',
            'ID & Legal': 'fa-file-shield',
            'Home & Property': 'fa-house',
            'Others': 'fa-folder',
        };
        const deptKeys = sortFolderKeys(Object.keys(fileSystem), fileSystem, []);
        const hasDepts = deptKeys.length > 0;
        let html = '';

        if (hasDepts) {
            html = '<div class="departments-wrapper"><div class="departments-grid">';
            for (const dept of deptKeys) {
                const total = countDepartmentFiles(fileSystem[dept], [dept]);
                const icon = deptIcons[dept] || 'fa-folder';
                const knownDepts = ['Personal', 'Work', 'Finance & Bills', 'Education', 'Health & Medical', 'ID & Legal', 'Home & Property', 'Others'];
                const pillBgStyle = (!knownDepts.includes(dept) && deptColors[dept]) ? ` style="background:${deptColors[dept]}"` : '';

                const isDeptLocked = !!(folderMeta[dept] && folderMeta[dept].locked);
                html += `<div class="dept-card" data-dept="${escapeHtml(dept)}">
                    <div class="dept-oval">
                        <div class="dept-pill-bg"${pillBgStyle}></div>
                        <div class="dept-pill-center-icon"><i class="fas ${icon}"></i></div>
                        <div class="dept-pill-body">
                            <div class="dept-pill-name">${escapeHtml(dept)}</div>
                        </div>
                        ${isDeptLocked ? '<i class="fas fa-lock dept-lock-indicator"></i>' : ''}
                    </div>
                    <div class="dept-pill-icon">
                        <span class="dept-count">${total}</span>
                        <span class="dept-count-label">Items</span>
                    </div>
                </div>`;
            }
            html += `
                </div>
                <div class="dept-hub">
                    <div class="dept-hub-circle">
                        <span class="dept-hub-text">DEPARTMENT</span>
                        <div class="dept-hub-knob" onclick="showInfoDelayed()">
                            <i class="fas fa-info dept-hub-icon"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        html += `<div class="dept-add-footer"></div>`;

        document.getElementById('departmentsSection').innerHTML = html;
        document.getElementById('homeBtn').classList.add('hidden');
        updateDeptAddFabVisibility();
        document.getElementById('uploadBtn').classList.add('hidden');
        document.getElementById('newNoteBtn').classList.add('hidden');

        if (hasDepts) {
            attachDepartmentPressEffects();
            drawDeptConnectorsWhenStable();
        }
    } else {
        document.getElementById('departmentsSection').innerHTML = '';
    }

    const hasSubfolders = Object.keys(folder).length > 0;
    const isLeafFolder = !isRoot && !hasSubfolders;

    const typeSelector = document.querySelector('.type-selector');
    if (typeSelector) typeSelector.classList.toggle('hidden', !isLeafFolder);

    if (isLeafFolder) {
        if (currentActiveTab === 'pdfs') {
            document.getElementById('uploadBtn').classList.remove('hidden');
            document.getElementById('newNoteBtn').classList.add('hidden');
        } else {
            document.getElementById('uploadBtn').classList.add('hidden');
            document.getElementById('newNoteBtn').classList.remove('hidden');
        }
    } else {
        document.getElementById('uploadBtn').classList.add('hidden');
        document.getElementById('newNoteBtn').classList.add('hidden');
    }

    if (!isRoot) {
        const folderCardEl = document.createElement('div');
        folderCardEl.className = 'current-folder-card';

        const parentPath = currentPath.slice(0, -1);
        const pathHtml = `<span class="cf-home" onclick="navigateToBreadcrumb(-1)"><i class="fas fa-home"></i> <span style="color:#ff6b4a">Home</span></span>` +
            parentPath.map((p, i) => `<span class="cf-sep"> / </span><span class="cf-part cf-part-nav" onclick="navigateToBreadcrumb(${i})">${escapeHtml(p)}</span>`).join('') +
            `<span class="cf-sep"> / </span><span class="cf-part cf-part-current">${escapeHtml(currentPath[currentPath.length - 1])}</span>`;

        const curFolderPath = currentPath.join('/');
        const curIsFav = !!(folderMeta[curFolderPath] && folderMeta[curFolderPath].favourite);

        folderCardEl.innerHTML = `
            <div class="cf-path-row">${pathHtml}</div>
            <div class="cf-bottom-row">
                <div class="cf-folder-name">${escapeHtml(currentPath[currentPath.length - 1])}</div>
                <div class="cf-folder-icon"><i class="fas fa-star cf-star${curIsFav ? ' cf-star-active' : ''}"></i></div>
            </div>`;
        contentDiv.appendChild(folderCardEl);

        const starEl = folderCardEl.querySelector('.cf-star');
        starEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            const meta = folderMeta[curFolderPath] || (folderMeta[curFolderPath] = {});
            meta.favourite = !meta.favourite;
            starEl.classList.toggle('cf-star-active', !!meta.favourite);
            haptic.toggle();
            await saveFolderMeta();
            showToast(meta.favourite ? '⭐ Added to favourites' : 'Removed from favourites');
        });
    }

    if (!isRoot) {
        // Rename/Delete no longer live here -- acting on whatever folder
        // happens to be open was too easy to trigger by accident. Both are
        // now long-press actions on the specific folder card itself (see
        // createCard's onRename/onDelete). The Favourite slot here reuses
        // the old stats-bar pill's own job -- opening the full favourites
        // list -- rather than toggling just this one folder.
        const actionDiv = document.createElement('div');
        actionDiv.className = 'folder-toolbar';
        actionDiv.innerHTML = `
            <div class="ft-icon-col">
                <button class="ft-icon-btn ft-back" onclick="haptic.press(); goBack()" aria-label="Back"><i class="fas fa-arrow-left"></i></button>
                <span class="ft-icon-label">Back</span>
            </div>
            <div class="ft-icon-col">
                <button class="ft-icon-btn ft-add" onclick="addNewFolder()" aria-label="Add Subfolder"><i class="fas fa-plus"></i></button>
                <span class="ft-icon-label">Add Subfolder</span>
            </div>
            <div class="ft-icon-col">
                <button id="ftFavBtn" class="ft-icon-btn ft-fav-icon-btn" aria-label="Favourite">
                    <img src="Images/favorite-icon.png" alt="Favourite" class="ft-fav-icon-img" draggable="false">
                </button>
                <span class="ft-icon-label">Favourite</span>
            </div>`;

        const folderCardInDom = contentDiv.querySelector('.current-folder-card');
        if (folderCardInDom) {
            contentDiv.insertBefore(actionDiv, folderCardInDom);
        } else {
            contentDiv.appendChild(actionDiv);
        }

        // touchend-primary, click-fallback (same technique used elsewhere in
        // this file, e.g. the PIN pad) -- a plain 'click' listener alone
        // waits on the browser's tap-vs-gesture disambiguation, which on
        // Android WebView can feel like the button isn't responding at all.
        // touchend fires immediately and preventDefault stops the trailing
        // synthetic click from firing the action a second time.
        const ftFavBtn = actionDiv.querySelector('#ftFavBtn');
        let ftFavFiredByTouch = false;
        const ftFavAction = () => {
            haptic.press();
            openFavouritesView();
        };
        ftFavBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            ftFavFiredByTouch = true;
            ftFavAction();
            setTimeout(() => { ftFavFiredByTouch = false; }, 400);
        }, { passive: false });
        ftFavBtn.addEventListener('click', () => {
            if (ftFavFiredByTouch) return;
            ftFavAction();
        });
    }

    if (!isRoot && hasSubfolders) {
        const subKeys = sortFolderKeys(Object.keys(folder), folder, currentPath);
        subKeys.forEach((key, i) => {
            const folderCard = createCard(key, () => {
                guardFolderEntry([...currentPath, key], () => {
                    navigateWithPageTurn(() => {
                        currentPath.push(key);
                        render();
                    }, 'forward');
                });
            }, true, [...currentPath, key].join('/'));
            contentDiv.appendChild(folderCard);
        });
    }

    if (isLeafFolder) {
        if (currentActiveTab === 'pdfs') {
            const files = sortFileList(getFilesForCurrentFolder());
            const path = currentPath.join('/');
            if (files.length) {
                files.forEach((f, i) => {
                    const card = createFileCard(f, path, {
                        isFirst: i === 0,
                        isLast: i === files.length - 1,
                        siblingCount: files.length
                    });
                    contentDiv.appendChild(card);
                });
            } else {
                const dz = document.createElement('div');
                dz.className = 'empty-state';
                dz.innerHTML = `<img src="Images/empty-cloud.png" alt="" class="empty-state-icon"><p>No files here yet</p>`;
                contentDiv.appendChild(dz);
            }
        } else {
            const notes = sortNoteList(getNotesForCurrentFolder());
            const path = currentPath.join('/');
            if (notes.length) {
                notes.forEach((n, i) => {
                    const card = createNoteCard(n, path, {
                        isFirst: i === 0,
                        isLast: i === notes.length - 1,
                        siblingCount: notes.length
                    });
                    contentDiv.appendChild(card);
                });
            } else {
                contentDiv.innerHTML += '<div class="empty-state empty-state-note"><i class="fas fa-sticky-note"></i><p>No notes yet. Click + New Note to add.</p></div>';
            }
        }
    }

    updateStats();
    attachPressEffects();
}

// ============================================================
// DEPARTMENT CONNECTORS
// ============================================================

function drawDeptConnectorsWhenStable(attempt) {
    attempt = attempt || 0;
    const wrapper = document.querySelector('.departments-wrapper');
    if (!wrapper) return;
    const badges = wrapper.querySelectorAll('.dept-pill-icon');
    if (!badges.length) return;

    const sample = () => Array.from(badges).map(b => {
        const r = b.getBoundingClientRect();
        return r.top + ',' + r.left + ',' + r.width;
    }).join('|');

    const pos1 = sample();

    requestAnimationFrame(() => {
        const pos2 = sample();
        if (pos1 === pos2 && pos2.indexOf('0,0,0') === -1) {
            drawDeptConnectors();
        } else if (attempt < 20) {
            setTimeout(() => drawDeptConnectorsWhenStable(attempt + 1), 50);
        } else {
            drawDeptConnectors();
        }
    });
}

function drawDeptConnectors() {
    const wrapper = document.querySelector('.departments-wrapper');
    if (!wrapper) return;

    const old = wrapper.querySelector('.dept-connector-svg');
    if (old) old.remove();

    const hubCircle = wrapper.querySelector('.dept-hub-circle');
    const badges = wrapper.querySelectorAll('.dept-pill-icon');
    if (!hubCircle || !badges.length) return;

    const wW = wrapper.offsetWidth;
    const wH = wrapper.offsetHeight;
    if (!wW) { setTimeout(drawDeptConnectors, 100); return; }

    function offsetRelTo(el, ancestor) {
        let top = 0,
            left = 0;
        while (el && el !== ancestor) {
            top += el.offsetTop;
            left += el.offsetLeft;
            el = el.offsetParent;
        }
        return { top, left };
    }

    const badgeData = Array.from(badges).map(b => {
        const off = offsetRelTo(b, wrapper);
        return {
            top: off.top,
            left: off.left,
            width: b.offsetWidth,
            height: b.offsetHeight
        };
    });
    if (!badgeData.every(r => r.width > 0)) { setTimeout(drawDeptConnectors, 100); return; }

    const centerYwrapper = (
        Math.min(...badgeData.map(r => r.top + r.height / 2)) +
        Math.max(...badgeData.map(r => r.top + r.height / 2))
    ) / 2;
    const hubTopLocal = centerYwrapper - hubCircle.offsetHeight / 2;

    hubCircle.style.position = 'absolute';
    hubCircle.style.top = hubTopLocal + 'px';
    hubCircle.style.right = '8px';
    hubCircle.style.left = 'auto';
    hubCircle.style.transform = 'none';

    void hubCircle.offsetHeight;

    if (!hubCircle.offsetWidth) { setTimeout(drawDeptConnectors, 100); return; }

    const hubOffNow = offsetRelTo(hubCircle, wrapper);
    const hubLeftX = hubOffNow.left;
    const hubTopY = hubOffNow.top;
    const hubCenterY = hubTopY + hubCircle.offsetHeight / 2;
    const svgTotalW2 = Math.min(Math.max(wW, hubOffNow.left + hubCircle.offsetWidth + 10), wW);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('dept-connector-svg');
    svg.setAttribute('width', svgTotalW2);
    svg.setAttribute('height', wH);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';

    const n = badgeData.length;
    const cr = 25;

    const sorted = badgeData.map((r, idx) => ({
        x1: r.left + r.width,
        y1: r.top + r.height / 2,
        origIdx: idx
    })).sort((a, b) => a.y1 - b.y1);

    const hubUseRatio = 0.88;
    const hubUseH = hubCircle.offsetHeight * hubUseRatio;
    const hubStartY = hubCenterY - hubUseH / 2;
    const hubStep = n > 1 ? hubUseH / (n - 1) : 0;

    sorted.forEach((d, si) => {
        const y2 = n === 1 ? hubCenterY : hubStartY + hubStep * si;
        const dy = y2 - d.y1;
        let pathD;
        const segments = [];

        const hubRadius = hubCircle.offsetWidth / 2 + 8;
        const hubCenterX = hubLeftX + hubCircle.offsetWidth / 2;
        const dyFromCenter = y2 - hubCenterY;
        const safeDy = Math.max(-hubRadius + 2, Math.min(hubRadius - 2, dyFromCenter));
        const dotX = hubCenterX - Math.sqrt(hubRadius * hubRadius - safeDy * safeDy);
        const lineEndX = dotX;

        segments.push(`M ${d.x1} ${d.y1}`);
        const exitX = d.x1 + 6;
        segments.push(`L ${exitX} ${d.y1}`);
        // Channel sits midway between the badge's exit point and the hub dot.
        // channelX is clamped to stay strictly inside [exitX, lineEndX], and
        // safeCr is derived from the actual (clamped) distance on each side —
        // not a floored/assumed gap — so the curve's bulge (channelX ± safeCr)
        // can never cross back past either endpoint, no matter how tight the
        // badge-to-hub spacing gets. (A fixed 35px/25px previously assumed a
        // wide gap; an earlier adaptive attempt still overshot when the gap
        // was very small because its minimum corner radius could exceed the
        // available half-gap.)
        const realGap = lineEndX - exitX;
        const totalGap = Math.max(2, realGap);
        let channelX = exitX + totalGap / 2;
        channelX = Math.max(exitX + 1, Math.min(lineEndX - 1, channelX));
        const halfGap = Math.max(0, Math.min(channelX - exitX, lineEndX - channelX));
        const safeCr = Math.min(cr, Math.abs(dy) / 2, Math.max(0, halfGap - 1));

        if (dy > 8) {
            segments.push(`L ${channelX - safeCr} ${d.y1}`);
            segments.push(`A ${safeCr} ${safeCr} 0 0 1 ${channelX} ${d.y1 + safeCr}`);
            segments.push(`L ${channelX} ${y2 - safeCr}`);
            segments.push(`A ${safeCr} ${safeCr} 0 0 0 ${channelX + safeCr} ${y2}`);
        } else if (dy < -8) {
            segments.push(`L ${channelX - safeCr} ${d.y1}`);
            segments.push(`A ${safeCr} ${safeCr} 0 0 0 ${channelX} ${d.y1 - safeCr}`);
            segments.push(`L ${channelX} ${y2 + safeCr}`);
            segments.push(`A ${safeCr} ${safeCr} 0 0 1 ${channelX + safeCr} ${y2}`);
        } else {
            segments.push(`L ${channelX} ${d.y1}`);
            segments.push(`L ${channelX} ${y2}`);
        }
        segments.push(`L ${lineEndX} ${y2}`);

        pathD = segments.join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(255,255,255,0.85)');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);

        const hDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hDot.setAttribute('cx', dotX);
        hDot.setAttribute('cy', y2);
        hDot.setAttribute('r', '4');
        hDot.setAttribute('fill', 'rgba(255,255,255,0.95)');
        hDot.setAttribute('stroke', 'rgba(245,168,0,0.55)');
        hDot.setAttribute('stroke-width', '1.5');
        svg.appendChild(hDot);

        const bDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bDot.setAttribute('cx', d.x1);
        bDot.setAttribute('cy', d.y1);
        bDot.setAttribute('r', '3');
        bDot.setAttribute('fill', 'rgba(255,255,255,0.75)');
        svg.appendChild(bDot);
    });

    wrapper.appendChild(svg);
}

function attachDepartmentPressEffects() {
    document.querySelectorAll('.dept-oval').forEach(oval => {
        if (oval._deptPressWired) return; // avoid stacking duplicate listeners across re-renders
        oval._deptPressWired = true;

        const card = oval.closest('.dept-card');
        if (!card) return;
        const dept = card.dataset.dept;

        // Long-press → Favourite/Lock context menu, same interaction
        // language and folderMeta storage as regular sub-folder cards
        // (guardFolderEntry already checks folderMeta[dept].locked in
        // selectDepartment -- this just adds the missing UI to set it).
        let pressTimer = null;
        let longPressTriggered = false;
        let touchStartPos = { x: 0, y: 0 };
        let isScrolling = false;

        const openDeptContextMenu = () => {
            showCardContextMenu({
                title: dept,
                isFav: !!(folderMeta[dept] && folderMeta[dept].favourite),
                triggerEl: oval,
                onFav: async () => {
                    const meta = folderMeta[dept] || (folderMeta[dept] = {});
                    meta.favourite = !meta.favourite;
                    haptic.toggle();
                    await saveFolderMeta();
                    render();
                    showToast(meta.favourite ? '⭐ Added to favourites' : 'Removed from favourites');
                },
                isLocked: !!(folderMeta[dept] && folderMeta[dept].locked),
                onLock: () => {
                    const meta = folderMeta[dept] || (folderMeta[dept] = {});

                    const applyLock = async (newLocked) => {
                        meta.locked = newLocked;
                        haptic.toggle();
                        await saveFolderMeta();
                        updateLockedItemsCountSub();
                        render();
                        showToast(newLocked ? '🔒 Department locked' : 'Department unlocked');
                    };

                    if (meta.locked) {
                        showPinVerifyModal('Enter PIN to unlock:', (ok) => {
                            if (ok) applyLock(false);
                        });
                        return;
                    }
                    ensurePinExistsForLock(() => applyLock(true));
                },
                onRename: () => {
                    const old = dept;
                    showPromptModal('Rename department:', old, async (newName) => {
                        if (newName === null || newName === old) return;
                        if (!isValidFolderName(newName)) { showToast("Department name can only use letters, numbers, spaces, and - _ ( ) . &", true); return; }
                        if (fileSystem[newName]) { showToast('Already exists', true); return; }

                        const rebuilt = {};
                        for (const key of Object.keys(fileSystem)) {
                            if (key === old) rebuilt[newName] = fileSystem[old];
                            else rebuilt[key] = fileSystem[key];
                        }
                        for (const key of Object.keys(fileSystem)) delete fileSystem[key];
                        for (const key of Object.keys(rebuilt)) fileSystem[key] = rebuilt[key];

                        // Prefix-aware: also migrates every subfolder under
                        // this department, and never touches native fsPath
                        // files (see migrateFilesAndNotesPath for why).
                        await migrateFilesAndNotesPath(old, newName);
                        migrateFolderMetaPath(old, newName);
                        await saveFolderMeta();

                        if (deptColors[old]) {
                            deptColors[newName] = deptColors[old];
                            delete deptColors[old];
                            await saveDeptColors();
                        }

                        if (currentPath[0] === old) currentPath = [newName, ...currentPath.slice(1)];

                        saveFolderStructure();
                        saveAllFilesToDB();
                        saveAllNotesToDB();
                        render();
                    });
                },
                onDelete: () => {
                    showConfirmModal(`Move "<b>${escapeHtml(dept)}</b>" and all its contents to Recycle Bin?`, async (confirmed) => {
                        if (!confirmed) return;
                        await moveFolderToRecycleBin([dept]);
                        if (deptColors[dept]) { delete deptColors[dept];
                            await saveDeptColors(); }
                        if (currentPath[0] === dept) currentPath = [];
                        render();
                        updateStats();
                        showToast('Moved to Recycle Bin');
                    });
                }
            });
        };

        const startPress = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            touchStartPos = { x: touch.clientX, y: touch.clientY };
            longPressTriggered = false;
            isScrolling = false;
            pressTimer = setTimeout(() => {
                if (isScrolling) return;
                longPressTriggered = true;
                haptic.longPress();
                openDeptContextMenu();
            }, 500);
        };

        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };

        const checkMove = (e) => {
            const touch = e.touches ? e.touches[0] : e;
            const dx = Math.abs(touch.clientX - touchStartPos.x);
            const dy = Math.abs(touch.clientY - touchStartPos.y);
            if (dx > 10 || dy > 10) { isScrolling = true; cancelPress(); }
        };

        oval.addEventListener('touchstart', startPress, { passive: true });
        oval.addEventListener('touchmove', checkMove, { passive: true });
        oval.addEventListener('touchend', cancelPress, { passive: true });
        oval.addEventListener('touchcancel', cancelPress, { passive: true });

        oval.addEventListener('mousedown', startPress);
        oval.addEventListener('mouseup', cancelPress);
        oval.addEventListener('mouseleave', cancelPress);

        oval.addEventListener('click', () => {
            if (longPressTriggered) { longPressTriggered = false; return; }
            // Let the press-feedback sink animation actually finish
            // playing before navigating away -- otherwise the page
            // change cuts it off and the press feels instant/sudden.
            setTimeout(() => selectDepartment(dept), 260);
        });
    });
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
    let folderCount = 0,
        fileCount = 0,
        notesCount = 0,
        favCount = 0;

    function countFolders(obj) {
        for (let k in obj) if (typeof obj[k] === 'object') { folderCount++;
            countFolders(obj[k]); }
    }
    countFolders(fileSystem);

    for (let k in allFiles) {
        if (allFiles[k]) {
            fileCount += allFiles[k].length;
            favCount += allFiles[k].filter(f => f.favourite).length;
        }
    }
    for (let k in allNotes) {
        if (allNotes[k]) {
            notesCount += allNotes[k].length;
            favCount += allNotes[k].filter(n => n.favourite).length;
        }
    }
    for (const k in folderMeta) {
        if (folderMeta[k] && folderMeta[k].favourite) favCount++;
    }

    const folderCountEl = document.getElementById('folderCount');
    const fileCountEl = document.getElementById('fileCount');
    const notesCountEl = document.getElementById('notesCount');
    const favCountEl = document.getElementById('favCount');
    if (folderCountEl) folderCountEl.textContent = folderCount;
    if (fileCountEl) fileCountEl.textContent = fileCount;
    if (notesCountEl) notesCountEl.textContent = notesCount;
    if (favCountEl) favCountEl.textContent = favCount;

    const favItem = document.getElementById('favStatItem');
    if (favItem && !favItem._wired) {
        favItem._wired = true;
        favItem.addEventListener('click', () => {
            haptic.press();
            openFavouritesView();
        });
    }

    const recentItem = document.getElementById('recentStatItem');
    if (recentItem && !recentItem._wired) {
        recentItem._wired = true;
        recentItem.addEventListener('click', () => {
            haptic.press();
            openRecentsView();
        });
    }

    const dashboardItem = document.getElementById('dashboardStatItem');
    if (dashboardItem && !dashboardItem._wired) {
        dashboardItem._wired = true;
        dashboardItem.addEventListener('click', () => {
            haptic.press();
            openDashboardView();
        });
    }

    const recycleBinItem = document.getElementById('recycleBinStatItem');
    if (recycleBinItem && !recycleBinItem._wired) {
        recycleBinItem._wired = true;
        recycleBinItem.addEventListener('click', () => {
            haptic.press();
            openRecycleBinView();
        });
    }
}

// ============================================================
// FAVOURITES VIEW
// ============================================================

function openFavouritesView() {
    const favFiles = [],
        favNotes = [],
        favFolders = [];

    for (const path in folderMeta) {
        if (folderMeta[path] && folderMeta[path].favourite) {
            favFolders.push({ path, name: path.split('/').pop() });
        }
    }
    for (const folderPath in allFiles) {
        if (!allFiles[folderPath]) continue;
        for (const f of allFiles[folderPath]) {
            if (f.favourite) favFiles.push({ file: f, folderPath });
        }
    }
    for (const folderPath in allNotes) {
        if (!allNotes[folderPath]) continue;
        for (const n of allNotes[folderPath]) {
            if (n.favourite) favNotes.push({ note: n, folderPath });
        }
    }

    const list = document.getElementById('favViewList');

    if (!favFiles.length && !favNotes.length && !favFolders.length) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-heart-crack"></i><p>No favourites yet.<br>Tap ⭐ on any folder, file, or note to add it here.</p></div>';
    } else {
        list.innerHTML = '';

        if (favFolders.length) {
            const sec = document.createElement('div');
            sec.className = 'fav-section-title';
            sec.innerHTML = `<i class="fas fa-folder"></i> Folders <span>${favFolders.length}</span>`;
            list.appendChild(sec);

            favFolders.forEach(({ path, name }) => {
                const row = document.createElement('div');
                row.className = 'fav-row';
                row.innerHTML = `
                    <div class="fav-row-icon fav-row-icon-folder"><i class="fas fa-folder"></i></div>
                    <div class="fav-row-info">
                        <div class="fav-row-name">${escapeHtml(name)}</div>
                        <div class="fav-row-path">${escapeHtml(path)}</div>
                    </div>
                    <button class="fav-row-unfav" title="Remove favourite"><i class="fas fa-heart"></i></button>
                `;
                row.querySelector('.fav-row-unfav').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    haptic.toggle();
                    if (folderMeta[path]) folderMeta[path].favourite = false;
                    await saveFolderMeta();
                    updateStats();
                    render();
                    row.classList.add('fav-row-removing');
                    setTimeout(() => { row.remove();
                        checkFavEmpty(list); }, 280);
                });
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.fav-row-unfav')) return;
                    guardFolderEntry(path.split('/'), () => {
                        closeFavouritesView();
                        currentPath = path.split('/');
                        render();
                    });
                });
                list.appendChild(row);
            });
        }

        if (favFiles.length) {
            const sec = document.createElement('div');
            sec.className = 'fav-section-title';
            sec.innerHTML = `<i class="fas fa-file"></i> Files <span>${favFiles.length}</span>`;
            list.appendChild(sec);

            favFiles.forEach(({ file, folderPath }) => {
                const iconClass = getFileIcon(file.name);
                const row = document.createElement('div');
                row.className = 'fav-row';
                row.innerHTML = `
                    <div class="fav-row-icon"><i class="fas ${iconClass}"></i></div>
                    <div class="fav-row-info">
                        <div class="fav-row-name">${escapeHtml(file.name)}</div>
                        <div class="fav-row-path">${escapeHtml(folderPath)}</div>
                    </div>
                    <button class="fav-row-unfav" title="Remove favourite"><i class="fas fa-heart"></i></button>
                `;
                row.querySelector('.fav-row-unfav').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    haptic.toggle();
                    const arr = allFiles[folderPath];
                    if (arr) { const f2 = arr.find(x => x.name === file.name); if (f2) f2.favourite = false; }
                    await saveFilesForFolder(folderPath);
                    updateStats();
                    render();
                    row.classList.add('fav-row-removing');
                    setTimeout(() => { row.remove();
                        checkFavEmpty(list); }, 280);
                });
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.fav-row-unfav')) return;
                    closeFavouritesView();
                    openFile(file.name, folderPath);
                });
                list.appendChild(row);
            });
        }

        if (favNotes.length) {
            const sec = document.createElement('div');
            sec.className = 'fav-section-title';
            sec.innerHTML = `<i class="fas fa-sticky-note"></i> Notes <span>${favNotes.length}</span>`;
            list.appendChild(sec);

            favNotes.forEach(({ note, folderPath }) => {
                const row = document.createElement('div');
                row.className = 'fav-row';
                row.innerHTML = `
                    <div class="fav-row-icon fav-row-icon-note"><i class="fas fa-sticky-note"></i></div>
                    <div class="fav-row-info">
                        <div class="fav-row-name">${escapeHtml(note.title)}</div>
                        <div class="fav-row-path">${escapeHtml(folderPath)}</div>
                    </div>
                    <button class="fav-row-unfav" title="Remove favourite"><i class="fas fa-heart"></i></button>
                `;
                row.querySelector('.fav-row-unfav').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    haptic.toggle();
                    const arr = allNotes[folderPath];
                    if (arr) { const n2 = arr.find(x => x.id === note.id); if (n2) n2.favourite = false; }
                    await saveNotesForFolder(folderPath);
                    updateStats();
                    render();
                    row.classList.add('fav-row-removing');
                    setTimeout(() => { row.remove();
                        checkFavEmpty(list); }, 280);
                });
                row.addEventListener('click', (e) => {
                    if (e.target.closest('.fav-row-unfav')) return;
                    closeFavouritesView();
                    openNote({ ...note, folder: folderPath });
                });
                list.appendChild(row);
            });
        }
    }

    document.getElementById('searchInfo').classList.add('hidden');

    const favView = document.getElementById('favouritesView');
    favView.classList.remove('hidden');
    requestAnimationFrame(() => favView.classList.add('fav-view-visible'));
    updateDeptAddFabVisibility();

    const favBackBtn = document.getElementById('favViewBackBtn');
    // Bound directly to touchend (with preventDefault to stop the follow-up
    // synthetic click from double-firing) instead of onclick. This skips
    // the browser's tap-vs-gesture disambiguation step entirely, which is
    // the standard fix when touch-action: manipulation alone isn't enough
    // to eliminate residual click latency on a specific element.
    const favBackAction = (e) => {
        if (e) e.preventDefault();
        haptic.press();
        closeFavouritesView();
    };
    favBackBtn.ontouchend = favBackAction;
    favBackBtn.onclick = favBackAction; // fallback for mouse/non-touch testing
}

function checkFavEmpty(list) {
    const rows = list.querySelectorAll('.fav-row');
    if (!rows.length) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-heart-crack"></i><p>No favourites yet.<br>Tap ⭐ on any folder, file, or note to add it here.</p></div>';
        document.getElementById('favCount').textContent = '0';
    }
}

function closeFavouritesView() {
    const favView = document.getElementById('favouritesView');
    // No display toggling needed on the content underneath -- it was never
    // actually hidden (the opaque full-screen favView already covered it),
    // and restoring display:'' on that section was the real cost causing
    // the delay: forcing a full layout/paint recompute of a blur-heavy
    // subtree from scratch. Just hide the overlay itself, instantly.
    favView.classList.remove('fav-view-visible');
    updateDeptAddFabVisibility();
    favView.classList.add('hidden');
}

// ============================================================
// RECENT DOCUMENTS VIEW (Continue Reading / Opened / Added / Modified)
// ============================================================

let currentRecentsTab = 'continue';

function relativeTimeLabel(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

function buildRecentRow({ icon, iconClass, name, folderPath, meta, onClick }) {
    const row = document.createElement('div');
    row.className = 'fav-row';
    row.innerHTML = `
        <div class="fav-row-icon${iconClass ? ' ' + iconClass : ''}"><i class="fas ${icon}"></i></div>
        <div class="fav-row-info">
            <div class="fav-row-name">${escapeHtml(name)}</div>
            <div class="fav-row-path">${escapeHtml(folderPath || 'Home')}${meta ? ' · ' + escapeHtml(meta) : ''}</div>
        </div>
    `;
    row.addEventListener('click', onClick);
    return row;
}

async function renderRecentsTab(tab) {
    currentRecentsTab = tab;
    document.querySelectorAll('#recentsSubtabRow .subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.recentsTab === tab);
    });

    const list = document.getElementById('recentsViewList');
    list.innerHTML = '<div class="fav-empty"><i class="fas fa-spinner fa-spin"></i></div>';

    if (tab === 'continue') {
        await renderContinueReadingTab(list);
        return;
    }

    const entries = getRecentByAction(tab, docmanSettings.recentsLimit || 20);
    if (!entries.length) {
        const labels = { opened: 'opened', added: 'added', modified: 'modified' };
        list.innerHTML = `<div class="fav-empty"><i class="fas fa-clock-rotate-left"></i><p>Nothing ${labels[tab] || ''} yet.</p></div>`;
        return;
    }

    list.innerHTML = '';
    entries.forEach(r => {
        const icon = r.kind === 'note' ? 'fa-sticky-note' : getFileIcon(r.name);
        const iconClass = r.kind === 'note' ? 'fav-row-icon-note' : '';
        const row = buildRecentRow({
            icon,
            iconClass,
            name: r.name,
            folderPath: r.folderPath,
            meta: relativeTimeLabel(r.time),
            onClick: () => {
                closeRecentsView();
                if (r.kind === 'note') {
                    const n = allNotes[r.folderPath]?.find(x => x.id === r.noteId || x.title === r.name);
                    if (n) openNote({ ...n, folder: r.folderPath });
                    else showToast('Note not found', true);
                } else {
                    openFile(r.name, r.folderPath);
                }
            }
        });
        list.appendChild(row);
    });
}

// Continue Reading — walks recently-opened PDFs and asks the native plugin
// for each one's saved page (see PdfNativePlugin.getLastPage). Only viable
// on native Android (the only platform with a viewer that tracks pages), and
// only checks a bounded recent set rather than every PDF in the library, so
// it stays fast even with thousands of documents.
async function renderContinueReadingTab(list) {
    const PdfNative = window.Capacitor?.Plugins?.PdfNative;
    if (!isNativePlatform() || !PdfNative) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-book-open"></i><p>Continue Reading is available in the native app viewer.</p></div>';
        return;
    }

    const candidates = getRecentByAction('opened', 30).filter(r => r.kind === 'file' && getFileType(r.name) === 'pdf');
    if (!candidates.length) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-book-open"></i><p>No PDFs opened yet.</p></div>';
        return;
    }

    const withProgress = [];
    for (const r of candidates) {
        try {
            const docId = getPdfDocId(r.folderPath, r.name);
            const last = await PdfNative.getLastPage({ docId });
            if (last?.found && last.page > 0) {
                withProgress.push({ ...r, page: last.page, totalPages: last.totalPages, updatedAt: last.updatedAt || r.time });
            }
        } catch (e) { /* no saved progress for this one — skip */ }
    }

    if (!withProgress.length) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-book-open"></i><p>No PDFs in progress.<br>Progress saves automatically as you read.</p></div>';
        return;
    }

    withProgress.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    list.innerHTML = '';
    withProgress.forEach(r => {
        const pct = r.totalPages > 0 ? Math.round(((r.page + 1) / r.totalPages) * 100) : null;
        const meta = pct !== null ? `Page ${r.page + 1} of ${r.totalPages} · ${pct}%` : `Page ${r.page + 1}`;
        const row = buildRecentRow({
            icon: 'fa-file-pdf',
            name: r.name,
            folderPath: r.folderPath,
            meta,
            onClick: () => {
                closeRecentsView();
                openFile(r.name, r.folderPath);
            }
        });
        if (pct !== null) {
            const bar = document.createElement('div');
            bar.className = 'continue-reading-bar';
            bar.innerHTML = `<div class="continue-reading-bar-fill" style="width:${pct}%"></div>`;
            row.querySelector('.fav-row-info').appendChild(bar);
        }
        list.appendChild(row);
    });
}

function openRecentsView() {
    document.getElementById('searchInfo').classList.add('hidden');
    renderRecentsTab(currentRecentsTab);

    const view = document.getElementById('recentsView');
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('fav-view-visible'));
    updateDeptAddFabVisibility();

    document.querySelectorAll('#recentsSubtabRow .subtab-btn').forEach(btn => {
        btn.onclick = () => { haptic.press();
            renderRecentsTab(btn.dataset.recentsTab); };
    });

    const backBtn = document.getElementById('recentsViewBackBtn');
    const backAction = (e) => { if (e) e.preventDefault();
        haptic.press();
        closeRecentsView(); };
    backBtn.ontouchend = backAction;
    backBtn.onclick = backAction;
}

function closeRecentsView() {
    const view = document.getElementById('recentsView');
    view.classList.remove('fav-view-visible');
    updateDeptAddFabVisibility();
    view.classList.add('hidden');
}

// ============================================================
// STORAGE DASHBOARD VIEW
// ============================================================

function renderDashboardView() {
    const body = document.getElementById('dashboardViewBody');

    let folderCount = 0, pdfCount = 0, imgCount = 0, noteCount = 0;
    let totalBytes = 0;
    let largestFile = { name: '—', size: 0, folderPath: '' };

    function countFolders(obj) {
        for (const k in obj) if (obj[k] && typeof obj[k] === 'object') { folderCount++;
            countFolders(obj[k]); }
    }
    countFolders(fileSystem);

    for (const folderPath in allFiles) {
        if (!allFiles[folderPath]) continue;
        for (const f of allFiles[folderPath]) {
            const bytes = getFileBytes(f);
            totalBytes += bytes;
            if (getFileType(f.name) === 'pdf') pdfCount++;
            else imgCount++;
            if (bytes > largestFile.size) largestFile = { name: f.name, size: bytes, folderPath };
        }
    }
    for (const folderPath in allNotes) {
        if (!allNotes[folderPath]) continue;
        noteCount += allNotes[folderPath].length;
    }

    const expiring = getAllExpiringFiles(EXPIRY_SOON_DAYS);

    body.innerHTML = `
        <div class="dash-stat-grid">
            <div class="dash-stat-card">
                <div class="dash-stat-icon"><i class="fas fa-folder"></i></div>
                <div class="dash-stat-value">${folderCount}</div>
                <div class="dash-stat-label">Folders</div>
            </div>
            <div class="dash-stat-card">
                <div class="dash-stat-icon dash-icon-pdf"><i class="fas fa-file-pdf"></i></div>
                <div class="dash-stat-value">${pdfCount}</div>
                <div class="dash-stat-label">PDFs</div>
            </div>
            <div class="dash-stat-card">
                <div class="dash-stat-icon dash-icon-note"><i class="fas fa-sticky-note"></i></div>
                <div class="dash-stat-value">${noteCount}</div>
                <div class="dash-stat-label">Notes</div>
            </div>
            <div class="dash-stat-card">
                <div class="dash-stat-icon dash-icon-img"><i class="fas fa-image"></i></div>
                <div class="dash-stat-value">${imgCount}</div>
                <div class="dash-stat-label">Images</div>
            </div>
        </div>
        <div class="dash-used-card">
            <div class="dash-used-label">Storage Used</div>
            <div class="dash-used-value">${formatBytes(totalBytes)}</div>
        </div>
        ${expiring.length ? `
        <div class="settings-group-title">Expiring Soon</div>
        <div class="settings-card">
            ${expiring.map(e => `
                <div class="dept-manage-row dash-expiry-row" data-folder="${escapeHtml(e.folderPath)}" data-file="${escapeHtml(e.file.name)}">
                    <div class="settings-item-icon" style="width:32px;height:32px;font-size:0.8rem;flex-shrink:0"><i class="fas ${getFileIcon(e.file.name)}"></i></div>
                    <div class="dept-manage-name" style="font-weight:600;font-size:0.82rem;">${escapeHtml(e.file.name)}</div>
                    <span class="card-expiry-badge card-expiry-${e.status}">${e.status === 'overdue' ? 'Expired' : `${e.days}d left`}</span>
                </div>
            `).join('')}
        </div>` : ''}
        <div class="settings-group-title">Largest Document</div>
        <div class="settings-card">
            <div class="dept-manage-row">
                <div class="settings-item-icon" style="width:32px;height:32px;font-size:0.8rem;flex-shrink:0"><i class="fas fa-file"></i></div>
                <div class="dept-manage-name" style="font-weight:600;font-size:0.82rem;">${largestFile.size > 0 ? escapeHtml(largestFile.name) : '—'}</div>
                <span class="dept-manage-count">${largestFile.size > 0 ? formatBytes(largestFile.size) : ''}</span>
            </div>
        </div>
        <div class="settings-group-title">By Department</div>
        <div class="settings-card">
            ${Object.keys(fileSystem).length ? Object.keys(fileSystem).map(dept => {
                const bytes = computeFolderSizeBytes(fileSystem[dept], [dept]);
                const pct = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
                return `<div class="sd-dept-row">
                    <div class="sd-dept-name">${escapeHtml(dept)}</div>
                    <div class="sd-dept-bar-wrap"><div class="sd-dept-bar" style="width:${pct}%"></div></div>
                    <div class="sd-dept-meta">${formatBytes(bytes)}</div>
                </div>`;
            }).join('') : '<div class="settings-empty-row">No departments yet</div>'}
        </div>
    `;

    body.querySelectorAll('.dash-expiry-row').forEach(row => {
        row.onclick = () => {
            const folderPath = row.dataset.folder;
            const fileName = row.dataset.file;
            const file = allFiles[folderPath]?.find(f => f.name === fileName);
            if (file) { closeDashboardView(); openFile(fileName, folderPath); }
        };
    });
}

function openDashboardView() {
    document.getElementById('searchInfo').classList.add('hidden');
    renderDashboardView();
    const view = document.getElementById('dashboardView');
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('fav-view-visible'));
    updateDeptAddFabVisibility();

    const backBtn = document.getElementById('dashboardViewBackBtn');
    const backAction = (e) => { if (e) e.preventDefault();
        haptic.press();
        closeDashboardView(); };
    backBtn.ontouchend = backAction;
    backBtn.onclick = backAction;
}

function closeDashboardView() {
    const view = document.getElementById('dashboardView');
    view.classList.remove('fav-view-visible');
    updateDeptAddFabVisibility();
    view.classList.add('hidden');
}

// ============================================================
// RECYCLE BIN VIEW
// ============================================================

const RECYCLE_KIND_ICON = { file: 'fa-file', note: 'fa-sticky-note', folder: 'fa-folder' };

function renderRecycleBinList() {
    const list = document.getElementById('recycleBinViewList');
    if (!recycleBin.length) {
        list.innerHTML = '<div class="fav-empty"><i class="fas fa-trash-can"></i><p>Recycle Bin is empty.</p></div>';
        return;
    }

    list.innerHTML = '';
    recycleBin.forEach(item => {
        const icon = item.kind === 'file' ? getFileIcon(item.name) : (RECYCLE_KIND_ICON[item.kind] || 'fa-file');
        const daysLeft = Math.max(0, RECYCLE_BIN_RETENTION_DAYS - Math.floor((Date.now() - item.deletedAt) / (24 * 60 * 60 * 1000)));
        const row = document.createElement('div');
        row.className = 'fav-row';
        row.innerHTML = `
            <div class="fav-row-icon${item.kind === 'note' ? ' fav-row-icon-note' : item.kind === 'folder' ? ' fav-row-icon-folder' : ''}"><i class="fas ${icon}"></i></div>
            <div class="fav-row-info">
                <div class="fav-row-name">${escapeHtml(item.name)}</div>
                <div class="fav-row-path">${escapeHtml(item.folderPath || 'Home')}</div>
                <div class="recycle-row-meta">Deleted ${relativeTimeLabel(item.deletedAt)} · ${daysLeft}d left</div>
            </div>
            <div class="recycle-row-actions">
                <button class="recycle-restore-btn" title="Restore"><i class="fas fa-rotate-left"></i></button>
                <button class="recycle-purge-btn" title="Delete Forever"><i class="fas fa-trash"></i></button>
            </div>
        `;
        row.querySelector('.recycle-restore-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            haptic.toggle();
            await restoreRecycleBinItem(item.id);
            renderRecycleBinList();
        });
        row.querySelector('.recycle-purge-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirmModal(`Permanently delete "<b>${escapeHtml(item.name)}</b>"? This cannot be undone.`, async (confirmed) => {
                if (!confirmed) return;
                haptic.warning();
                await permanentlyDeleteRecycleBinItem(item.id);
                renderRecycleBinList();
            });
        });
        list.appendChild(row);
    });
}

function openRecycleBinView() {
    document.getElementById('searchInfo').classList.add('hidden');
    renderRecycleBinList();
    const view = document.getElementById('recycleBinView');
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('fav-view-visible'));
    updateDeptAddFabVisibility();

    const backBtn = document.getElementById('recycleBinViewBackBtn');
    const backAction = (e) => { if (e) e.preventDefault();
        haptic.press();
        closeRecycleBinView(); };
    backBtn.ontouchend = backAction;
    backBtn.onclick = backAction;

    const emptyBtn = document.getElementById('emptyRecycleBinBtn');
    emptyBtn.onclick = () => {
        if (!recycleBin.length) { showToast('Recycle Bin is already empty');
            return; }
        showConfirmModal('Permanently delete everything in the Recycle Bin? This cannot be undone.', async (confirmed) => {
            if (!confirmed) return;
            haptic.warning();
            await emptyRecycleBin();
            renderRecycleBinList();
        });
    };
}

function closeRecycleBinView() {
    const view = document.getElementById('recycleBinView');
    view.classList.remove('fav-view-visible');
    updateDeptAddFabVisibility();
    view.classList.add('hidden');
}

// ============================================================
// TAB SWITCHING
// ============================================================

function setActiveTab(tab) {
    haptic.toggle();
    currentActiveTab = tab;
    const pdfBtn = document.getElementById('pdfTabBtn');
    const notesBtn = document.getElementById('notesTabBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const newNoteBtn = document.getElementById('newNoteBtn');
    const toggleEl = document.getElementById('fileNoteToggle');

    if (tab === 'pdfs') {
        pdfBtn.classList.add('active');
        notesBtn.classList.remove('active');
        uploadBtn.classList.remove('hidden');
        newNoteBtn.classList.add('hidden');
        if (toggleEl) { toggleEl.classList.add('active-files'); toggleEl.classList.remove('active-notes'); }
    } else {
        pdfBtn.classList.remove('active');
        notesBtn.classList.add('active');
        uploadBtn.classList.add('hidden');
        newNoteBtn.classList.remove('hidden');
        if (toggleEl) { toggleEl.classList.add('active-notes'); toggleEl.classList.remove('active-files'); }
    }
    render();
}

// ============================================================
// THEME
// ============================================================

function toggleTheme() {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';
    docmanSettings.theme = newTheme;
    saveSettings();
    applyTheme(newTheme);
}

function updateThemeIcon() {
    const themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return;

    const isDark = !document.body.classList.contains('light-mode');
    const iconWrapper = themeBtn.querySelector('.theme-icon-wrapper');
    if (iconWrapper) {
        iconWrapper.innerHTML = `<i class="fas ${isDark ? 'fa-sun' : 'fa-moon'}"></i>`;
    }
    themeBtn.dataset.theme = isDark ? 'dark' : 'light';
}

function applyTheme(theme) {
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('light-mode', !prefersDark);
    } else {
        document.body.classList.toggle('light-mode', theme === 'light');
    }
    localStorage.setItem('docman_theme', theme);
    updateThemeIcon();
    applyThemePickUI();
}

function applyThemePickUI() {
    const theme = docmanSettings.theme || 'dark';
    document.getElementById('themePickDark')?.classList.toggle('active', theme === 'dark');
    document.getElementById('themePickLight')?.classList.toggle('active', theme === 'light');
    document.getElementById('themePickSystem')?.classList.toggle('active', theme === 'system');
}

function applyAnimations() {
    document.body.classList.toggle('reduce-motion', !docmanSettings.enableAnimations);
}

function applyParticles() {
    const pc = document.querySelector('.particles-container');
    const g1 = document.querySelector('.ambient-glow.glow-1');
    const g2 = document.querySelector('.ambient-glow.glow-2');
    const show = docmanSettings.enableParticles;
    if (pc) pc.style.display = show ? '' : 'none';
    if (g1) g1.style.display = show ? '' : 'none';
    if (g2) g2.style.display = show ? '' : 'none';
}

function applyRadioUI(radioName) {
    const val = docmanSettings[radioName] || 'docman';
    document.querySelectorAll(`[data-radio="${radioName}"]`).forEach(dot => {
        dot.classList.toggle('active', dot.getAttribute('data-val') === val);
    });
}

// ============================================================
// APP LOCK GATE (PIN Lock enforcement, Auto Lock, Session Timeout,
// Fingerprint/Face Unlock)
// ============================================================
// Everything below is what actually ENFORCES app lock -- the PIN itself
// (PIN_KEY, hashPin, showPinVerifyModal) already existed, but nothing ever
// gated app access with it. This is that gate.

let appIsLocked = false;
let lastBackgroundedAt = null;
let inactivityLockTimer = null;
// Almost anything that hands off to a native Android surface -- the file
// picker (Upload/Import), the PDF viewer, the Share sheet, the biometric
// prompt -- backgrounds this WebView exactly like actually switching away
// from the app would; visibilitychange fires the same way either way.
// There's no reliable time threshold that separates them from a real
// app-switch: browsing a file picker, or just reading a PDF for a while,
// can easily take longer than someone glancing at another app and back.
// So this isn't time-based at all -- call expectNativeReturn() right
// before deliberately launching any of those, and the very next time the
// app settles back to visible (however long that took) is treated as
// "that was us, not the person leaving DOCMAN" and skips the relock check
// entirely, exactly once.
//
// This only protects a LIVE session -- it's in-memory only, on purpose.
// An earlier version also persisted this to localStorage so it could
// survive Android silently killing and recreating the process mid-native-
// Activity (a real thing that can happen under memory pressure). That
// turned out to be unfixable well: there's no time window for "is this
// marker still valid" that can tell a real process restart apart from
// someone deliberately closing and reopening the app quickly -- both look
// identical from a timer alone, so any window wide enough to help the
// first case was also wide enough to silently skip the lock screen for
// the second. enforceAppLockGate() (the actual boot-time gate) no longer
// looks at anything persisted at all -- it locks on every real launch,
// full stop. This flag now only smooths over relock *within* a session
// that never actually died, which carries none of that risk.
let expectingNativeReturn = false;

function expectNativeReturn() {
    expectingNativeReturn = true;
}

function getBiometricPlugin() {
    return window.Capacitor?.Plugins?.BiometricAuth || null;
}

// -1 = never auto-lock, 0 = lock immediately, otherwise seconds.
function getAutoLockMs() {
    const secs = docmanSettings.autoLockSeconds;
    if (secs === undefined || secs === null || secs < 0) return -1;
    return secs * 1000;
}

function isAppLockActive() {
    return !!(docmanSettings.appLock && localStorage.getItem(PIN_KEY));
}

// Timestamp of the last successful unlock -- used as a short cooldown
// below so the lock screen can't immediately reappear right after someone
// has just genuinely unlocked (e.g. a biometric success landing right as
// some other check fires and briefly re-shows it before disappearing
// again). A real, deliberate re-lock is never something that needs to
// happen within a fraction of a second of unlocking, so this costs nothing
// in practice while closing off that flash.
let lastUnlockAt = 0;
const RELOCK_COOLDOWN_MS = 1000;

// Called once at startup. Resolves immediately if no lock is configured;
// otherwise blocks (via the returned Promise) until the person unlocks.
//
// Deliberately unconditional -- always shows the lock screen here, every
// time, with no "was this maybe just a process restart, not a real
// re-open" bypass. An earlier version tried exactly that (a marker written
// before any native handoff, checked here), but there's no time window
// that can tell "Android silently killed and recreated the process mid-
// PDF-viewer" apart from "the person deliberately closed and reopened the
// app quickly" -- both look identical from a timer alone, at any window
// short enough to still be useful. A lock screen that can be silently
// skipped defeats the entire point of the feature, so this asks every
// time rather than risk that, even at the cost of occasionally asking
// again right after something that was actually just a process blip.
function enforceAppLockGate() {
    return new Promise((resolve) => {
        if (!isAppLockActive()) { resolve();
            return; }
        console.log('[DOCMAN-LOCK]', Date.now(), 'enforceAppLockGate: showing lock screen (boot)');
        appIsLocked = true;
        showAppLockScreen(() => {
            console.log('[DOCMAN-LOCK]', Date.now(), 'enforceAppLockGate: unlocked (boot)');
            appIsLocked = false;
            lastUnlockAt = Date.now();
            resetInactivityLockTimer();
            resolve();
        });
    });
}

function relockApp() {
    if (!isAppLockActive() || appIsLocked) return;
    // Never relock before the app has even finished its first real load and
    // render after unlocking -- that initial load (reading everything back
    // out of IndexedDB) can genuinely take longer than any fixed guess,
    // especially with a large document library, and a relock check landing
    // anywhere in that window used to slip through a fixed-duration
    // cooldown. There is no meaningful "relock" before the person has even
    // seen the app's content once, so this is an unconditional gate, not a
    // timing guess.
    if (!window.docmanReady) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'relockApp: blocked, docmanReady is false');
        return;
    }
    if (Date.now() - lastUnlockAt < RELOCK_COOLDOWN_MS) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'relockApp: blocked, within cooldown of last unlock');
        return;
    }
    // Don't stack the full-screen app-lock over an in-progress locked-
    // file/folder PIN prompt -- that's a deliberate, active interaction
    // (e.g. reopening a locked PDF right after closing another one) and
    // should never get silently interrupted or visually buried by a relock
    // decision landing at the same moment.
    if (document.getElementById('pinVerifyModal')) return;
    console.log('[DOCMAN-LOCK]', Date.now(), 'relockApp: showing lock screen (relock)');
    appIsLocked = true;
    clearTimeout(inactivityLockTimer);
    showAppLockScreen(() => {
        console.log('[DOCMAN-LOCK]', Date.now(), 'relockApp: unlocked (relock)');
        appIsLocked = false;
        lastUnlockAt = Date.now();
        resetInactivityLockTimer();
    });
}

// Auto Lock (background) — records when the app was hidden, and if enough
// time has passed by the time it's visible again, re-locks. Debounced:
// some native transitions flicker hidden/visible more than once in quick
// succession as the Activity animates, so this waits for visibility to
// actually settle before deciding anything.
let visibilityDebounceTimer = null;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'visibilitychange: hidden');
        if (lastBackgroundedAt == null) lastBackgroundedAt = Date.now();
        clearTimeout(inactivityLockTimer);
        clearTimeout(visibilityDebounceTimer);
    } else {
        console.log('[DOCMAN-LOCK]', Date.now(), 'visibilitychange: visible, debouncing 300ms');
        clearTimeout(visibilityDebounceTimer);
        visibilityDebounceTimer = setTimeout(handleAppSettledVisible, 300);
    }
});

function handleAppSettledVisible() {
    if (document.hidden) { console.log('[DOCMAN-LOCK]', Date.now(), 'handleAppSettledVisible: flapped hidden again, skipping');
        return; }

    const wasExpectingNative = expectingNativeReturn;
    expectingNativeReturn = false;
    const backgroundedAt = lastBackgroundedAt;
    lastBackgroundedAt = null;
    console.log('[DOCMAN-LOCK]', Date.now(), 'handleAppSettledVisible: wasExpectingNative=', wasExpectingNative, 'appIsLocked=', appIsLocked, 'backgroundedAt=', backgroundedAt);

    if (!isAppLockActive() || appIsLocked || backgroundedAt == null) return;

    // Stale signal guard -- the visibilitychange that produced this
    // backgroundedAt timestamp can arrive from something that started
    // BEFORE the person already unlocked through some other path (most
    // commonly: the native biometric prompt itself backgrounding the
    // WebView while it's open, then closing after the person switched to
    // the PIN pad and unlocked before this debounced check got a chance
    // to run). Without this guard, that late-arriving, already-resolved
    // background/foreground pair gets misread as a brand-new "away and
    // back" cycle and can trigger a spurious relock immediately after a
    // successful unlock. If the backgrounding we're evaluating started
    // before the most recent successful unlock, it's leftover bookkeeping
    // from an already-resolved lock cycle, not a new one -- ignore it.
    if (backgroundedAt < lastUnlockAt) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'handleAppSettledVisible: stale backgroundedAt predates lastUnlockAt, ignoring');
        return;
    }

    if (wasExpectingNative) {
        resetInactivityLockTimer();
        return;
    }

    const elapsed = Date.now() - backgroundedAt;
    const ms = getAutoLockMs();
    console.log('[DOCMAN-LOCK]', Date.now(), 'handleAppSettledVisible: elapsed=', elapsed, 'threshold=', ms);
    if (ms >= 0 && elapsed >= ms) relockApp();
    else resetInactivityLockTimer();
}

// Session Timeout (foreground inactivity) — shares the same duration
// setting as Auto Lock. A value of 0 means "lock immediately on
// background", which doesn't sensibly apply to sitting still looking at
// the screen, so the idle timer only runs for positive durations.
function resetInactivityLockTimer() {
    clearTimeout(inactivityLockTimer);
    if (!isAppLockActive() || appIsLocked) return;
    const ms = getAutoLockMs();
    if (ms <= 0) return;
    inactivityLockTimer = setTimeout(relockApp, ms);
}
['touchstart', 'mousedown', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => { if (!appIsLocked) resetInactivityLockTimer(); }, { passive: true });
});

// Non-dismissable full-screen lock — deliberately separate from
// showPinVerifyModal (which is used for one-off confirmations elsewhere,
// e.g. before changing security settings, and has a Cancel button). This
// screen has no way out except a correct PIN or successful biometric.
function showAppLockScreen(onUnlock) {
    // The loading skeleton underneath (see showLoadingSkeleton()) uses
    // continuously-animating "shimmer" elements. They're fully hidden
    // behind this opaque lock screen while it's up, so animating them is
    // pure wasted work -- pausing them here (and resuming on unlock)
    // frees up the main thread/GPU for input handling while a PIN is
    // being entered instead of competing with it for no visible benefit.
    document.body.classList.add('lock-active');
    const existing = document.getElementById('appLockScreen');
    console.log('[DOCMAN-LOCK]', Date.now(), 'showAppLockScreen called, existing overlay found:', !!existing);
    if (existing) existing.remove();

    const biometricReady = !!(docmanSettings.biometricUnlock && getBiometricPlugin());

    const overlay = document.createElement('div');
    overlay.id = 'appLockScreen';
    overlay.style.cssText = 'position:fixed;inset:0;background:#170a28;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;touch-action:manipulation;';
    overlay.innerHTML = `
        <!-- position:relative + both child views position:absolute means
             BOTH views are laid out and painted from the very first frame,
             regardless of which one starts visible. Switching between them
             is then a pure opacity/pointer-events change -- a compositor-
             only operation with no layout pass involved -- instead of a
             display:none -> block transition, which is what was causing
             the PIN keypad to feel laggy on its first tap after switching
             to it (an element coming out of display:none isn't fully
             "warmed up" for input the instant it becomes visible). A fixed
             min-height reserves room for the taller of the two views so
             neither one collapses the container while stacked. -->
        <div style="width:100%;max-width:340px;text-align:center;position:relative;min-height:520px;">

            <!-- Biometric-first view: shown alone when biometric unlock is on,
                 no PIN pad visible at all until it's actually needed. This is
                 the "smart" single flow -- one method at a time, not two
                 competing prompts stacked on top of each other. -->
            <div id="alBioView" style="position:absolute;top:0;left:0;right:0;opacity:${biometricReady ? '1' : '0'};pointer-events:${biometricReady ? 'auto' : 'none'};">
                <div style="width:88px;height:88px;background:linear-gradient(135deg,#ff6b4a,#e91e8c);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:2.2rem;color:#fff;">
                    <i class="fas fa-fingerprint"></i>
                </div>
                <p style="color:#f8fafc;font-size:1.1rem;font-weight:700;margin:0 0 4px;font-family:Inter,sans-serif;">DOCMAN Locked</p>
                <p id="alBioStatus" style="color:#94a3b8;font-size:0.8rem;margin:0 0 28px;font-family:Inter,sans-serif;">Use fingerprint or face to unlock</p>
                <button id="alRetryBioBtn" style="touch-action:manipulation;width:100%;padding:13px;border-radius:40px;border:none;background:linear-gradient(135deg,#ff6b4a,#e91e8c);color:#fff;font-weight:600;font-family:Inter,sans-serif;font-size:0.88rem;margin-bottom:12px;">
                    <i class="fas fa-fingerprint"></i>&nbsp; Try Again
                </button>
                <button id="alUsePinBtn" style="touch-action:manipulation;width:100%;padding:12px;border-radius:40px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#94a3b8;font-family:Inter,sans-serif;font-size:0.85rem;">Use PIN Instead</button>
            </div>

            <!-- PIN pad view: the only method when biometric is off, or the
                 fallback once biometric fails / is cancelled / the person
                 taps "Use PIN Instead" above. -->
            <div id="alPinView" style="position:absolute;top:0;left:0;right:0;opacity:${biometricReady ? '0' : '1'};pointer-events:${biometricReady ? 'none' : 'auto'};">
                <div style="width:64px;height:64px;background:linear-gradient(135deg,#ff6b4a,#e91e8c);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:1.8rem;">🔒</div>
                <p style="color:#f8fafc;font-size:1.1rem;font-weight:700;margin:0 0 4px;font-family:Inter,sans-serif;">DOCMAN Locked</p>
                <p style="color:#94a3b8;font-size:0.8rem;margin:0 0 26px;font-family:Inter,sans-serif;">Enter your PIN to continue</p>
                <div id="alDots" style="display:flex;justify-content:center;gap:14px;margin-bottom:28px;">
                    ${[0, 1, 2, 3].map(i => `<div id="alDot${i}" style="width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.22);transition:all 0.15s;"></div>`).join('')}
                </div>
                <div id="alGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:${biometricReady ? '10' : '18'}px;">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => `
                        <button class="alKey" data-key="${k}" style="touch-action:manipulation;padding:18px 0;border-radius:16px;border:1px solid rgba(255,255,255,${k === '' ? '0' : '0.1'});background:${k === '' ? 'transparent' : 'rgba(255,255,255,0.06)'};color:#e2e8f0;font-size:1.2rem;font-weight:600;font-family:Inter,sans-serif;cursor:${k === '' ? 'default' : 'pointer'};pointer-events:${k === '' ? 'none' : 'auto'};">${k}</button>
                    `).join('')}
                </div>
                ${biometricReady ? `<button id="alBackToBioBtn" style="touch-action:manipulation;width:100%;padding:12px;border-radius:40px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#94a3b8;font-family:Inter,sans-serif;font-size:0.85rem;"><i class="fas fa-fingerprint"></i>&nbsp; Use Biometric Instead</button>` : ''}
            </div>

        </div>`;
    document.body.appendChild(overlay);

    const bioView = overlay.querySelector('#alBioView');
    const pinView = overlay.querySelector('#alPinView');
    const bioStatus = overlay.querySelector('#alBioStatus');

    let entered = '';
    const storedPin = localStorage.getItem(PIN_KEY) || '';

    // Pure compositor-level opacity/pointer-events flips -- both views were
    // already laid out and painted from frame one, so there's no display
    // transition here for the browser to "catch up" on before the next tap.
    function showPinView() {
        bioView.style.opacity = '0';
        bioView.style.pointerEvents = 'none';
        pinView.style.opacity = '1';
        pinView.style.pointerEvents = 'auto';
    }
    function showBioView() {
        pinView.style.opacity = '0';
        pinView.style.pointerEvents = 'none';
        bioView.style.opacity = '1';
        bioView.style.pointerEvents = 'auto';
        if (bioStatus) bioStatus.textContent = 'Use fingerprint or face to unlock';
    }

    function updateDots() {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`alDot${i}`);
            dot.style.background = i < entered.length ? '#ff6b4a' : 'rgba(255,255,255,0.12)';
            dot.style.borderColor = i < entered.length ? '#ff6b4a' : 'rgba(255,255,255,0.22)';
        }
    }

    function shake() {
        const box = pinView;
        let count = 0;
        const interval = setInterval(() => {
            box.style.transform = count % 2 === 0 ? 'translateX(8px)' : 'translateX(-8px)';
            count++;
            if (count > 5) { clearInterval(interval);
                box.style.transform = ''; }
        }, 50);
    }

    function unlock() {
        console.log('[DOCMAN-LOCK]', Date.now(), 'unlock() called -- removing this overlay instance');
        // Hide synchronously before remove() -- on a slow paint/reflow tick
        // (right as a native dialog is handing focus back) a bare remove()
        // can visually linger for a frame or two; forcing display:none first
        // makes the disappearance immediate regardless of when the DOM
        // removal itself actually gets painted.
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        overlay.remove();
        document.body.classList.remove('lock-active');
        onUnlock();
    }

    // Toggles the bright "Try Again" / "Use PIN Instead" buttons off while
    // the native biometric prompt is actually up. The system dialog's own
    // close animation can briefly reveal whatever is underneath it before
    // our JS gets a chance to react -- with this on, that brief reveal is
    // just the fingerprint icon and title (a quiet, in-progress-looking
    // frame) instead of a flash of full button UI that reads as "stuck".
    function setBioBusy(busy) {
        if (retryBioBtn) retryBioBtn.style.opacity = busy ? '0' : '1';
        if (retryBioBtn) retryBioBtn.style.pointerEvents = busy ? 'none' : 'auto';
        if (usePinBtn) usePinBtn.style.opacity = busy ? '0' : '1';
        if (usePinBtn) usePinBtn.style.pointerEvents = busy ? 'none' : 'auto';
        if (bioStatus) bioStatus.style.opacity = busy ? '0' : '1';
    }

    // Fades the ENTIRE lock screen to invisible right before the native
    // biometric prompt opens (while still blocking touches underneath).
    // On success, unlock() removes an already-invisible overlay, so the
    // system dialog's own close animation has nothing branded left to
    // reveal for that brief moment -- it goes straight through to the
    // app underneath instead of flashing "DOCMAN Locked" first. On
    // failure/cancel this is reversed so the person can see the retry
    // options again.
    function setOverlayHidden(hidden) {
        overlay.style.transition = hidden ? 'none' : 'opacity 0.15s ease';
        overlay.style.opacity = hidden ? '0' : '1';
    }

    async function tryBiometric() {
        console.log('[DOCMAN-LOCK]', Date.now(), 'tryBiometric() invoked');
        const plugin = getBiometricPlugin();
        if (!plugin) { showPinView();
            return; }
        try {
            const avail = await plugin.isAvailable();
            if (!avail?.available) { showPinView();
                return; }
            // The biometric prompt is a native system dialog, same class of
            // "briefly backgrounds the WebView" behavior as the PDF viewer
            // and Share sheet -- suppress defensively so it can never cause
            // a spurious extra relock cycle while it's on screen.
            expectNativeReturn();
            setBioBusy(true);
            setOverlayHidden(true);
            console.log('[DOCMAN-LOCK]', Date.now(), 'tryBiometric: calling native authenticate()');
            const result = await plugin.authenticate({ reason: 'Unlock DOCMAN' });
            console.log('[DOCMAN-LOCK]', Date.now(), 'tryBiometric: native result =', JSON.stringify(result));
            expectingNativeReturn = false;
            if (result?.success) {
                unlock();
            } else if (result?.negativeButton) {
                // The native dialog's OWN "Use PIN instead" button (distinct
                // from DOCMAN's HTML one, worded the same on purpose) --
                // this means the person explicitly asked for the PIN pad,
                // so show it directly instead of leaving them on the
                // biometric screen with just a status message.
                setOverlayHidden(false);
                setBioBusy(false);
                showPinView();
            } else {
                setOverlayHidden(false);
                setBioBusy(false);
                if (bioStatus) bioStatus.textContent = "Didn't match — try again, or use your PIN";
            }
        } catch (e) {
            console.log('[DOCMAN-LOCK]', Date.now(), 'tryBiometric: threw', e);
            expectingNativeReturn = false;
            setOverlayHidden(false);
            setBioBusy(false);
            // Cancelled or failed -- stay on the biometric view with a
            // gentle nudge toward the PIN fallback, no error toast needed.
            if (bioStatus) bioStatus.textContent = 'Cancelled — try again, or use your PIN';
        }
    }

    // touchend-primary, click-fallback: same technique already used for the
    // Favourites view's back button in this file. Relying on 'click' alone
    // means waiting for the browser's tap-vs-gesture disambiguation (up to
    // ~300ms) before anything happens; touchend fires immediately, and
    // preventDefault on it stops the trailing synthetic click from
    // double-firing the action a moment later.
    function bindTap(el, handler) {
        if (!el) return;
        let firedByTouch = false;
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            firedByTouch = true;
            handler();
            setTimeout(() => { firedByTouch = false; }, 400);
        }, { passive: false });
        el.addEventListener('click', () => {
            if (firedByTouch) return;
            handler();
        });
    }

    function withPressFeedback(el) {
        if (!el) return;
        el.addEventListener('touchstart', () => { el.style.opacity = '0.7'; }, { passive: true });
        el.addEventListener('touchend', () => { el.style.opacity = '1'; }, { passive: true });
        el.addEventListener('touchcancel', () => { el.style.opacity = '1'; }, { passive: true });
        el.addEventListener('mousedown', () => { el.style.opacity = '0.7'; });
        el.addEventListener('mouseup', () => { el.style.opacity = '1'; });
        el.addEventListener('mouseleave', () => { el.style.opacity = '1'; });
    }

    const retryBioBtn = overlay.querySelector('#alRetryBioBtn');
    const usePinBtn = overlay.querySelector('#alUsePinBtn');
    const backToBioBtn = overlay.querySelector('#alBackToBioBtn');
    [retryBioBtn, usePinBtn, backToBioBtn].forEach(withPressFeedback);
    bindTap(retryBioBtn, tryBiometric);
    bindTap(usePinBtn, showPinView);
    bindTap(backToBioBtn, () => { showBioView();
        tryBiometric(); });

    async function handleKeyPress(k) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'handleKeyPress start, key=', k === '⌫' ? '⌫' : '•');
        if (k === '⌫') {
            haptic.press();
            entered = entered.slice(0, -1);
            updateDots();
            console.log('[DOCMAN-LOCK]', Date.now(), 'handleKeyPress end (backspace)');
            return;
        }
        if (entered.length < 4 && k !== '') {
            haptic.press();
            entered += k;
            updateDots();
            console.log('[DOCMAN-LOCK]', Date.now(), 'handleKeyPress: dot updated, entered.length=', entered.length);
            if (entered.length === 4) {
                const enteredHash = await hashPin(entered);
                console.log('[DOCMAN-LOCK]', Date.now(), 'handleKeyPress: hash compared');
                if (enteredHash === storedPin) {
                    unlock();
                } else {
                    haptic.warning();
                    showToast('Incorrect PIN', true);
                    entered = '';
                    updateDots();
                    shake();
                }
            }
        }
    }

    overlay.querySelectorAll('.alKey').forEach(btn => {
        if (btn.dataset.key === '') return;
        btn.addEventListener('pointerdown', () => { btn.style.background = 'rgba(255,255,255,0.16)'; });
        btn.addEventListener('pointerup', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        btn.addEventListener('pointercancel', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        btn.addEventListener('touchstart', () => { console.log('[DOCMAN-LOCK]', Date.now(), 'alKey touchstart'); }, { passive: true });
        bindTap(btn, () => handleKeyPress(btn.dataset.key));
    });

    // Biometric-first: auto-trigger as soon as the biometric view has
    // actually painted -- not a moment before (system prompt popping up
    // over a blank frame looks broken) and not a moment later than
    // necessary either (a fixed guess like 120ms either overshoots, adding
    // a visible flash of our own screen first, or undershoots on a slower
    // device). Double requestAnimationFrame is the standard way to wait
    // for exactly one real paint to have happened: the first rAF fires
    // before the paint that includes this frame's DOM changes, the second
    // fires after it, so by then the browser has genuinely drawn this
    // screen at least once.
    if (biometricReady) {
        console.log('[DOCMAN-LOCK]', Date.now(), 'showAppLockScreen: scheduling biometric auto-trigger');
        requestAnimationFrame(() => requestAnimationFrame(tryBiometric));
    }
}



function showPinVerifyModal(title, callback) {
    const existing = document.getElementById('pinVerifyModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pinVerifyModal';
    // z-index above the app-lock screen (99999) on purpose -- this modal can
    // legitimately be triggered right around the same time as an Auto Lock
    // relock decision settling (e.g. reopening a locked file shortly after
    // returning from viewing another one), and it must never end up
    // rendered but hidden underneath that full-screen layer.
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:20px;touch-action:manipulation;';
    overlay.innerHTML = `
        <div style="background:#1a1a1a;border:1px solid rgba(239,68,68,0.4);border-radius:24px;padding:28px 24px;width:100%;max-width:320px;box-shadow:0 24px 60px rgba(0,0,0,0.7);text-align:center;">
            <div style="width:48px;height:48px;background:linear-gradient(135deg,#ef4444,#dc2626);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:1.4rem;">🔒</div>
            <p style="color:#e2e8f0;font-size:0.95rem;font-weight:700;margin:0 0 6px;font-family:Inter,sans-serif;">${title}</p>
            <p style="color:#94a3b8;font-size:0.78rem;margin:0 0 20px;font-family:Inter,sans-serif;">Enter your 4-digit PIN to confirm</p>
            <div id="pinVerifyDots" style="display:flex;justify-content:center;gap:12px;margin-bottom:24px;">
                ${[0,1,2,3].map(i => `<div id="pvDot${i}" style="width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.25);transition:all 0.15s;"></div>`).join('')}
            </div>
            <div id="pinVerifyGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
                ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
                    <button class="pvKey" data-key="${k}" style="touch-action:manipulation;padding:16px 0;border-radius:14px;border:1px solid rgba(255,255,255,${k===''?'0':'0.1'});background:${k===''?'transparent':'rgba(255,255,255,0.06)'};color:#e2e8f0;font-size:1.15rem;font-weight:600;font-family:Inter,sans-serif;cursor:${k===''?'default':'pointer'};pointer-events:${k===''?'none':'auto'};transition:background 0.1s;">${k}</button>
                `).join('')}
            </div>
            <button id="pvCancel" style="touch-action:manipulation;width:100%;padding:12px;border-radius:40px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#94a3b8;cursor:pointer;font-family:Inter,sans-serif;font-size:0.85rem;">Cancel</button>
        </div>`;
    document.body.appendChild(overlay);

    let entered = '';
    const storedPin = localStorage.getItem(PIN_KEY) || '';

    function updateDots() {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`pvDot${i}`);
            dot.style.background = i < entered.length ? '#ef4444' : 'rgba(255,255,255,0.15)';
            dot.style.borderColor = i < entered.length ? '#ef4444' : 'rgba(255,255,255,0.25)';
        }
    }

    function shakeModal() {
        const box = overlay.querySelector('div');
        box.style.animation = 'none';
        box.style.transition = 'transform 0.05s';
        let count = 0;
        const interval = setInterval(() => {
            box.style.transform = count % 2 === 0 ? 'translateX(8px)' : 'translateX(-8px)';
            count++;
            if (count > 5) { clearInterval(interval);
                box.style.transform = ''; }
        }, 50);
    }

    // touchend-primary, click-fallback -- same technique used on the app-lock
    // screen's keypad, for the same reason: 'click' alone waits on the
    // browser's tap-vs-gesture disambiguation before firing, which reads as
    // an unresponsive keypad. touchend fires immediately; preventDefault on
    // it stops the trailing synthetic click from double-firing afterward.
    function bindTap(el, handler) {
        if (!el) return;
        let firedByTouch = false;
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            firedByTouch = true;
            handler();
            setTimeout(() => { firedByTouch = false; }, 400);
        }, { passive: false });
        el.addEventListener('click', () => {
            if (firedByTouch) return;
            handler();
        });
    }

    async function handleKeyPress(k) {
        if (k === '⌫') {
            haptic.press();
            entered = entered.slice(0, -1);
            updateDots();
            return;
        }
        if (entered.length < 4 && k !== '') {
            haptic.press();
            entered += k;
            updateDots();
            if (entered.length === 4) {
                const enteredHash = await hashPin(entered);
                if (enteredHash === storedPin) {
                    overlay.remove();
                    callback(true);
                } else {
                    haptic.warning();
                    showToast('Incorrect PIN', true);
                    entered = '';
                    updateDots();
                    shakeModal();
                }
            }
        }
    }

    // Same trailing-synthetic-click problem the backdrop guard below
    // handles, but landing squarely on a keypad digit instead of the
    // backdrop: the tap that opened this locked folder can generate a
    // click a moment after this modal has already been created, and if
    // that click lands on whichever key button happens to sit at that
    // same screen position, it silently registers as a real keypress --
    // showing up as the first PIN dot already filled in before the user
    // has touched anything. Ignoring key presses within the same 400ms
    // window used for the backdrop absorbs that ghost click too.
    const overlayCreatedAt = Date.now();

    overlay.querySelectorAll('.pvKey').forEach(btn => {
        if (btn.dataset.key === '') return;
        btn.addEventListener('pointerdown', () => { btn.style.background = 'rgba(255,255,255,0.14)'; });
        btn.addEventListener('pointerup', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        btn.addEventListener('pointercancel', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        bindTap(btn, () => {
            if (Date.now() - overlayCreatedAt < 400) return;
            handleKeyPress(btn.dataset.key);
        });
    });

    const cancelBtn = document.getElementById('pvCancel');
    bindTap(cancelBtn, () => { overlay.remove();
        callback(false); });
    // The tap that opened this locked file generates a trailing synthetic
    // click a moment AFTER touchend (standard Android WebView behavior,
    // and the file card's own touchend listener is passive so it can't
    // prevent it). If that click fires after this overlay already exists,
    // it lands on whatever's now at that same screen position -- which,
    // since this overlay covers the entire screen, is very likely this
    // overlay's own backdrop rather than the small centered PIN box. That
    // reads as "tap outside to cancel" and closes the prompt almost the
    // instant it appears. Ignoring backdrop-dismiss for a brief window
    // after creation absorbs that leftover click without blocking a
    // genuine, deliberate tap-outside-to-cancel a moment later.
    overlay.addEventListener('click', (e) => {
        if (e.target !== overlay) return;
        if (Date.now() - overlayCreatedAt < 400) return;
        overlay.remove();
        callback(false);
    });
}

function promptSetPin(callback) {
    showPromptModal('Set a 4-digit PIN:', '', async (val) => {
        if (val === null) { callback(false); return; }
        const pin = val.trim();
        if (!/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits', true);
            callback(false); return; }
        localStorage.setItem(PIN_KEY, await hashPin(pin));
        showToast('PIN saved');
        callback(true);
    });
}

function updatePinStatusUI() {
    const hasPin = !!localStorage.getItem(PIN_KEY);
    const sub = document.getElementById('pinStatusSub');
    const changeCard = document.getElementById('changePinCard');
    const lockToggle = document.getElementById('appLockToggle');
    const biometricCard = document.getElementById('biometricCard');
    const autoLockCard = document.getElementById('autoLockCard');
    const autoLockGroupTitle = document.getElementById('autoLockGroupTitle');
    if (sub) sub.textContent = hasPin ? 'PIN is set' : 'Not set';
    if (changeCard) changeCard.classList.toggle('hidden', !docmanSettings.appLock);
    if (lockToggle) lockToggle.checked = docmanSettings.appLock;
    if (biometricCard) biometricCard.classList.toggle('hidden', !docmanSettings.appLock);
    if (autoLockCard) autoLockCard.classList.toggle('hidden', !docmanSettings.appLock);
    if (autoLockGroupTitle) autoLockGroupTitle.classList.toggle('hidden', !docmanSettings.appLock);

    const biometricToggle = document.getElementById('biometricToggle');
    if (biometricToggle) biometricToggle.checked = docmanSettings.biometricUnlock;

    document.querySelectorAll('.autolock-opt').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.secs) === docmanSettings.autoLockSeconds);
    });

    updateLockedItemsCountSub();
}

function updateLockedItemsCountSub() {
    const sub = document.getElementById('lockedItemsCountSub');
    if (!sub) return;
    let count = 0;
    for (const k in folderMeta) if (folderMeta[k]?.locked) count++;
    for (const path in allFiles) {
        if (!allFiles[path]) continue;
        count += allFiles[path].filter(f => f.locked).length;
    }
    for (const path in allNotes) {
        if (!allNotes[path]) continue;
        count += allNotes[path].filter(n => n.locked).length;
    }
    sub.textContent = count ? `${count} item${count === 1 ? '' : 's'} locked` : 'None locked';
}

function showLockedItemsDialog() {
    const existing = document.getElementById('lockedItemsOverlay');
    if (existing) existing.remove();

    const lockedFolders = Object.keys(folderMeta).filter(k => folderMeta[k]?.locked);
    const lockedFiles = [];
    for (const path in allFiles) {
        if (!allFiles[path]) continue;
        for (const f of allFiles[path]) {
            if (f.locked) lockedFiles.push({ path, name: f.name });
        }
    }
    const lockedNotes = [];
    for (const path in allNotes) {
        if (!allNotes[path]) continue;
        for (const n of allNotes[path]) {
            if (n.locked) lockedNotes.push({ path, id: n.id, title: n.title });
        }
    }

    const overlay = document.createElement('div');
    overlay.id = 'lockedItemsOverlay';
    overlay.className = 'ctx-menu-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9998;display:flex;align-items:flex-end;justify-content:center;';

    const rowsHtml = (!lockedFolders.length && !lockedFiles.length && !lockedNotes.length)
        ? '<div class="fav-empty"><i class="fas fa-lock-open"></i><p>Nothing is locked.</p></div>'
        : [
            ...lockedFolders.map(path => `
                <div class="locked-item-row" data-kind="folder" data-key="${escapeHtml(path)}">
                    <i class="fas fa-folder" style="color:#c084fc;"></i>
                    <span>${escapeHtml(path)}</span>
                    <button class="locked-item-unlock-btn">Unlock</button>
                </div>`),
            ...lockedFiles.map(f => `
                <div class="locked-item-row" data-kind="file" data-key="${escapeHtml(f.path)}::${escapeHtml(f.name)}">
                    <i class="fas ${getFileIcon(f.name)}" style="color:#60a5fa;"></i>
                    <span>${escapeHtml(f.name)}</span>
                    <button class="locked-item-unlock-btn">Unlock</button>
                </div>`),
            ...lockedNotes.map(n => `
                <div class="locked-item-row" data-kind="note" data-key="${escapeHtml(n.path)}::${escapeHtml(n.id)}">
                    <i class="fas fa-sticky-note" style="color:#fbbf24;"></i>
                    <span>${escapeHtml(n.title)}</span>
                    <button class="locked-item-unlock-btn">Unlock</button>
                </div>`)
        ].join('');

    overlay.innerHTML = `
        <div style="background:#12162c;border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:70vh;overflow-y:auto;padding-bottom:20px;">
            <div style="padding:16px 18px;font-weight:700;color:#f8fafc;font-family:Inter,sans-serif;border-bottom:1px solid rgba(255,255,255,0.08);">Locked Folders &amp; PDFs</div>
            ${rowsHtml}
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelectorAll('.locked-item-unlock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.locked-item-row');
            const kind = row.dataset.kind;
            haptic.toggle();
            if (kind === 'folder') {
                const path = row.dataset.key;
                if (folderMeta[path]) folderMeta[path].locked = false;
                await saveFolderMeta();
            } else if (kind === 'note') {
                const [path, id] = row.dataset.key.split('::');
                const n = allNotes[path]?.find(x => x.id === id);
                if (n) n.locked = false;
                await saveNotesForFolder(path);
            } else {
                const [path, name] = row.dataset.key.split('::');
                const f = allFiles[path]?.find(x => x.name === name);
                if (f) f.locked = false;
                await saveFilesForFolder(path);
            }
            row.remove();
            updateLockedItemsCountSub();
            render();
            showToast('Unlocked');
        });
    });
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

async function exportBackupData() {
    showToast('Preparing backup…');
    try {
        const manifest = {
            fileSystem,
            allNotes,
            deptColors,
            folderMeta,
            exportedAt: new Date().toISOString(),
            version: APP_VERSION,
            format: 'docman-zip-v1'
        };

        manifest.fileMetadata = {};
        for (const path in allFiles) {
            if (allFiles[path]) {
                manifest.fileMetadata[path] = allFiles[path].map(f => ({
                    name: f.name,
                    type: f.type,
                    uploadedAt: f.uploadedAt,
                    favourite: f.favourite || false,
                    locked: f.locked || false,
                    size: f.size || 0
                }));
            }
        }

        const zip = new JSZip();
        zip.file('manifest.json', JSON.stringify(manifest));
        const filesFolder = zip.folder('files');

        // Pull every file's actual content (lazy-loading blobs as needed) into the zip.
        // Zip entry path mirrors folderPath/fileName so import can match it back to its folder.
        for (const path in allFiles) {
            for (const f of (allFiles[path] || [])) {
                try {
                    const blob = await loadFileData(path, f.name);
                    if (blob) {
                        filesFolder.file(path + '/' + f.name, blob);
                    } else {
                        console.warn('No data found for', path, f.name, '— skipping content, metadata only');
                    }
                } catch (e) {
                    console.warn('Failed to read file for backup:', path, f.name, e);
                }
            }
        }

        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const backupFileName = `docman-backup-${Date.now()}.zip`;
        await nativeDownload(zipBlob, backupFileName);
        showToast('Backup exported');
    } catch (err) {
        console.error('Backup export failed:', err);
        showToast('Could not export backup', true);
    }
}

function importBackupData(file) {
    (async () => {
        try {
            const zip = await JSZip.loadAsync(file);
            const manifestEntry = zip.file('manifest.json');
            if (!manifestEntry) { showToast('Invalid backup file', true); return; }

            const manifest = JSON.parse(await manifestEntry.async('string'));
            if (!manifest.fileSystem) { showToast('Invalid backup file', true); return; }

            showConfirmModal('This will <b>replace all current data</b> (including the Recycle Bin) with the backup. Continue?', async (ok) => {
                if (!ok) return;

                showToast('Restoring backup…');

                // ------------------------------------------------------------
                // STAGED RESTORE: build the new in-memory state from the zip
                // FIRST, without touching anything currently on disk. Only
                // once the new state is fully built and persisted do we go
                // back and remove the OLD native files it replaces. This way
                // a failure partway through parsing/staging never destroys
                // data we haven't successfully replaced yet.
                // ------------------------------------------------------------

                // Every native fsPath the CURRENT data (files + recycle bin,
                // both of which this restore is about to fully replace)
                // still points at. These become orphans the moment we swap
                // in the backup's metadata below, since restored files are
                // staged as fresh Blobs with no fsPath of their own -- so
                // every one of these must be explicitly removed, not just
                // "left behind and hopefully unreferenced".
                const oldFsPaths = new Set();
                for (const path in allFiles) {
                    for (const f of (allFiles[path] || [])) {
                        if (f && f.fsPath) oldFsPaths.add(f.fsPath);
                    }
                }
                for (const item of recycleBin) {
                    if (item.kind === 'file' && item.payload?.fsPath) {
                        oldFsPaths.add(item.payload.fsPath);
                    } else if (item.kind === 'folder' && item.payload?.filesSnapshot) {
                        for (const k of Object.keys(item.payload.filesSnapshot)) {
                            for (const f of item.payload.filesSnapshot[k]) {
                                if (f && f.fsPath) oldFsPaths.add(f.fsPath);
                            }
                        }
                    }
                }

                const stagedFileSystem = manifest.fileSystem || {};
                const stagedNotes = manifest.allNotes || {};
                const stagedDeptColors = manifest.deptColors || {};
                const stagedFolderMeta = manifest.folderMeta || {};
                const stagedFiles = {};

                let readFailures = 0;
                if (manifest.fileMetadata) {
                    for (const path in manifest.fileMetadata) {
                        if (!manifest.fileMetadata[path]) continue;
                        stagedFiles[path] = [];
                        for (const f of manifest.fileMetadata[path]) {
                            const zipEntry = zip.file('files/' + path + '/' + f.name);
                            let fileData = null;
                            if (zipEntry) {
                                try {
                                    fileData = await zipEntry.async('blob');
                                } catch (e) {
                                    console.warn('Failed to read file from backup:', path, f.name, e);
                                    readFailures++;
                                }
                            } else {
                                // Metadata references a file the zip doesn't actually
                                // contain -- surface this rather than silently
                                // restoring a phantom entry with no content.
                                readFailures++;
                            }
                            stagedFiles[path].push({
                                name: f.name,
                                type: f.type || 'application/octet-stream',
                                uploadedAt: f.uploadedAt || Date.now(),
                                favourite: f.favourite || false,
                                locked: f.locked || false,
                                size: f.size || (fileData ? fileData.size : 0),
                                fileData: fileData,
                                _hasData: !!fileData,
                                _isBase64: false
                            });
                        }
                    }
                }

                // Commit the staged state -- this is the point of no return,
                // now that every zip entry has been read successfully (or the
                // failure counted above, without corrupting anything).
                fileSystem = stagedFileSystem;
                allNotes = stagedNotes;
                deptColors = stagedDeptColors;
                folderMeta = stagedFolderMeta;
                allFiles = stagedFiles;
                // Recycle Bin is explicitly NOT carried over -- the confirm
                // dialog above tells the user everything is being replaced,
                // so leaving old trash entries around (pointing at fsPaths
                // we're about to delete) would be a lie and a dangling
                // reference. A restore starts with an empty Recycle Bin.
                recycleBin = [];

                await saveFolderStructure();
                await saveDeptColors();
                await saveFolderMeta();
                await saveRecycleBin();
                await saveAllNotesToDB();
                await saveAllFilesToDB(true);
                await loadAllFileMetadata();

                // Now that the new state is safely persisted, remove the
                // native files it replaced. Best-effort per file; failures
                // are tracked and reported rather than assumed away.
                let deleteFailures = 0;
                for (const fsPath of oldFsPaths) {
                    const ok = await deleteFileFromFS(fsPath);
                    if (!ok) {
                        console.warn('Restore: failed to remove obsolete native file', fsPath);
                        deleteFailures++;
                    }
                }

                currentPath = [];
                closeSettingsPage();
                render();

                if (readFailures || deleteFailures) {
                    showToast(
                        'Backup restored, but ' + readFailures + ' file(s) could not be read from the backup and ' +
                        deleteFailures + ' old file(s) could not be cleaned up — check console',
                        true
                    );
                } else {
                    showToast('Data imported successfully');
                }
            });
        } catch (err) {
            console.error('Backup import failed:', err);
            showToast('Failed to read backup: ' + err.message, true);
        }
    })();
}

// ============================================================
// CLEAR ALL DATA
// ============================================================

// Erases the CONTENTS of every department/folder -- all files, notes,
// and the Recycle Bin (including its native files) -- while explicitly
// KEEPING the department/folder tree itself, dept colors, and folder
// metadata (creation dates) intact. Only the documents/notes living
// inside folders and the native bytes backing them are removed; folders
// stay exactly where they were, empty.
//
// Also removes every native document file this app has ever written
// under Directory.DATA/docs/ -- including files still sitting in the
// recycle bin (their native bytes are not touched until Secure Delete,
// so without this step they would silently survive an erase).
//
// Strategy: (1) collect every known fsPath from allFiles + recycleBin and
// delete them individually, (2) as a belt-and-suspenders pass, recursively
// remove the whole docs/ directory to catch any orphaned native files that
// metadata lost track of, (3) only then clear the files/notes/recycle-bin
// state (folder tree, dept colors, folder metadata untouched).
// Partial native-delete failures are tracked and surfaced -- this never
// silently reports success if something could not be removed.
async function doEraseAllData() {
    const failures = [];

    // 1) Delete every native file referenced by current metadata.
    const fsPaths = new Set();
    for (const folderPath of Object.keys(allFiles)) {
        for (const f of (allFiles[folderPath] || [])) {
            if (f && f.fsPath) fsPaths.add(f.fsPath);
        }
    }
    // ...and every native file still parked in the recycle bin (files +
    // files nested inside recycled folders) -- these are real bytes on
    // disk that "Clear All Data" must also remove.
    for (const item of recycleBin) {
        if (item.kind === 'file' && item.payload && item.payload.fsPath) {
            fsPaths.add(item.payload.fsPath);
        } else if (item.kind === 'folder' && item.payload && item.payload.filesSnapshot) {
            for (const k of Object.keys(item.payload.filesSnapshot)) {
                for (const f of item.payload.filesSnapshot[k]) {
                    if (f && f.fsPath) fsPaths.add(f.fsPath);
                }
            }
        }
    }
    for (const fsPath of fsPaths) {
        const ok = await deleteFileFromFS(fsPath);
        if (!ok) {
            console.warn('Erase All Data: failed to delete native file', fsPath);
            failures.push(fsPath);
        }
    }

    // 2) Belt-and-suspenders: remove the entire docs/ directory so any
    // native file NOT referenced by metadata (a true orphan) is also gone,
    // and the app starts from a genuinely clean native storage state.
    const Filesystem = getFilesystemPlugin();
    if (Filesystem) {
        try {
            await Filesystem.rmdir({ path: 'docs', directory: 'DATA', recursive: true });
        } catch (e) {
            // ENOENT (directory never existed / already empty) is fine and
            // expected -- only treat this as a real failure if the
            // directory demonstrably still has content afterwards.
            try {
                const check = await Filesystem.readdir({ path: 'docs', directory: 'DATA' });
                if (check && check.files && check.files.length) {
                    console.warn('Erase All Data: docs/ directory could not be fully removed', e);
                    failures.push('docs/ (directory)');
                }
            } catch (e2) { /* directory genuinely gone -- fine */ }
        }
    }

    // 3) Clear only files/notes/recycle-bin state. Folder tree (fileSystem),
    // dept colors, and folder metadata (creation dates) are deliberately
    // left untouched -- departments and subfolders must survive this,
    // empty, exactly as the user left them.
    allFiles = {};
    allNotes = {};
    recycleBin = [];

    await saveRecycleBin();

    await new Promise((resolve, reject) => {
        const tx = db.transaction(['files', 'notes', 'blobs'], 'readwrite');
        tx.objectStore('files').clear();
        tx.objectStore('notes').clear();
        tx.objectStore('blobs').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    }).catch(e => {
        console.warn('Erase All Data: IndexedDB clear failed', e);
        failures.push('IndexedDB (files/notes/blobs)');
    });

    // Recents + search history are DOCMAN-specific local metadata too.
    try { localStorage.removeItem(ACTIVITY_KEY); } catch (e) { failures.push('recents'); }
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (e) { failures.push('search history'); }

    currentPath = [];
    closeSettingsPage();
    render();

    if (failures.length) {
        console.warn('Erase All Data: completed with failures:', failures);
        showToast('Data erased, but ' + failures.length + ' item(s) could not be removed — check console', true);
    } else {
        showToast('All data erased');
    }
}

function clearAllAppData() {
    const hasPin = !!localStorage.getItem(PIN_KEY);
    if (hasPin) {
        showPinVerifyModal('Erase All Data', (verified) => {
            if (!verified) return;
            showConfirmModal('This will permanently delete <b>all files and notes inside every department/folder</b> (folders themselves will be kept, but emptied). This cannot be undone. Continue?', async (confirmed) => {
                if (!confirmed) return;
                await doEraseAllData();
            });
        });
    } else {
        showPromptModal('\u26a0\ufe0f No PIN set. Create a 4-digit PIN to authorize erase:', '', async (val) => {
            if (val === null) return;
            const pin = val.trim();
            if (!/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits', true); return; }
            localStorage.setItem(PIN_KEY, await hashPin(pin));
            showToast('PIN saved. Enter it again to confirm erase.');
            showPinVerifyModal('Confirm Erase All Data', (verified) => {
                if (!verified) return;
                showConfirmModal('This will permanently delete <b>all files and notes inside every department/folder</b> (folders themselves will be kept, but emptied). This cannot be undone. Continue?', async (confirmed) => {
                    if (!confirmed) return;
                    await doEraseAllData();
                });
            });
        });
    }
}

// ============================================================
// SETTINGS PANEL RENDERERS
// ============================================================

function renderStoragePanel() {
    let docCount = 0,
        noteCount = 0;
    for (const p in allFiles) if (allFiles[p]) docCount += allFiles[p].length;
    for (const p in allNotes) if (allNotes[p]) noteCount += allNotes[p].length;

    document.getElementById('storageDocCount').textContent = docCount;
    document.getElementById('storageNoteCount').textContent = noteCount;

    try {
        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(est => {
                const usedMB = (est.usage / (1024 * 1024)).toFixed(2);
                document.getElementById('storageSummaryUsed').textContent = usedMB + ' MB';
            }).catch(() => {
                document.getElementById('storageSummaryUsed').textContent = 'Unknown';
            });
        } else {
            document.getElementById('storageSummaryUsed').textContent = 'Unknown';
        }
    } catch (e) {
        document.getElementById('storageSummaryUsed').textContent = 'Unknown';
    }
}

async function renderStorageDetailPanel() {
    const body = document.getElementById('storageDetailBody');
    body.innerHTML = '<div class="storage-detail-loading"><i class="fas fa-spinner fa-spin"></i> Calculating…</div>';

    let pdfBytes = 0,
        imgBytes = 0,
        pdfCount = 0,
        imgCount = 0;
    const deptMap = {};

    for (const dept of Object.keys(fileSystem)) {
        deptMap[dept] = { bytes: 0, docs: 0, notes: 0 };
    }

    for (const folderPath in allFiles) {
        if (!allFiles[folderPath]) continue;
        const topDept = folderPath.split('/')[0];
        for (const f of allFiles[folderPath]) {
            const bytes = f.size || 0;
            if (f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf')) {
                pdfBytes += bytes;
                pdfCount++;
            } else {
                imgBytes += bytes;
                imgCount++;
            }
            if (deptMap[topDept]) {
                deptMap[topDept].bytes += bytes;
                deptMap[topDept].docs++;
            }
        }
    }

    let noteBytes = 0;
    for (const folderPath in allNotes) {
        if (!allNotes[folderPath]) continue;
        const topDept = folderPath.split('/')[0];
        for (const n of allNotes[folderPath]) {
            const nb = new Blob([JSON.stringify(n)]).size;
            noteBytes += nb;
            if (deptMap[topDept]) {
                deptMap[topDept].bytes += nb;
                deptMap[topDept].notes++;
            }
        }
    }

    const totalBytes = pdfBytes + imgBytes + noteBytes;
    const fmt = (b) => b < 1024 * 1024 ? (b / 1024).toFixed(1) + ' KB' : (b / (1024 * 1024)).toFixed(2) + ' MB';
    const pct = (b) => totalBytes > 0 ? Math.round((b / totalBytes) * 100) : 0;

    const deptEntries = Object.entries(deptMap).sort((a, b) => b[1].bytes - a[1].bytes);

    const deptRows = deptEntries.map(([dept, info]) => {
        const p = pct(info.bytes);
        return `
            <div class="sd-dept-row">
                <div class="sd-dept-name">${dept}</div>
                <div class="sd-dept-bar-wrap"><div class="sd-dept-bar" style="width:${p}%"></div></div>
                <div class="sd-dept-meta">${fmt(info.bytes)} · ${info.docs} doc${info.docs !== 1 ? 's' : ''}${info.notes ? ` · ${info.notes} note${info.notes !== 1 ? 's' : ''}` : ''}</div>
            </div>`;
    }).join('');

    body.innerHTML = `
        <div class="settings-group-title">By File Type</div>
        <div class="settings-card sd-type-card">
            <div class="sd-type-row">
                <div class="sd-type-icon sd-icon-pdf"><i class="fas fa-file-pdf"></i></div>
                <div class="sd-type-info"><span class="sd-type-label">PDFs</span><span class="sd-type-count">${pdfCount} file${pdfCount !== 1 ? 's' : ''}</span></div>
                <div class="sd-type-size">${fmt(pdfBytes)}</div>
            </div>
            <div class="sd-type-row">
                <div class="sd-type-icon sd-icon-img"><i class="fas fa-image"></i></div>
                <div class="sd-type-info"><span class="sd-type-label">Images</span><span class="sd-type-count">${imgCount} file${imgCount !== 1 ? 's' : ''}</span></div>
                <div class="sd-type-size">${fmt(imgBytes)}</div>
            </div>
            <div class="sd-type-row">
                <div class="sd-type-icon sd-icon-note"><i class="fas fa-sticky-note"></i></div>
                <div class="sd-type-info"><span class="sd-type-label">Notes</span><span class="sd-type-count">${Object.values(allNotes).reduce((a,b)=>a+(b?.length||0),0)} note${Object.values(allNotes).reduce((a,b)=>a+(b?.length||0),0) !== 1 ? 's' : ''}</span></div>
                <div class="sd-type-size">${fmt(noteBytes)}</div>
            </div>
        </div>
        <div class="settings-group-title">By Department</div>
        <div class="settings-card sd-dept-card">
            ${deptEntries.length ? deptRows : '<div class="sd-empty">No departments yet</div>'}
        </div>
        <div class="sd-total-note">Total estimated: <b>${fmt(totalBytes)}</b></div>
    `;
}

function renderFavoritesPanel() {
    const list = loadRecents();
    document.getElementById('recentsCount').textContent = list.length;
    const card = document.getElementById('recentsListCard');
    if (!list.length) { card.innerHTML = '<div class="settings-empty-row">No recent files yet</div>'; return; }
    card.innerHTML = list.slice(0, 10).map(r => `
        <div class="dept-manage-row">
            <div class="settings-item-icon settings-icon-favorites" style="width:32px;height:32px;font-size:0.8rem;flex-shrink:0"><i class="fas fa-file"></i></div>
            <div class="dept-manage-name" style="font-weight:600;font-size:0.82rem;">${escapeHtml(r.name)}</div>
            <span class="dept-manage-count">${new Date(r.time).toLocaleDateString()}</span>
        </div>
    `).join('');
}

function renderStatisticsPanel() {
    let fileCount = 0,
        noteCount = 0,
        folderCount = 0;
    let largestFile = { name: '—', size: 0 };
    let largestFolder = { name: '—', count: 0 };

    function countFolders(obj) {
        for (const k in obj) if (typeof obj[k] === 'object') { folderCount++;
            countFolders(obj[k]); }
    }
    countFolders(fileSystem);

    for (const path in allFiles) {
        if (!allFiles[path]) continue;
        fileCount += allFiles[path].length;
        const folderTotal = allFiles[path].length;
        if (folderTotal > largestFolder.count) {
            largestFolder = { name: path.split('/').pop() || path, count: folderTotal };
        }
        allFiles[path].forEach(f => {
            const size = f.size || 0;
            if (size > largestFile.size) largestFile = { name: f.name, size };
        });
    }
    for (const path in allNotes) if (allNotes[path]) noteCount += allNotes[path].length;

    document.getElementById('statTotalFiles').textContent = fileCount;
    document.getElementById('statTotalNotes').textContent = noteCount;
    document.getElementById('statTotalFolders').textContent = folderCount;
    document.getElementById('statTotalDepts').textContent = Object.keys(fileSystem).length;
    document.getElementById('statLargestFile').textContent = largestFile.size > 0 ?
        `${largestFile.name} (${(largestFile.size / (1024 * 1024)).toFixed(2)} MB)` :
        '—';
    document.getElementById('statLargestFolder').textContent = largestFolder.count > 0 ?
        `${largestFolder.name} (${largestFolder.count} files)` :
        '—';
}

function renderDepartmentsManagePanel() {
    const list = document.getElementById('deptManageList');
    const depts = Object.keys(fileSystem);
    document.getElementById('deptManageCount').textContent = depts.length;
    if (!depts.length) { list.innerHTML = '<div class="settings-empty-row">No departments yet</div>'; return; }
    list.innerHTML = depts.map(dept => {
        const total = countDepartmentFiles(fileSystem[dept], [dept]);
        return `
            <div class="dept-manage-row">
                <div class="dept-manage-dot"${deptColors[dept] ? ` style="background:${deptColors[dept]}"` : ''}></div>
                <div class="dept-manage-name">${escapeHtml(dept)}</div>
                <span class="dept-manage-count">${total} items</span>
                <button class="dept-manage-delete" data-dept-del="${escapeHtml(dept)}"><i class="fas fa-trash"></i></button>
            </div>`;
    }).join('');
    list.querySelectorAll('[data-dept-del]').forEach(btn => {
        btn.onclick = () => {
            const dept = btn.getAttribute('data-dept-del');
            showConfirmModal(`Delete department "<b>${escapeHtml(dept)}</b>" and everything inside it?`, async (confirmed) => {
                if (!confirmed) return;
                delete fileSystem[dept];
                delete deptColors[dept];
                await saveFolderStructure();
                await saveDeptColors();
                renderDepartmentsManagePanel();
                refreshSettingsListSubtitles();
                if (currentPath[0] === dept) currentPath = [];
                render();
                showToast(`Department "${dept}" deleted`);
            });
        };
    });
}

function refreshSettingsListSubtitles() {
    const deptCount = Object.keys(fileSystem).length;
    const deptSub = document.getElementById('settingsDeptSub');
    if (deptSub) deptSub.textContent = `${deptCount} department${deptCount === 1 ? '' : 's'}`;
    updateStorageSummarySubtitle();
}

async function updateStorageSummarySubtitle() {
    const sub = document.getElementById('settingsStorageSub');
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            const usedMB = (est.usage / (1024 * 1024)).toFixed(1);
            if (sub) sub.textContent = `${usedMB} MB used`;
        } else if (sub) sub.textContent = 'Tap to view';
    } catch (e) { if (sub) sub.textContent = 'Tap to view'; }
}

// ============================================================
// SETTINGS PAGE INIT
// ============================================================

const settingsPanelRenderers = {
    storage: renderStoragePanel,
    appearance: applyThemePickUI,
    favorites: renderFavoritesPanel,
    statistics: renderStatisticsPanel,
    departments: renderDepartmentsManagePanel,
    security: updatePinStatusUI
};

function showSettingsScreen(screenId) {
    document.querySelectorAll('.settings-screen').forEach(s => s.classList.remove('settings-screen-active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('settings-screen-active');
    document.querySelector('.settings-page-inner').scrollTop = 0;
}

function openSettingsPage() {
    haptic.press();
    const page = document.getElementById('settingsPage');
    page.classList.remove('hidden');
    requestAnimationFrame(() => page.classList.add('settings-page-visible'));
    showSettingsScreen('settingsListScreen');
    refreshSettingsListSubtitles();
}

function closeSettingsPage() {
    const page = document.getElementById('settingsPage');
    page.classList.remove('settings-page-visible');
    setTimeout(() => page.classList.add('hidden'), 280);
}

function initSettingsPage() {
    document.getElementById('settingsBtn').onclick = openSettingsPage;
    document.getElementById('settingsCloseBtn').onclick = closeSettingsPage;

    document.querySelectorAll('.settings-panel-back').forEach(btn => {
        btn.onclick = () => showSettingsScreen('settingsListScreen');
    });

    document.querySelectorAll('.settings-item[data-panel]').forEach(item => {
        item.onclick = () => {
            const panel = item.getAttribute('data-panel');
            showSettingsScreen('settingsPanel-' + panel);
            if (settingsPanelRenderers[panel]) settingsPanelRenderers[panel]();
        };
    });

    document.getElementById('settingsPage').addEventListener('click', (e) => {
        if (e.target.id === 'settingsPage') { closeSettingsPage();
            return; }
        // Every tappable control inside settings (nav items, back/close
        // buttons, stepper +/-, radio dots, danger actions, theme cards)
        // is a <button> or a .settings-radio-dot -- one delegated listener
        // covers all of them instead of wiring haptic into each handler.
        if (e.target.closest('button, .settings-radio-dot')) haptic.press();
    });

    // Toggle switches (checkbox inputs) don't route through the click
    // delegation above cleanly (label-forwarded clicks would double-fire),
    // so give them their own single 'change' based haptic.
    document.getElementById('settingsPage').addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"]')) haptic.press();
    });

    // Appearance
    document.getElementById('themePickDark').onclick = () => {
        docmanSettings.theme = 'dark';
        saveSettings();
        applyTheme('dark');
    };
    document.getElementById('themePickLight').onclick = () => {
        docmanSettings.theme = 'light';
        saveSettings();
        applyTheme('light');
    };
    document.getElementById('themePickSystem').onclick = () => {
        docmanSettings.theme = 'system';
        saveSettings();
        applyTheme('system');
    };

    const enableAnimToggle = document.getElementById('enableAnimationsToggle');
    enableAnimToggle.checked = docmanSettings.enableAnimations;
    enableAnimToggle.onchange = () => {
        docmanSettings.enableAnimations = enableAnimToggle.checked;
        saveSettings();
        applyAnimations();
    };

    const enableParticlesToggle = document.getElementById('enableParticlesToggle');
    enableParticlesToggle.checked = docmanSettings.enableParticles;
    enableParticlesToggle.onchange = () => {
        docmanSettings.enableParticles = enableParticlesToggle.checked;
        saveSettings();
        applyParticles();
    };

    // PDF Settings
    document.querySelectorAll('[data-radio="pdfOpen"]').forEach(dot => {
        dot.parentElement.onclick = () => {
            docmanSettings.pdfOpen = dot.getAttribute('data-val');
            saveSettings();
            applyRadioUI('pdfOpen');
        };
    });
    applyRadioUI('pdfOpen');

    const thresholdVal = document.getElementById('pdfThresholdVal');
    thresholdVal.textContent = docmanSettings.pdfThreshold;
    document.getElementById('pdfThresholdDown').onclick = () => {
        if (docmanSettings.pdfThreshold > 1) {
            docmanSettings.pdfThreshold--;
            thresholdVal.textContent = docmanSettings.pdfThreshold;
            saveSettings();
        }
    };
    document.getElementById('pdfThresholdUp').onclick = () => {
        if (docmanSettings.pdfThreshold < 500) {
            docmanSettings.pdfThreshold++;
            thresholdVal.textContent = docmanSettings.pdfThreshold;
            saveSettings();
        }
    };

    // Favorites & Recents
    const showRecentsToggle = document.getElementById('showRecentsToggle');
    showRecentsToggle.checked = docmanSettings.showRecents;
    showRecentsToggle.onchange = () => {
        docmanSettings.showRecents = showRecentsToggle.checked;
        saveSettings();
    };

    const showFavoritesToggle = document.getElementById('showFavoritesToggle');
    showFavoritesToggle.checked = docmanSettings.showFavorites;
    showFavoritesToggle.onchange = () => {
        docmanSettings.showFavorites = showFavoritesToggle.checked;
        saveSettings();
    };

    // The old stats-bar Favorite pill used to open this; now that the pill
    // is gone (replaced by a per-folder Favourite toggle on the folder
    // toolbar), this Settings entry keeps the full favourites list reachable.
    const openFavBtn = document.getElementById('openFavouritesFromSettings');
    if (openFavBtn) openFavBtn.onclick = () => { haptic.press(); openFavouritesView(); };

    const recentsLimitVal = document.getElementById('recentsLimitVal');
    recentsLimitVal.textContent = docmanSettings.recentsLimit;
    document.getElementById('recentsLimitDown').onclick = () => {
        if (docmanSettings.recentsLimit > 5) {
            docmanSettings.recentsLimit -= 5;
            recentsLimitVal.textContent = docmanSettings.recentsLimit;
            saveSettings();
        }
    };
    document.getElementById('recentsLimitUp').onclick = () => {
        if (docmanSettings.recentsLimit < 100) {
            docmanSettings.recentsLimit += 5;
            recentsLimitVal.textContent = docmanSettings.recentsLimit;
            saveSettings();
        }
    };

    document.getElementById('clearRecentsBtn').onclick = () => {
        showConfirmModal('Clear your recent documents history?', (ok) => {
            if (!ok) return;
            saveActivityLog([]);
            renderFavoritesPanel();
            showToast('Recents cleared');
        });
    };

    // Search Settings
    const searchNotesToggle = document.getElementById('searchNotesToggle');
    searchNotesToggle.checked = docmanSettings.searchNotes;
    searchNotesToggle.onchange = () => {
        docmanSettings.searchNotes = searchNotesToggle.checked;
        saveSettings();
    };

    const searchFileNamesToggle = document.getElementById('searchFileNamesToggle');
    searchFileNamesToggle.checked = docmanSettings.searchFileNames;
    searchFileNamesToggle.onchange = () => {
        docmanSettings.searchFileNames = searchFileNamesToggle.checked;
        saveSettings();
    };

    const searchFolderNamesToggle = document.getElementById('searchFolderNamesToggle');
    searchFolderNamesToggle.checked = docmanSettings.searchFolderNames;
    searchFolderNamesToggle.onchange = () => {
        docmanSettings.searchFolderNames = searchFolderNamesToggle.checked;
        saveSettings();
    };

    document.getElementById('clearSearchHistoryBtn').onclick = () => {
        showConfirmModal('Clear your saved search history?', (ok) => {
            if (!ok) return;
            localStorage.removeItem(SEARCH_HISTORY_KEY);
            showToast('Search history cleared');
        });
    };

    // Security
    const appLockToggle = document.getElementById('appLockToggle');
    appLockToggle.onchange = () => {
        if (appLockToggle.checked && !localStorage.getItem(PIN_KEY)) {
            promptSetPin((success) => {
                if (success) {
                    docmanSettings.appLock = true;
                    saveSettings();
                } else {
                    appLockToggle.checked = false;
                }
                updatePinStatusUI();
            });
        } else {
            docmanSettings.appLock = appLockToggle.checked;
            saveSettings();
            updatePinStatusUI();
        }
    };
    document.getElementById('changePinBtn').onclick = () => promptSetPin(() => {});

    const biometricToggleEl = document.getElementById('biometricToggle');
    if (biometricToggleEl) {
        biometricToggleEl.onchange = async () => {
            if (biometricToggleEl.checked) {
                const plugin = getBiometricPlugin();
                if (!plugin) {
                    showToast('Biometric unlock needs the native app build', true);
                    biometricToggleEl.checked = false;
                    return;
                }
                try {
                    const avail = await plugin.isAvailable();
                    if (!avail?.available) {
                        showToast(avail?.reason || 'Biometric unlock is not available', true);
                        biometricToggleEl.checked = false;
                        return;
                    }
                } catch (e) {
                    showToast('Could not check biometric availability', true);
                    biometricToggleEl.checked = false;
                    return;
                }
            }
            docmanSettings.biometricUnlock = biometricToggleEl.checked;
            saveSettings();
        };
    }

    document.querySelectorAll('.autolock-opt').forEach(btn => {
        btn.onclick = () => {
            docmanSettings.autoLockSeconds = Number(btn.dataset.secs);
            saveSettings();
            document.querySelectorAll('.autolock-opt').forEach(b => b.classList.toggle('active', b === btn));
            resetInactivityLockTimer();
        };
    });

    const manageLockedItemsBtnEl = document.getElementById('manageLockedItemsBtn');
    if (manageLockedItemsBtnEl) {
        manageLockedItemsBtnEl.onclick = () => showLockedItemsDialog();
    }

    // Storage
    document.getElementById('exportDataBtn').onclick = exportBackupData;
    document.getElementById('clearAllDataBtn').onclick = clearAllAppData;
    document.getElementById('viewStorageDetailsBtn').onclick = () => {
        showSettingsScreen('settingsPanel-storageDetail');
        renderStorageDetailPanel();
    };

    const importFileInput = document.getElementById('importFileInput');
    document.getElementById('importDataBtn').onclick = () => { expectNativeReturn();
        importFileInput.click(); };
    importFileInput.onchange = (e) => {
        if (e.target.files[0]) {
            importBackupData(e.target.files[0]);
            e.target.value = '';
        }
    };

    // About
    // Never claim to have checked for an update when nothing was actually
    // checked -- this used to unconditionally show "You're on the latest
    // version" regardless of reality. There's no update-check server for
    // this app, so the honest action is opening the Play Store listing,
    // where the real answer (and an Update button, if one exists) lives.
    // window.open(url, '_system') is the standard Capacitor convention for
    // handing a URL off to the OS as an external Intent (handled by the
    // default BridgeWebViewClient, unmodified in this app) -- this is how
    // market:// gets routed to the Play Store app itself.
    document.getElementById('checkUpdatesBtn').onclick = () => {
        window.open('market://details?id=com.oarcel.docman', '_system');
    };

    applyTheme(docmanSettings.theme || 'dark');
    applyAnimations();
    applyParticles();
}

// ============================================================
// SHOW INFO
// ============================================================

// Called from the info-button's touch handler instead of onclick directly
// -- delays opening the modal just long enough for the press-feedback
// sink animation to actually finish playing (see attachDepartmentPressEffects
// for the same pattern on department cards).
function showInfoDelayed() {
    setTimeout(showInfo, 260);
}

function showInfo() {
    haptic.press();
    const deptCount = Object.keys(fileSystem).length;
    let folderCount = 0,
        fileCount = 0,
        noteCount = 0;

    function countRecursive(obj, path) {
        for (const key of Object.keys(obj)) {
            const p = path ? path + '/' + key : key;
            folderCount++;
            if (allFiles[p]) fileCount += allFiles[p].length;
            if (allNotes[p]) noteCount += allNotes[p].length;
            if (obj[key] && typeof obj[key] === 'object') countRecursive(obj[key], p);
        }
    }
    countRecursive(fileSystem, '');

    document.getElementById('infoStatDepts').textContent = deptCount;
    document.getElementById('infoStatFolders').textContent = folderCount;
    document.getElementById('infoStatFiles').textContent = fileCount;
    document.getElementById('infoStatNotes').textContent = noteCount;
    document.getElementById('deptInfoVersion').textContent = APP_VERSION;

    const modal = document.getElementById('deptInfoModal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}

function closeDeptInfo() {
    const modal = document.getElementById('deptInfoModal');
    const card = modal.querySelector('.dept-info-card');
    modal.classList.remove('show');
    if (card) card.classList.add('fly-out');
    setTimeout(() => {
        modal.style.display = 'none';
        if (card) card.classList.remove('fly-out');
    }, 250);
}

// ============================================================
// ATTACH PRESS EFFECTS
// ============================================================

function attachPressEffects() {
    const selectors = [
        '#homeBtn', '.type-btn', '#uploadBtn', '#newNoteBtn',
        '#settingsBtn', '.dept-hub-knob',
        '.action-btn', '.fav-file-btn', '.fav-note-btn',
        '.rename-file-btn', '.delete-file-btn', '.rename-note-btn',
        '.delete-note-btn', '.clear-search', '.modal-close',
        '.modal-footer button', '.breadcrumb-item', '.card', '.dept-oval',
        '#closeImageViewer', '#closeDocViewer', '#shareDocViewerBtn',
        '#closeSheetViewer', '#shareSheetViewerBtn', '.doc-viewer-sheet-tab'
    ];

    document.querySelectorAll(selectors.join(',')).forEach(el => {
        el.removeEventListener('click', pressHandler);
        el.removeEventListener('touchstart', pressHandler, { passive: false });
        el.removeEventListener('mousedown', pressHandler);
        el.addEventListener('mousedown', pressHandler);
        el.addEventListener('touchstart', pressHandler, { passive: false });
    });
}

// Tracks the last real touch so a browser-synthesized 'mousedown' that
// follows the same tap doesn't fire a second, delayed haptic buzz.
let lastTouchPressTime = 0;

function pressHandler(e) {
    if (this.hasAttribute('data-press-animating') || (e.button === 2)) return;
    if (e.type === 'touchstart' && this.hasAttribute('data-touch-processing')) return;
    if (e.type === 'mousedown' && (Date.now() - lastTouchPressTime) < 600) return;
    if (e.type === 'touchstart') {
        lastTouchPressTime = Date.now();
        this.setAttribute('data-touch-processing', 'true');
        setTimeout(() => this.removeAttribute('data-touch-processing'), 200);
    }
    e.stopPropagation();
    addDepthEffect(this, e);
}

function addDepthEffect(element, event) {
    if (!element || element.hasAttribute('data-press-animating')) return;
    element.setAttribute('data-press-animating', 'true');
    haptic.press();
    setTimeout(() => {
        element.classList.remove('press-depth-3d');
        element.removeAttribute('data-press-animating');
    }, 150);
}

// ============================================================
// HANDLE FILES UPLOAD
// ============================================================

// heic2any is small (~1.3MB, unlike the OpenCV experiment) but still
// only worth loading the first time a HEIC/HEIF file is actually
// imported, not on every app start.
let imgHeic2anyLoadPromise = null;
function imgLoadHeic2any() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    if (imgHeic2anyLoadPromise) return imgHeic2anyLoadPromise;
    imgHeic2anyLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/heic2any/heic2any.min.js';
        script.onload = () => resolve(window.heic2any);
        script.onerror = () => reject(new Error('Failed to load HEIC converter'));
        document.head.appendChild(script);
    }).catch(err => { imgHeic2anyLoadPromise = null; throw err; });
    return imgHeic2anyLoadPromise;
}

async function imgConvertHeicToJpeg(file) {
    const heic2any = await imgLoadHeic2any();
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result; // multi-image HEIC containers -> just the first
    const base = file.name.replace(/\.(heic|heif)$/i, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

// One bad file must never silently abort the rest of a multi-file import.
// Previously this had no try/catch around addFileToCurrentFolder -- an
// IndexedDB error partway through a batch (e.g. storage quota exceeded,
// a genuinely corrupted file) would throw uncaught, stop the loop dead,
// and drop every remaining file in the batch with no error shown at all.
// Now each file is isolated: a failure is counted and reported, but never
// stops the rest of the batch from being attempted.
async function handleFiles(files) {
    let failures = 0;
    let heicFailures = 0;
    let heicConverted = 0;
    let firstFailureDetail = null;
    let firstHeicFailureDetail = null;
    for (let f of files) {
        const fileType = getFileType(f.name);
        if (['image', 'pdf', 'word', 'word-legacy', 'excel', 'text'].includes(fileType)) {
            try {
                await addFileToCurrentFolder(f);
            } catch (e) {
                console.error('Import failed for', f.name, e);
                if (!firstFailureDetail) firstFailureDetail = `${f.name}: ${e.message || e}`;
                failures++;
            }
        } else if (fileType === 'heic') {
            try {
                const converted = await imgConvertHeicToJpeg(f);
                await addFileToCurrentFolder(converted);
                heicConverted++;
            } catch (e) {
                console.error('HEIC conversion failed for', f.name, e);
                if (!firstHeicFailureDetail) firstHeicFailureDetail = `${f.name}: ${e.message || e}`;
                heicFailures++;
            }
        } else {
            showToast('Skipped: ' + f.name + ' (not supported)', true);
        }
    }
    render();
    if (heicConverted) {
        showToast(`Converted ${heicConverted} HEIC photo(s) to JPG`);
    }
    if (heicFailures) {
        showToast(`${heicFailures} HEIC failed: ${firstHeicFailureDetail}`, true);
    }
    if (failures) {
        showToast(`${failures} file(s) failed: ${firstFailureDetail}`, true);
    }
}

function triggerUpload() {
    expectNativeReturn();
    document.getElementById('fileInput').click();
}

function triggerNewNote() {
    openNewNoteModal();
}

// ============================================================
// ANDROID HARDWARE BACK BUTTON
// ============================================================
//
// Without this listener the app never registers a 'backButton' handler,
// so Capacitor falls back to its default WebView behaviour -- and since
// this is a single-page app that never uses webview.history, canGoBack()
// is always false, which left the back key doing nothing instead of
// closing anything. This restores a normal Android back stack: close any
// open overlay/modal first, then step out of folders/search, and only
// exit the app on a second press at the true root (so one accidental tap
// can't kill it).
function initAndroidBackButton() {
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return; // Web/PWA build -- hardware back key doesn't apply.

    let lastBackPressAt = 0;

    App.addListener('backButton', () => {
        haptic.press();

        // Never let back-button navigation bypass the lock screen.
        const lockScreen = document.getElementById('appLockScreen');
        if (lockScreen) { App.exitApp(); return; }

        // PIN verify prompt (locked folder/file/note, erase-all confirm, etc.)
        const pinVerify = document.getElementById('pinVerifyModal');
        if (pinVerify) { pinVerify.querySelector('#pvCancel')?.click(); return; }

        // Generic confirm/prompt modal (rename, delete, new folder, etc.)
        const genericModal = document.getElementById('customPrompt') || document.getElementById('customConfirm');
        if (genericModal) { genericModal.querySelector('#modalCancel')?.click(); return; }

        // Long-press context menu (Favourite/Lock/Rename/...).
        const ctxMenu = document.getElementById('ctxMenuOverlay');
        if (ctxMenu) { ctxMenu.remove(); return; }

        // Full-screen sub-views.
        const subViews = [
            ['favouritesView', closeFavouritesView],
            ['recentsView', closeRecentsView],
            ['dashboardView', closeDashboardView],
            ['recycleBinView', closeRecycleBinView],
        ];
        for (const [id, closeFn] of subViews) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) { closeFn(); return; }
        }

        // Settings page.
        const settingsPage = document.getElementById('settingsPage');
        if (settingsPage && !settingsPage.classList.contains('hidden')) { closeSettingsPage(); return; }

        // Search mode.
        if (isSearchMode) { clearSearch(); return; }

        // Inside a folder/department -- step up one level.
        if (currentPath.length) { goBack(); return; }

        // True root -- require a confirming second press within 2s before
        // actually exiting.
        const now = Date.now();
        if (now - lastBackPressAt < 2000) {
            App.exitApp();
        } else {
            lastBackPressAt = now;
            showToast('Press back again to exit');
        }
    });
}

// ============================================================
// UPLOAD OPTIONS ACTION SHEET
// ============================================================

function openFilePicker({ accept, capture, multiple }) {
    expectNativeReturn();
    const input = document.getElementById('fileInput');
    input.setAttribute('accept', accept);
    if (capture) input.setAttribute('capture', capture);
    else input.removeAttribute('capture');
    if (multiple) input.setAttribute('multiple', '');
    else input.removeAttribute('multiple');
    input.click();
}

function showUploadOptions() {
    const existing = document.getElementById('ctxMenuOverlay');
    if (existing) existing.remove();

    haptic.press();

    const overlay = document.createElement('div');
    overlay.id = 'ctxMenuOverlay';
    overlay.className = 'ctx-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'ctx-menu upload-options-menu';
    menu.innerHTML = `
        <div class="ctx-menu-item" id="optPhotoLibrary">
            <i class="fas fa-images ctx-item-icon ctx-icon-photolib"></i>
            <span class="ctx-menu-item-label">Photo Library</span>
        </div>
        <div class="ctx-menu-item" id="optTakePhoto">
            <i class="fas fa-camera ctx-item-icon ctx-icon-camera"></i>
            <span class="ctx-menu-item-label">Take Photo</span>
        </div>
        <div class="ctx-menu-divider"></div>
        <div class="ctx-menu-item" id="optChooseFiles">
            <i class="fas fa-folder-open ctx-item-icon ctx-icon-choosefiles"></i>
            <span class="ctx-menu-item-label">Choose Files</span>
        </div>
        <div class="ctx-menu-item" id="optGoogleDrive">
            <i class="fab fa-google-drive ctx-item-icon ctx-icon-googledrive"></i>
            <span class="ctx-menu-item-label">Google Drive</span>
        </div>
    `;

    const close = () => {
        menu.style.animation = 'ctxPopOut 0.15s ease forwards';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.15s ease';
        setTimeout(() => overlay.remove(), 160);
    };

    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const triggerEl = document.getElementById('uploadBtn');
    if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const menuW = 220;
        const menuH = 225;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = rect.right - menuW;
        let top = rect.bottom + 8;

        if (left < 8) left = 8;
        if (left + menuW > vw - 8) left = vw - menuW - 8;
        if (top + menuH > vh - 8) top = rect.top - menuH - 8;
        if (top < 8) top = 8;

        menu.style.width = menuW + 'px';
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.transformOrigin = 'top right';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('optPhotoLibrary').addEventListener('click', () => {
        close();
        haptic.press();
        openFilePicker({ accept: 'image/*', capture: null, multiple: true });
    });
    document.getElementById('optTakePhoto').addEventListener('click', () => {
        close();
        haptic.press();
        openFilePicker({ accept: 'image/*', capture: 'environment', multiple: false });
    });
    document.getElementById('optChooseFiles').addEventListener('click', () => {
        close();
        haptic.press();
        openFilePicker({ accept: '.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv,.txt', capture: null, multiple: true });
    });
    document.getElementById('optGoogleDrive').addEventListener('click', () => {
        close();
        haptic.press();
        // Uses Android's native document picker, targeted directly at the
        // Google Drive app (DocmanWebChromeClient.java recognises the
        // 'x-docman/google-drive' marker and launches
        // com.google.android.apps.docs directly via ACTION_OPEN_DOCUMENT).
        // No OAuth, no browser, no custom URL scheme, no Google app
        // verification screen -- the Drive app itself is already signed
        // in and just hands back a content:// URI like any other picked
        // file, which flows through the exact same handleFiles() path as
        // "Choose Files". If the Drive app isn't installed, the native
        // side falls back to the general chooser automatically.
        openFilePicker({
            accept: 'x-docman/google-drive,.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv,.txt',
            capture: null,
            multiple: true
        });
    });
}
window.showUploadOptions = showUploadOptions;

// ============================================================
// IMAGE VIEWER GESTURES
// ============================================================

function initImageViewerGestures() {
    const body = document.querySelector('.image-viewer-body');
    const img = document.getElementById('viewerImage');
    if (!body || !img) return;

    let scale = 1,
        minScale = 1,
        maxScale = 5;
    let originX = 0,
        originY = 0;
    let lastDist = 0;
    let isDragging = false,
        dragStartX = 0,
        dragStartY = 0;
    let lastOriginX = 0,
        lastOriginY = 0;

    function applyTransform() {
        img.style.transform = `scale(${scale}) translate(${originX}px, ${originY}px)`;
        img.style.cursor = scale > 1 ? 'grab' : 'default';
    }

    function resetTransform() {
        scale = 1;
        originX = 0;
        originY = 0;
        img.style.transition = 'transform 0.2s ease';
        applyTransform();
        setTimeout(() => { img.style.transition = ''; }, 220);
    }

    document.getElementById('closeImageViewer').addEventListener('click', resetTransform);
    body.addEventListener('dblclick', () => {
        scale === 1 ? (scale = 2.5, applyTransform()) : resetTransform();
    });

    body.addEventListener('touchstart', (e) => {
        img.style.transition = '';
        if (e.touches.length === 2) {
            lastDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1 && scale > 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            lastOriginX = originX;
            lastOriginY = originY;
        }
    }, { passive: true });

    body.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = dist / lastDist;
            scale = Math.min(maxScale, Math.max(minScale, scale * delta));
            lastDist = dist;
            applyTransform();
        } else if (isDragging && e.touches.length === 1) {
            e.preventDefault();
            originX = lastOriginX + (e.touches[0].clientX - dragStartX) / scale;
            originY = lastOriginY + (e.touches[0].clientY - dragStartY) / scale;
            applyTransform();
        }
    }, { passive: false });

    body.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) isDragging = false;
        if (scale < 1.05) resetTransform();
    });

    body.addEventListener('mousedown', (e) => {
        if (scale > 1) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            lastOriginX = originX;
            lastOriginY = originY;
            img.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        originX = lastOriginX + (e.clientX - dragStartX) / scale;
        originY = lastOriginY + (e.clientY - dragStartY) / scale;
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (scale > 1) img.style.cursor = 'grab';
    });

    const origClose = window.closeImageViewer;
    window.closeImageViewer = function() {
        origClose();
        resetTransform();
    };
}

// ============================================================
// ELASTIC OVERSCROLL (rubber-band stretch on the main screen)
// ============================================================
// html/body both have overscroll-behavior: none elsewhere in this file --
// disabled on purpose, to stop the whole WebView shifting/chain-scrolling
// the way plain browser overscroll can. This restores just the nice part
// of that native feel (a soft, springy stretch at the very top/bottom of
// the page) as a controlled, self-contained effect instead, without
// re-enabling the native behavior this app deliberately turned off.
//
// Only pulling past the true top/bottom of the *page* triggers it -- it
// deliberately does not apply inside nested scrollable panels (Settings,
// the PDF viewer chrome, Favourites/Recents/Dashboard/Recycle Bin
// overlays, any modal), where a stretch on the whole page underneath
// would look broken rather than nice.
function initElasticOverscroll() {
    const stretchEl = document.querySelector('.app');
    if (!stretchEl) return;

    const EXCLUDED_SELECTOR = '.settings-page, .favourites-view, #imageViewer, #imageEditor, .pdf-viewer-body, .modal, .ctx-menu-overlay, #appLockScreen, #pinVerifyModal, #customConfirm, #customPrompt, #lockedItemsOverlay';

    let startY = 0;
    let pulling = false;
    let excluded = false;
    const RESISTANCE = 3.2; // higher = stiffer, less visual travel per pixel dragged
    const MAX_PULL = 90;    // px cap so an aggressive pull can't stretch it absurdly far

    function getScrollTop() { return window.scrollY || document.documentElement.scrollTop; }
    function getMaxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }

    function releaseStretch() {
        pulling = false;
        stretchEl.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
        stretchEl.style.transform = '';
    }

    document.addEventListener('touchstart', (e) => {
        excluded = !!e.target.closest(EXCLUDED_SELECTOR);
        startY = e.touches[0].clientY;
        pulling = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (excluded) return;
        const dy = e.touches[0].clientY - startY;
        const scrollTop = getScrollTop();
        const maxScroll = getMaxScroll();

        const pullingPastTop = scrollTop <= 0 && dy > 0;
        const pullingPastBottom = scrollTop >= maxScroll - 1 && dy < 0;

        if (pullingPastTop || pullingPastBottom) {
            pulling = true;
            const pullDistance = pullingPastTop
                ? Math.min(dy / RESISTANCE, MAX_PULL)
                : Math.max(dy / RESISTANCE, -MAX_PULL);
            stretchEl.style.transition = 'none';
            stretchEl.style.transform = `translateY(${pullDistance}px)`;
        } else if (pulling) {
            // Scrolled back within normal bounds mid-gesture -- let go smoothly.
            releaseStretch();
        }
    }, { passive: true });

    document.addEventListener('touchend', () => { if (pulling) releaseStretch(); }, { passive: true });
    document.addEventListener('touchcancel', () => { if (pulling) releaseStretch(); }, { passive: true });
}

// ============================================================
// DOM CONTENT LOADED
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    initAndroidBackButton();

    // CSS :active alone doesn't reliably show its transition on mobile
    // for a quick tap -- some WebViews apply and remove the :active
    // state faster than a frame can render, so the "sink in" animation
    // only becomes visible on a press-and-hold. This guarantees the
    // .pressed-feedback class (which the CSS treats identically to
    // :active) stays on for at least the transition's duration, so a
    // normal quick tap gets to actually show the animation.
    // Delegated on document so it also covers .dept-oval cards, which
    // are created dynamically per department.
    (function wirePressFeedback(selector, minDuration) {
        const findTarget = (e) => e.target.closest(selector);
        document.addEventListener('touchstart', (e) => {
            const el = findTarget(e);
            if (el) { el.classList.add('pressed-feedback'); el._pressedAt = Date.now(); }
        }, { passive: true });
        const release = (e) => {
            const el = findTarget(e);
            if (el) {
                const elapsed = Date.now() - (el._pressedAt || 0);
                setTimeout(() => el.classList.remove('pressed-feedback'), Math.max(0, minDuration - elapsed));
            }
        };
        document.addEventListener('touchend', release, { passive: true });
        document.addEventListener('touchcancel', release, { passive: true });
    })('.dept-oval, .dept-info-hub-icon', 320);

    // "Add Department" FAB -- bound via touchend (not inline onclick) for
    // the same reason as favBackBtn elsewhere in this file: it skips the
    // browser's tap-vs-gesture disambiguation step, which is the fix
    // that's already proven necessary for reliable touch response on
    // specific custom-positioned elements in this WebView.
    const deptAddFabEl = document.getElementById('deptAddFab');
    if (deptAddFabEl) {
        // Guards against touchend + the browser's synthetic click firing
        // back-to-back on the same tap, which would call onDeptAddFabTap()
        // twice in quick succession.
        let deptFabBusy = false;
        const deptAddFabAction = (e) => {
            if (e) e.preventDefault();
            if (deptFabBusy) return;
            deptFabBusy = true;
            onDeptAddFabTap();
            setTimeout(() => { deptFabBusy = false; }, 700);
        };
        deptAddFabEl.ontouchend = deptAddFabAction;
        deptAddFabEl.onclick = deptAddFabAction; // fallback for mouse/non-touch testing
    }

    const pdfQueueFabEl = document.getElementById('pdfQueueFab');
    if (pdfQueueFabEl) {
        pdfQueueFabEl.onclick = () => imgCombinePdfQueue();
    }

    // Rendered immediately, before anything else -- including the lock
    // screen below. This is what's actually underneath the lock screen the
    // whole time it's up, so the moment it's removed after a correct PIN/
    // fingerprint, the skeleton is already there instead of a blank page
    // that would otherwise show for the beat it takes real data to load.
    showLoadingSkeleton();

    // App Lock — blocks here until unlocked (or resolves immediately if no
    // lock is configured). Deliberately the very first thing that runs
    // besides the skeleton above, so nothing else initializes or touches
    // app data before authentication.
    //
    // Wait for the splash screen (index.html) to finish its own minimum
    // on-screen time and hide itself first. Both the splash and the lock
    // screen render as separate full-screen overlays at the same z-index,
    // so without this wait they can race and briefly overlap/flicker
    // against each other. This keeps the sequence strictly sequential:
    // splash screen finishes and clears, THEN (and only then) the lock
    // screen appears.
    const splashEl = document.getElementById('splashScreen');
    if (splashEl && !splashEl.classList.contains('hidden')) {
        await new Promise(resolve => {
            window.addEventListener('docman-splash-hidden', resolve, { once: true });
        });
    }
    await enforceAppLockGate();

    // Inject version
    const vEls = ['aboutVersionBadge', 'aboutVersionRow', 'deptInfoVersion'];
    vEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = APP_VERSION;
    });

    // Theme
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.onclick = toggleTheme;

    const savedTheme = docmanSettings.theme || localStorage.getItem('docman_theme') || 'dark';
    if (savedTheme === 'light-mode' || savedTheme === 'light') {
        document.body.classList.add('light-mode');
    } else if (savedTheme === 'system') {
        if (!window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('light-mode');
        }
    }
    updateThemeIcon();

    // Tabs
    document.getElementById('pdfTabBtn').onclick = () => setActiveTab('pdfs');
    document.getElementById('notesTabBtn').onclick = () => setActiveTab('notes');

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('imageEditor').classList.contains('hidden')) {
                imgEditorCancel();
                return;
            }
            closeImageViewer();
            closePdfViewer();
        }
    });

    // Image viewer close
    const closeBtn = document.getElementById('closeImageViewer');
    if (closeBtn) closeBtn.onclick = closeImageViewer;

    const viewer = document.getElementById('imageViewer');
    if (viewer) {
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) closeImageViewer();
        });
    }

    // Image editor
    const openEditorBtn = document.getElementById('openImageEditorBtn');
    if (openEditorBtn) {
        let editorBtnBusy = false;
        const openEditorAction = (e) => {
            if (e) e.preventDefault();
            if (editorBtnBusy) return;
            editorBtnBusy = true;
            haptic.press();
            openImageEditor();
            setTimeout(() => { editorBtnBusy = false; }, 700);
        };
        openEditorBtn.ontouchend = openEditorAction;
        openEditorBtn.onclick = openEditorAction;
    }

    const imgEditorCancelBtn = document.getElementById('imgEditorCancelBtn');
    if (imgEditorCancelBtn) imgEditorCancelBtn.onclick = imgEditorCancel;

    const imgEditorUndoBtn = document.getElementById('imgEditorUndoBtn');
    if (imgEditorUndoBtn) imgEditorUndoBtn.onclick = imgEditorUndo;

    const imgEditorRedoBtn = document.getElementById('imgEditorRedoBtn');
    if (imgEditorRedoBtn) imgEditorRedoBtn.onclick = imgEditorRedo;

    const imgEditorResetBtn = document.getElementById('imgEditorResetBtn');
    if (imgEditorResetBtn) imgEditorResetBtn.onclick = imgEditorResetToOriginal;

    document.querySelectorAll('.img-editor-tool').forEach(btn => {
        btn.onclick = () => imgEditorSetTool(imgEditor.activeTool === btn.dataset.tool ? null : btn.dataset.tool);
    });

    // Wire every Adjust-panel slider from the same config used for
    // has-pending/reset/filter-string, so brightness/contrast/exposure/
    // saturation/hue/blur/sepia/opacity/invert are all handled
    // identically: live preview on 'input', and each finished drag
    // ('change', i.e. release) commits as its own single undo step.
    IMG_ADJUST_PROPS.forEach(p => {
        const el = document.getElementById(p.elId);
        if (!el) return;
        const valEl = document.getElementById(p.elId + 'Val');
        el.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            imgEditor[p.prop] = v;
            if (valEl) valEl.textContent = imgFormatSliderValue(p, v);
            imgEditorRender();
            imgEditorUpdateHistoryButtons();
        });
        el.addEventListener('change', imgEditorCommitPending);
    });

    document.querySelectorAll('.img-preset-btn').forEach(btn => {
        btn.onclick = () => imgEditorApplyPreset(btn.dataset.preset);
    });

    const imgCropCancelBtn = document.getElementById('imgCropCancelBtn');
    if (imgCropCancelBtn) imgCropCancelBtn.onclick = () => imgEditorSetTool(null);

    const imgCropApplyBtn = document.getElementById('imgCropApplyBtn');
    if (imgCropApplyBtn) imgCropApplyBtn.onclick = imgEditorApplyCrop;

    const imgScanCancelBtn = document.getElementById('imgScanCancelBtn');
    if (imgScanCancelBtn) imgScanCancelBtn.onclick = () => imgEditorSetTool(null);

    const imgScanApplyBtn = document.getElementById('imgScanApplyBtn');
    if (imgScanApplyBtn) imgScanApplyBtn.onclick = imgEditorApplyScan;

    const imgTextInput = document.getElementById('imgTextInput');
    if (imgTextInput) imgTextInput.addEventListener('input', (e) => {
        document.getElementById('imgTextOverlay').textContent = e.target.value || 'Text';
    });

    document.querySelectorAll('.img-text-swatch').forEach(sw => {
        sw.onclick = () => {
            document.querySelectorAll('.img-text-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            imgEditor.textColor = sw.dataset.color;
            document.getElementById('imgTextOverlay').style.color = imgEditor.textColor;
        };
    });

    document.querySelectorAll('.img-text-font').forEach(fb => {
        fb.onclick = () => {
            document.querySelectorAll('.img-text-font').forEach(f => f.classList.remove('active'));
            fb.classList.add('active');
            imgEditor.textFont = fb.dataset.font;
            document.getElementById('imgTextOverlay').style.fontFamily = imgEditor.textFont;
        };
    });

    const imgTextSize = document.getElementById('imgTextSize');
    if (imgTextSize) imgTextSize.addEventListener('input', (e) => {
        imgEditor.textSize = parseInt(e.target.value, 10);
        document.getElementById('imgTextOverlay').style.fontSize = imgEditor.textSize + 'px';
    });

    document.querySelectorAll('.img-brush-swatch').forEach(sw => {
        sw.onclick = () => {
            document.querySelectorAll('.img-brush-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            imgBrush.color = sw.dataset.color;
        };
    });

    const imgBrushSize = document.getElementById('imgBrushSize');
    if (imgBrushSize) imgBrushSize.addEventListener('input', (e) => {
        imgBrush.size = parseInt(e.target.value, 10);
    });

    const imgTextCancelBtn = document.getElementById('imgTextCancelBtn');
    if (imgTextCancelBtn) imgTextCancelBtn.onclick = () => imgEditorSetTool(null);

    const imgTextApplyBtn = document.getElementById('imgTextApplyBtn');
    if (imgTextApplyBtn) imgTextApplyBtn.onclick = imgEditorApplyText;

    const imgEditorSaveNewBtn = document.getElementById('imgEditorSaveNewBtn');
    if (imgEditorSaveNewBtn) imgEditorSaveNewBtn.onclick = imgEditorSaveAsNew;

    const imgEditorSavePdfBtn = document.getElementById('imgEditorSavePdfBtn');
    if (imgEditorSavePdfBtn) imgEditorSavePdfBtn.onclick = imgEditorSaveAsPdf;

    const imgEditorReplaceBtn = document.getElementById('imgEditorReplaceBtn');
    if (imgEditorReplaceBtn) imgEditorReplaceBtn.onclick = imgEditorReplaceOriginal;

    const imgExitKeepEditingBtn = document.getElementById('imgExitKeepEditingBtn');
    if (imgExitKeepEditingBtn) imgExitKeepEditingBtn.onclick = imgEditorExitModalHide;

    const imgExitDiscardBtn = document.getElementById('imgExitDiscardBtn');
    if (imgExitDiscardBtn) imgExitDiscardBtn.onclick = () => {
        imgEditorExitModalHide();
        closeImageEditor();
    };

    const imgExitSaveBtn = document.getElementById('imgExitSaveBtn');
    if (imgExitSaveBtn) imgExitSaveBtn.onclick = () => {
        imgEditorExitModalHide();
        imgEditorReplaceOriginal();
    };

    // Word / Excel viewer close + share
    const closeDocBtn = document.getElementById('closeDocViewer');
    if (closeDocBtn) closeDocBtn.onclick = closeDocViewer;
    const shareDocBtn = document.getElementById('shareDocViewerBtn');
    if (shareDocBtn) shareDocBtn.onclick = () => {
        const v = document.getElementById('docViewer');
        if (v._currentData) nativeDownload(v._currentData, v._currentName);
    };

    const closeSheetBtn = document.getElementById('closeSheetViewer');
    if (closeSheetBtn) closeSheetBtn.onclick = closeSheetViewer;
    const shareSheetBtn = document.getElementById('shareSheetViewerBtn');
    if (shareSheetBtn) shareSheetBtn.onclick = () => {
        const v = document.getElementById('sheetViewer');
        if (v._currentData) nativeDownload(v._currentData, v._currentName);
    };

    // File input
    document.getElementById('fileInput').addEventListener('change', async (e) => {
        await handleFiles(Array.from(e.target.files));
        e.target.value = '';
    });

    document.getElementById('newNoteBtn').onclick = triggerNewNote;
    const searchInputEl = document.getElementById('searchInput');
    searchInputEl.addEventListener('input', () => {
        render();
        renderSearchSuggestions();
    });
    searchInputEl.addEventListener('focus', renderSearchSuggestions);
    searchInputEl.addEventListener('blur', () => {
        // Delayed so a suggestion's mousedown handler still gets to fire first.
        setTimeout(() => {
            const box = document.getElementById('searchSuggestions');
            if (box) box.classList.add('hidden');
        }, 150);
    });
    searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const box = document.getElementById('searchSuggestions');
            if (box) box.classList.add('hidden');
            addSearchHistory(searchInputEl.value);
            searchInputEl.blur();
        }
    });
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    document.getElementById('homeBtn').addEventListener('click', goHome);
    document.getElementById('uploadBtn').addEventListener('click', showUploadOptions);

    const sortBtnEl = document.getElementById('sortBtn');
    if (sortBtnEl) {
        sortBtnEl.addEventListener('click', () => showSortMenu(sortBtnEl));
        updateSortBtnState();
    }

    // Settings
    initSettingsPage();

    // Load data
    await initDB();

    const folderReq = db.transaction('folderStructure', 'readonly').objectStore('folderStructure').get('structure');
    folderReq.onsuccess = () => {
        if (folderReq.result) {
            fileSystem = folderReq.result.value;
        } else {
            fileSystem = {
                "Personal": {
                    "IDs & Certificates": {},
                    "Photos": {},
                    "Personal Notes": {},
                    "Travel Documents": {}
                },
                "Work": {
                    "Contracts": {},
                    "Reports": {},
                    "Meeting Notes": {},
                    "Projects": {}
                },
                "Finance & Bills": {
                    "Bank Statements": {},
                    "Tax Documents": {},
                    "Receipts": {},
                    "Utility Bills": {}
                },
                "Education": {
                    "Certificates": {},
                    "Transcripts": {},
                    "Assignments": {},
                    "Course Materials": {}
                },
                "Health & Medical": {
                    "Prescriptions": {},
                    "Lab Reports": {},
                    "Insurance": {},
                    "Vaccination Records": {}
                },
                "ID & Legal": {
                    "Passport": {},
                    "ID Proof": {},
                    "Agreements": {},
                    "Licenses": {}
                },
                "Home & Property": {
                    "Rental Agreement": {},
                    "Property Documents": {},
                    "Utility Setup": {},
                    "Maintenance": {}
                },
                "Others": {
                    "Miscellaneous": {},
                    "Archive": {},
                    "Backup": {},
                    "Drafts": {}
                }
            };
            saveFolderStructure();
        }

        const deptColorsReq = db.transaction('folderStructure', 'readonly').objectStore('folderStructure').get('deptColors');
        deptColorsReq.onsuccess = () => {
            if (deptColorsReq.result) {
                deptColors = deptColorsReq.result.value;
            }
            // One-time migration: reassign existing custom department
            // colors to the new fixed palette (was random before).
            if (!deptColors.__migratedFixedPalette) {
                const knownDeptsMigrate = ['Personal', 'Work', 'Finance & Bills', 'Education', 'Health & Medical', 'ID & Legal', 'Home & Property', 'Others'];
                const customDeptKeys = Object.keys(fileSystem).filter(k => !knownDeptsMigrate.includes(k));
                deptColorCycleIndex = 0;
                customDeptKeys.forEach(k => {
                    deptColors[k] = getRandomGradient();
                });
                deptColors.__migratedFixedPalette = true;
                saveDeptColors();
            }
        };

        const folderMetaReq = db.transaction('folderStructure', 'readonly').objectStore('folderStructure').get('folderMeta');
        folderMetaReq.onsuccess = () => {
            if (folderMetaReq.result) {
                folderMeta = folderMetaReq.result.value || {};
            }
        };

        const recycleBinReq = db.transaction('folderStructure', 'readonly').objectStore('folderStructure').get('recycleBin');
        recycleBinReq.onsuccess = () => {
            if (recycleBinReq.result) {
                recycleBin = recycleBinReq.result.value || [];
                purgeExpiredRecycleBinItems();
            }
        };

        loadAllFileMetadata().then(() => {
            const notesReq = db.transaction('notes', 'readonly').objectStore('notes').getAll();
            notesReq.onsuccess = () => {
                allNotes = {};
                for (let item of notesReq.result) {
                    allNotes[item.folderPath] = item.notes;
                }
                render();

                // One-time-per-session check for documents expiring soon
                // or already overdue -- delayed slightly so it doesn't
                // compete with the initial render.
                setTimeout(() => checkExpiringDocumentsOnLoad(), 1200);

                const migrationRun = localStorage.getItem('docman_migration_done');
                if (!migrationRun) {
                    setTimeout(async () => {
                        await migrateBase64ToBlob();
                        localStorage.setItem('docman_migration_done', 'true');
                    }, 1500);
                }

                // Move any remaining IndexedDB-stored PDFs onto native
                // storage. Safe to run every launch — files already
                // migrated (have fsPath) are skipped instantly, so this
                // naturally becomes a no-op once everything's converted.
                if (isNativePlatform()) {
                    setTimeout(() => { migrateFilesToNativeStorage(); }, 3000);
                }

                window.docmanReady = true;
            };
            notesReq.onerror = () => {
                console.warn('Notes load failed, proceeding anyway');
                render();
                window.docmanReady = true;
            };
        }).catch(err => {
            console.warn('loadAllFileMetadata failed:', err);
            render();
            window.docmanReady = true;
        });
    };

    attachPressEffects();
    initImageViewerGestures();
    initElasticOverscroll();

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(drawDeptConnectors, 100);
    });

    if (typeof ResizeObserver !== 'undefined') {
        let roTimeout;
        const roObs = new ResizeObserver(() => {
            clearTimeout(roTimeout);
            roTimeout = setTimeout(drawDeptConnectors, 80);
        });
        const roWatch = document.querySelector('.departments-wrapper') || document.body;
        roObs.observe(roWatch);
    }

    window.addEventListener('load', () => {
        setTimeout(drawDeptConnectors, 300);
        setTimeout(drawDeptConnectors, 800);
        setTimeout(drawDeptConnectors, 1500);
    });

    const redrawOnFirstInteraction = () => {
        drawDeptConnectors();
        window.removeEventListener('scroll', redrawOnFirstInteraction, true);
        window.removeEventListener('touchstart', redrawOnFirstInteraction, true);
    };
    window.addEventListener('scroll', redrawOnFirstInteraction, { capture: true, passive: true, once: true });
    window.addEventListener('touchstart', redrawOnFirstInteraction, { capture: true, passive: true, once: true });

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    document.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'IMG' || e.target.classList.contains('logo-tray-icon') ||
            e.target.classList.contains('header-gear-icon') || e.target.classList.contains('home-icon-img')) {
            e.preventDefault();
        }
    }, { passive: false });

    window.selectDepartment = selectDepartment;
    window.goBack = goBack;
    window.goHome = goHome;
    window.triggerUpload = triggerUpload;
    window.triggerNewNote = triggerNewNote;
    window.clearSearch = clearSearch;
    window.navigateToBreadcrumb = navigateToBreadcrumb;
    window.renameCurrentFolder = renameCurrentFolder;
    window.deleteCurrentFolder = deleteCurrentFolder;
    window.addNewFolder = addNewFolder;
    window.addNewDepartment = addNewDepartment;
    window.onDeptAddFabTap = onDeptAddFabTap;
    window.openFile = openFile;
    window.openNote = openNote;
    window.closeNoteModal = closeNoteModal;
    window.renameNote = renameNote;
    window.deleteNoteFromFolder = deleteNoteFromFolder;
    window.closeImageViewer = closeImageViewer;
    window.openImageEditor = openImageEditor;
    window.closeImageEditor = closeImageEditor;
    window.showInfo = showInfo;
    window.showInfoDelayed = showInfoDelayed;
    window.closeDeptInfo = closeDeptInfo;
});

// ============================================================
// END OF FILE
// ============================================================
