const defaultState = {
  activeStepId: "",
  checkedItems: {},
  selectedRebuttalId: "",
  notes: {
    goal: "",
    loan: "",
    next: ""
  }
};

const LEGACY_TIMER_KEYS = ["timerRunning", "timerStartedAt", "elapsedBeforeStart"];
const SAVE_DELAY_MS = 300;
const CLEAR_CONFIRM_MS = 5000;

const elements = {
  newCall: document.querySelector("#new-call"),
  copyNotes: document.querySelector("#copy-notes"),
  copyStatus: document.querySelector("#copy-status"),
  stepList: document.querySelector("#step-list"),
  stepDetail: document.querySelector("#step-detail"),
  stepStatus: document.querySelector("#step-status"),
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
let persistQueue = Promise.resolve();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

  next.notes = normalizeNotes(next.notes);
  next.checkedItems = normalizeCheckedItems(next.checkedItems);
  next.selectedRebuttalId =
    typeof next.selectedRebuttalId === "string" ? next.selectedRebuttalId : "";
  next.activeStepId = typeof next.activeStepId === "string" ? next.activeStepId : "";
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

function getActiveStep() {
  return steps.find((step) => step.id === state.activeStepId) || steps[0];
}

function getCheckedItems(stepId) {
  const items = state.checkedItems[stepId];
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => typeof item === "string");
}

function isStepComplete(step) {
  if (!step.checklist?.length) {
    return false;
  }

  const checked = new Set(getCheckedItems(step.id));
  return step.checklist.every((item) => checked.has(item));
}

function isLastStep(step) {
  return steps.at(-1)?.id === step.id;
}

function findSelectedRebuttal() {
  for (const step of steps) {
    const match = step.rebuttals?.find((rebuttal) => rebuttal.id === state.selectedRebuttalId);
    if (match) {
      return match;
    }
  }

  return null;
}

function renderStepList() {
  elements.stepList.innerHTML = steps
    .map((step) => {
      const isActive = step.id === state.activeStepId;
      const complete = isStepComplete(step);

      return `
        <button
          class="step-button"
          type="button"
          data-step-id="${escapeHtml(step.id)}"
          ${isActive ? 'aria-current="step"' : ""}
        >
          <span class="step-number">${escapeHtml(step.number)}</span>
          <span>
            <strong>${escapeHtml(step.title)}</strong><br />
            <small>${escapeHtml(step.subtitle)}</small>
          </span>
          <span class="complete-mark">${complete ? "Done" : ""}</span>
        </button>
      `;
    })
    .join("");
}

function renderChecklist(step) {
  if (!step.checklist?.length) {
    return "";
  }

  const checkedItems = getCheckedItems(step.id);

  return `
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
                ${escapeHtml(item)}
              </label>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderPrompts(step) {
  if (!step.prompts?.length) {
    return "";
  }

  return `
    <ul class="prompt-list">
      ${step.prompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}
    </ul>
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
              aria-pressed="${rebuttal.id === state.selectedRebuttalId ? "true" : "false"}"
            >
              ${escapeHtml(rebuttal.label)}
            </button>
          `
        )
        .join("")}
    </div>
    <article class="script-card">
      <h3>${escapeHtml(selected.label)}</h3>
      <p>${escapeHtml(selected.response)}</p>
      <strong>Follow-up:</strong>
      <p>${escapeHtml(selected.followUp)}</p>
    </article>
  `;
}

function renderOptions(step) {
  if (!step.options?.length) {
    return "";
  }

  return `
    <div class="option-grid">
      ${step.options
        .map(
          (option) => `
            <article class="option-card">
              <h3>${escapeHtml(option.title)}</h3>
              <p>${escapeHtml(option.description)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStepDetail() {
  const step = getActiveStep();
  if (!step) {
    elements.stepDetail.innerHTML = "";
    return;
  }

  const onLastStep = isLastStep(step);

  elements.stepDetail.innerHTML = `
    <p class="step-kicker">Step ${escapeHtml(step.number)}</p>
    <h2 id="step-title" class="step-title" tabindex="-1">${escapeHtml(step.title)}</h2>
    <p>${escapeHtml(step.goal)}</p>
    ${
      step.script
        ? `<article class="script-card"><strong>Talk track</strong><p>${escapeHtml(step.script)}</p></article>`
        : ""
    }
    ${renderChecklist(step)}
    ${renderPrompts(step)}
    ${renderRebuttals(step)}
    ${renderOptions(step)}
    <button class="next-button" type="button" ${onLastStep ? "disabled" : "data-next-step"}>
      ${onLastStep ? "End of script" : "Next Step"}
    </button>
  `;
}

function renderNotes() {
  elements.goalNote.value = state.notes.goal;
  elements.loanNote.value = state.notes.loan;
  elements.nextNote.value = state.notes.next;
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
  renderStepList();
  renderStepDetail();
  renderNotes();

  if (announce) {
    announceStep();
  }

  if (focusStep) {
    focusStepTitle();
  }
}

async function setActiveStep(stepId) {
  if (stepId === state.activeStepId) {
    focusStepTitle();
    return;
  }

  await flushState({ activeStepId: stepId });
  renderApp({ announce: true, focusStep: true });
}

async function goToNextStep() {
  const currentIndex = steps.findIndex((step) => step.id === state.activeStepId);
  if (currentIndex < 0 || currentIndex >= steps.length - 1) {
    return;
  }

  await setActiveStep(steps[currentIndex + 1].id);
}

async function updateChecklist(step, checkbox) {
  const itemText = step.checklist?.[Number(checkbox.dataset.checkIndex)];
  if (typeof itemText !== "string") {
    return;
  }

  const checkedItems = new Set(getCheckedItems(step.id));
  if (checkbox.checked) {
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

function updateNotes() {
  rememberNotes();
  schedulePersist();
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
  const lines = [
    "REFI CALL NOTES",
    `Current step: ${step.number}. ${step.title}`,
    "",
    `Borrower goal: ${state.notes.goal || "Not captured"}`,
    `Loan details: ${state.notes.loan || "Not captured"}`,
    `Objections / next step: ${state.notes.next || "Not captured"}`
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
    setCopyStatus("Notes copied to clipboard.");
  } catch {
    setCopyStatus("Could not copy notes.", "error");
  }
}

function armClearCall() {
  clearArmed = true;
  elements.newCall.textContent = "Clear this call?";
  elements.newCall.setAttribute("aria-pressed", "true");
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = setTimeout(disarmClearCall, CLEAR_CONFIRM_MS);
}

function disarmClearCall() {
  clearArmed = false;
  clearTimeout(clearConfirmTimer);
  clearConfirmTimer = null;
  elements.newCall.textContent = "New Call";
  elements.newCall.removeAttribute("aria-pressed");
}

async function resetCall() {
  if (!clearArmed) {
    armClearCall();
    return;
  }

  disarmClearCall();
  await flushState({
    ...structuredClone(defaultState),
    activeStepId: steps[0]?.id || ""
  });
  renderApp({ announce: true, focusStep: true });
}

async function selectRebuttal(rebuttalId) {
  await flushState({ selectedRebuttalId: rebuttalId });
  renderStepDetail();
  document.querySelector(`[data-rebuttal-id="${CSS.escape(rebuttalId)}"]`)?.focus();
}

function bindEvents() {
  elements.newCall.addEventListener("click", resetCall);
  elements.copyNotes.addEventListener("click", copyNotes);

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
    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      disarmClearCall();
      selectRebuttal(rebuttalButton.dataset.rebuttalId);
      return;
    }

    if (event.target.closest("[data-next-step]")) {
      disarmClearCall();
      goToNextStep();
    }
  });

  elements.stepDetail.addEventListener("change", (event) => {
    if (!event.target.matches("[data-check-index]")) {
      return;
    }

    updateChecklist(getActiveStep(), event.target);
  });

  document.addEventListener("click", (event) => {
    if (!clearArmed || event.target.closest("#new-call")) {
      return;
    }

    disarmClearCall();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && clearArmed) {
      disarmClearCall();
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
