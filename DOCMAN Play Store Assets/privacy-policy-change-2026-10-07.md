# Privacy policy — the one change 1.0.0 needs

The policy lives in its own repo, **not** in this folder:
  https://github.com/abjincy-dot/docman-privacy  (branch `main`, `index.html`)
  published at https://abjincy-dot.github.io/docman-privacy/

## Is a change required?

**No.** The 1.0.0 features add no new data type, no new sharing and no new
permission:

| New in 1.0.0 | Data it adds | Leaves the device? | New permission? |
|---|---|---|---|
| Repeating reminders | a `repeat` field on a reminder you already made | No | No |
| Reminder on a note | a pointer to which note it belongs to | No | No |
| Note colours | a colour name on a note | No | No |

So the **Play Data safety form stays exactly as it is**, and the policy is not
blocking the 1.0.0 upload. The edit below is an accuracy touch-up, worth making
because Section 1 lists reminder fields item by item and is now one item short.

## Edit 1 — Section 1, the reminders bullet  (the only real change)

FIND:
```html
      <li><strong>Reminders you create</strong> (title, due date, and time) &mdash; stored locally.</li>
```

REPLACE WITH:
```html
      <li><strong>Reminders you create</strong> (title, due date and time, whether you set it to
        repeat every month or every year, and &mdash; if you attached it to a note &mdash; which
        note it belongs to) &mdash; stored locally.</li>
```

## Edit 2 — Section 6, one sentence on repeats (optional, for completeness)

FIND:
```html
    <p>A reminder that has fallen due repeats every 30 minutes for up to three hours until you
      acknowledge it, and an expiry alert repeats through the day it falls due. Those repeats are
      scheduled on your device in advance, like the first alert, and stop as soon as you dismiss
      them.</p>
```

REPLACE WITH:
```html
    <p>A reminder that has fallen due repeats every 30 minutes for up to three hours until you
      acknowledge it, and an expiry alert repeats through the day it falls due. Those repeats are
      scheduled on your device in advance, like the first alert, and stop as soon as you dismiss
      them.</p>
    <p>A reminder you set to repeat every month or every year works out its own next date on your
      device as soon as you acknowledge it, and schedules the next alert the same local way. Nothing
      about a repeating reminder is sent anywhere, and nothing about it is kept outside the app's
      own private storage.</p>
```

## Edit 3 — the date stamp

FIND:
```html
    <p class="stamp">Last updated &middot; September 26, 2026</p>
```

REPLACE WITH:
```html
    <p class="stamp">Last updated &middot; October 7, 2026</p>
```

## After pushing

1. Open https://abjincy-dot.github.io/docman-privacy/ and confirm the new date
   shows (GitHub Pages takes a minute or two).
2. Refresh the mirror in this folder:
   `DOCMAN Play Store Assets\privacy-policy\index.html`
3. Nothing to change in Play Console — the policy URL is unchanged.
