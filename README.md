# Remediation Wizard Study

A within-subjects user study hosted on GitHub Pages. Each participant completes
walkthroughs of **two** account-security remediation wizard designs, in a
randomly assigned order:

| Code | File | Design |
|------|------|--------|
| A | `wizard-a.html` | High-security (guided / nudging) |
| B | `wizard-b.html` | High-agency (user choice, no nudging) |

Condition names are never shown to participants (files are just "a" and "b",
and both pages are titled "Account Security Wizard").

## Participant flow

Participants receive **two links, sent separately** (e.g. by email after consent):

```
Part 1:  https://<user>.github.io/wizard-study/part1.html?pid=P-07
Part 2:  https://<user>.github.io/wizard-study/part2.html?pid=P-07
```

- `part1.html` assigns the session (random wizard order, or `&w=a` / `&w=b` to
  force which design comes first) and lands directly on that wizard's opening
  email screen. Finishing shows `interlude.html`: "Part 1 complete, close this
  window, open Part 2 in the same browser."
- `part2.html` continues the session from the same browser's localStorage and
  shows the *other* wizard. Finishing shows `done.html`.
- The root URL (`index.html`) redirects to `part1.html`.

The `?pid=` parameter is optional and never shown to participants; without it a
random ID is generated. Include it if you want to link the two parts to your
own participant numbering (and to be robust if someone switches browsers
between parts — sessions are matched by pid where possible).

If Part 2 is opened in a browser with no Part 1 state (different device), a
session is reconstructed and flagged `part2_without_part1_state`; use `&w=` on
the Part 2 link if you need to guarantee which wizard it shows in that case.

Re-opening a link is safe: mid-walkthrough Part 1 resumes, a finished Part 1
shows the interlude again, and a finished study shows the thank-you page.

## Data collection (`study.js`)

All instrumentation lives in `study.js`, included by every page. It records:

- every **click** (element, label text, and its `onclick` handler),
- every **screen transition** with from/to and timestamps,
- every **wizard function call** (choices selected, actions completed/skipped,
  toggles flagged, panels opened) with arguments,
- **form-field focus/blur** — character counts only, *typed values are never recorded*,
- the wizard's **final outcome state** at each exit point, and which exit was taken.

Events are timestamped (absolute + ms since page load), buffered in
`localStorage`, and batched to `LOG_ENDPOINT` on every screen change, on tab
hide/close, and at each part's end. Participants never handle data themselves;
as a recovery tool the researcher can run `Study.download()` in the browser
console on the participant's machine to save the local copy as JSON.

### Hooking up the Google Sheet

1. Create a new Google Sheet.
2. Extensions → Apps Script; paste in `apps-script/Code.gs`; save.
3. Deploy → New deployment → Web app; **Execute as: Me**, **Who has access: Anyone**.
4. Copy the web-app URL into `LOG_ENDPOINT` at the top of `study.js`, commit, push.

One event = one row. Sessions started by opening a wizard file directly (e.g.
you testing) are flagged `test = TRUE` — filter them out before analysis.

### Re-deploying the Apps Script

If you edit `Code.gs` later, use Deploy → **Manage deployments** → edit → new
version, so the URL stays the same.

## Notes

- Scenario framing ("you are Alice…") is no longer shown on-site — include it
  in your instruction email or read it aloud in session.
- The repo (and site) are public — anyone with the URL can view both designs
  and this README. Don't put IRB documents or participant data here.
- `wizard-b.html` contains a "Plan actions" screen (`s4-plan`, Step 3 — Plan
  actions) that is currently unreachable: the activity-review screen links
  straight to "Secure account". If that screen should be part of the flow,
  change `go('s5-secure')` on the review screen's footer to `go('s4-plan')`.
