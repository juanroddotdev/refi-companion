# Refi Companion

Refi Companion is a Chrome Manifest V3 side-panel extension for refinance loan officers. It provides a step-by-step call script, local scratch notes, a call pacing timer, objection responses, pivot options, and a one-click CRM note formatter.

This first version is intentionally simple:

- No call recording
- No borrower data syncing
- No CRM page scraping
- No external services
- All call notes stay local in the browser

## Project structure

```text
manifest.json        Chrome extension manifest
service-worker.js    Enables side-panel behavior from the extension action
panel.html           Side-panel document
panel.css            Side-panel styling
panel.js             UI behavior, local state, timer, notes, copy action
steps.json           Editable script, checklist, rebuttal, and pivot content
```

## Load locally in Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Click the Refi Companion extension icon to open the side panel.

## Editing the script

Most call content lives in `steps.json`.

Use it to adjust:

- step titles
- goals
- talk tracks
- checklist items
- discovery prompts
- rebuttal responses
- pivot options

After editing `steps.json`, reload the extension from `chrome://extensions`.

## Notes and privacy

The extension uses `chrome.storage.local` to remember the active step, checked items, notes, and timer state. The current scaffold does not transmit borrower data anywhere.

Any production use in a mortgage environment should be reviewed for company policy, compliance language, privacy requirements, and state-specific disclosure rules.
