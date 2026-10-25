const defaultState = {
  activeStepId: "",
  checkedItems: {},
  selectedRebuttalId: "",
  notes: {
    goal: "",
    loan: "",
    next: ""
  },
  timerRunning: false,
  timerStartedAt: null,
  elapsedBeforeStart: 0
};

const elements = {
  timer: document.querySelector("#timer"),
  timerToggle: document.querySelector("#timer-toggle"),
  newCall: document.querySelector("#new-call"),
  copyNotes: document.querySelector("#copy-notes"),
  copyStatus: document.querySelector("#copy-status"),
  stepList: document.querySelector("#step-list"),
  stepDetail: document.querySelector("#step-detail"),
  goalNote: document.querySelector("#goal-note"),
  loanNote: document.querySelector("#loan-note"),
  nextNote: document.querySelector("#next-note")
};

let steps = [];
let state = structuredClone(defaultState);
let timerInterval = null;

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

function saveState(partialState = {}) {
  state = { ...state, ...partialState };

  if (globalThis.chrome?.storage?.local) {
    return chrome.storage.local.set(state);
  }

  localStorage.setItem("refi-companion-state", JSON.stringify(state));
  return Promise.resolve();
}

function getElapsedSeconds() {
  if (!state.timerRunning || !state.timerStartedAt) {
    return state.elapsedBeforeStart;
  }

  return state.elapsedBeforeStart + Math.floor((Date.now() - state.timerStartedAt) / 1000);
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderTimer() {
  elements.timer.textContent = formatTime(getElapsedSeconds());
  elements.timerToggle.textContent = state.timerRunning ? "Pause" : "Start";
}

function startTimerLoop() {
  clearInterval(timerInterval);
  timerInterval = setInterval(renderTimer, 1000);
}

async function toggleTimer() {
  if (state.timerRunning) {
    await saveState({
      timerRunning: false,
      timerStartedAt: null,
      elapsedBeforeStart: getElapsedSeconds()
    });
  } else {
    await saveState({
      timerRunning: true,
      timerStartedAt: Date.now()
    });
  }

  renderTimer();
}

function getActiveStep() {
  return steps.find((step) => step.id === state.activeStepId) || steps[0];
}

function getCheckedItems(stepId) {
  return state.checkedItems[stepId] || [];
}

function isStepComplete(step) {
  if (!step.checklist?.length) {
    return false;
  }

  return getCheckedItems(step.id).length === step.checklist.length;
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
          data-step-id="${step.id}"
          ${isActive ? 'aria-current="step"' : ""}
        >
          <span class="step-number">${step.number}</span>
          <span>
            <strong>${step.title}</strong><br />
            <small>${step.subtitle}</small>
          </span>
          <span class="complete-mark" aria-label="${complete ? "Complete" : "Incomplete"}">
            ${complete ? "Done" : ""}
          </span>
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
    <ul class="checklist" aria-label="${step.title} checklist">
      ${step.checklist
        .map(
          (item, index) => `
            <li>
              <label>
                <input
                  type="checkbox"
                  data-check-index="${index}"
                  ${checkedItems.includes(index) ? "checked" : ""}
                />
                ${item}
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
      ${step.prompts.map((prompt) => `<li>${prompt}</li>`).join("")}
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
    <div class="chip-row" aria-label="Common objections">
      ${step.rebuttals
        .map(
          (rebuttal) => `
            <button class="chip" type="button" data-rebuttal-id="${rebuttal.id}">
              ${rebuttal.label}
            </button>
          `
        )
        .join("")}
    </div>
    <article class="script-card">
      <h3>${selected.label}</h3>
      <p>${selected.response}</p>
      <strong>Follow-up:</strong>
      <p>${selected.followUp}</p>
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
              <h3>${option.title}</h3>
              <p>${option.description}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStepDetail() {
  const step = getActiveStep();

  elements.stepDetail.innerHTML = `
    <p class="step-kicker">Step ${step.number}</p>
    <h3>${step.title}</h3>
    <p>${step.goal}</p>
    ${
      step.script
        ? `<article class="script-card"><strong>Talk track</strong><p>${step.script}</p></article>`
        : ""
    }
    ${renderChecklist(step)}
    ${renderPrompts(step)}
    ${renderRebuttals(step)}
    ${renderOptions(step)}
    <button class="next-button" type="button" data-next-step>Next Step</button>
  `;
}

function renderNotes() {
  elements.goalNote.value = state.notes.goal;
  elements.loanNote.value = state.notes.loan;
  elements.nextNote.value = state.notes.next;
}

function renderApp() {
  renderTimer();
  renderStepList();
  renderStepDetail();
  renderNotes();
}

async function setActiveStep(stepId) {
  await saveState({ activeStepId: stepId });
  renderApp();
}

async function goToNextStep() {
  const currentIndex = steps.findIndex((step) => step.id === state.activeStepId);
  const nextStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
  await setActiveStep(nextStep.id);
}

async function updateChecklist(step, checkbox) {
  const checkedItems = new Set(getCheckedItems(step.id));
  const itemIndex = Number(checkbox.dataset.checkIndex);

  if (checkbox.checked) {
    checkedItems.add(itemIndex);
  } else {
    checkedItems.delete(itemIndex);
  }

  await saveState({
    checkedItems: {
      ...state.checkedItems,
      [step.id]: [...checkedItems].sort()
    }
  });

  renderStepList();
}

async function updateNotes() {
  await saveState({
    notes: {
      goal: elements.goalNote.value,
      loan: elements.loanNote.value,
      next: elements.nextNote.value
    }
  });
}

function buildCrmNote() {
  const step = getActiveStep();

  return [
    "REFI CALL NOTES",
    `Current step: ${step.number}. ${step.title}`,
    `Call duration: ${formatTime(getElapsedSeconds())}`,
    "",
    `Borrower goal: ${state.notes.goal || "Not captured"}`,
    `Loan details: ${state.notes.loan || "Not captured"}`,
    `Objections / next step: ${state.notes.next || "Not captured"}`
  ].join("\n");
}

async function copyNotes() {
  await updateNotes();
  await navigator.clipboard.writeText(buildCrmNote());

  elements.copyStatus.textContent = "Notes copied to clipboard.";
  setTimeout(() => {
    elements.copyStatus.textContent = "";
  }, 2400);
}

async function resetCall() {
  await saveState({
    ...structuredClone(defaultState),
    activeStepId: steps[0]?.id || ""
  });
  renderApp();
}

function bindEvents() {
  elements.timerToggle.addEventListener("click", toggleTimer);
  elements.newCall.addEventListener("click", resetCall);
  elements.copyNotes.addEventListener("click", copyNotes);

  [elements.goalNote, elements.loanNote, elements.nextNote].forEach((textarea) => {
    textarea.addEventListener("input", updateNotes);
  });

  elements.stepList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step-id]");
    if (!button) {
      return;
    }

    setActiveStep(button.dataset.stepId);
  });

  elements.stepDetail.addEventListener("click", (event) => {
    const rebuttalButton = event.target.closest("[data-rebuttal-id]");
    if (rebuttalButton) {
      saveState({ selectedRebuttalId: rebuttalButton.dataset.rebuttalId }).then(renderStepDetail);
      return;
    }

    if (event.target.closest("[data-next-step]")) {
      goToNextStep();
    }
  });

  elements.stepDetail.addEventListener("change", (event) => {
    if (!event.target.matches("[data-check-index]")) {
      return;
    }

    updateChecklist(getActiveStep(), event.target);
  });
}

async function init() {
  steps = await loadSteps();
  const storedState = await getStoredState();
  state = {
    ...defaultState,
    ...storedState,
    activeStepId: storedState.activeStepId || steps[0]?.id || ""
  };

  bindEvents();
  renderApp();
  startTimerLoop();
}

init().catch((error) => {
  elements.stepDetail.innerHTML = `
    <h3>Unable to load script</h3>
    <p>${error.message}</p>
  `;
});
