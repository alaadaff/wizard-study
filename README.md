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

```
index.html  →  wizard (random 1st)  →  interlude.html  →  wizard (2nd)  →  done.html
```

- `index.html` — scenario framing + participant ID (typed, or pre-filled via
  `index.html?pid=P-07` links you send by email). Randomizes A→B vs B→A.
- `interlude.html` — break screen between the two parts.
- `done.html` — thank-you screen; flushes data and offers a JSON backup download.

## Data collection (`study.js`)

All instrumentation lives in `study.js`, which is included by every page. It records:

- every **click** (element, label text, and its `onclick` handler),
- every **screen transition** with from/to and timestamps,
- every **wizard function call** (choices selected, actions completed/skipped,
  toggles flagged, panels opened) with arguments,
- **form-field focus/blur** — character counts only, *typed values are never recorded*,
- the wizard's **final outcome state** at each exit point, and which exit was taken.

Events are timestamped (absolute + ms since page load), buffered in
`localStorage`, and batched to `LOG_ENDPOINT` on every screen change, on tab
hide/close, and at each wizard's end.

### Hooking up the Google Sheet

1. Create a new Google Sheet.
2. Extensions → Apps Script; paste in `apps-script/Code.gs`; save.
3. Deploy → New deployment → Web app; **Execute as: Me**, **Who has access: Anyone**.
4. Copy the web-app URL into `LOG_ENDPOINT` at the top of `study.js`, commit, push.

One event = one row. Sessions started by opening a wizard file directly (e.g.
you testing) are flagged `test = TRUE` — filter them out before analysis.

If `LOG_ENDPOINT` is left empty, nothing is transmitted; participants are asked
on `done.html` to download their JSON and return it to you.

### Re-deploying the Apps Script

If you edit `Code.gs` later, use Deploy → **Manage deployments** → edit → new
version, so the URL stays the same.

## Running a participant

Send each participant (after consent, via email) a link like:

```
https://<your-username>.github.io/wizard-study/?pid=P-07
```

Each new session on `index.html` overwrites the previous one in that browser,
so the same laptop can be reused across participants (e.g. in-lab sessions).

## Notes

- The repo (and site) are public — anyone with the URL can view both designs
  and this README. Don't put IRB documents or participant data here.
- `wizard-b.html` contains a "Plan actions" screen (`s4-plan`, Step 3 — Plan
  actions) that is currently unreachable: the activity-review screen links
  straight to "Secure account". If that screen should be part of the flow,
  change `go('s5-secure')` on the review screen's footer to `go('s4-plan')`.
