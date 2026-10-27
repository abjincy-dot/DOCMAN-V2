const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('anchor not unique/found: ' + a.slice(0, 60)); s = s.replace(a, () => b); }
rep("import java.util.ArrayList;\nimport java.util.HashSet;", "import java.util.ArrayList;\nimport java.util.HashMap;\nimport java.util.HashSet;");
rep("import java.util.List;\nimport java.util.Set;", "import java.util.List;\nimport java.util.Map;\nimport java.util.Set;");
rep("Resolves { events: [ { eventId, begin, end, title, allDay, location, calendar, recurring } ] }", "Resolves { events: [ { eventId, begin, end, title, allDay, location, calendar, recurring, rrule } ] }");
rep("        Set<Long> repeating = repeatingEvents(cr, ids);", "        Map<Long, String> repeating = repeatingEvents(cr, ids);");
rep("            try { o.put(\"recurring\", repeating.contains(id)); } catch (Exception ignored) { }",
    "            try {\n                o.put(\"recurring\", repeating.containsKey(id));\n                String rule = repeating.get(id);\n                o.put(\"rrule\", rule == null ? \"\" : rule);   // e.g. FREQ=MONTHLY;INTERVAL=1 (empty when it only has fixed extra dates)\n            } catch (Exception ignored) { }");
rep("    private Set<Long> repeatingEvents(ContentResolver cr, Set<Long> ids) {\n        Set<Long> out = new HashSet<>();", "    private Map<Long, String> repeatingEvents(ContentResolver cr, Set<Long> ids) {\n        Map<Long, String> out = new HashMap<>();");
rep("                    if (rrule || rdate) out.add(c.getLong(0));", "                    if (rrule || rdate) out.put(c.getLong(0), rrule ? c.getString(1) : \"\");");
fs.writeFileSync(f, s); console.log('java edited');
