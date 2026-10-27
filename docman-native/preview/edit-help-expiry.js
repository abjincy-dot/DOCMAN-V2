// "i" screen, Expiry Dates & Alerts row: the alert schedule as a clear list (it was one confusing sentence).
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');
const a = "Your phone then alerts you even when DOCMAN is closed &mdash; <b>7 days before</b>, <b>3 days before</b> and <b>the day before</b> at 9am, and on the day itself <b>every 30 minutes from 7am</b> until you press <b>Done</b>. It stops at 9pm, so it never wakes you at night, and if the document still isn&rsquo;t renewed you get one reminder a day for a week. Documents that run out on the same day";
const i = s.indexOf(a);
if (i < 0 || s.indexOf(a, i + 1) >= 0) throw new Error('anchor');
const b = "Your phone then alerts you, even when DOCMAN is closed, on this schedule:" +
    "<br>&bull; <b>7 days before</b>, <b>3 days before</b> and <b>1 day before</b>: one alert each, at <b>9am</b>." +
    "<br>&bull; <b>On the day it expires</b>: an alert <b>every 30 minutes from 7am until 9pm</b>, until you press <b>Done</b>." +
    "<br>&bull; <b>After it expires</b>: one alert a day at <b>9am</b> for 7 days, if it still isn&rsquo;t renewed." +
    "<br>Nothing rings between 9pm and 7am, so it never wakes you at night. Documents that run out on the same day";
s = s.replace(a, () => b);
fs.writeFileSync(f, s);
console.log('expiry help edited');
