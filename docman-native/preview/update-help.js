const fs = require("fs");
const p = "../www/index.html";
let h = fs.readFileSync(p, "utf8");
const rep = [
  // Reminders paragraph: logo is a calendar now
  ["<b>Reminders</b> &mdash; Tap the DOCMAN logo at the top for <b>Expiring</b> and <b>Reminders</b>.",
   "<b>Reminders</b> &mdash; Tap the DOCMAN logo at the top &mdash; the little calendar that shows today&rsquo;s day and date &mdash; for <b>Expiring</b> and <b>Reminders</b>."],
  // pencil button -> Edit
  ["and the pencil button on its row can change the repeat or turn it off.",
   "and <b>Edit</b> can change the repeat or turn it off."],
  // the old calendar-above-the-list sentence
  ["The month calendar is above the list &mdash; tap any day to see just that day&rsquo;s reminders, and dated days carry a dot &mdash; and anything overdue pulses, including the <b>Reminders</b> tab itself, so you can see it from the Expiring side.",
   "Press <b>+ Add reminder</b> and a month calendar opens: tap the day, press <b>Continue</b>, then type the title and set the time. In the list every reminder is a card, and one orange <b>button bar</b> sits beside the cards &mdash; <b>Open</b>, <b>Edit</b> and <b>Delete</b> on Reminders, <b>View</b>, <b>Edit</b> and <b>Remind</b> on Expiring. The bar stays in place while you scroll, the cards slide up over each other like a deck, and the bar always works on the top card, the one with the orange outline. Each card has its own <b>Done</b> button, and <b>Mark all done</b> clears everything that is waiting. Anything overdue makes its tab glow gently, including the <b>Reminders</b> tab itself, so you can see it from the Expiring side."],
  // Expiry paragraph tail
  ["Tap the DOCMAN logo for the <b>Expiring</b> and <b>Reminders</b> tabs, with the month calendar.",
   "Tap the DOCMAN logo (the calendar that shows today&rsquo;s day and date) for the <b>Expiring</b> and <b>Reminders</b> tabs."],
];
for (const [a, b] of rep) {
  if (!h.includes(a)) { console.log("MISSING:", a.slice(0, 80)); process.exit(1); }
  h = h.replace(a, b);
}
fs.writeFileSync(p, h, "utf8");
console.log("help updated");
