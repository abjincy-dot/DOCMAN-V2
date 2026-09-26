# Privacy policy — MIRROR, do not edit here

The published policy lives in its own repository and is served from there:

- Source of truth: https://github.com/abjincy-dot/docman-privacy (branch `main`, `index.html`)
- Published at: https://abjincy-dot.github.io/docman-privacy/
- The app opens that URL directly (`PRIVACY_POLICY_URL` in `docman-native/www/app.js`)

`index.html` in this folder is a **copy**, kept only so the wording can be read
alongside the other store assets. Editing it changes nothing that users see.

It had already drifted once: on 2026-09-26 this folder still held the
September 15 text while the live page was on September 19, so it was missing
the merged-PDF and Safety Snapshot wording. Publishing from here would have
silently reverted those.

To change the policy: clone the repo above, edit `index.html`, push to `main`,
then refresh this copy.

A `_body.html` partial used to sit here too. It existed in no other copy and
had drifted the same way, so it was removed rather than left to mislead.
