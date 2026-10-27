const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const a = "        const dismissed = calDismissed();\n";
if (s.split(a).length !== 2) throw new Error('anchor');
s = s.replace(a, () => "        // Pressing the button yourself brings back reminders you deleted earlier (you asked for the sync on purpose);\n        // the silent Auto-sync keeps them deleted, so a reminder you removed does not return every few hours.\n        if (!auto) { try { localStorage.removeItem(CAL_DISMISSED_KEY); } catch (e) { /* the set below is then empty anyway */ } }\n        const dismissed = auto ? calDismissed() : new Set();\n");
fs.writeFileSync(f, s); console.log('edited');
