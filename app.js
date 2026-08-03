// ============================================================
// DOCMAN - Document Manager
// Version: 1.0.0
// ============================================================

const APP_VERSION = '1.0.2';

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
    'linear-gradient(135deg, #3f5cda, #2c3fa0)',
    'linear-gradient(135deg, #4ea384, #2f6e58)',
    'linear-gradient(135deg, #7f33c7, #4e1d7c)',
    'linear-gradient(135deg, #b6337f, #7c2154)',
    'linear-gradient(135deg, #bf5b2a, #8a3f1a)',
    'linear-gradient(135deg, #b99233, #856419)',
    'linear-gradient(135deg, #43815c, #2a5c3f)',
    'linear-gradient(135deg, #304bc0, #1e2f80)'
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

function getFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['docx'].includes(ext)) return 'word';
    if (['doc'].includes(ext)) return 'word-legacy';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
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
    // Everything routes through a single gentle vibration now — no more
    // Medium/Heavy impact styles, and the fallback duration is short
    // regardless of which action triggered it.
    const imp = () => cap()?.impact({ style: 'Light' }) ?? navigator.vibrate?.(10);
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
        <div style="background:#1a1a1a;border:1px solid ${borderColor};border-radius:20px;padding:28px 24px;width:100%;max-width:360px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
            <p style="color:#ffffff;font-size:0.95rem;font-weight:600;margin-bottom:${isPrompt ? 16 : 24}px;font-family:Inter,sans-serif;line-height:1.5;">${message}</p>
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
async function permanentlyDeleteRecycleBinItem(id, { silent = false } = {}) {
    const idx = recycleBin.findIndex(r => r.id === id);
    if (idx === -1) return;
    const item = recycleBin[idx];

    if (item.kind === 'file') {
        const f = item.payload;
        if (f.fsPath) deleteFileFromFS(f.fsPath);
        else deleteBlobFromDB(item.folderPath, f.name);
    } else if (item.kind === 'folder') {
        for (const k of Object.keys(item.payload.filesSnapshot || {})) {
            for (const f of item.payload.filesSnapshot[k]) {
                if (f.fsPath) deleteFileFromFS(f.fsPath);
                else deleteBlobFromDB(k, f.name);
            }
        }
    }
    // Notes carry no separate blob -- their content lives entirely in the
    // recycle bin entry itself, nothing extra to purge.

    recycleBin.splice(idx, 1);
    await saveRecycleBin();
    if (!silent) {
        render();
        updateStats();
        showToast('Permanently deleted');
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
            fsPath: f.fsPath
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
            size: f.fileData.size || 0
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
            size: f.size || 0
        };
    }
    return {
        name: f.name,
        type: f.type,
        uploadedAt: f.uploadedAt || Date.now(),
        favourite: f.favourite || false,
        locked: f.locked || false,
        size: f.size || 0
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
async function deleteBlobFromDB(folderPath, fileName) {
    try {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(folderPath + '/' + fileName);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('Failed to delete blob:', e);
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
                    size: blob.size
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
                    _hasData: true,
                    _isBase64: false
                };
            }
        }
    } catch (e) {
        console.warn('Failed to cache file as blob:', e);
    }
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

function fsPathFor(folderPath, fileName) {
    // Filesystem paths can't safely contain the same characters a display
    // name might; folderPath is already made of internal path segments so
    // it's safe as-is, filenames are used as leaf segments verbatim.
    return 'docs/' + folderPath + '/' + fileName;
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

async function deleteFileFromFS(fsPath) {
    const Filesystem = getFilesystemPlugin();
    if (!Filesystem || !fsPath) return;
    try {
        await Filesystem.deleteFile({ path: fsPath, directory: 'DATA' });
    } catch (e) {
        // File may already be gone — not fatal.
        console.warn('Native file delete failed (may not exist):', e);
    }
}

async function moveFileInFS(oldPath, newPath) {
    const Filesystem = getFilesystemPlugin();
    if (!Filesystem || !oldPath) return false;
    if (oldPath === newPath) return true;
    try {
        await Filesystem.rename({ from: oldPath, to: newPath, directory: 'DATA', toDirectory: 'DATA' });
        return true;
    } catch (e) {
        console.warn('Native file rename failed:', e);
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

async function renameFileInFolder(folderPath, oldName, newName) {
    if (!newName?.trim()) return showToast("Name empty", true);
    if (allFiles[folderPath]) {
        const idx = allFiles[folderPath].findIndex(f => f.name === oldName);
        if (idx !== -1) {
            const entry = allFiles[folderPath][idx];
            if (entry.fsPath) {
                const newFsPath = fsPathFor(folderPath, newName);
                const ok = await moveFileInFS(entry.fsPath, newFsPath);
                if (ok) entry.fsPath = newFsPath;
            } else {
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
        openImageViewer(fileData, fileName);
    } else if (fileType === 'pdf') {
        await handlePdfFile(fileData, fileName, folderPath);
    } else if (fileType === 'word') {
        openWordViewer(fileData, fileName);
    } else if (fileType === 'excel') {
        openExcelViewer(fileData, fileName);
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

function openImageViewer(fileData, fileName) {
    const viewer = document.getElementById('imageViewer');
    const viewerImage = document.getElementById('viewerImage');

    const url = URL.createObjectURL(fileData);
    viewerImage.src = url;
    viewerImage.alt = fileName;

    viewer._currentUrl = url;
    viewer._currentData = fileData;

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
// WORD DOCUMENT VIEWER (.docx via mammoth.js)
// ============================================================

async function openWordViewer(fileData, fileName) {
    const viewer = document.getElementById('docViewer');
    const body = document.getElementById('docViewerBody');
    const title = document.getElementById('docViewerTitle');

    title.textContent = fileName;
    body.innerHTML = '<div class="doc-viewer-unsupported"><i class="fas fa-spinner fa-spin"></i><p>Loading document…</p></div>';
    viewer._currentData = fileData;
    viewer._currentName = fileName;
    viewer.classList.remove('hidden');

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

function showCardContextMenu({ title, isFav, onFav, onRename, onDelete, isLocked, onLock, onShare, triggerEl }) {
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
        const menuW = 200;
        const menuH = 180;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = rect.right - menuW;
        let top = rect.top - menuH - 8;

        if (left < 8) left = 8;
        if (left + menuW > vw - 8) left = vw - menuW - 8;
        if (top < 8) top = rect.bottom + 8;
        if (top + menuH > vh - 8) top = vh - menuH - 8;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('ctxFav').addEventListener('click', () => { close();
        onFav(); });
    const lockEl = document.getElementById('ctxLock');
    if (lockEl) lockEl.addEventListener('click', () => { close();
        onLock(); });
    const renameEl = document.getElementById('ctxRename');
    if (renameEl) renameEl.addEventListener('click', () => { close();
        onRename(); });
    const shareEl = document.getElementById('ctxShare');
    if (shareEl) shareEl.addEventListener('click', () => { close();
        onShare(); });
    const deleteEl = document.getElementById('ctxDelete');
    if (deleteEl) deleteEl.addEventListener('click', () => { close();
        onDelete(); });
}

// ============================================================
// CARD CREATION
// ============================================================

function createFileCard(file, folderPath, opts = {}) {
    const iconClass = getFileIcon(file.name);
    const div = document.createElement('div');
    div.className = 'card file-card';
    const sizeLabel = getFileSizeLabel(file);
    const nameHtml = opts.highlightQuery ? highlightMatch(file.name, opts.highlightQuery) : escapeHtml(file.name);
    div.innerHTML = `
        <div class="card-icon"><i class="fas ${iconClass}"></i></div>
        <div class="card-info">
            <div class="card-filename" title="${escapeHtml(file.name)}">${nameHtml}</div>
            ${sizeLabel ? `<div class="card-meta">${sizeLabel}</div>` : ''}
        </div>
        ${file.locked ? '<i class="fas fa-lock card-lock-indicator"></i>' : ''}
        <i class="fas fa-star card-fav-indicator${file.favourite ? '' : ' card-fav-hidden'}"></i>
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

                    if (f.locked) { applyLock(false);
                        return; }
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

                    if (n.locked) { applyLock(false);
                        return; }
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

                    if (meta.locked) { applyLock(false);
                        return; }
                    ensurePinExistsForLock(() => applyLock(true));
                }
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

function renameCurrentFolder() {
    if (!currentPath.length) return;
    const old = currentPath[currentPath.length - 1];
    showPromptModal('Rename folder:', old, async (newName) => {
        if (newName && newName !== old && newName.trim()) {
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
            if (allFiles[oldPath]) {
                allFiles[newPath] = allFiles[oldPath];
                delete allFiles[oldPath];
                await Promise.all(allFiles[newPath].map(async f => {
                    if (f.fsPath) {
                        const newFsPath = fsPathFor(newPath, f.name);
                        const ok = await moveFileInFS(f.fsPath, newFsPath);
                        if (ok) f.fsPath = newFsPath;
                    } else {
                        await renameBlobInDB(oldPath, f.name, newPath, f.name);
                    }
                }));
            }
            if (allNotes[oldPath]) { allNotes[newPath] = allNotes[oldPath];
                delete allNotes[oldPath]; }

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
    showPromptModal('New folder name:', '', (name) => {
        if (name && name.trim()) {
            const cur = getCurrentFolderObject();
            if (cur && !cur[name]) { cur[name] = {};
                folderMeta[[...currentPath, name].join('/')] = { createdAt: Date.now() };
                saveFolderMeta();
                saveFolderStructure();
                render(); } else showToast('Already exists', true);
        }
    });
}

function addNewDepartment() {
    showPromptModal('New department name:', '', (name) => {
        if (name && name.trim()) {
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
        } else if (name !== null && name.trim() === '') {
            showToast('Department name cannot be empty', true);
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
                        <div class="dept-hub-knob" onclick="showInfo()">
                            <i class="fas fa-info dept-hub-icon"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        html += `<div class="dept-add-footer">
            <button class="dept-add-btn" onclick="addNewDepartment()">
                <span class="dept-add-btn-icon"><i class="fas fa-plus"></i></span>
                <span class="dept-add-btn-label">Add Department</span>
            </button>
        </div>`;

        document.getElementById('departmentsSection').innerHTML = html;
        document.getElementById('homeBtn').classList.add('hidden');
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
        const actionDiv = document.createElement('div');
        actionDiv.className = 'folder-toolbar';
        actionDiv.innerHTML = `
            <button class="ft-zone" onclick="goBack()" aria-label="Back"></button>
            <button class="ft-zone" onclick="addNewFolder()" aria-label="Add Subfolder"></button>
            <button class="ft-zone" onclick="renameCurrentFolder()" aria-label="Rename"></button>
            <button class="ft-zone" onclick="deleteCurrentFolder()" aria-label="Delete"></button>`;

        const folderCardInDom = contentDiv.querySelector('.current-folder-card');
        if (folderCardInDom) {
            contentDiv.insertBefore(actionDiv, folderCardInDom);
        } else {
            contentDiv.appendChild(actionDiv);
        }
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
        const safeCr = Math.min(cr, Math.abs(dy) / 2);
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
        const channelX = lineEndX - 35;

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

                    if (meta.locked) { applyLock(false); return; }
                    ensurePinExistsForLock(() => applyLock(true));
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
            selectDepartment(dept);
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
}

function openDashboardView() {
    document.getElementById('searchInfo').classList.add('hidden');
    renderDashboardView();
    const view = document.getElementById('dashboardView');
    view.classList.remove('hidden');
    requestAnimationFrame(() => view.classList.add('fav-view-visible'));

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

    overlay.querySelectorAll('.pvKey').forEach(btn => {
        if (btn.dataset.key === '') return;
        btn.addEventListener('pointerdown', () => { btn.style.background = 'rgba(255,255,255,0.14)'; });
        btn.addEventListener('pointerup', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        btn.addEventListener('pointercancel', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
        bindTap(btn, () => handleKeyPress(btn.dataset.key));
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
    const overlayCreatedAt = Date.now();
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

            showConfirmModal('This will <b>replace all current data</b> with the backup. Continue?', async (ok) => {
                if (!ok) return;

                showToast('Restoring backup…');

                fileSystem = manifest.fileSystem || {};
                allNotes = manifest.allNotes || {};
                deptColors = manifest.deptColors || {};
                allFiles = {};

                if (manifest.fileMetadata) {
                    for (const path in manifest.fileMetadata) {
                        if (!manifest.fileMetadata[path]) continue;
                        allFiles[path] = [];
                        for (const f of manifest.fileMetadata[path]) {
                            const zipEntry = zip.file('files/' + path + '/' + f.name);
                            let fileData = null;
                            if (zipEntry) {
                                try {
                                    fileData = await zipEntry.async('blob');
                                } catch (e) {
                                    console.warn('Failed to read file from backup:', path, f.name, e);
                                }
                            }
                            allFiles[path].push({
                                name: f.name,
                                type: f.type || 'application/octet-stream',
                                uploadedAt: f.uploadedAt || Date.now(),
                                favourite: f.favourite || false,
                                size: f.size || (fileData ? fileData.size : 0),
                                fileData: fileData,
                                _hasData: !!fileData,
                                _isBase64: false
                            });
                        }
                    }
                }

                await saveFolderStructure();
                await saveDeptColors();
                await saveAllNotesToDB();
                await saveAllFilesToDB(true);
                await loadAllFileMetadata();

                currentPath = [];
                closeSettingsPage();
                render();
                showToast('Data imported successfully');
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

async function doEraseAllData() {
    fileSystem = {};
    allFiles = {};
    allNotes = {};
    deptColors = {};
    await saveFolderStructure();
    await saveDeptColors();
    const tx = db.transaction(['files', 'notes', 'blobs'], 'readwrite');
    tx.objectStore('files').clear();
    tx.objectStore('notes').clear();
    tx.objectStore('blobs').clear();
    tx.commit();
    currentPath = [];
    closeSettingsPage();
    render();
    showToast('All data erased');
}

function clearAllAppData() {
    const hasPin = !!localStorage.getItem(PIN_KEY);
    if (hasPin) {
        showPinVerifyModal('Erase All Data', (verified) => {
            if (!verified) return;
            showConfirmModal('This will permanently delete <b>all files, notes and departments</b>. This cannot be undone. Continue?', async (confirmed) => {
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
                showConfirmModal('This will permanently delete <b>all files, notes and departments</b>. This cannot be undone. Continue?', async (confirmed) => {
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
        if (e.target.id === 'settingsPage') closeSettingsPage();
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

    // Departments
    document.getElementById('settingsAddDeptBtn').onclick = () => {
        addNewDepartment();
        setTimeout(renderDepartmentsManagePanel, 50);
        setTimeout(refreshSettingsListSubtitles, 50);
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
    document.getElementById('checkUpdatesBtn').onclick = () => showToast("You're on the latest version ✓");

    applyTheme(docmanSettings.theme || 'dark');
    applyAnimations();
    applyParticles();
}

// ============================================================
// SHOW INFO
// ============================================================

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
    modal.classList.remove('show');
    setTimeout(() => { modal.style.display = 'none'; }, 80);
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

async function handleFiles(files) {
    for (let f of files) {
        const fileType = getFileType(f.name);
        if (['image', 'pdf', 'word', 'word-legacy', 'excel'].includes(fileType)) {
            await addFileToCurrentFolder(f);
        } else {
            showToast('Skipped: ' + f.name + ' (not supported)', true);
        }
    }
    render();
}

function triggerUpload() {
    expectNativeReturn();
    document.getElementById('fileInput').click();
}

function triggerNewNote() {
    openNewNoteModal();
}

// ============================================================
// GOOGLE DRIVE PICKER (hosted web page + custom URL scheme callback)
// ============================================================

// The hosted page (drive-picker.html) does the Google sign-in and shows
// the Picker UI -- Google's Picker widget has to run in a real browser,
// not inside the app's WebView. Once a file is chosen, that page redirects
// to docman://oauth-callback, which AndroidManifest.xml routes back into
// this app; the listener below catches that and downloads the file.
//
// SECURITY NOTE: custom URL schemes like "docman://" are not exclusive to
// this app on Android -- another app could in principle register the same
// scheme and receive this callback (with the Drive access token in it)
// instead of DOCMAN. The `state` nonce below defends against a *forged*
// callback being accepted by this app, but it can't stop a malicious app
// from being the one that *receives* the genuine redirect in the first
// place. Closing that fully requires switching to a verified Android App
// Link (a real https:// domain with a hosted assetlinks.json) instead of
// a custom scheme -- that requires control over the drive-picker.html
// domain, which is out of scope here.
const DRIVE_PICKER_URL = 'https://abjincy-dot.github.io/docman-drive-picker/drive-picker.html';

// One-time nonce for the in-flight Drive picker request, so a stray/late
// callback can't be replayed against a later request. Cleared as soon as
// it's consumed (success, mismatch, or cancellation).
let pendingDriveState = null;

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

function initGoogleDrivePicker() {
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return; // Web/PWA build -- Drive picker is native-app only.

    App.addListener('appUrlOpen', async (data) => {
        const url = data?.url || '';
        if (!url.startsWith('docman://oauth-callback')) return;

        const Browser = window.Capacitor?.Plugins?.Browser;
        if (Browser) { try { await Browser.close(); } catch (e) { /* already closed */ } }

        let params;
        try { params = new URL(url).searchParams; } catch (e) { return; }

        const expectedState = pendingDriveState;
        pendingDriveState = null; // one-time use regardless of outcome below

        if (params.get('cancelled')) return;

        // Backward-compatible check: only enforce if the picker page is
        // actually echoing state back. Once drive-picker.html is updated
        // to always include &state=..., this becomes a hard requirement.
        const returnedState = params.get('state');
        if (returnedState !== null && returnedState !== expectedState) {
            console.warn('[DOCMAN-DRIVE] state mismatch, ignoring callback');
            showToast('Google Drive selection failed', true);
            return;
        }
        if (returnedState === null) {
            console.warn('[DOCMAN-DRIVE] picker page did not echo state -- update drive-picker.html to close the replay gap');
        }

        const fileId = params.get('fileId');
        const fileName = params.get('fileName') || 'drive-file';
        const accessToken = params.get('accessToken');
        if (!fileId || !accessToken) {
            showToast('Google Drive selection failed', true);
            return;
        }

        showToast('Importing from Google Drive…');
        try {
            const res = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!res.ok) throw new Error('Drive download failed: ' + res.status);
            const blob = await res.blob();
            const file = new File([blob], fileName, { type: blob.type });
            await handleFiles([file]);
        } catch (err) {
            showToast('Could not import from Google Drive', true);
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
        openFilePicker({ accept: '.pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.doc,.docx,.xls,.xlsx,.csv', capture: null, multiple: true });
    });
    document.getElementById('optGoogleDrive').addEventListener('click', async () => {
        close();
        haptic.press();
        const Browser = window.Capacitor?.Plugins?.Browser;
        if (!Browser) {
            showToast('Google Drive import needs the native app', true);
            return;
        }
        pendingDriveState = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2));
        const pickerUrl = DRIVE_PICKER_URL + '?state=' + encodeURIComponent(pendingDriveState);
        await Browser.open({ url: pickerUrl });
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

    const EXCLUDED_SELECTOR = '.settings-page, .favourites-view, #imageViewer, .pdf-viewer-body, .modal, .ctx-menu-overlay, #appLockScreen, #pinVerifyModal, #customConfirm, #customPrompt, #lockedItemsOverlay';

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
    initGoogleDrivePicker();
    initAndroidBackButton();

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
                "Personal": {},
                "Work": {},
                "Finance & Bills": {},
                "Education": {},
                "Health & Medical": {},
                "ID & Legal": {},
                "Home & Property": {},
                "Others": {}
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
    window.openFile = openFile;
    window.openNote = openNote;
    window.closeNoteModal = closeNoteModal;
    window.renameNote = renameNote;
    window.deleteNoteFromFolder = deleteNoteFromFolder;
    window.closeImageViewer = closeImageViewer;
    window.showInfo = showInfo;
    window.closeDeptInfo = closeDeptInfo;
});

// ============================================================
// END OF FILE
// ============================================================
