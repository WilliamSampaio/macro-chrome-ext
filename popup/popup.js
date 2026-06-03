const DEFAULTS = {
  delayMs: 200,
  loopCount: 1,
  macroSteps: [],
  macroExecutionCount: 0
};

const fields = {
  delayMs: document.querySelector("#delayMs"),
  loopCount: document.querySelector("#loopCount"),
  save: document.querySelector("#save"),
  run: document.querySelector("#run"),
  runLoop: document.querySelector("#runLoop"),
  clear: document.querySelector("#clear"),
  delayStatus: document.querySelector("#delayStatus"),
  actionStatus: document.querySelector("#actionStatus"),
  macroList: document.querySelector("#macroList"),
  macroLog: document.querySelector("#macroLog")
};

function setDelayStatus(message, type = "") {
  fields.delayStatus.textContent = message;
  fields.delayStatus.className = `status ${type}`.trim();
}

function setActionStatus(message, type = "") {
  fields.actionStatus.textContent = message;
  fields.actionStatus.className = `status ${type}`.trim();
}

function readForm() {
  return {
    delayMs: Math.max(0, Number(fields.delayMs.value) || DEFAULTS.delayMs),
    loopCount: Math.max(1, Number(fields.loopCount.value) || DEFAULTS.loopCount)
  };
}

function writeForm(settings) {
  fields.delayMs.value = settings.delayMs;
  fields.loopCount.value = settings.loopCount;
}

function appendLogEntry(text, status = "info") {
  const item = document.createElement("li");
  item.textContent = text;
  if (status === "error") {
    item.style.color = "#a91d2a";
  } else if (status === "success") {
    item.style.color = "#17633a";
  }
  fields.macroLog.appendChild(item);
  fields.macroLog.scrollTop = fields.macroLog.scrollHeight;
}

function clearLog() {
  fields.macroLog.innerHTML = "";
}

function renderMacroSteps(steps) {
  fields.macroList.innerHTML = "";

  if (!Array.isArray(steps) || steps.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No saved macro steps.";
    fields.macroList.appendChild(item);
    return;
  }

  steps.forEach((step, index) => {
    const item = document.createElement("li");
    const label = step.type === "text"
      ? `Text: "${step.text.length > 60 ? `${step.text.slice(0, 57)}...` : step.text}"`
      : step.description || step.selector || step.xpath || "Saved element";

    const labelElement = document.createElement("span");
    labelElement.className = "step-label";
    labelElement.textContent = `${index + 1}. ${label}`;

    const buttons = document.createElement("span");
    buttons.className = "step-buttons";

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.className = "step-button";
    runButton.textContent = "Run";
    runButton.addEventListener("click", () => {
      runStep(index);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "step-remove-button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removeStep(index);
    });

    buttons.appendChild(runButton);
    buttons.appendChild(removeButton);
    item.appendChild(labelElement);
    item.appendChild(buttons);
    fields.macroList.appendChild(item);
  });
}

async function removeStep(stepIndex) {
  try {
    const stored = await chrome.storage.local.get(DEFAULTS);
    const macroSteps = Array.isArray(stored.macroSteps) ? stored.macroSteps : [];

    if (stepIndex < 0 || stepIndex >= macroSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    macroSteps.splice(stepIndex, 1);
    await chrome.storage.local.set({ macroSteps });
    renderMacroSteps(macroSteps);
    setActionStatus(`Step ${stepIndex + 1} removed.`, "success");
  } catch (error) {
    setActionStatus(error.message, "error");
  }
}

async function runStep(stepIndex) {
  setActionStatus(`Running step ${stepIndex + 1}...`);

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_MACRO_STEP",
      stepIndex
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The page did not respond.");
    }

    setActionStatus(`Step ${stepIndex + 1} executed successfully.`, "success");
  } catch (error) {
    setActionStatus(error.message, "error");
  }
}

async function saveSettings() {
  const settings = readForm();
  await chrome.storage.local.set(settings);
  setDelayStatus("Delay saved.", "success");
  return settings;
}

async function runLoop() {
  fields.runLoop.disabled = true;
  setActionStatus("Starting loop...");
  clearLog();

  try {
    const settings = readForm();
    await chrome.storage.local.set(settings);
    const tab = await getActiveTab();

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_MACRO_LOOP",
      loopCount: settings.loopCount
    });

    if (!response?.ok) {
      throw new Error(response?.error || "The page did not respond.");
    }

    if (response.result?.started) {
      setActionStatus("Loop started.", "success");
      return;
    }

    setActionStatus(`Loop completed: ${response.result?.executedRuns || 0} run(s).`, "success");
  } catch (error) {
    setActionStatus(error.message, "error");
  } finally {
    fields.runLoop.disabled = false;
  }
}

async function clearMacroSteps() {
  await chrome.storage.local.set({ macroSteps: [] });
  renderMacroSteps([]);
  setActionStatus("Saved macro steps cleared.", "success");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runMacro() {
  fields.run.disabled = true;
  setActionStatus("Running macro...");
  clearLog();

  try {
    const settings = readForm();
    await chrome.storage.local.set(settings);
    const tab = await getActiveTab();

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "RUN_MACRO" });

    if (!response?.ok) {
      throw new Error(response?.error || "The page did not respond.");
    }

    if (response.result?.started) {
      setActionStatus("Macro started.", "success");
      return;
    }

    setActionStatus(`Macro completed: ${response.result?.executedSteps || 0} step(s).`, "success");
  } catch (error) {
    setActionStatus(error.message, "error");
  } finally {
    fields.run.disabled = false;
  }
}

async function init() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  writeForm(settings);
  renderMacroSteps(settings.macroSteps);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MACRO_LOG") {
      appendLogEntry(message.message, message.status);
      return false;
    }

    return false;
  });

  fields.save.addEventListener("click", () => {
    saveSettings().catch((error) => setDelayStatus(error.message, "error"));
  });

  fields.run.addEventListener("click", runMacro);
  fields.runLoop.addEventListener("click", () => {
    runLoop().catch((error) => setActionStatus(error.message, "error"));
  });
  fields.clear.addEventListener("click", () => {
    clearMacroSteps().catch((error) => setActionStatus(error.message, "error"));
  });
}

init().catch((error) => setActionStatus(error.message, "error"));
