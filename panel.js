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

const NOTARY_CHOICES = [
  { value: "standard", label: "Standard / Lounge" },
  { value: "proof", label: "Proof Online ($30)" },
  { value: "longpen", label: "LongPen (TX)" }
];

const GAP_PITCH_CHOICES = [
  { value: "backend", label: "Back-End GAP Pitch" },
  { value: "included", label: "Already Included GAP" }
];

const DEFAULT_PAD_HEIGHT = 180;
const MIN_PAD_HEIGHT = 96;
const MAX_PAD_HEIGHT = 520;

const defaultState = {
  viewMode: "live",
  activeStepId: "",
  checkedItems: {},
  selectedRebuttalId: "",
  padOpen: false,
  padHeight: DEFAULT_PAD_HEIGHT,
  branches: {
    horizon: "keep",
    dealerVsc: "bought",
    notaryMode: "standard",
    gapPitchMode: "backend"
  },
  scratchpad: ""
};

const LEGACY_KEYS = [
  "timerRunning",
  "timerStartedAt",
  "elapsedBeforeStart",
  "deal",
  "notes",
  "activeNoteTab",
  "selectedPivotId",
  "notesCollapsed"
];
const LEGACY_STEP_IDS = ["set-stage", "pivot"];
const SAVE_DELAY_MS = 250;
const CLEAR_CONFIRM_MS = 5000;

const elements = {
  modeLive: document.querySelector("#mode-live"),
  modePractice: document.querySelector("#mode-practice"),
  togglePadBtn: document.querySelector("#toggle-pad-btn"),
  padInkDot: document.querySelector("#pad-ink-dot"),
  quickObjectionToggle: document.querySelector("#quick-objection-toggle"),
  quickObjectionDrawer: document.querySelector("#quick-objection-drawer"),
  stepList: document.querySelector("#step-list"),
  stepDetail: document.querySelector("#step-detail"),
  stepStatus: document.querySelector("#step-status"),
  notesDock: document.querySelector("#notes-dock"),
  padResizeHandle: document.querySelector("#pad-resize-handle"),
  padActions: document.querySelector("#pad-actions"),
  notesBody: document.querySelector("#notes-body"),
  copyNotes: document.querySelector("#copy-notes"),
  newCall: document.querySelector("#new-call"),
  closePadBtn: document.querySelector("#close-pad-btn"),
  copyStatus: document.querySelector("#copy-status"),
  callNote: document.querySelector("#call-note")
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

function clampPadHeight(height) {
  const num = Number(height);
  if (!Number.isFinite(num)) {
    return DEFAULT_PAD_HEIGHT;
  }
  const viewportMax = Math.max(
    MIN_PAD_HEIGHT,
    Math.min(MAX_PAD_HEIGHT, Math.round(window.innerHeight * 0.65))
  );
  return Math.max(MIN_PAD_HEIGHT, Math.min(viewportMax, Math.round(num)));
}

function highlightBracketTokens(rawText) {
  if (!rawText) {
    return "";
  }
  return escapeHtml(rawText).replace(
    /\[([^\]]+)\]/g,
    '<span class="dynamic-token">[$1]</span>'
  );
}

function getVscBranchKey(branches = state.branches) {
  const horizon = branches?.horizon || "keep";
  const vsc = branches?.dealerVsc || "bought";
  if (horizon === "keep" && vsc === "bought") {
    return "keep-bought";
  }
  if (horizon === "trade" && vsc === "bought") {
    return "trade-bought";
  }
  if (horizon === "keep" && vsc === "none") {
    return "keep-nobought";
  }
  return "trade-nobought";
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
    return chrome.storage.local.get(null);
  }

  const localState = JSON.parse(localStorage.getItem("refi-companion-state") || "{}");
  return Promise.resolve({ ...defaultState, ...localState });
}

function normalizeBranches(branches, legacyDeal) {
  const fallback = defaultState.branches;
  const source = branches && typeof branches === "object" ? branches : legacyDeal || {};

  return {
    horizon: ["keep", "trade"].includes(source.horizon) ? source.horizon : fallback.horizon,
    dealerVsc: ["bought", "none"].includes(source.dealerVsc)
      ? source.dealerVsc
      : fallback.dealerVsc,
    notaryMode: ["standard", "proof", "longpen"].includes(source.notaryMode)
      ? source.notaryMode
      : fallback.notaryMode,
    gapPitchMode: ["backend", "included"].includes(source.gapPitchMode)
      ? source.gapPitchMode
      : fallback.gapPitchMode
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

function normalizeScratchpad(storedState) {
  if (typeof storedState?.scratchpad === "string" && storedState.scratchpad.trim()) {
    return storedState.scratchpad;
  }
  if (storedState?.notes && typeof storedState.notes === "object") {
    return [storedState.notes.goal, storedState.notes.loan, storedState.notes.next]
      .filter((part) => typeof part === "string" && part.trim())
      .join("\n");
  }
  return typeof storedState?.scratchpad === "string" ? storedState.scratchpad : "";
}

function normalizeStoredState(storedState) {
  return {
    viewMode: storedState?.viewMode === "practice" ? "practice" : "live",
    activeStepId:
      typeof storedState?.activeStepId === "string" &&
      !LEGACY_STEP_IDS.includes(storedState.activeStepId)
        ? storedState.activeStepId
        : "",
    checkedItems: normalizeCheckedItems(storedState?.checkedItems),
    selectedRebuttalId:
      typeof storedState?.selectedRebuttalId === "string"
        ? storedState.selectedRebuttalId
        : "",
    padOpen: Boolean(storedState?.padOpen),
    padHeight: clampPadHeight(storedState?.padHeight),
    branches: normalizeBranches(storedState?.branches, storedState?.deal),
    scratchpad: normalizeScratchpad(storedState)
  };
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

async function removeLegacyKeys() {
  if (!globalThis.chrome?.storage?.local) {
    return;
  }

  await chrome.storage.local.remove(LEGACY_KEYS);
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

function hasAnyChecks() {
  return Object.values(state.checkedItems).some(
    (items) => Array.isArray(items) && items.length > 0
  );
}

function isStepComplete(step) {
  if (!step.checklist?.length) {
    return false;
  }

  const checked = new Set(getCheckedItems(step.id));
  return step.checklist.every((item) => checked.has(item));
}

function findSelectedRebuttal() {
  const all = getAllRebuttals();
  return all.find((rebuttal) => rebuttal.id === state.selectedRebuttalId) || null;
}

function renderModeSwitch() {
  const live = isLiveMode();
  elements.modeLive.setAttribute("aria-pressed", live ? "true" : "false");
  elements.modePractice.setAttribute("aria-pressed", live ? "false" : "true");
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
  liveCueText,
  liveAskText,
  fullScriptText,
  followUpText,
  idAttr = ""
}) {
  const live = isLiveMode();
  const isPeekOpen = expandedPeeks.has(peekKey);

  if (!live) {
    return `
      <article class="script-card script-card-practice">
        <div class="script-card-top">
          <span class="script-card-label">${escapeHtml(label)}</span>
        </div>
        <p class="full-script-text" ${idAttr ? `id="${escapeHtml(idAttr)}"` : ""}>${highlightBracketTokens(
          fullScriptText || liveCueText
        )}</p>
        ${
          followUpText
            ? `<strong class="followup-heading">Ask / Follow-Up:</strong><p class="full-script-text">${highlightBracketTokens(
                followUpText
              )}</p>`
            : ""
        }
      </article>
    `;
  }

  const askLine = liveAskText || followUpText;

  return `
    <article class="script-card script-card-live">
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
      <p class="cue-headline cue-headline-live" ${
        idAttr ? `id="${escapeHtml(idAttr)}"` : ""
      }>${highlightBracketTokens(liveCueText || fullScriptText)}</p>
      ${
        askLine
          ? `<p class="cue-ask"><span class="cue-ask-badge">Ask</span> <span>${highlightBracketTokens(
              askLine
            )}</span></p>`
          : ""
      }
      ${
        isPeekOpen && fullScriptText
          ? `<div class="peek-script-box">${highlightBracketTokens(fullScriptText)}</div>`
          : ""
      }
    </article>
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
                data-branch-field="${escapeHtml(field)}"
                data-branch-value="${escapeHtml(choice.value)}"
                aria-pressed="${state.branches[field] === choice.value ? "true" : "false"}"
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
      <h2>Instant Objection Handler (AIOA)</h2>
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
      liveCueText: selected.liveCue,
      liveAskText: selected.liveAsk,
      fullScriptText: selected.response,
      followUpText: selected.followUp
    })}
  `;
}

function renderDiscoveryBranchWidget() {
  return `
    <section class="inline-widget" aria-label="Step 3 VSC branch setup">
      ${renderChoiceRow("Keep vs. Trade (Sets Step 3 Stage)", "horizon", HORIZON_CHOICES)}
      ${renderChoiceRow("Dealership Warranty / VSC", "dealerVsc", VSC_CHOICES)}
    </section>
  `;
}

function renderRecapBranchWidget() {
  const recapStep = steps.find((step) => step.id === "recap");
  const branchKey = getVscBranchKey();
  const branch = recapStep?.stageScripts?.[branchKey];

  return `
    <section class="inline-widget" aria-label="Set the stage VSC branch">
      ${renderChoiceRow("Horizon", "horizon", HORIZON_CHOICES)}
      ${renderChoiceRow("Dealer VSC", "dealerVsc", VSC_CHOICES)}
      ${
        branch
          ? renderScriptOrCueCard({
              peekKey: `stage-${branchKey}`,
              label: `Set the Stage — ${branch.label}`,
              liveCueText: branch.liveCue,
              fullScriptText: branch.script
            })
          : ""
      }
    </section>
  `;
}

function renderDocWalkBranchWidget() {
  const docStep = steps.find((step) => step.id === "docwalk");
  const notaryScript = docStep?.notaryScripts?.[state.branches.notaryMode];

  return `
    <section class="inline-widget" aria-label="DocuSign and Notary process">
      ${renderChoiceRow("2-Email Doc & Notary Path", "notaryMode", NOTARY_CHOICES)}
      ${
        notaryScript
          ? renderScriptOrCueCard({
              peekKey: `notary-${state.branches.notaryMode}`,
              label: `Explain Doc Process — ${notaryScript.label}`,
              liveCueText: notaryScript.liveCue,
              fullScriptText: notaryScript.script
            })
          : ""
      }
    </section>
  `;
}

function renderQaBranchWidget() {
  const qaStep = steps.find((step) => step.id === "qa");
  const pitch = qaStep?.gapScripts?.[state.branches.gapPitchMode];

  return `
    <section class="inline-widget" aria-label="Assuming the GAP pitch">
      ${renderChoiceRow("Assuming the GAP", "gapPitchMode", GAP_PITCH_CHOICES)}
      ${
        pitch
          ? renderScriptOrCueCard({
              peekKey: `gap-${state.branches.gapPitchMode}`,
              label: pitch.label,
              liveCueText: pitch.liveCue,
              fullScriptText: pitch.script
            })
          : ""
      }
    </section>
  `;
}

function renderAioaStrip(step) {
  if (!step.aioa?.length) {
    return "";
  }

  if (isLiveMode()) {
    return `
      <div class="aioa-compact-bar" aria-label="AIOA Framework">
        <span><strong>A</strong>gree</span>
        <span>→</span>
        <span><strong>I</strong>solate</span>
        <span>→</span>
        <span><strong>O</strong>vercome</span>
        <span>→</span>
        <span><strong>A</strong>sk</span>
      </div>
    `;
  }

  return `
    <section class="aioa-ledger" aria-label="AIOA Framework">
      <p class="widget-label">The AIOA Framework</p>
      ${step.aioa
        .map(
          (row) => `
            <div class="aioa-row">
              <span class="aioa-letter">${escapeHtml(row.letter)}</span>
              <div>
                <strong>${escapeHtml(row.label)}</strong>
                <p>${escapeHtml(row.purpose)}</p>
                <p class="aioa-example">${escapeHtml(row.example)}</p>
              </div>
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function renderChecklist(step) {
  if (!step.checklist?.length) {
    return "";
  }

  const checkedItems = getCheckedItems(step.id);
  const resetLink = hasAnyChecks()
    ? `<button type="button" class="reset-checks-btn" data-reset-checks title="Uncheck all steps for next call">Reset checks</button>`
    : "";

  if (isLiveMode()) {
    return `
      <div>
        <div class="checklist-header-row">
          <p class="section-sublabel">Step Check-Offs</p>
          ${resetLink}
        </div>
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
      <div class="checklist-header-row">
        <p class="section-sublabel">Step Checklist</p>
        ${resetLink}
      </div>
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
        ${step.prompts.map((prompt) => `<li>${highlightBracketTokens(prompt)}</li>`).join("")}
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
      liveCueText: selected.liveCue,
      liveAskText: selected.liveAsk,
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

  const live = isLiveMode();
  const showTopCard = Boolean(step.script) && !(live && step.id === "rebuttal");

  elements.stepDetail.innerHTML = `
    <div class="step-header-bar">
      <div class="step-title-wrap">
        <span class="step-kicker">Step ${escapeHtml(step.number)}</span>
        <h2 id="step-title" class="step-title" tabindex="-1">${escapeHtml(step.title)}</h2>
      </div>
      <p class="step-subtitle">${escapeHtml(step.subtitle)}</p>
    </div>
    ${!live && step.goal ? `<p class="step-goal">${escapeHtml(step.goal)}</p>` : ""}
    ${
      showTopCard
        ? renderScriptOrCueCard({
            peekKey: `step-${step.id}`,
            label: live ? "Live Cue" : "Full Script",
            liveCueText: step.liveCue,
            liveAskText: step.liveAsk,
            fullScriptText: step.script,
            idAttr: "active-talk-track"
          })
        : ""
    }
    ${step.id === "discovery" ? renderDiscoveryBranchWidget() : ""}
    ${step.id === "recap" ? renderRecapBranchWidget() : ""}
    ${step.id === "docwalk" ? renderDocWalkBranchWidget() : ""}
    ${step.id === "qa" ? renderQaBranchWidget() : ""}
    ${renderPrompts(step)}
    ${renderRebuttals(step)}
    ${renderChecklist(step)}
  `;
}

function renderNotes() {
  const isOpen = Boolean(state.padOpen);
  const hasInk = Boolean(state.scratchpad?.trim());

  elements.notesDock.dataset.open = isOpen ? "true" : "false";
  elements.notesDock.style.setProperty("--pad-height", `${clampPadHeight(state.padHeight)}px`);
  elements.padResizeHandle.hidden = !isOpen;
  elements.padActions.hidden = !isOpen;
  elements.notesBody.hidden = !isOpen;
  elements.togglePadBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  elements.padInkDot.hidden = !hasInk;
  elements.callNote.value = state.scratchpad;
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

async function togglePad(forceOpen) {
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !state.padOpen;
  await flushState({ padOpen: nextOpen });
  renderNotes();
  if (nextOpen) {
    elements.callNote.focus();
  }
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

  await flushState({ activeStepId: stepId });
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
  renderStepDetail();
}

async function resetAllChecks() {
  await flushState({ checkedItems: {} });
  renderStepList();
  renderStepDetail();
}

async function selectBranchChoice(field, value) {
  if (!field || !value) {
    return;
  }

  await flushState({
    branches: {
      ...state.branches,
      [field]: value
    }
  });

  renderStepDetail();
}

function rememberNotes() {
  state = {
    ...state,
    scratchpad: elements.callNote.value
  };
  elements.padInkDot.hidden = !Boolean(state.scratchpad.trim());
}

function updateNotes() {
  rememberNotes();
  schedulePersist();
}

function buildCrmNote() {
  const { branches, scratchpad } = state;
  const horizonLabel =
    HORIZON_CHOICES.find((c) => c.value === branches.horizon)?.label || "";
  const vscLabel =
    VSC_CHOICES.find((c) => c.value === branches.dealerVsc)?.label || "";
  const notaryLabel =
    NOTARY_CHOICES.find((c) => c.value === branches.notaryMode)?.label || "";
  const gapLabel =
    GAP_PITCH_CHOICES.find((c) => c.value === branches.gapPitchMode)?.label || "";

  const lines = [
    "GRAVITY LENDING CALL NOTES",
    `VSC Setup: ${[horizonLabel, vscLabel].filter(Boolean).join(" · ")}`,
    `Doc / Notary Path: ${notaryLabel} · ${gapLabel}`,
    "",
    scratchpad.trim() || "No scratchpad notes entered."
  ];

  const selected = findSelectedRebuttal();
  if (selected) {
    lines.push("", `Objection handled: ${selected.label}`);
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
    setCopyStatus("Copied!");
  } catch {
    setCopyStatus("Could not copy.", "error");
  }
}

function armClearCall() {
  clearArmed = true;
  elements.newCall.textContent = "Confirm Clear?";
  elements.newCall.setAttribute("aria-pressed", "true");
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = setTimeout(disarmClearCall, CLEAR_CONFIRM_MS);
}

function disarmClearCall() {
  clearArmed = false;
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = null;
  elements.newCall.textContent = "Clear Call";
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
    padOpen: state.padOpen,
    padHeight: state.padHeight,
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

function bindResizeHandle() {
  let startY = 0;
  let startHeight = DEFAULT_PAD_HEIGHT;
  let dragging = false;

  const onPointerMove = (event) => {
    if (!dragging) {
      return;
    }
    const deltaY = startY - event.clientY;
    const nextHeight = clampPadHeight(startHeight + deltaY);
    state = { ...state, padHeight: nextHeight };
    elements.notesDock.style.setProperty("--pad-height", `${nextHeight}px`);
  };

  const onPointerUp = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    schedulePersist();
  };

  elements.padResizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    startHeight = clampPadHeight(state.padHeight);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  elements.padResizeHandle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? 22 : -22;
      const nextHeight = clampPadHeight(state.padHeight + delta);
      flushState({ padHeight: nextHeight }).then(() => renderNotes());
    }
  });
}

function bindEvents() {
  elements.modeLive.addEventListener("click", () => setViewMode("live"));
  elements.modePractice.addEventListener("click", () => setViewMode("practice"));
  elements.togglePadBtn.addEventListener("click", () => togglePad());
  elements.closePadBtn.addEventListener("click", () => togglePad(false));
  elements.newCall.addEventListener("click", resetCall);
  elements.copyNotes.addEventListener("click", copyNotes);
  elements.quickObjectionToggle.addEventListener("click", () => {
    disarmClearCall();
    toggleQuickObjectionDrawer();
  });

  bindResizeHandle();

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

  elements.callNote.addEventListener("input", updateNotes);
  elements.callNote.addEventListener("blur", () => {
    rememberNotes();
    flushState();
  });

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

    if (event.target.closest("[data-reset-checks]")) {
      disarmClearCall();
      resetAllChecks();
      return;
    }

    const checkPill = event.target.closest("[data-check-pill-index]");
    if (checkPill) {
      disarmClearCall();
      toggleChecklistIndex(getActiveStep(), checkPill.dataset.checkPillIndex);
      return;
    }

    const branchBtn = event.target.closest("[data-branch-field]");
    if (branchBtn) {
      disarmClearCall();
      selectBranchChoice(
        branchBtn.dataset.branchField,
        branchBtn.dataset.branchValue
      );
      return;
    }

    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      disarmClearCall();
      selectRebuttal(rebuttalButton.dataset.rebuttalId);
    }
  });

  elements.stepDetail.addEventListener("change", (event) => {
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

    if (event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      togglePad();
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
  const normalized = normalizeStoredState(await getStoredState());
  const activeStepId = steps.some((step) => step.id === normalized.activeStepId)
    ? normalized.activeStepId
    : steps[0]?.id || "";

  state = {
    ...structuredClone(defaultState),
    ...normalized,
    activeStepId
  };

  bindEvents();
  renderApp({ announce: true });
  removeLegacyKeys().catch(() => {});
  persistState();
}

init().catch((error) => {
  elements.stepDetail.innerHTML = `
    <h2>Unable to load script</h2>
    <p>${escapeHtml(error.message)}</p>
  `;
});
