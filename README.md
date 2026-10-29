# Refi Companion

Refi Companion is a Chrome Manifest V3 side-panel extension for refinance loan officers. It combines a **sparse, glanceable Live Call Mode** (with inline `"Peek script"` toggles) and a **thorough Practice Mode** (full verbatim scripts, explanations, and checklists), alongside inline discovery & break-even calculators, an instant objection drawer, and a one-click CRM note formatter.

This version is intentionally fast and local-first:

- No call recording
- No borrower data syncing
- No CRM page scraping
- No external services
- All call notes and deal numbers stay local in the browser

## Live Mode vs. Practice Mode (`Alt+M`)

- **Live Mode (Default for Active Calls):** Strips out paragraphs, subtitles, and redundant checklists so you never have to read prose while talking to a borrower. Displays a single bold 4–6 word **Live Cue**, a single highlighted **ASK** prompt, compact 1-word check pills, and the interactive inputs.
- **Inline `"Peek script"` Button:** While in Live Mode, click **Peek script** on any step, objection, or pivot card to temporarily expand the full word-for-word sentence without leaving Live Mode.
- **Practice Mode (Training & Roleplay):** Displays full step goals, verbatim talk-track paragraphs, complete discovery question lists, and full checklists.

## Key Features for Live Calls

- **Compact 7-Step Rail & HUD Strip:** Keeps the active step cue, calculator, and scratchpad visible in a single 320px–360px side-panel viewport without elevator scrolling.
- **1-Click Goal Chips & Discovery Capture (Step 2):** Select the borrower's primary goal (`Lower Payment`, `Cash-Out / Debt Consolidation`, `Shorten Term`, `Remove MI / Switch to Fixed`) and enter current balance, rate, and payment inline—automatically checking off corresponding discovery items.
- **Auto-Calculated Savings & Break-Even (Step 5):** Enter proposed rate, term, new P&I payment, and net closing cost/credit to immediately see monthly/annual savings and break-even months.
- **Dynamic Cues & Talk Tracks:** Replaces `[goal]` and `[benefit]` placeholders in Step 3 (Recap), Step 5 (Mic Drop Close), and objections with the borrower's actual goal and calculated monthly savings.
- **Instant Objection Drawer (`Alt+O`):** Access rebuttals from *any* step on the call without losing your place in the script.
- **Interactive Pivot Scripts (Step 7):** Click any loan-structure pivot card (`Lender Credit`, `Shorter Term`, `Payment Focus`, `Follow-Up Plan`) to display its cue or verbatim talk track.
- **Docked Tabbed Scratchpad:** Always-accessible bottom scratchpad (`Goal & Story`, `Loan Notes`, `Next Step`) that can be collapsed at any time.
- **Keyboard Shortcuts:**
  - `Alt + M`: Switch between **Live** and **Practice** mode
  - `Alt + →` / `Alt + ←`: Next / Previous script step
  - `Alt + O`: Toggle Instant Objection Drawer
  - `Cmd/Ctrl + Shift + C`: Copy formatted CRM notes to clipboard

## Project structure

```text
manifest.json        Chrome extension manifest
service-worker.js    Enables side-panel behavior from the extension action
panel.html           Side-panel cockpit layout
panel.css            Compact side-panel styling
panel.js             Live/Practice modes, inline peek, refi calculators, local state, and CRM copy
steps.json           Editable cues, scripts, checklists, rebuttals, and pivot content
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

- step titles & goals
- `cue` & `askCue` (used in **Live Mode**)
- `script` (used in **Practice Mode** and **Peek script**)
- `checklist` & `checkCues`
- `prompts` & `promptCues`
- `rebuttals` (both short cues and full responses)
- `options` (pivot cues and full talk tracks)

After editing `steps.json`, reload the extension from `chrome://extensions`.

## Notes and privacy

The extension uses `chrome.storage.local` to remember the active mode (`live` vs. `practice`), active step, checked items, deal numbers, and notes. Choosing **New** asks for a confirmation click before clearing the current call. The extension does not transmit borrower data anywhere.

Any production use in a mortgage environment should be reviewed for company policy, compliance language, privacy requirements, and state-specific disclosure rules.
