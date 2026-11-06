# Refi Companion — Feature Backlog & TODOs

A running list of high-impact refinance loan officer features to consider before final release. Everything here is optional and deferred so the core tool stays fast and lightweight while we iterate.

---

## 1. Refi Math & Deal Structuring
- [ ] **Auto P&I Amortization Helper:** Automatically calculate `New P&I ($/mo)` from `Curr Balance` (or new loan amount) + `New Rate (%)` + `New Term` so the LO doesn't even have to type the proposed payment if they only know the rate.
- [ ] **Debt Consolidation / Cash-Out Math (Blended Savings):** In Step 2/5, allow adding non-mortgage monthly debt payments being paid off (credit cards, auto loans) so `Monthly Savings` shows **Total Household Monthly Relief**, not just mortgage P&I difference.
- [ ] **Side-by-Side Option A vs. Option B Compare:** Quick toggle in Step 5 (Close) & Step 7 (Pivot) to hold two structures (e.g., *Option A: Par Rate* vs. *Option B: Lender Credit / No-Cost* or *30-yr vs. 20-yr*) and switch between them with 1 click.
- [ ] **Skip-a-Payment / Escrow Refund Callout:** Quick checkbox or badge reminding the LO to mention 1–2 skipped mortgage payments and the existing escrow account refund check after closing.

## 2. Call Flow & Live Speed
- [ ] **Borrower Name & Spouse Name Header Slot:** Tiny underline slot at the very top so typing the borrower's first name (e.g., `"Mike"`) and spouse's name (`"Sarah"`) automatically personalizes cues and the CRM note.
- [ ] **1-Click Borrower Summary (Text / Email Copy):** Alongside `Copy CRM` (internal notes), add a **`Copy for Borrower`** button that formats a clean, friendly 4-bullet text/email summary the LO can immediately send to the borrower (and their spouse) right after Step 5/6.
- [ ] **Recent Calls History (Last 5 Calls in LocalStorage):** When clicking `New`, archive the previous call into a tiny local "Recent Calls (Last 5)" dropdown in case the LO cleared a call too early or needs to re-copy notes from 20 minutes ago.
- [ ] **Hold-Spacebar to Peek:** While in `Live` mode, holding `Space` (when not focused in an input/textarea) temporarily reveals the full verbatim script on the active card, and releasing `Space` hides it again.

## 3. Customization & Compliance
- [ ] **In-Panel Script & NMLS Customizer:** Simple settings sheet to edit the LO's personal NMLS ID / state disclosure reminder and tweak custom cues without having to open `steps.json` and reload the unpacked extension.
- [ ] **Loan Type Tag (`Conv` / `FHA Streamline` / `VA IRRRL` / `Cash-Out`):** 1-click stamp that adjusts the checklist/cues slightly (e.g., VA IRRRL 0.5% funding fee / 36-month recoupment rule, or FHA MIP note).
