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
  status: document.querySelector("#status"),
  executionCount: document.querySelector("#executionCount"),
  macroList: document.querySelector("#macroList"),
  macroLog: document.querySelector("#macroLog")
};

function setStatus(message, type = "") {
  fields.status.textContent = message;
  fields.status.className = type;
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
  fields.executionCount.textContent = `Total executions: ${settings.macroExecutionCount || 0}`;
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
    const stored = await chrome.storage.sync.get(DEFAULTS);
    const macroSteps = Array.isArray(stored.macroSteps) ? stored.macroSteps : [];

    if (stepIndex < 0 || stepIndex >= macroSteps.length) {
      throw new Error(`Invalid step index: ${stepIndex}`);
    }

    macroSteps.splice(stepIndex, 1);
    await chrome.storage.sync.set({ macroSteps });
    renderMacroSteps(macroSteps);
    setStatus(`Step ${stepIndex + 1} removed.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function runStep(stepIndex) {
  setStatus(`Running step ${stepIndex + 1}...`);

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

    setStatus(`Step ${stepIndex + 1} executed successfully.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function saveSettings() {
  const settings = readForm();
  await chrome.storage.sync.set(settings);
  setStatus("Settings saved.", "success");
  return settings;
}

async function runLoop() {
  fields.runLoop.disabled = true;
  setStatus("Starting loop...");
  clearLog();

  try {
    const settings = readForm();
    await chrome.storage.sync.set(settings);
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
      setStatus("Loop started.", "success");
      return;
    }

    setStatus(`Loop completed: ${response.result?.executedRuns || 0} run(s). Total executions: ${response.result?.totalExecutions || 0}`, "success");
    fields.executionCount.textContent = `Total executions: ${response.result?.totalExecutions || 0}`;
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    fields.runLoop.disabled = false;
  }
}

async function clearMacroSteps() {
  await chrome.storage.sync.set({ macroSteps: [] });
  renderMacroSteps([]);
  setStatus("Saved macro steps cleared.", "success");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runMacro() {
  fields.run.disabled = true;
  setStatus("Running macro...");
  clearLog();

  try {
    const settings = readForm();
    await chrome.storage.sync.set(settings);
    const tab = await getActiveTab();

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "RUN_MACRO" });

    if (!response?.ok) {
      throw new Error(response?.error || "The page did not respond.");
    }

    if (response.result?.started) {
      setStatus("Macro started.", "success");
      return;
    }

    setStatus(`Macro completed: ${response.result?.executedSteps || 0} step(s).`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    fields.run.disabled = false;
  }
}

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  writeForm(settings);
  renderMacroSteps(settings.macroSteps);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MACRO_LOG") {
      appendLogEntry(message.message, message.status);
      return false;
    }

    if (message?.type === "MACRO_EXECUTION_COUNT") {
      fields.executionCount.textContent = `Total executions: ${message.count}`;
      return false;
    }

    return false;
  });

  fields.save.addEventListener("click", () => {
    saveSettings().catch((error) => setStatus(error.message, "error"));
  });

  fields.run.addEventListener("click", runMacro);
  fields.runLoop.addEventListener("click", () => {
    runLoop().catch((error) => setStatus(error.message, "error"));
  });
  fields.clear.addEventListener("click", () => {
    clearMacroSteps().catch((error) => setStatus(error.message, "error"));
  });
}

init().catch((error) => setStatus(error.message, "error"));
