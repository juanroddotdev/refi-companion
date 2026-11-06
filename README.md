# Refi Companion

Refi Companion is a Chrome Manifest V3 side-panel companion for Gravity Lending auto refinance calls. It combines a **sparse, glanceable Live Call Mode** (with inline `"Peek script"` toggles) and a **thorough Practice Mode** (full verbatim Gravity Lending scripts and checklists), with interactive keep/trade + VSC branching, a 2-option close, the AIOA rebuttal framework, DocWalk/notary switching, and a one-click CRM note formatter.

This version is intentionally fast and local-first:

- No call recording
- No borrower data syncing
- No CRM page scraping
- No external services
- All call notes and deal numbers stay local in the browser

## 7-Step Gravity Lending Flow

Short titles stay on the rail; Gravity Lending section titles show as subtitles in both Live and Practice modes.

1. **Intro** — Intro & Qualification
2. **Discovery** — Discovery & Vehicle Verification
3. **Recap** — Recap & Set the Stage (auto-loads the matching Keep/Trade + Dealer VSC talk track)
4. **Mic Drop Close** — 2-Option Pitch (VSC vs. Out-of-Pocket)
5. **Rebuttal Hub** — Rebuttal / Pivot (AIOA Framework)
6. **DocWalk** — Application, DL, Residency, Employment & Notary
7. **Quality Assurance** — Final Loan Breakdown & Assuming the GAP

## Live Mode vs. Practice Mode (`Alt+M`)

- **Live Mode (Default for Active Calls):** Ultra-condensed 2–4 word monospace trigger cues (`liveCue`), 2–3 word `ASK` prompts (`liveAsk`), a single-line AIOA bar (`Agree → Isolate → Overcome → Ask`), and zero redundant selectors once a branch is chosen—built for split-second glancing while talking.
- **Practice Mode:** Displays the fuller guided cue view (`cue` & `askCue`), the 4-row AIOA example table, and compact `[ ]` / `[x]` check pills.
- **Inline `"Peek script"` Button:** Available in **both** Live and Practice modes to expand the verbatim word-for-word Gravity Lending script on any card.

## Key Features for Live Calls

- **Keep / Trade + Dealer VSC branching:** Selections in Step 2 automatically load the matching Set the Stage track in Step 3 (`Keeping + Bought`, `Trading + Bought`, `Keeping + No VSC`, `Trading + No VSC`).
- **2-Option Close Calculator:** Enter current payment, Option 1 (with protection), and Option 2 (out-of-pocket repairs) to see monthly savings vs. current and the protection spread.
- **AIOA Framework:** Agree → Isolate → Overcome → Ask, plus auto-refi objection chips available from any step (`Alt+O`).
- **DocWalk Notary Switcher:** Last 4 SSN vs. FourLeaf full SSN, plus Standard / Lending Lounge, Proof Online ($30), or LongPen (TX) scripts. Gross monthly income auto-calculates yearly.
- **QA + Assuming the GAP:** Itemized lender/term/rate/APR/fees, VSC decline warning if they chose Option 2, and Back-End vs. Already Included GAP pitches with refundable vs. 60-day opt-out.
- **Keyboard Shortcuts:**
  - `Alt + M`: Switch between **Live** and **Practice** mode
  - `Alt + →` / `Alt + ←`: Next / Previous script step
  - `Alt + O`: Toggle Instant Objection Drawer
  - `Cmd/Ctrl + Shift + C`: Copy formatted CRM notes to clipboard

## Project structure

```text
manifest.json                    Chrome extension manifest
service-worker.js                Enables side-panel behavior from the extension action
panel.html                       Side-panel cockpit layout
panel.css                        Index-card / legal-pad styling
panel.js                         Live/Practice modes, Gravity Lending widgets, local state, CRM copy
steps.json                       Gravity Lending cues, scripts, rebuttals, notary and GAP tracks
gravity_lending_script_guide.md  Source call script
TODO.md                          Deferred feature backlog
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

- step titles & Gravity Lending subtitles
- `cue` & `askCue` (used in **Live Mode**)
- `script` (used in **Practice Mode** and **Peek script**)
- `stageScripts` (Step 3 VSC branches)
- `notaryScripts` (Step 6 DocuSign / notary paths)
- `gapScripts` (Step 7 GAP pitches)
- `checklist` & `checkCues`
- `rebuttals` and `aioa`

After editing `steps.json`, reload the extension from `chrome://extensions`.

## Notes and privacy

The extension uses `chrome.storage.local` to remember the active mode (`live` vs. `practice`), active step, checked items, deal numbers, and notes. Choosing **New** asks for a confirmation click before clearing the current call. The extension does not transmit borrower data anywhere.

Any production use should be reviewed for company policy, compliance language, privacy requirements, and state-specific disclosure rules.
