const GOAL_CHIPS = [
  "Lower Payment",
  "Lower Rate / Save Interest",
  "Skip Payment / Cash Relief",
  "Replace Dealer Warranty"
];

const SHORT_STEP_LABELS = {
  intro: "Intro",
  discovery: "Discov",
  recap: "Recap",
  close: "Close",
  rebuttal: "Rebut",
  docwalk: "Docs",
  qa: "QA"
};

const HORIZON_CHOICES = [
  { value: "keep", label: "Keeping Long-Term" },
  { value: "trade", label: "Trading in Few Yrs" }
];

const VSC_CHOICES = [
  { value: "bought", label: "Bought Dealer VSC" },
  { value: "none", label: "No Dealer VSC" }
];

const MOD_CHOICES = [
  { value: "none", label: "Stock" },
  { value: "modified", label: "Lift / Aftermarket" }
];

const OPTION_CHOICES = [
  { value: "option1", label: "Option 1 w/ Protection" },
  { value: "option2", label: "Option 2 No VSC" }
];

const SSN_CHOICES = [
  { value: "last4", label: "Last 4 SSN" },
  { value: "fourleaf", label: "FourLeaf Full SSN" }
];

const NOTARY_CHOICES = [
  { value: "standard", label: "Standard / Lounge" },
  { value: "proof", label: "Proof Online ($30)" },
  { value: "longpen", label: "LongPen (TX)" }
];

const GAP_PITCH_CHOICES = [
  { value: "backend", label: "Back-End Pitch" },
  { value: "included", label: "Already Included" }
];

const GAP_REFUND_CHOICES = [
  { value: "refundable", label: "Refundable Pro-Rated" },
  { value: "sixty-day", label: "60-Day Opt-Out" }
];

const defaultState = {
  viewMode: "live",
  activeStepId: "",
  checkedItems: {},
  selectedRebuttalId: "",
  activeNoteTab: "goal",
  notesCollapsed: false,
  deal: {
    customerName: "",
    vehicle: "",
    currentLender: "",
    currentPayment: "",
    state: "",
    primaryGoal: "",
    paymentPreference: "",
    otherObligations: "",
    mileage: "",
    horizon: "",
    dealerVsc: "",
    mods: "",
    lenderName: "",
    proposedTerm: "",
    proposedRate: "",
    option1Payment: "",
    option2Payment: "",
    selectedOption: "",
    monthlyIncome: "",
    ssnMode: "last4",
    notaryMode: "standard",
    apr: "",
    vscCost: "",
    otherProductCost: "",
    titleFee: "",
    lenderFee: "",
    gapCost: "",
    gapMonthlyPayment: "",
    gapPitchMode: "backend",
    gapRefundMode: "refundable"
  },
  notes: {
    goal: "",
    loan: "",
    next: ""
  }
};

const LEGACY_TIMER_KEYS = ["timerRunning", "timerStartedAt", "elapsedBeforeStart"];
const LEGACY_STEP_IDS = ["set-stage", "pivot"];
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

function formatMoneyToken(value, fallback) {
  const amount = parseNumber(value);
  if (Number.isFinite(amount)) {
    return formatCurrency(amount);
  }
  return value || fallback;
}

function getVscBranchKey(deal = state.deal) {
  if (deal.horizon === "keep" && deal.dealerVsc === "bought") {
    return "keep-bought";
  }
  if (deal.horizon === "trade" && deal.dealerVsc === "bought") {
    return "trade-bought";
  }
  if (deal.horizon === "keep" && deal.dealerVsc === "none") {
    return "keep-nobought";
  }
  if (deal.horizon === "trade" && deal.dealerVsc === "none") {
    return "trade-nobought";
  }
  return "";
}

function getVscBranchLabel(deal = state.deal) {
  const recapStep = steps.find((step) => step.id === "recap");
  const key = getVscBranchKey(deal);
  return recapStep?.stageScripts?.[key]?.label || "Not set";
}

function getSelectedPayment(deal = state.deal) {
  if (deal.selectedOption === "option1") {
    return deal.option1Payment;
  }
  if (deal.selectedOption === "option2") {
    return deal.option2Payment;
  }
  return "";
}

function computeDealMetrics(deal = state.deal) {
  const currentPayment = parseNumber(deal.currentPayment);
  const option1 = parseNumber(deal.option1Payment);
  const option2 = parseNumber(deal.option2Payment);
  const selectedPayment = parseNumber(getSelectedPayment(deal) || deal.option1Payment);
  const monthlyIncome = parseNumber(deal.monthlyIncome);
  const annualIncome = Number.isFinite(monthlyIncome) ? monthlyIncome * 12 : NaN;
  const optionSpread =
    Number.isFinite(option1) && Number.isFinite(option2) ? option1 - option2 : NaN;
  const monthlySavings =
    Number.isFinite(currentPayment) && Number.isFinite(selectedPayment)
      ? currentPayment - selectedPayment
      : NaN;
  const annualSavings = Number.isFinite(monthlySavings) ? monthlySavings * 12 : NaN;

  return {
    currentPayment,
    option1,
    option2,
    selectedPayment,
    optionSpread,
    monthlySavings,
    annualSavings,
    monthlyIncome,
    annualIncome
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

  const next = structuredClone(fallback);
  for (const key of Object.keys(fallback)) {
    if (typeof deal[key] === "string") {
      next[key] = deal[key];
    }
  }

  if (!["keep", "trade", ""].includes(next.horizon)) {
    next.horizon = "";
  }
  if (!["bought", "none", ""].includes(next.dealerVsc)) {
    next.dealerVsc = "";
  }
  if (!["none", "modified", ""].includes(next.mods)) {
    next.mods = "";
  }
  if (!["option1", "option2", ""].includes(next.selectedOption)) {
    next.selectedOption = "";
  }
  if (!["last4", "fourleaf"].includes(next.ssnMode)) {
    next.ssnMode = "last4";
  }
  if (!["standard", "proof", "longpen"].includes(next.notaryMode)) {
    next.notaryMode = "standard";
  }
  if (!["backend", "included"].includes(next.gapPitchMode)) {
    next.gapPitchMode = "backend";
  }
  if (!["refundable", "sixty-day"].includes(next.gapRefundMode)) {
    next.gapRefundMode = "refundable";
  }

  return next;
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
  next.activeStepId = typeof next.activeStepId === "string" ? next.activeStepId : "";
  if (LEGACY_STEP_IDS.includes(next.activeStepId)) {
    next.activeStepId = "";
  }
  next.activeNoteTab = ["goal", "loan", "next"].includes(next.activeNoteTab)
    ? next.activeNoteTab
    : "goal";
  next.notesCollapsed = Boolean(next.notesCollapsed);
  delete next.selectedPivotId;
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
  const customer = deal.customerName || (short ? "Customer" : "the customer");
  const vehicle = deal.vehicle || (short ? "Vehicle" : "your vehicle");
  const lender = deal.currentLender || (short ? "Current Lender" : "your current lender");
  const currPmt = formatMoneyToken(deal.currentPayment, short ? "current payment" : "$___");
  const stateName = deal.state || "your state";
  const paymentPref =
    deal.paymentPreference ||
    (Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0
      ? `around ${formatCurrency(metrics.selectedPayment || metrics.option1)}/mo`
      : "a more comfortable payment");
  const cuName = deal.lenderName || (short ? "Credit Union" : "the credit union");
  const term = deal.proposedTerm || (short ? "___" : "___");
  const rate = deal.proposedRate || (short ? "___" : "___");
  const opt1 = formatMoneyToken(deal.option1Payment, short ? "Opt 1" : "$___");
  const opt2 = formatMoneyToken(deal.option2Payment, short ? "Opt 2" : "$___");
  const selectedPmt = formatMoneyToken(
    getSelectedPayment(deal) || deal.option1Payment,
    short ? "selected pmt" : "________"
  );
  const branch = getVscBranchLabel(deal);
  const notary =
    NOTARY_CHOICES.find((choice) => choice.value === deal.notaryMode)?.label || "Standard / Lounge";
  const apr = deal.apr ? `${deal.apr}%` : "___";
  const gapMo = formatMoneyToken(deal.gapMonthlyPayment, "$___");
  const gapCost = formatMoneyToken(deal.gapCost, "$___");

  const tokens = {
    customerName: customer,
    Customer: customer,
    vehicle,
    Vehicle: vehicle,
    currentLender: lender,
    currentPayment: currPmt,
    state: stateName,
    goal: goalText,
    paymentPreference: paymentPref,
    "payment, cash, term, or certainty outcome": paymentPref,
    benefit: paymentPref,
    lenderName: cuName,
    proposedTerm: term,
    proposedRate: rate,
    option1Payment: opt1,
    option2Payment: opt2,
    selectedPayment: selectedPmt,
    vscBranch: branch,
    notaryMode: notary,
    apr,
    gapMonthlyPayment: gapMo,
    gapCost
  };

  let html = escapeHtml(rawText);
  for (const [key, value] of Object.entries(tokens)) {
    const pattern = new RegExp(`\\[${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`, "gi");
    html = html.replace(
      pattern,
      `<span class="dynamic-token">${escapeHtml(String(value))}</span>`
    );
  }
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

  if (deal.customerName || deal.vehicle) {
    badges.push(
      `<span class="metric-badge">${escapeHtml(
        [deal.customerName, deal.vehicle].filter(Boolean).join(" · ")
      )}</span>`
    );
  }

  if (deal.currentLender || deal.currentPayment) {
    const parts = [
      deal.currentLender,
      Number.isFinite(metrics.currentPayment) ? formatCurrency(metrics.currentPayment) : ""
    ].filter(Boolean);
    badges.push(`<span class="metric-badge">Curr: <strong>${escapeHtml(parts.join(" · "))}</strong></span>`);
  }

  if (deal.primaryGoal) {
    badges.push(
      `<span class="metric-badge">Goal: <strong>${escapeHtml(deal.primaryGoal)}</strong></span>`
    );
  }

  if (getVscBranchKey(deal)) {
    badges.push(
      `<span class="metric-badge">VSC: <strong>${escapeHtml(getVscBranchLabel(deal))}</strong></span>`
    );
  }

  if (Number.isFinite(metrics.option1) || Number.isFinite(metrics.option2)) {
    const optBits = [
      Number.isFinite(metrics.option1) ? `1 ${formatCurrency(metrics.option1)}` : "",
      Number.isFinite(metrics.option2) ? `2 ${formatCurrency(metrics.option2)}` : ""
    ].filter(Boolean);
    badges.push(`<span class="metric-badge">Opts: <strong>${escapeHtml(optBits.join(" / "))}</strong></span>`);
  }

  if (Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0) {
    badges.push(
      `<span class="metric-badge metric-positive">Saves: <strong>${formatCurrency(
        metrics.monthlySavings
      )}/mo</strong></span>`
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
            ? `<strong class="followup-heading">Follow-up question:</strong><p class="full-script-text">${interpolateTalkTrack(
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
          ? `<p class="cue-ask"><span class="cue-ask-badge">Ask</span> <span>${interpolateTalkTrack(
              askLine,
              { short: true }
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

function renderUnderlineField(label, field, placeholder, extra = "") {
  return `
    <label class="calc-field">
      ${escapeHtml(label)}
      <input
        type="text"
        data-deal-field="${escapeHtml(field)}"
        placeholder="${escapeHtml(placeholder)}"
        value="${escapeHtml(state.deal[field] || "")}"
        ${extra}
      />
    </label>
  `;
}

function renderChoiceRow(label, field, choices) {
  return `
    <div class="choice-block">
      <p class="widget-label">${escapeHtml(label)}</p>
      <div class="chip-row" role="group" aria-label="${escapeHtml(label)}">
        ${choices
          .map(
            (choice) => `
              <button
                type="button"
                class="chip"
                data-deal-choice="${escapeHtml(field)}"
                data-choice-value="${escapeHtml(choice.value)}"
                aria-pressed="${state.deal[field] === choice.value ? "true" : "false"}"
              >
                ${escapeHtml(choice.label)}
              </button>
            `
          )
          .join("")}
      </div>
    </div>
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

function renderIntroWidget() {
  return `
    <section class="inline-widget" aria-label="Intro capture">
      <p class="widget-label">Call Snapshot</p>
      <div class="calc-grid">
        ${renderUnderlineField("Customer", "customerName", "Mike")}
        ${renderUnderlineField("Vehicle", "vehicle", "2021 F-150")}
        ${renderUnderlineField("State", "state", "TX")}
      </div>
      <div class="calc-grid-2">
        ${renderUnderlineField("Current Lender", "currentLender", "Ally")}
        ${renderUnderlineField("Curr Pmt ($/mo)", "currentPayment", "485")}
      </div>
    </section>
  `;
}

function renderDiscoveryWidget() {
  return `
    <section class="inline-widget" aria-label="Discovery capture">
      <p class="widget-label">1-Click Refinance Goal</p>
      <div class="chip-row" role="group" aria-label="Primary refinance goal">
        ${GOAL_CHIPS.map(
          (goal) => `
            <button
              type="button"
              class="chip"
              data-goal-chip="${escapeHtml(goal)}"
              aria-pressed="${state.deal.primaryGoal === goal ? "true" : "false"}"
            >
              ${escapeHtml(goal)}
            </button>
          `
        ).join("")}
      </div>
      <div class="calc-grid">
        ${renderUnderlineField("Payment Preference", "paymentPreference", "under $420")}
        ${renderUnderlineField("Odometer Miles", "mileage", "48,200")}
        ${renderUnderlineField("Other Obligations", "otherObligations", "cards / auto")}
      </div>
      ${renderChoiceRow("Keep vs. Trade", "horizon", HORIZON_CHOICES)}
      ${renderChoiceRow("Dealer Warranty / VSC", "dealerVsc", VSC_CHOICES)}
      ${renderChoiceRow("Vehicle Mods", "mods", MOD_CHOICES)}
    </section>
  `;
}

function renderRecapWidget() {
  const recapStep = steps.find((step) => step.id === "recap");
  const branchKey = getVscBranchKey();
  const branch = recapStep?.stageScripts?.[branchKey];

  return `
    <section class="inline-widget" aria-label="Recap and set the stage">
      ${renderUnderlineField("Credit Union / Lender", "lenderName", "FourLeaf / Credit Union")}
      ${renderChoiceRow("Horizon", "horizon", HORIZON_CHOICES)}
      ${renderChoiceRow("Dealer VSC", "dealerVsc", VSC_CHOICES)}
      ${
        branch
          ? renderScriptOrCueCard({
              peekKey: `stage-${branchKey}`,
              label: `Set the Stage — ${branch.label}`,
              cueText: branch.cue,
              fullScriptText: branch.script
            })
          : `<p class="step-goal">Select Keep vs. Trade and Dealer VSC to load the matching Set the Stage track.</p>`
      }
    </section>
  `;
}

function renderCloseWidget() {
  const metrics = computeDealMetrics();
  const hasSavings = Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings !== 0;
  const spreadLabel = Number.isFinite(metrics.optionSpread)
    ? `${metrics.optionSpread >= 0 ? "+" : ""}${formatCurrency(metrics.optionSpread)} Opt 1 vs Opt 2`
    : "Enter both options";

  return `
    <section class="inline-widget" aria-label="Two option close">
      <p class="widget-label">Recommended Structure</p>
      <div class="calc-grid">
        ${renderUnderlineField("Term (mos)", "proposedTerm", "72")}
        ${renderUnderlineField("Rate (%)", "proposedRate", "6.49")}
        ${renderUnderlineField("Curr Pmt ($/mo)", "currentPayment", "485")}
      </div>
      <div class="calc-grid-2">
        ${renderUnderlineField("Option 1 w/ Protection ($/mo)", "option1Payment", "462")}
        ${renderUnderlineField("Option 2 Out-of-Pocket ($/mo)", "option2Payment", "428")}
      </div>
      <div id="close-calc-summary" class="calc-output-row">
        <div class="calc-stat ${hasSavings && metrics.monthlySavings > 0 ? "stat-positive" : ""}">
          <span class="calc-stat-label">Vs. Current Payment</span>
          <span class="calc-stat-value">
            ${
              Number.isFinite(metrics.monthlySavings)
                ? `${metrics.monthlySavings >= 0 ? "Saves" : "Adds"} ${formatCurrency(
                    Math.abs(metrics.monthlySavings)
                  )}/mo`
                : "Enter current & option pmts"
            }
          </span>
        </div>
        <div class="calc-stat">
          <span class="calc-stat-label">Protection Spread</span>
          <span class="calc-stat-value">${escapeHtml(spreadLabel)}</span>
        </div>
      </div>
      ${renderChoiceRow("Customer Selected", "selectedOption", OPTION_CHOICES)}
    </section>
  `;
}

function renderAioaStrip(step) {
  if (!step.aioa?.length) {
    return "";
  }

  return `
    <section class="aioa-ledger" aria-label="AIOA Framework">
      <p class="widget-label">AIOA Framework</p>
      ${step.aioa
        .map(
          (row) => `
            <div class="aioa-row">
              <span class="aioa-letter">${escapeHtml(row.letter)}</span>
              <div>
                <strong>${escapeHtml(row.label)}</strong>
                ${isLiveMode() ? "" : `<p>${escapeHtml(row.purpose)}</p>`}
                <p class="aioa-example">${escapeHtml(row.example)}</p>
              </div>
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function renderDocWalkWidget() {
  const docStep = steps.find((step) => step.id === "docwalk");
  const metrics = computeDealMetrics();
  const ssnKey = state.deal.ssnMode === "fourleaf" ? "fourleaf" : "standard";
  const ssnScript = docStep?.notaryScripts?.[ssnKey];
  const notaryScript = docStep?.notaryScripts?.[state.deal.notaryMode];

  return `
    <section class="inline-widget" aria-label="DocWalk verification">
      <div class="verify-group">
        <p class="widget-label">Employment Income</p>
        <div class="calc-grid-2">
          ${renderUnderlineField("Gross Monthly ($)", "monthlyIncome", "5,400")}
          <div class="calc-field">
            Equates Yearly
            <p class="calc-stat-value" id="annual-income-readout">
              ${Number.isFinite(metrics.annualIncome) ? formatCurrency(metrics.annualIncome) : "—"}
            </p>
          </div>
        </div>
      </div>
      ${renderChoiceRow("DocuSign Access", "ssnMode", SSN_CHOICES)}
      ${
        ssnScript && state.deal.ssnMode === "fourleaf"
          ? renderScriptOrCueCard({
              peekKey: "ssn-fourleaf",
              label: ssnScript.label,
              cueText: ssnScript.cue,
              fullScriptText: ssnScript.script
            })
          : ""
      }
      ${renderChoiceRow("Notary Path", "notaryMode", NOTARY_CHOICES)}
      ${
        notaryScript
          ? renderScriptOrCueCard({
              peekKey: `notary-${state.deal.notaryMode}`,
              label: `Docs — ${notaryScript.label}`,
              cueText: notaryScript.cue,
              fullScriptText: notaryScript.script
            })
          : ""
      }
    </section>
  `;
}

function renderQaWidget() {
  const qaStep = steps.find((step) => step.id === "qa");
  const declinedVsc = state.deal.selectedOption === "option2";
  const pitch = qaStep?.gapScripts?.[state.deal.gapPitchMode];
  const refund = qaStep?.gapScripts?.[state.deal.gapRefundMode];

  return `
    <section class="inline-widget" aria-label="Quality assurance breakdown">
      ${
        declinedVsc
          ? `<p class="ink-warning">Customer selected Option 2 (no VSC). Re-pitch protection with AIOA before reading QA.</p>`
          : ""
      }
      <p class="widget-label">Itemized Loan</p>
      <div class="calc-grid">
        ${renderUnderlineField("Lender", "lenderName", "Credit Union")}
        ${renderUnderlineField("Term (mos)", "proposedTerm", "72")}
        ${renderUnderlineField("Rate (%)", "proposedRate", "6.49")}
      </div>
      <div class="calc-grid">
        ${renderUnderlineField("APR (%)", "apr", "7.12")}
        ${renderUnderlineField("VSC Cost ($)", "vscCost", "2,495")}
        ${renderUnderlineField("Other Product ($)", "otherProductCost", "895 GAP")}
      </div>
      <div class="calc-grid-2">
        ${renderUnderlineField("Title Fee ($)", "titleFee", "75")}
        ${renderUnderlineField("Lender Fee ($)", "lenderFee", "499")}
      </div>
      <p class="widget-label">Assuming the GAP</p>
      <div class="calc-grid-2">
        ${renderUnderlineField("GAP Cost ($)", "gapCost", "895")}
        ${renderUnderlineField("GAP Monthly ($)", "gapMonthlyPayment", "18")}
      </div>
      ${renderChoiceRow("GAP Pitch", "gapPitchMode", GAP_PITCH_CHOICES)}
      ${
        pitch
          ? renderScriptOrCueCard({
              peekKey: `gap-${state.deal.gapPitchMode}`,
              label: pitch.label,
              cueText: pitch.cue,
              askCueText:
                state.deal.gapPitchMode === "backend"
                  ? "Did you want to maintain GAP on the new loan going forward?"
                  : "",
              fullScriptText: pitch.script
            })
          : ""
      }
      ${renderChoiceRow("GAP Refund", "gapRefundMode", GAP_REFUND_CHOICES)}
      ${
        refund
          ? renderScriptOrCueCard({
              peekKey: `gap-refund-${state.deal.gapRefundMode}`,
              label: refund.label,
              cueText: refund.cue,
              fullScriptText: refund.script
            })
          : ""
      }
    </section>
  `;
}

function renderChecklist(step) {
  if (!step.checklist?.length) {
    return "";
  }

  const widgetSteps = new Set(["discovery", "recap", "close", "docwalk", "qa"]);
  if (isLiveMode() && widgetSteps.has(step.id)) {
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
                    isChecked ? "[x]" : "[ ]"
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
  if (!step.prompts?.length || isLiveMode()) {
    return "";
  }

  return `
    <div>
      <p class="section-sublabel">Questions to Ask</p>
      <ul class="prompt-list">
        ${step.prompts.map((prompt) => `<li>${interpolateTalkTrack(prompt)}</li>`).join("")}
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
    ${renderAioaStrip(step)}
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
      <p class="step-subtitle">${escapeHtml(step.subtitle)}</p>
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
    ${step.id === "intro" ? renderIntroWidget() : ""}
    ${step.id === "discovery" ? renderDiscoveryWidget() : ""}
    ${step.id === "recap" ? renderRecapWidget() : ""}
    ${step.id === "close" ? renderCloseWidget() : ""}
    ${step.id === "docwalk" ? renderDocWalkWidget() : ""}
    ${step.id === "qa" ? renderQaWidget() : ""}
    ${renderPrompts(step)}
    ${renderRebuttals(step)}
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
    stepId === "intro" || stepId === "discovery"
      ? "goal"
      : stepId === "recap" || stepId === "close"
        ? "loan"
        : stepId === "rebuttal" || stepId === "docwalk" || stepId === "qa"
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
  if (summaryEl) {
    const metrics = computeDealMetrics(state.deal);
    const spreadLabel = Number.isFinite(metrics.optionSpread)
      ? `${metrics.optionSpread >= 0 ? "+" : ""}${formatCurrency(metrics.optionSpread)} Opt 1 vs Opt 2`
      : "Enter both options";
    summaryEl.innerHTML = `
      <div class="calc-stat ${
        Number.isFinite(metrics.monthlySavings) && metrics.monthlySavings > 0 ? "stat-positive" : ""
      }">
        <span class="calc-stat-label">Vs. Current Payment</span>
        <span class="calc-stat-value">
          ${
            Number.isFinite(metrics.monthlySavings)
              ? `${metrics.monthlySavings >= 0 ? "Saves" : "Adds"} ${formatCurrency(
                  Math.abs(metrics.monthlySavings)
                )}/mo`
              : "Enter current & option pmts"
          }
        </span>
      </div>
      <div class="calc-stat">
        <span class="calc-stat-label">Protection Spread</span>
        <span class="calc-stat-value">${escapeHtml(spreadLabel)}</span>
      </div>
    `;
  }

  const annualEl = document.getElementById("annual-income-readout");
  if (annualEl) {
    const metrics = computeDealMetrics(state.deal);
    annualEl.textContent = Number.isFinite(metrics.annualIncome)
      ? formatCurrency(metrics.annualIncome)
      : "—";
  }
}

function markFieldsOnDeal(field, value) {
  if (!String(value || "").trim() && !["horizon", "dealerVsc", "mods", "selectedOption"].includes(field)) {
    return;
  }

  if (field === "customerName") {
    markChecklistItem("intro", "customer name");
  } else if (field === "currentLender" || field === "currentPayment") {
    markChecklistItem("intro", "current lender");
  } else if (field === "primaryGoal") {
    markChecklistItem("discovery", "primary goal");
    markChecklistItem("recap", "customer's goal");
  } else if (field === "paymentPreference") {
    markChecklistItem("discovery", "payment comfort");
    markChecklistItem("recap", "payment preference");
  } else if (field === "otherObligations") {
    markChecklistItem("discovery", "other financial");
  } else if (field === "mileage") {
    markChecklistItem("discovery", "odometer");
  } else if (field === "horizon") {
    markChecklistItem("discovery", "keep vs");
  } else if (field === "dealerVsc") {
    markChecklistItem("discovery", "dealer warranty");
    markChecklistItem("recap", "vsc branch");
  } else if (field === "mods") {
    markChecklistItem("discovery", "lift or aftermarket");
  } else if (field === "lenderName") {
    markChecklistItem("recap", "simple-interest");
    markChecklistItem("qa", "lender, term");
  } else if (field === "proposedTerm" || field === "proposedRate") {
    markChecklistItem("close", "term and rate");
    markChecklistItem("qa", "lender, term");
  } else if (field === "option1Payment") {
    markChecklistItem("close", "option 1");
  } else if (field === "option2Payment") {
    markChecklistItem("close", "option 2");
  } else if (field === "selectedOption") {
    markChecklistItem("close", "which option");
    if (value === "option2") {
      markChecklistItem("qa", "re-pitch vsc");
    }
  } else if (field === "monthlyIncome") {
    markChecklistItem("docwalk", "employment");
  } else if (field === "notaryMode" || field === "ssnMode") {
    markChecklistItem("docwalk", "email");
  } else if (field === "vscCost" || field === "otherProductCost") {
    markChecklistItem("qa", "itemize vsc");
  } else if (field === "titleFee" || field === "lenderFee") {
    markChecklistItem("qa", "title fee");
  } else if (field === "gapPitchMode" || field === "gapCost" || field === "gapMonthlyPayment") {
    markChecklistItem("qa", "assume gap");
  }
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

  markFieldsOnDeal(field, inputEl.value);
  renderLiveMetricsStrip();
  renderStepList();
  updateCloseSummaryInPlace();
  refreshActiveTalkTrackInPlace();
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
    markChecklistItem("recap", "customer's goal");
  }

  await flushState();
  renderApp();
}

async function selectDealChoice(field, value) {
  const nextValue = state.deal[field] === value ? "" : value;
  state = {
    ...state,
    deal: {
      ...state.deal,
      [field]: nextValue || (field === "ssnMode" ? "last4" : field === "notaryMode" ? "standard" : field === "gapPitchMode" ? "backend" : field === "gapRefundMode" ? "refundable" : nextValue)
    }
  };

  markFieldsOnDeal(field, state.deal[field]);
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
  const selectedPmt = getSelectedPayment(deal);

  const lines = [
    "GRAVITY LENDING AUTO REFI NOTES",
    `Current step: ${step.number}. ${step.title} — ${step.subtitle}`,
    "",
    `Customer: ${deal.customerName || "Not captured"}`,
    `Vehicle: ${deal.vehicle || "Not captured"}`,
    `State: ${deal.state || "Not captured"}`,
    `Current loan: ${[deal.currentLender, deal.currentPayment ? `$${deal.currentPayment}/mo` : ""]
      .filter(Boolean)
      .join(" | ") || "Not captured"}`,
    "",
    `Goal: ${[deal.primaryGoal, notes.goal].filter(Boolean).join(" — ") || "Not captured"}`,
    `Payment preference: ${deal.paymentPreference || "Not captured"}`,
    `Other obligations: ${deal.otherObligations || "Not captured"}`,
    `Mileage: ${deal.mileage || "Not captured"}`,
    `Keep vs Trade: ${HORIZON_CHOICES.find((c) => c.value === deal.horizon)?.label || "Not captured"}`,
    `Dealer VSC: ${VSC_CHOICES.find((c) => c.value === deal.dealerVsc)?.label || "Not captured"}`,
    `Mods: ${MOD_CHOICES.find((c) => c.value === deal.mods)?.label || "Not captured"}`,
    `VSC branch: ${getVscBranchKey(deal) ? getVscBranchLabel(deal) : "Not set"}`,
    "",
    `Proposed lender: ${deal.lenderName || "Not captured"}`,
    `Term / Rate / APR: ${[deal.proposedTerm ? `${deal.proposedTerm} mo` : "", deal.proposedRate ? `${deal.proposedRate}%` : "", deal.apr ? `APR ${deal.apr}%` : ""]
      .filter(Boolean)
      .join(" | ") || "Not captured"}`,
    `Option 1 (w/ protection): ${deal.option1Payment ? `$${deal.option1Payment}/mo` : "Not captured"}`,
    `Option 2 (no VSC): ${deal.option2Payment ? `$${deal.option2Payment}/mo` : "Not captured"}`,
    `Selected: ${OPTION_CHOICES.find((c) => c.value === deal.selectedOption)?.label || "Not captured"}${
      selectedPmt ? ` @ $${selectedPmt}/mo` : ""
    }`,
    Number.isFinite(metrics.monthlySavings)
      ? `Vs current: ${metrics.monthlySavings >= 0 ? "saves" : "adds"} ${formatCurrency(
          Math.abs(metrics.monthlySavings)
        )}/mo`
      : "",
    "",
    `DocuSign: ${SSN_CHOICES.find((c) => c.value === deal.ssnMode)?.label || "Last 4 SSN"}`,
    `Notary: ${NOTARY_CHOICES.find((c) => c.value === deal.notaryMode)?.label || "Standard"}`,
    Number.isFinite(metrics.annualIncome)
      ? `Gross income: ${formatCurrency(metrics.monthlyIncome)}/mo (${formatCurrency(
          metrics.annualIncome
        )}/yr)`
      : "",
    `VSC cost / other / title / lender fee: ${[
      deal.vscCost && `VSC $${deal.vscCost}`,
      deal.otherProductCost && `Other $${deal.otherProductCost}`,
      deal.titleFee && `Title $${deal.titleFee}`,
      deal.lenderFee && `Lender $${deal.lenderFee}`
    ]
      .filter(Boolean)
      .join(" | ") || "Not captured"}`,
    `GAP: ${GAP_PITCH_CHOICES.find((c) => c.value === deal.gapPitchMode)?.label || ""} / ${
      GAP_REFUND_CHOICES.find((c) => c.value === deal.gapRefundMode)?.label || ""
    }${deal.gapCost ? ` · $${deal.gapCost}` : ""}${
      deal.gapMonthlyPayment ? ` · $${deal.gapMonthlyPayment}/mo` : ""
    }`,
    "",
    `Loan notes: ${notes.loan || "Not captured"}`,
    `Next step / objections: ${notes.next || "Not captured"}`
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "");

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

    const choiceBtn = event.target.closest("[data-deal-choice]");
    if (choiceBtn) {
      disarmClearCall();
      selectDealChoice(choiceBtn.dataset.dealChoice, choiceBtn.dataset.choiceValue);
      return;
    }

    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      disarmClearCall();
      selectRebuttal(rebuttalButton.dataset.rebuttalId);
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
