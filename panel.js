const GOAL_CHIPS = [
  "Lower Payment",
  "Cash-Out / Debt Consolidation",
  "Shorten Term",
  "Remove MI / Switch to Fixed"
];

const SHORT_STEP_LABELS = {
  intro: "Intro",
  discovery: "Discov",
  recap: "Recap",
  "set-stage": "Stage",
  close: "Close",
  rebuttal: "Object",
  pivot: "Pivot"
};

const defaultState = {
  viewMode: "live",
  activeStepId: "",
  checkedItems: {},
  selectedRebuttalId: "",
  selectedPivotId: "",
  activeNoteTab: "goal",
  notesCollapsed: false,
  deal: {
    primaryGoal: "",
    currentBalance: "",
    currentRate: "",
    currentPayment: "",
    proposedRate: "",
    proposedTerm: "30 yr",
    proposedPayment: "",
    netCost: "",
    cashOut: ""
  },
  notes: {
    goal: "",
    loan: "",
    next: ""
  }
};

const LEGACY_TIMER_KEYS = ["timerRunning", "timerStartedAt", "elapsedBeforeStart"];
const SAVE_DELAY_MS = 250;
const CLEAR_CONFIRM_MS = 5000;

const elements = {
  modeLive: document.querySelector("#mode-live"),
  modePractice: document.querySelector("#mode-practice"),
  newCall: document.querySelector("#new-call"),
  copyNotes: document.querySelector("#copy-notes"),
  copyStatus: document.querySelector("#copy-status"),
  quickObjectionToggle: document.querySelector("#quick-objection-toggle"),
  quickObjectionDrawer: document.querySelector("#quick-objection-drawer"),
  liveMetricsStrip: document.querySelector("#live-metrics-strip"),
  stepList: document.querySelector("#step-list"),
  stepDetail: document.querySelector("#step-detail"),
  stepStatus: document.querySelector("#step-status"),
  toggleNotes: document.querySelector("#toggle-notes"),
  notesBody: document.querySelector("#notes-body"),
  goalNote: document.querySelector("#goal-note"),
  loanNote: document.querySelector("#loan-note"),
  nextNote: document.querySelector("#next-note")
};

let steps = [];
let state = structuredClone(defaultState);
let saveTimer = null;
let clearConfirmTimer = null;
let copyStatusTimer = null;
let clearArmed = false;
let quickObjectionOpen = false;
let expandedPeeks = new Set();
let persistQueue = Promise.resolve();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return NaN;
  }
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return NaN;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Math.round(amount));
}

function computeDealMetrics(deal = state.deal) {
  const currentPayment = parseNumber(deal.currentPayment);
  const proposedPayment = parseNumber(deal.proposedPayment);
  const netCost = parseNumber(deal.netCost);
  const cashOut = parseNumber(deal.cashOut);

  const monthlySavings =
    Number.isFinite(currentPayment) && Number.isFinite(proposedPayment)
      ? currentPayment - proposedPayment
      : NaN;

  const annualSavings = Number.isFinite(monthlySavings) ? monthlySavings * 12 : NaN;

  let breakEvenLabel = "—";
  let breakEvenMonths = NaN;

  if (
    Number.isFinite(netCost) &&
    netCost <= 0 &&
    Number.isFinite(monthlySavings) &&
    monthlySavings > 0
  ) {
    breakEvenLabel = "Immediate (0 mos)";
    breakEvenMonths = 0;
  } else if (
    Number.isFinite(netCost) &&
    netCost > 0 &&
    Number.isFinite(monthlySavings) &&
    monthlySavings > 0
  ) {
    breakEvenMonths = Math.ceil(netCost / monthlySavings);
    breakEvenLabel = `${breakEvenMonths} mo${breakEvenMonths === 1 ? "" : "s"}`;
  }

  return {
    currentPayment,
    proposedPayment,
    netCost,
    cashOut,
    monthlySavings,
    annualSavings,
    breakEvenMonths,
    breakEvenLabel
  };
}

async function loadSteps() {
  const stepsUrl = globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL("steps.json")
    : "steps.json";
  const response = await fetch(stepsUrl);

  if (!response.ok) {
    throw new Error("Unable to load steps.json");
  }

  return response.json();
}

function getStoredState() {
  if (globalThis.chrome?.storage?.local) {
    return chrome.storage.local.get(defaultState);
  }

  const localState = JSON.parse(localStorage.getItem("refi-companion-state") || "{}");
  return Promise.resolve({ ...defaultState, ...localState });
}

function normalizeNotes(notes) {
  return {
    goal: typeof notes?.goal === "string" ? notes.goal : "",
    loan: typeof notes?.loan === "string" ? notes.loan : "",
    next: typeof notes?.next === "string" ? notes.next : ""
  };
}

function normalizeDeal(deal) {
  const fallback = defaultState.deal;
  if (!deal || typeof deal !== "object") {
    return structuredClone(fallback);
  }

  return {
    primaryGoal: typeof deal.primaryGoal === "string" ? deal.primaryGoal : "",
    currentBalance: typeof deal.currentBalance === "string" ? deal.currentBalance : "",
    currentRate: typeof deal.currentRate === "string" ? deal.currentRate : "",
    currentPayment: typeof deal.currentPayment === "string" ? deal.currentPayment : "",
    proposedRate: typeof deal.proposedRate === "string" ? deal.proposedRate : "",
    proposedTerm:
      typeof deal.proposedTerm === "string" && deal.proposedTerm ? deal.proposedTerm : "30 yr",
    proposedPayment: typeof deal.proposedPayment === "string" ? deal.proposedPayment : "",
    netCost: typeof deal.netCost === "string" ? deal.netCost : "",
    cashOut: typeof deal.cashOut === "string" ? deal.cashOut : ""
  };
}

function normalizeCheckedItems(checkedItems) {
  if (!checkedItems || typeof checkedItems !== "object" || Array.isArray(checkedItems)) {
    return {};
  }

  const normalized = {};
  for (const [stepId, items] of Object.entries(checkedItems)) {
    if (!Array.isArray(items)) {
      continue;
    }

    normalized[stepId] = items.filter((item) => typeof item === "string");
  }

  return normalized;
}

function stripLegacyState(storedState) {
  const next = { ...storedState };
  for (const key of LEGACY_TIMER_KEYS) {
    delete next[key];
  }

  next.viewMode = next.viewMode === "practice" ? "practice" : "live";
  next.notes = normalizeNotes(next.notes);
  next.deal = normalizeDeal(next.deal);
  next.checkedItems = normalizeCheckedItems(next.checkedItems);
  next.selectedRebuttalId =
    typeof next.selectedRebuttalId === "string" ? next.selectedRebuttalId : "";
  next.selectedPivotId =
    typeof next.selectedPivotId === "string" ? next.selectedPivotId : "";
  next.activeStepId = typeof next.activeStepId === "string" ? next.activeStepId : "";
  next.activeNoteTab = ["goal", "loan", "next"].includes(next.activeNoteTab)
    ? next.activeNoteTab
    : "goal";
  next.notesCollapsed = Boolean(next.notesCollapsed);
  return next;
}

function writeSnapshot(snapshot) {
  if (globalThis.chrome?.storage?.local) {
    return chrome.storage.local.set(snapshot);
  }

  localStorage.setItem("refi-companion-state", JSON.stringify(snapshot));
  return Promise.resolve();
}

function persistState() {
  const snapshot = structuredClone(state);
  const write = persistQueue.catch(() => {}).then(() => writeSnapshot(snapshot));
  persistQueue = write.catch(() => {});
  return persistQueue;
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistState();
  }, SAVE_DELAY_MS);
}

async function flushState(partialState = {}) {
  state = { ...state, ...partialState };
  clearTimeout(saveTimer);
  saveTimer = null;
  await persistState();
}

async function removeLegacyTimerKeys() {
  if (!globalThis.chrome?.storage?.local) {
    return;
  }

  await chrome.storage.local.remove(LEGACY_TIMER_KEYS);
}

function isLiveMode() {
  return state.viewMode !== "practice";
}

function getActiveStep() {
  return steps.find((step) => step.id === state.activeStepId) || steps[0];
}

function getAllRebuttals() {
  return steps.flatMap((step) => step.rebuttals || []);
}

function getCheckedItems(stepId) {
  const items = state.checkedItems[stepId];
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => typeof item === "string");
}

function markChecklistItem(stepId, itemSubstring) {
  const step = steps.find((entry) => entry.id === stepId);
  if (!step?.checklist?.length) {
    return;
  }

  const match = step.checklist.find((item) =>
    item.toLowerCase().includes(itemSubstring.toLowerCase())
  );
  if (!match) {
    return;
  }

  const checked = new Set(getCheckedItems(stepId));
  if (!checked.has(match)) {
    checked.add(match);
    state = {
      ...state,
      checkedItems: {
        ...state.checkedItems,
        [stepId]: [...checked].sort()
      }
    };
  }
}

function isStepComplete(step) {
  if (!step.checklist?.length) {
    return false;
  }

  const checked = new Set(getCheckedItems(step.id));
  return step.checklist.every((item) => checked.has(item));
}

function isFirstStep(step) {
  return steps[0]?.id === step.id;
}

function isLastStep(step) {
  return steps.at(-1)?.id === step.id;
}

function findSelectedRebuttal() {
  const all = getAllRebuttals();
  return all.find((rebuttal) => rebuttal.id === state.selectedRebuttalId) || null;
}

function interpolateTalkTrack(rawText, { short = false } = {}) {
  if (!rawText) {
    return "";
  }

  const { deal, notes } = state;
  const metrics = computeDealMetrics(deal);
  const goalText =
    deal.primaryGoal ||
    notes.goal.split(/[.,\n]/)[0]?.trim() ||
    (short ? "Goal" : "your refinance goal");

  let outcomeParts = [];
  if (Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0) {
    outcomeParts.push(
      short
        ? `Saves ${formatCurrency(metrics.monthlySavings)}/mo`
        : `saving ${formatCurrency(metrics.monthlySavings)}/mo`
    );
  }
  if (Number.isFinite(metrics.cashOut) && metrics.cashOut > 0) {
    outcomeParts.push(
      short
        ? `${formatCurrency(metrics.cashOut)} Cash Out`
        : `accessing ${formatCurrency(metrics.cashOut)} cash out`
    );
  }
  if (deal.proposedRate) {
    outcomeParts.push(
      short
        ? `${deal.proposedRate}% (${deal.proposedTerm})`
        : `locking in ${deal.proposedRate}% (${deal.proposedTerm})`
    );
  }

  const benefitText =
    outcomeParts.join(" + ") ||
    (short ? "Target Structure" : "a stronger monthly & long-term loan structure");

  let html = escapeHtml(rawText);
  html = html.replace(
    /\[goal\]/gi,
    `<span class="dynamic-token">${escapeHtml(short ? goalText : goalText.toLowerCase())}</span>`
  );
  html = html.replace(
    /\[payment, cash, term, or certainty outcome\]/gi,
    `<span class="dynamic-token">${escapeHtml(benefitText)}</span>`
  );
  html = html.replace(
    /\[benefit\]/gi,
    `<span class="dynamic-token">${escapeHtml(benefitText)}</span>`
  );
  return html;
}

function renderModeSwitch() {
  const live = isLiveMode();
  elements.modeLive.setAttribute("aria-pressed", live ? "true" : "false");
  elements.modePractice.setAttribute("aria-pressed", live ? "false" : "true");
}

function renderLiveMetricsStrip() {
  const { deal } = state;
  const metrics = computeDealMetrics(deal);
  const badges = [];

  if (deal.primaryGoal) {
    badges.push(
      `<span class="metric-badge">Goal: <strong>${escapeHtml(deal.primaryGoal)}</strong></span>`
    );
  }

  if (deal.currentRate || deal.currentPayment) {
    const ratePart = deal.currentRate ? `${escapeHtml(deal.currentRate)}%` : "";
    const pmtPart = Number.isFinite(metrics.currentPayment)
      ? formatCurrency(metrics.currentPayment)
      : "";
    const combined = [ratePart, pmtPart].filter(Boolean).join(" · ");
    badges.push(`<span class="metric-badge">Curr: <strong>${combined}</strong></span>`);
  }

  if (Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0) {
    badges.push(
      `<span class="metric-badge metric-positive">Saves: <strong>${formatCurrency(
        metrics.monthlySavings
      )}/mo</strong> (${formatCurrency(metrics.annualSavings)}/yr)</span>`
    );
  }

  if (metrics.breakEvenLabel !== "—") {
    badges.push(
      `<span class="metric-badge">Break-even: <strong>${escapeHtml(
        metrics.breakEvenLabel
      )}</strong></span>`
    );
  }

  elements.liveMetricsStrip.innerHTML = badges.join("");
}

function renderStepList() {
  elements.stepList.innerHTML = steps
    .map((step) => {
      const isActive = step.id === state.activeStepId;
      const complete = isStepComplete(step);
      const shortLabel = SHORT_STEP_LABELS[step.id] || step.title;

      return `
        <button
          class="step-button"
          type="button"
          data-step-id="${escapeHtml(step.id)}"
          title="Step ${escapeHtml(step.number)}: ${escapeHtml(step.title)} — ${escapeHtml(
            step.subtitle
          )}"
          ${isActive ? 'aria-current="step"' : ""}
        >
          <span class="step-number-row">
            <span>${escapeHtml(step.number)}</span>
            ${complete ? '<span class="complete-dot" aria-label="Completed"></span>' : ""}
          </span>
          <span class="step-short-label">${escapeHtml(shortLabel)}</span>
        </button>
      `;
    })
    .join("");
}

function renderScriptOrCueCard({
  peekKey,
  label,
  cueText,
  askCueText,
  fullScriptText,
  followUpText,
  idAttr = ""
}) {
  const live = isLiveMode();
  const isPeekOpen = expandedPeeks.has(peekKey);

  if (!live || !cueText) {
    return `
      <article class="script-card">
        <div class="script-card-top">
          <span class="script-card-label">${escapeHtml(label)}</span>
        </div>
        <p class="full-script-text" ${idAttr ? `id="${escapeHtml(idAttr)}"` : ""}>${interpolateTalkTrack(
          fullScriptText
        )}</p>
        ${
          followUpText
            ? `<strong class="followup-heading">Follow-up question:</strong><p class="full-script-text">${escapeHtml(
                followUpText
              )}</p>`
            : ""
        }
      </article>
    `;
  }

  const askLine = askCueText || followUpText;

  return `
    <article class="script-card">
      <div class="script-card-top">
        <span class="script-card-label">${escapeHtml(label)}</span>
        ${
          fullScriptText
            ? `<button
                type="button"
                class="peek-btn"
                data-peek-key="${escapeHtml(peekKey)}"
                aria-expanded="${isPeekOpen ? "true" : "false"}"
                title="Peek at full word-for-word script"
              >
                ${isPeekOpen ? "Hide script" : "Peek script"}
              </button>`
            : ""
        }
      </div>
      <p class="cue-headline" ${idAttr ? `id="${escapeHtml(idAttr)}"` : ""}>${interpolateTalkTrack(
        cueText,
        { short: true }
      )}</p>
      ${
        askLine
          ? `<p class="cue-ask"><span class="cue-ask-badge">Ask</span> <span>${escapeHtml(
              askLine
            )}</span></p>`
          : ""
      }
      ${
        isPeekOpen && fullScriptText
          ? `<div class="peek-script-box">${interpolateTalkTrack(fullScriptText)}</div>`
          : ""
      }
    </article>
  `;
}

function renderQuickObjectionDrawer() {
  elements.quickObjectionToggle.setAttribute(
    "aria-expanded",
    quickObjectionOpen ? "true" : "false"
  );
  elements.quickObjectionDrawer.hidden = !quickObjectionOpen;

  if (!quickObjectionOpen) {
    return;
  }

  const allRebuttals = getAllRebuttals();
  const selected =
    allRebuttals.find((r) => r.id === state.selectedRebuttalId) || allRebuttals[0];

  if (!selected) {
    elements.quickObjectionDrawer.innerHTML = "";
    return;
  }

  elements.quickObjectionDrawer.innerHTML = `
    <div class="quick-drawer-header">
      <h2>Instant Objection Handler</h2>
      <button type="button" class="close-drawer-btn" data-close-drawer>Close (Esc)</button>
    </div>
    <div class="chip-row" role="group" aria-label="Quick objections" style="margin-bottom: 8px;">
      ${allRebuttals
        .map(
          (rebuttal) => `
            <button
              class="chip"
              type="button"
              data-rebuttal-id="${escapeHtml(rebuttal.id)}"
              aria-pressed="${rebuttal.id === selected.id ? "true" : "false"}"
            >
              ${escapeHtml(rebuttal.label)}
            </button>
          `
        )
        .join("")}
    </div>
    ${renderScriptOrCueCard({
      peekKey: `drawer-${selected.id}`,
      label: `Objection: ${selected.label}`,
      cueText: selected.cue,
      askCueText: selected.askCue,
      fullScriptText: selected.response,
      followUpText: selected.followUp
    })}
  `;
}

function renderDiscoveryWidget() {
  const { deal } = state;

  return `
    <section class="inline-widget" aria-label="Discovery quick capture">
      <p class="widget-label">1-Click Borrower Goal</p>
      <div class="chip-row" role="group" aria-label="Primary borrower goal">
        ${GOAL_CHIPS.map(
          (goal) => `
            <button
              type="button"
              class="chip"
              data-goal-chip="${escapeHtml(goal)}"
              aria-pressed="${deal.primaryGoal === goal ? "true" : "false"}"
            >
              ${escapeHtml(goal)}
            </button>
          `
        ).join("")}
      </div>
      <div class="calc-grid">
        <label class="calc-field">
          Curr Balance ($)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="currentBalance"
            placeholder="385,000"
            value="${escapeHtml(deal.currentBalance)}"
          />
        </label>
        <label class="calc-field">
          Curr Rate (%)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="currentRate"
            placeholder="7.125"
            value="${escapeHtml(deal.currentRate)}"
          />
        </label>
        <label class="calc-field">
          Curr P&amp;I ($/mo)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="currentPayment"
            placeholder="2,640"
            value="${escapeHtml(deal.currentPayment)}"
          />
        </label>
      </div>
    </section>
  `;
}

function renderCloseWidget() {
  const { deal } = state;
  const metrics = computeDealMetrics(deal);
  const hasSavings = Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0;

  return `
    <section class="inline-widget" aria-label="Refi Close Calculator">
      <p class="widget-label">Proposed Offer &amp; Break-Even Calculator</p>
      <div class="calc-grid">
        <label class="calc-field">
          New Rate (%)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="proposedRate"
            placeholder="5.875"
            value="${escapeHtml(deal.proposedRate)}"
          />
        </label>
        <label class="calc-field">
          New Term
          <select data-deal-field="proposedTerm">
            ${["30 yr", "25 yr", "20 yr", "15 yr", "10 yr"]
              .map(
                (term) =>
                  `<option value="${term}" ${
                    deal.proposedTerm === term ? "selected" : ""
                  }>${term}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="calc-field">
          New P&amp;I ($/mo)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="proposedPayment"
            placeholder="2,280"
            value="${escapeHtml(deal.proposedPayment)}"
          />
        </label>
      </div>
      <div class="calc-grid-2">
        <label class="calc-field">
          Net Cost / Credit ($)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="netCost"
            placeholder="1,800 (or 0)"
            value="${escapeHtml(deal.netCost)}"
          />
        </label>
        <label class="calc-field">
          Cash Out ($ optional)
          <input
            type="text"
            inputmode="decimal"
            data-deal-field="cashOut"
            placeholder="0"
            value="${escapeHtml(deal.cashOut)}"
          />
        </label>
      </div>
      <div id="close-calc-summary" class="calc-output-row">
        <div class="calc-stat ${hasSavings ? "stat-positive" : ""}">
          <span class="calc-stat-label">Monthly / Annual Savings</span>
          <span class="calc-stat-value">
            ${
              hasSavings
                ? `${formatCurrency(metrics.monthlySavings)}/mo (${formatCurrency(
                    metrics.annualSavings
                  )}/yr)`
                : "Enter Curr & New Pmt"
            }
          </span>
        </div>
        <div class="calc-stat">
          <span class="calc-stat-label">Break-Even Period</span>
          <span class="calc-stat-value">${escapeHtml(metrics.breakEvenLabel)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderChecklist(step) {
  if (!step.checklist?.length) {
    return "";
  }

  // In Live Mode, Discovery & Close inputs already auto-track their checklists
  if (isLiveMode() && (step.id === "discovery" || step.id === "close")) {
    return "";
  }

  const checkedItems = getCheckedItems(step.id);

  if (isLiveMode()) {
    return `
      <div>
        <div class="cue-pill-row" role="group" aria-label="${escapeHtml(step.title)} quick checks">
          ${step.checklist
            .map((item, index) => {
              const shortLabel = step.checkCues?.[index] || item;
              const isChecked = checkedItems.includes(item);
              return `
                <button
                  type="button"
                  class="check-pill"
                  data-check-pill-index="${index}"
                  aria-pressed="${isChecked ? "true" : "false"}"
                  title="${escapeHtml(item)}"
                >
                  <span class="check-pill-icon" aria-hidden="true">${
                    isChecked ? "✓" : "○"
                  }</span>
                  <span>${escapeHtml(shortLabel)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  return `
    <div>
      <p class="section-sublabel">Step Checklist</p>
      <ul class="checklist" aria-label="${escapeHtml(step.title)} checklist">
        ${step.checklist
          .map(
            (item, index) => `
              <li>
                <label>
                  <input
                    type="checkbox"
                    data-check-index="${index}"
                    ${checkedItems.includes(item) ? "checked" : ""}
                  />
                  <span>${escapeHtml(item)}</span>
                </label>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderPrompts(step) {
  if (!step.prompts?.length || step.id === "close") {
    return "";
  }

  // In Live Mode, the primary question is already featured inside the Live Cue card
  if (isLiveMode()) {
    return "";
  }

  return `
    <div>
      <p class="section-sublabel">Questions to Ask</p>
      <ul class="prompt-list">
        ${step.prompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderRebuttals(step) {
  if (!step.rebuttals?.length) {
    return "";
  }

  const selected =
    step.rebuttals.find((rebuttal) => rebuttal.id === state.selectedRebuttalId) ||
    step.rebuttals[0];

  return `
    <div class="chip-row" role="group" aria-label="Common objections">
      ${step.rebuttals
        .map(
          (rebuttal) => `
            <button
              class="chip"
              type="button"
              data-rebuttal-id="${escapeHtml(rebuttal.id)}"
              aria-pressed="${rebuttal.id === selected.id ? "true" : "false"}"
            >
              ${escapeHtml(rebuttal.label)}
            </button>
          `
        )
        .join("")}
    </div>
    ${renderScriptOrCueCard({
      peekKey: `rebuttal-${selected.id}`,
      label: selected.label,
      cueText: selected.cue,
      askCueText: selected.askCue,
      fullScriptText: selected.response,
      followUpText: selected.followUp
    })}
  `;
}

function renderOptions(step) {
  if (!step.options?.length) {
    return "";
  }

  const selectedOption =
    step.options.find((opt) => (opt.id || opt.title) === state.selectedPivotId) ||
    step.options[0];
  const live = isLiveMode();

  return `
    <div class="option-grid" role="group" aria-label="Loan structure pivots">
      ${step.options
        .map((option) => {
          const optId = option.id || option.title;
          const isSelected = optId === (selectedOption.id || selectedOption.title);
          return `
            <button
              type="button"
              class="option-card"
              data-pivot-id="${escapeHtml(optId)}"
              aria-pressed="${isSelected ? "true" : "false"}"
            >
              <h3>${escapeHtml(option.title)}</h3>
              ${!live ? `<p>${escapeHtml(option.description)}</p>` : ""}
            </button>
          `;
        })
        .join("")}
    </div>
    ${
      selectedOption?.talkTrack
        ? renderScriptOrCueCard({
            peekKey: `pivot-${selectedOption.id || selectedOption.title}`,
            label: `Pivot — ${selectedOption.title}`,
            cueText: selectedOption.cue,
            fullScriptText: selectedOption.talkTrack
          })
        : ""
    }
  `;
}

function renderStepDetail() {
  const step = getActiveStep();
  if (!step) {
    elements.stepDetail.innerHTML = "";
    return;
  }

  const onFirstStep = isFirstStep(step);
  const onLastStep = isLastStep(step);
  const live = isLiveMode();

  elements.stepDetail.innerHTML = `
    <div class="step-header-bar">
      <div class="step-title-wrap">
        <span class="step-kicker">Step ${escapeHtml(step.number)}</span>
        <h2 id="step-title" class="step-title" tabindex="-1">${escapeHtml(step.title)}</h2>
      </div>
      ${!live ? `<p class="step-subtitle">${escapeHtml(step.subtitle)}</p>` : ""}
    </div>
    ${!live ? `<p class="step-goal">${escapeHtml(step.goal)}</p>` : ""}
    ${
      step.script
        ? renderScriptOrCueCard({
            peekKey: `step-${step.id}`,
            label: live ? "Live Cue" : "Talk Track",
            cueText: step.cue,
            askCueText: step.askCue,
            fullScriptText: step.script,
            idAttr: "active-talk-track"
          })
        : ""
    }
    ${step.id === "discovery" ? renderDiscoveryWidget() : ""}
    ${step.id === "close" ? renderCloseWidget() : ""}
    ${renderPrompts(step)}
    ${renderRebuttals(step)}
    ${renderOptions(step)}
    ${renderChecklist(step)}
    <div class="step-nav-footer">
      <button
        class="prev-button"
        type="button"
        title="Previous Step (Alt+Left)"
        ${onFirstStep ? "disabled" : "data-prev-step"}
      >
        ← Back
      </button>
      <button
        class="next-button"
        type="button"
        title="Next Step (Alt+Right)"
        ${onLastStep ? "disabled" : "data-next-step"}
      >
        ${onLastStep ? "End of Script" : "Next Step →"}
      </button>
    </div>
  `;
}

function renderNotes() {
  elements.goalNote.value = state.notes.goal;
  elements.loanNote.value = state.notes.loan;
  elements.nextNote.value = state.notes.next;

  elements.notesBody.hidden = Boolean(state.notesCollapsed);
  elements.toggleNotes.setAttribute(
    "aria-expanded",
    state.notesCollapsed ? "false" : "true"
  );
  elements.toggleNotes.textContent = state.notesCollapsed ? "Expand" : "Hide";

  for (const tabBtn of document.querySelectorAll("[data-note-tab]")) {
    const key = tabBtn.dataset.noteTab;
    const isSelected = key === state.activeNoteTab;
    tabBtn.setAttribute("aria-selected", isSelected ? "true" : "false");

    const hasContent = Boolean(state.notes[key]?.trim());
    const dot = tabBtn.querySelector(".tab-dot");
    if (hasContent && !dot) {
      tabBtn.insertAdjacentHTML(
        "beforeend",
        '<span class="tab-dot" aria-hidden="true"></span>'
      );
    } else if (!hasContent && dot) {
      dot.remove();
    }
  }

  for (const pane of document.querySelectorAll("[data-note-pane]")) {
    pane.hidden = pane.dataset.notePane !== state.activeNoteTab;
  }
}

function announceStep() {
  const step = getActiveStep();
  if (!step) {
    return;
  }

  elements.stepStatus.textContent = `Step ${step.number}, ${step.title}`;
}

function focusStepTitle() {
  document.getElementById("step-title")?.focus();
}

function renderApp({ announce = false, focusStep = false } = {}) {
  renderModeSwitch();
  renderLiveMetricsStrip();
  renderStepList();
  renderQuickObjectionDrawer();
  renderStepDetail();
  renderNotes();

  if (announce) {
    announceStep();
  }

  if (focusStep) {
    focusStepTitle();
  }
}

async function setViewMode(mode) {
  const nextMode = mode === "practice" ? "practice" : "live";
  if (nextMode === state.viewMode) {
    return;
  }

  expandedPeeks.clear();
  await flushState({ viewMode: nextMode });
  renderApp();
}

function togglePeek(peekKey) {
  if (!peekKey) {
    return;
  }
  if (expandedPeeks.has(peekKey)) {
    expandedPeeks.delete(peekKey);
  } else {
    expandedPeeks.add(peekKey);
  }
  renderQuickObjectionDrawer();
  renderStepDetail();
}

async function setActiveStep(stepId) {
  if (stepId === state.activeStepId) {
    focusStepTitle();
    return;
  }

  const autoTab =
    stepId === "discovery"
      ? "goal"
      : stepId === "close"
        ? "loan"
        : stepId === "rebuttal" || stepId === "pivot"
          ? "next"
          : state.activeNoteTab;

  await flushState({ activeStepId: stepId, activeNoteTab: autoTab });
  renderApp({ announce: true, focusStep: true });
}

async function goToAdjacentStep(delta) {
  const currentIndex = steps.findIndex((step) => step.id === state.activeStepId);
  const nextIndex = currentIndex + delta;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= steps.length) {
    return;
  }

  await setActiveStep(steps[nextIndex].id);
}

async function toggleChecklistIndex(step, index, forceChecked) {
  const itemText = step.checklist?.[Number(index)];
  if (typeof itemText !== "string") {
    return;
  }

  const checkedItems = new Set(getCheckedItems(step.id));
  const shouldCheck =
    typeof forceChecked === "boolean" ? forceChecked : !checkedItems.has(itemText);

  if (shouldCheck) {
    checkedItems.add(itemText);
  } else {
    checkedItems.delete(itemText);
  }

  await flushState({
    checkedItems: {
      ...state.checkedItems,
      [step.id]: [...checkedItems].sort()
    }
  });

  renderStepList();
  if (isLiveMode()) {
    renderStepDetail();
  }
}

function rememberNotes() {
  state = {
    ...state,
    notes: {
      goal: elements.goalNote.value,
      loan: elements.loanNote.value,
      next: elements.nextNote.value
    }
  };
}

function refreshActiveTalkTrackInPlace() {
  const step = getActiveStep();
  const talkTrackEl = document.getElementById("active-talk-track");
  if (!step || !talkTrackEl) {
    return;
  }

  if (isLiveMode() && step.cue) {
    talkTrackEl.innerHTML = interpolateTalkTrack(step.cue, { short: true });
  } else if (step.script) {
    talkTrackEl.innerHTML = interpolateTalkTrack(step.script);
  }
}

function updateNotes() {
  rememberNotes();
  renderLiveMetricsStrip();
  refreshActiveTalkTrackInPlace();
  renderNotes();
  schedulePersist();
}

function updateCloseSummaryInPlace() {
  const summaryEl = document.getElementById("close-calc-summary");
  if (!summaryEl) {
    return;
  }
  const metrics = computeDealMetrics(state.deal);
  const hasSavings = Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0;
  summaryEl.innerHTML = `
    <div class="calc-stat ${hasSavings ? "stat-positive" : ""}">
      <span class="calc-stat-label">Monthly / Annual Savings</span>
      <span class="calc-stat-value">
        ${
          hasSavings
            ? `${formatCurrency(metrics.monthlySavings)}/mo (${formatCurrency(
                metrics.annualSavings
              )}/yr)`
            : "Enter Curr & New Pmt"
        }
      </span>
    </div>
    <div class="calc-stat">
      <span class="calc-stat-label">Break-Even Period</span>
      <span class="calc-stat-value">${escapeHtml(metrics.breakEvenLabel)}</span>
    </div>
  `;
}

function handleDealFieldInput(inputEl) {
  const field = inputEl.dataset.dealField;
  if (!field) {
    return;
  }

  state = {
    ...state,
    deal: {
      ...state.deal,
      [field]: inputEl.value
    }
  };

  if (field === "currentBalance" && inputEl.value.trim()) {
    markChecklistItem("discovery", "current balance");
  } else if (field === "currentRate" && inputEl.value.trim()) {
    markChecklistItem("discovery", "current rate");
  } else if (field === "currentPayment" && inputEl.value.trim()) {
    markChecklistItem("discovery", "current payment");
  } else if (field === "proposedPayment" && inputEl.value.trim()) {
    markChecklistItem("close", "proposed payment");
  } else if (field === "proposedRate" && inputEl.value.trim()) {
    markChecklistItem("close", "rate and term");
  } else if (field === "netCost" && inputEl.value.trim()) {
    markChecklistItem("close", "closing costs");
    markChecklistItem("close", "break-even");
  }

  renderLiveMetricsStrip();
  renderStepList();
  updateCloseSummaryInPlace();
  refreshActiveTalkTrackInPlace();

  for (const pill of elements.stepDetail.querySelectorAll("[data-check-pill-index]")) {
    const step = getActiveStep();
    const idx = Number(pill.dataset.checkPillIndex);
    const item = step?.checklist?.[idx];
    const isChecked = item ? getCheckedItems(step.id).includes(item) : false;
    pill.setAttribute("aria-pressed", isChecked ? "true" : "false");
    const icon = pill.querySelector(".check-pill-icon");
    if (icon) {
      icon.textContent = isChecked ? "✓" : "○";
    }
  }

  schedulePersist();
}

async function selectGoalChip(goalValue) {
  const nextGoal = state.deal.primaryGoal === goalValue ? "" : goalValue;
  state = {
    ...state,
    deal: {
      ...state.deal,
      primaryGoal: nextGoal
    }
  };

  if (nextGoal) {
    markChecklistItem("discovery", "primary goal");
  }

  await flushState();
  renderApp();
}

function openChecklistLines() {
  const currentIndex = Math.max(
    steps.findIndex((step) => step.id === state.activeStepId),
    0
  );

  return steps.flatMap((step, index) => {
    if (!step.checklist?.length) {
      return [];
    }

    const checked = new Set(getCheckedItems(step.id));
    const reached = index <= currentIndex || checked.size > 0;
    if (!reached) {
      return [];
    }

    const open = step.checklist.filter((item) => !checked.has(item));
    if (!open.length) {
      return [];
    }

    return [`${step.number}. ${step.title}`, ...open.map((item) => `- ${item}`)];
  });
}

function buildCrmNote() {
  const step = getActiveStep();
  const { deal, notes } = state;
  const metrics = computeDealMetrics(deal);

  const goalSummary =
    [deal.primaryGoal, notes.goal].filter(Boolean).join(" — ") || "Not captured";

  const currentSnap = [
    deal.currentBalance ? `Bal: $${deal.currentBalance}` : "",
    deal.currentRate ? `Rate: ${deal.currentRate}%` : "",
    deal.currentPayment ? `Pmt: $${deal.currentPayment}/mo` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  const proposedSnap = [
    deal.proposedRate ? `New Rate: ${deal.proposedRate}% (${deal.proposedTerm})` : "",
    deal.proposedPayment ? `New Pmt: $${deal.proposedPayment}/mo` : "",
    Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0
      ? `Savings: ${formatCurrency(metrics.monthlySavings)}/mo (${formatCurrency(
          metrics.annualSavings
        )}/yr)`
      : "",
    metrics.breakEvenLabel !== "—" ? `Break-Even: ${metrics.breakEvenLabel}` : "",
    deal.cashOut ? `Cash Out: $${deal.cashOut}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  const loanDetailsCombined =
    [currentSnap, proposedSnap, notes.loan].filter(Boolean).join(" // ") ||
    "Not captured";

  const lines = [
    "REFI CALL NOTES",
    `Current step: ${step.number}. ${step.title}`,
    "",
    `Borrower goal: ${goalSummary}`,
    `Loan details: ${loanDetailsCombined}`,
    `Objections / next step: ${notes.next || "Not captured"}`
  ];

  const selected = findSelectedRebuttal();
  if (selected) {
    lines.push("", `Selected objection: ${selected.label}`);
  }

  const openItems = openChecklistLines();
  if (openItems.length) {
    lines.push("", "Checklist still open:", ...openItems);
  }

  return lines.join("\n");
}

function setCopyStatus(message, tone) {
  elements.copyStatus.textContent = message;
  elements.copyStatus.classList.toggle("copy-status-error", tone === "error");
  clearTimeout(copyStatusTimer);
  copyStatusTimer = setTimeout(() => {
    elements.copyStatus.textContent = "";
    elements.copyStatus.classList.remove("copy-status-error");
  }, 2400);
}

async function copyNotes() {
  disarmClearCall();
  rememberNotes();
  await flushState();

  try {
    await navigator.clipboard.writeText(buildCrmNote());
    setCopyStatus("Copied to clipboard!");
  } catch {
    setCopyStatus("Could not copy notes.", "error");
  }
}

function armClearCall() {
  clearArmed = true;
  elements.newCall.textContent = "Clear?";
  elements.newCall.setAttribute("aria-pressed", "true");
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = setTimeout(disarmClearCall, CLEAR_CONFIRM_MS);
}

function disarmClearCall() {
  clearArmed = false;
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = null;
  elements.newCall.textContent = "New";
  elements.newCall.removeAttribute("aria-pressed");
}

async function resetCall() {
  if (!clearArmed) {
    armClearCall();
    return;
  }

  disarmClearCall();
  quickObjectionOpen = false;
  expandedPeeks.clear();
  await flushState({
    ...structuredClone(defaultState),
    viewMode: state.viewMode,
    activeStepId: steps[0]?.id || ""
  });
  renderApp({ announce: true, focusStep: true });
}

async function selectRebuttal(rebuttalId) {
  await flushState({ selectedRebuttalId: rebuttalId });
  renderQuickObjectionDrawer();
  renderStepDetail();
}

async function selectPivot(pivotId) {
  await flushState({ selectedPivotId: pivotId });
  renderStepDetail();
}

function toggleQuickObjectionDrawer() {
  quickObjectionOpen = !quickObjectionOpen;
  renderQuickObjectionDrawer();
}

function bindEvents() {
  elements.modeLive.addEventListener("click", () => setViewMode("live"));
  elements.modePractice.addEventListener("click", () => setViewMode("practice"));
  elements.newCall.addEventListener("click", resetCall);
  elements.copyNotes.addEventListener("click", copyNotes);
  elements.quickObjectionToggle.addEventListener("click", () => {
    disarmClearCall();
    toggleQuickObjectionDrawer();
  });

  elements.quickObjectionDrawer.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-drawer]")) {
      quickObjectionOpen = false;
      renderQuickObjectionDrawer();
      return;
    }

    const peekBtn = event.target.closest("[data-peek-key]");
    if (peekBtn) {
      togglePeek(peekBtn.dataset.peekKey);
      return;
    }

    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      selectRebuttal(rebuttalButton.dataset.rebuttalId);
    }
  });

  elements.toggleNotes.addEventListener("click", () => {
    flushState({ notesCollapsed: !state.notesCollapsed }).then(() => renderNotes());
  });

  document.querySelector(".notes-tabs")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest("[data-note-tab]");
    if (!tabBtn) {
      return;
    }
    flushState({
      activeNoteTab: tabBtn.dataset.noteTab,
      notesCollapsed: false
    }).then(() => renderNotes());
  });

  for (const textarea of [elements.goalNote, elements.loanNote, elements.nextNote]) {
    textarea.addEventListener("input", updateNotes);
    textarea.addEventListener("blur", () => {
      rememberNotes();
      flushState();
    });
  }

  elements.stepList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step-id]");
    if (!button) {
      return;
    }

    disarmClearCall();
    setActiveStep(button.dataset.stepId);
  });

  elements.stepDetail.addEventListener("click", (event) => {
    const peekBtn = event.target.closest("[data-peek-key]");
    if (peekBtn) {
      disarmClearCall();
      togglePeek(peekBtn.dataset.peekKey);
      return;
    }

    const checkPill = event.target.closest("[data-check-pill-index]");
    if (checkPill) {
      disarmClearCall();
      toggleChecklistIndex(getActiveStep(), checkPill.dataset.checkPillIndex);
      return;
    }

    const goalChip = event.target.closest("[data-goal-chip]");
    if (goalChip) {
      disarmClearCall();
      selectGoalChip(goalChip.dataset.goalChip);
      return;
    }

    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      disarmClearCall();
      selectRebuttal(rebuttalButton.dataset.rebuttalId);
      return;
    }

    const pivotButton = event.target.closest("[data-pivot-id]");
    if (pivotButton) {
      disarmClearCall();
      selectPivot(pivotButton.dataset.pivotId);
      return;
    }

    if (event.target.closest("[data-prev-step]")) {
      disarmClearCall();
      goToAdjacentStep(-1);
      return;
    }

    if (event.target.closest("[data-next-step]")) {
      disarmClearCall();
      goToAdjacentStep(1);
    }
  });

  elements.stepDetail.addEventListener("input", (event) => {
    if (event.target.matches("[data-deal-field]")) {
      handleDealFieldInput(event.target);
    }
  });

  elements.stepDetail.addEventListener("change", (event) => {
    if (event.target.matches("[data-deal-field]")) {
      handleDealFieldInput(event.target);
      flushState();
      renderStepDetail();
      return;
    }

    if (event.target.matches("[data-check-index]")) {
      toggleChecklistIndex(
        getActiveStep(),
        event.target.dataset.checkIndex,
        event.target.checked
      );
    }
  });

  document.addEventListener("click", (event) => {
    if (!clearArmed || event.target.closest("#new-call")) {
      return;
    }

    disarmClearCall();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (clearArmed) {
        disarmClearCall();
      }
      if (quickObjectionOpen) {
        quickObjectionOpen = false;
        renderQuickObjectionDrawer();
      }
      return;
    }

    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      goToAdjacentStep(1);
      return;
    }

    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      goToAdjacentStep(-1);
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      toggleQuickObjectionDrawer();
      return;
    }

    if (event.altKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      setViewMode(isLiveMode() ? "practice" : "live");
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyNotes();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      rememberNotes();
      clearTimeout(saveTimer);
      saveTimer = null;
      persistState();
    }
  });

  window.addEventListener("pagehide", () => {
    rememberNotes();
    clearTimeout(saveTimer);
    saveTimer = null;
    persistState();
  });
}

async function init() {
  steps = await loadSteps();
  const storedState = stripLegacyState(await getStoredState());
  const activeStepId = steps.some((step) => step.id === storedState.activeStepId)
    ? storedState.activeStepId
    : steps[0]?.id || "";

  state = {
    ...structuredClone(defaultState),
    ...storedState,
    notes: normalizeNotes(storedState.notes),
    deal: normalizeDeal(storedState.deal),
    checkedItems: normalizeCheckedItems(storedState.checkedItems),
    activeStepId
  };

  bindEvents();
  renderApp({ announce: true });
  removeLegacyTimerKeys().catch(() => {});
  persistState();
}

init().catch((error) => {
  elements.stepDetail.innerHTML = `
    <h2>Unable to load script</h2>
    <p>${escapeHtml(error.message)}</p>
  `;
});
