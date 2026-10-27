// Files / Notes sections of a folder:
//  (a) Select is offered only when the section on screen has something to select (it counted files + notes together),
//  (b) an empty section tells the user that the OTHER section has items and lets them jump there,
//  (c) a small count badge on the inactive FILES / NOTES label, so nobody forgets the notes are there.
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

// (a)
rep("    const canSelectHere = canShowOwnContent && ((allFiles[selectablePath] || []).length + (allNotes[selectablePath] || []).length) > 0;",
    "    // Select follows the section on screen: a folder with notes but no files must not offer Select under FILES (and the other way round).\n    const canSelectHere = canShowOwnContent && ((currentActiveTab === 'pdfs' ? (allFiles[selectablePath] || []) : (allNotes[selectablePath] || [])).length) > 0;");

// (c) + (b) helpers, placed before the folder content block
rep("    if (canShowOwnContent) {\n        if (currentActiveTab === 'pdfs') {",
    "    updateFilesNotesBadges(canShowOwnContent);\n    if (canShowOwnContent) {\n        if (currentActiveTab === 'pdfs') {");

rep("                dz.innerHTML = `<img src=\"Images/empty-cloud.png\" alt=\"\" class=\"empty-state-icon\"><p>No files here yet</p>`;\n                contentDiv.appendChild(dz);",
    "                const otherNotes = getNotesForCurrentFolder().length;\n                dz.innerHTML = `<img src=\"Images/empty-cloud.png\" alt=\"\" class=\"empty-state-icon\"><p>No files here yet</p>` +\n                    (otherNotes ? `<button type=\"button\" class=\"empty-state-hop\" onclick=\"setActiveTab('notes')\">This folder has ${otherNotes} note${otherNotes === 1 ? '' : 's'} &rarr; open NOTES</button>` : '');\n                contentDiv.appendChild(dz);");

rep("                contentDiv.insertAdjacentHTML('beforeend', '<div class=\"empty-state empty-state-note\"><i class=\"fas fa-sticky-note\"></i><p>No notes yet. Click + New Note to add.</p></div>');",
    "                const otherFiles = getFilesForCurrentFolder().length;\n                contentDiv.insertAdjacentHTML('beforeend', '<div class=\"empty-state empty-state-note\"><i class=\"fas fa-sticky-note\"></i><p>No notes yet. Click + New Note to add.</p>' +\n                    (otherFiles ? '<button type=\"button\" class=\"empty-state-hop\" onclick=\"setActiveTab(\\'pdfs\\')\">This folder has ' + otherFiles + ' file' + (otherFiles === 1 ? '' : 's') + ' &rarr; open FILES</button>' : '') + '</div>');");

rep("function setActiveTab(tab) {\n    haptic.toggle();",
    "// Small count badges on the FILES / NOTES labels (shown on the side that is NOT lit): the number of files and notes in this folder.\nfunction updateFilesNotesBadges(show) {\n    const lf = document.querySelector('.ft-toggle-label-files'), ln = document.querySelector('.ft-toggle-label-notes');\n    if (!lf || !ln) return;\n    const nf = show ? getFilesForCurrentFolder().length : 0, nn = show ? getNotesForCurrentFolder().length : 0;\n    if (nf) lf.setAttribute('data-count', nf > 99 ? '99+' : String(nf)); else lf.removeAttribute('data-count');\n    if (nn) ln.setAttribute('data-count', nn > 99 ? '99+' : String(nn)); else ln.removeAttribute('data-count');\n}\n\nfunction setActiveTab(tab) {\n    haptic.toggle();");

fs.writeFileSync(f, s);
console.log('files/notes edited');
