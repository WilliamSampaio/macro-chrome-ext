const DEFAULTS = {
  delayMs: 200,
  loopCount: 1,
  macroSteps: []
};

const EXECUTION_DEFAULTS = {
  macroRunning: false,
  currentMacroStep: 0,
  macroLoopRemaining: 0,
  macroExecutionCount: 0
};

let lastContextMenuTarget = null;

window.addEventListener("contextmenu", (event) => {
  lastContextMenuTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
});

function visible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isXPath(selector) {
  const normalized = selector.trim();
  return (
    normalized.startsWith("/") ||
    normalized.startsWith(".//") ||
    normalized.startsWith("//") ||
    normalized.startsWith("(") ||
    normalized.toLowerCase().startsWith("xpath:")
  );
}

function evaluateXPath(selector) {
  const expression = selector.toLowerCase().startsWith("xpath:")
    ? selector.slice(6)
    : selector;

  const iterator = document.evaluate(
    expression,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  const nodes = [];
  for (let i = 0; i < iterator.snapshotLength; i += 1) {
    nodes.push(iterator.snapshotItem(i));
  }

  return nodes;
}

function findFirstVisible(selector) {
  const matches = isXPath(selector)
    ? evaluateXPath(selector)
    : [...document.querySelectorAll(selector)];

  return matches.find(visible) || null;
}

function cssPath(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const parts = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== "html") {
    let selector = current.tagName.toLowerCase();

    if (current.classList.length > 0) {
      selector += Array.from(current.classList)
        .map((className) => `.${CSS.escape(className)}`)
        .join("");
    }

    const siblingElements = Array.from(current.parentNode?.children || []).filter(
      (sibling) => sibling.tagName === current.tagName
    );

    if (siblingElements.length > 1) {
      const index = siblingElements.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    parts.unshift(selector);
    current = current.parentNode;
  }

  return parts.join(" > ");
}

function getXPath(element) {
  if (!(element instanceof Element)) {
    return "";
  }

  const segments = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
        index += 1;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = current.nodeName.toLowerCase();
    segments.unshift(`${tagName}[${index}]`);
    current = current.parentNode;
  }

  return `/${segments.join("/")}`;
}

function sendLog(message, status = "info", tabId = null) {
  try {
    chrome.runtime.sendMessage({ type: "MACRO_LOG", message, status, tabId });
  } catch (error) {
    // ignore if the popup is not open
  }
}

function describeElement(element) {
  if (!(element instanceof Element)) {
    return "element";
  }

  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = element.classList.length > 0 ? `.${Array.from(element.classList).join(".")}` : "";
  const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);

  return `${tag}${id}${classes}${text ? ` — ${text}` : ""}`;
}

function getElementIdentifier(element) {
  if (!(element instanceof Element)) {
    throw new Error("No element available to save for the macro.");
  }

  const selector = cssPath(element);
  const xpath = getXPath(element);

  return {
    type: "element",
    selector,
    xpath,
    description: describeElement(element)
  };
}

function findElementContainingText(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return null;
  }

  const nodes = Array.from(document.querySelectorAll("body *"));
  const match = nodes.find((element) => {
    if (!visible(element)) {
      return false;
    }

    const elementText = (element.innerText || element.textContent || "").trim().toLowerCase();
    return elementText.includes(normalizedText);
  });

  return match || null;
}

function findElementFromStep(step) {
  if (!step) {
    return null;
  }

  if (step.type === "text" && step.text) {
    return findElementContainingText(step.text);
  }

  if (step.selector) {
    try {
      const found = findFirstVisible(step.selector);
      if (found) {
        return found;
      }
    } catch {
      // Fall back to XPath below.
    }
  }

  if (step.xpath) {
    try {
      return findFirstVisible(step.xpath);
    } catch {
      return null;
    }
  }

  return null;
}

function selectRadio(radio) {
  if (!(radio instanceof HTMLInputElement) || radio.type !== "radio") {
    throw new Error("The macro step must match an input[type='radio'] element.");
  }

  radio.scrollIntoView({ block: "center", inline: "center" });
  radio.focus();
  radio.checked = true;
  radio.dispatchEvent(new Event("input", { bubbles: true }));
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

function interactWithElement(element) {
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus();

  if (element instanceof HTMLInputElement && element.type === "radio") {
    selectRadio(element);
    return;
  }

  element.click();
}

function normalizeExecutionState(state = {}) {
  return {
    macroRunning: Boolean(state.macroRunning),
    currentMacroStep: Number(state.currentMacroStep) || 0,
    macroLoopRemaining: Number(state.macroLoopRemaining) || 0,
    macroExecutionCount: Number(state.macroExecutionCount) || 0
  };
}

function tabExecutionStorageKey(tabId) {
  return `macroExecution:${tabId}`;
}

async function getCurrentTabId() {
  const response = await chrome.runtime.sendMessage({ type: "GET_TAB_ID" });

  if (!response?.ok || !Number.isFinite(Number(response.tabId))) {
    throw new Error(response?.error || "Could not determine the current tab.");
  }

  return Number(response.tabId);
}

async function setExecutionState(tabId, updates) {
  const key = tabExecutionStorageKey(tabId);
  const stored = await chrome.storage.local.get({ [key]: EXECUTION_DEFAULTS });
  const current = normalizeExecutionState(stored[key]);

  await chrome.storage.local.set({
    [key]: normalizeExecutionState({ ...current, ...updates })
  });
}

async function executeMacroSteps(settings, tabId, startIndex = 0) {
  if (!Array.isArray(settings.macroSteps) || settings.macroSteps.length === 0) {
    throw new Error("No saved macro steps found.");
  }

  for (let i = startIndex; i < settings.macroSteps.length; i += 1) {
    await setExecutionState(tabId, { macroRunning: true, currentMacroStep: i + 1 });

    const step = settings.macroSteps[i];
    const description = step.type === "text"
      ? `Text: "${step.text}"`
      : step.description || step.selector || step.xpath || "Saved element";

    try {
      const element = findElementFromStep(step);

      if (!element) {
        throw new Error(`Macro step ${i + 1} not found: ${description}`);
      }

      interactWithElement(element);
      sendLog(`Step ${i + 1} succeeded: ${description}`, "success", tabId);
    } catch (error) {
      sendLog(`Step ${i + 1} failed: ${description} — ${error.message}`, "error", tabId);
    }

    if (i < settings.macroSteps.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, settings.delayMs));
    }
  }

  await setExecutionState(tabId, { currentMacroStep: settings.macroSteps.length });
  // Reset currentMacroStep so a finished run is clearly at the beginning
  // This makes resume logic simpler: a completed run reports step 0.
  await setExecutionState(tabId, { currentMacroStep: 0 });

  return {
    executedSteps: settings.macroSteps.length
  };
}

async function runSingleMacro(settings, tabId) {
  await setExecutionState(tabId, {
    macroRunning: true,
    currentMacroStep: 0,
    macroLoopRemaining: 0
  });

  sendLog("Macro started.", "info", tabId);
  const result = await executeMacroSteps(settings, tabId, 0);
  sendLog("Macro finished.", "info", tabId);

  await setExecutionState(tabId, {
    macroRunning: false,
    currentMacroStep: 0,
    macroLoopRemaining: 0
  });

  return result;
}

async function runLoopMacro(settings, tabId, count) {
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Loop count must be at least 1.");
  }

  let executedRuns = 0;
  let remaining = count;
  let totalExecutions = settings.macroExecutionCount;

  await setExecutionState(tabId, {
    macroRunning: true,
    currentMacroStep: 0,
    macroLoopRemaining: remaining
  });

  sendLog(`Loop started: ${count} run(s)`, "info", tabId);

  while (remaining > 0) {
    // Re-read settings at the start of each run so any edits/updates
    // (like delayMs or macroSteps) are respected and we keep storage in sync.
    const currentSettings = await getSettings(tabId);

    remaining -= 1;
    currentSettings.macroLoopRemaining = remaining;
    currentSettings.macroExecutionCount = Number(currentSettings.macroExecutionCount || 0) + 1;
    totalExecutions = currentSettings.macroExecutionCount;

    await setExecutionState(tabId, {
      macroLoopRemaining: remaining,
      macroExecutionCount: currentSettings.macroExecutionCount,
      currentMacroStep: 0,
      macroRunning: true
    });

    sendLog(`Starting loop run ${executedRuns + 1} (${currentSettings.macroExecutionCount} total executions)`, "info", tabId);

    await executeMacroSteps(currentSettings, tabId, 0);
    executedRuns += 1;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, currentSettings.delayMs));
    }
  }

  sendLog(`Loop finished: ${executedRuns} run(s) completed.`, "info", tabId);

  await setExecutionState(tabId, {
    macroRunning: false,
    currentMacroStep: 0,
    macroLoopRemaining: 0
  });

  return {
    executedRuns,
    totalExecutions
  };
}

async function runStep(settings, stepIndex) {
  if (!Array.isArray(settings.macroSteps) || settings.macroSteps.length === 0) {
    throw new Error("No saved macro steps found.");
  }

  if (stepIndex < 0 || stepIndex >= settings.macroSteps.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }

  const step = settings.macroSteps[stepIndex];
  const element = findElementFromStep(step);

  if (!element) {
    throw new Error(`Step ${stepIndex + 1} not found: ${step.description || step.selector || step.xpath || step.text}`);
  }

  interactWithElement(element);

  return {
    executedStep: stepIndex + 1
  };
}

async function continueResumedMacro(settings, tabId) {
  await executeMacroSteps(settings, tabId, settings.currentMacroStep);

  const fresh = await getSettings(tabId);

  if (fresh.macroLoopRemaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, fresh.delayMs));
    await runLoopMacro(fresh, tabId, fresh.macroLoopRemaining);
    return;
  }

  sendLog("Macro finished.", "info", tabId);

  await setExecutionState(tabId, {
    macroRunning: false,
    currentMacroStep: 0,
    macroLoopRemaining: 0
  });
}

async function getSettings(tabId) {
  const executionKey = tabExecutionStorageKey(tabId);
  const stored = await chrome.storage.local.get({
    ...DEFAULTS,
    [executionKey]: EXECUTION_DEFAULTS
  });
  const execution = normalizeExecutionState(stored[executionKey]);

  return {
    ...DEFAULTS,
    ...stored,
    delayMs: Number(stored.delayMs) || DEFAULTS.delayMs,
    macroSteps: Array.isArray(stored.macroSteps) ? stored.macroSteps : [],
    ...execution
  };
}

async function resumeMacroIfNeeded() {
  const tabId = await getCurrentTabId();
  const settings = await getSettings(tabId);

  if (!settings.macroRunning) {
    return;
  }

  if (settings.currentMacroStep >= settings.macroSteps.length) {
    if (settings.macroLoopRemaining > 0) {
      // Ensure we read fresh settings from storage in case values changed
      await setExecutionState(tabId, { currentMacroStep: 0 });
      window.setTimeout(async () => {
        try {
          const fresh = await getSettings(tabId);
          await runLoopMacro(fresh, tabId, Number(fresh.macroLoopRemaining) || 0);
        } catch (error) {
          console.warn("[MacroTap]", error.message);
        }
      }, settings.delayMs);
      return;
    }

    await setExecutionState(tabId, { macroRunning: false, currentMacroStep: 0, macroLoopRemaining: 0 });
    return;
  }

  window.setTimeout(() => {
    continueResumedMacro(settings, tabId).catch((error) => {
      console.warn("[MacroTap]", error.message);
    });
  }, settings.delayMs);
}

async function getMessageTabId(message) {
  if (Number.isFinite(Number(message?.tabId))) {
    return Number(message.tabId);
  }

  return getCurrentTabId();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAVE_MACRO_ELEMENT") {
    try {
      const identifier = getElementIdentifier(lastContextMenuTarget);
      sendResponse({ ok: true, step: identifier });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }

  if (message?.type === "RUN_MACRO") {
    getMessageTabId(message)
      .then((tabId) => getSettings(tabId).then((settings) => ({ settings, tabId })))
      .then(({ settings, tabId }) => {
        if (settings.macroRunning) {
          sendResponse({ ok: false, error: "A macro is already running." });
          return null;
        }

        sendResponse({ ok: true, result: { started: true } });
        runSingleMacro(settings, tabId).catch((error) => {
          console.warn("[MacroTap] Macro run failed:", error.message);
        });
        return null;
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "RUN_MACRO_LOOP") {
    getMessageTabId(message)
      .then((tabId) => getSettings(tabId).then((settings) => ({ settings, tabId })))
      .then(({ settings, tabId }) => {
        if (settings.macroRunning) {
          sendResponse({ ok: false, error: "A macro is already running." });
          return null;
        }

        sendResponse({ ok: true, result: { started: true } });
        runLoopMacro(settings, tabId, Number(message.loopCount) || 0).catch((error) => {
          console.warn("[MacroTap] Loop macro failed:", error.message);
        });
        return null;
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "RUN_MACRO_STEP") {
    getMessageTabId(message)
      .then((tabId) => getSettings(tabId))
      .then((settings) => runStep(settings, message.stepIndex))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  return false;
});

resumeMacroIfNeeded().catch((error) => {
  console.warn("[MacroTap] Could not resume macro:", error.message);
});
