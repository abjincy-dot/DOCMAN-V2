// Renders Settings > Storage with the 3D cylinder icon swapped in (preview only; the app is not changed).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dir = __dirname;
const svg = fs.readFileSync(path.join(dir, process.argv[2] || 'storage-cylinder.svg'), 'utf8').replace(/\s*\n\s*/g, ' ');
fs.writeFileSync(path.join(dir, 'storage-icon.css'), `
/* 21 Oct: the Storage screen's top icon is a 3D coral / white / blue cylinder stack instead of the flat gradient box. */
#settingsPanel-storage .storage-summary-icon {
    background: none !important; box-shadow: none !important; border-radius: 0 !important;
    width: 58px; height: 66px; filter: drop-shadow(0 6px 10px rgba(59, 130, 246, 0.45));
}
#settingsPanel-storage .storage-summary-icon svg { width: 100%; height: 100%; display: block; }
`);
const act = `(()=>{const i=document.querySelector('#settingsPanel-storage .storage-summary-icon'); i.innerHTML=${JSON.stringify(svg)}; document.getElementById('settingsBtn').click(); setTimeout(()=>showSettingsScreen('settingsPanel-storage'),500);})();`;
for (const mode of ['dark', 'light']) {
    execFileSync('node', [path.join(dir, 'shot-light.js'), path.join(dir, `storage-icon-${mode}.png`), mode, path.join(dir, 'storage-icon.css'), 'reminders', act], { stdio: 'inherit' });
}
console.log('done');
