function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "SAVE_MACRO_ELEMENT",
            title: "Save element for macro",
            contexts: ["page", "link", "image", "video", "audio"]
        });

        chrome.contextMenus.create({
            id: "SAVE_MACRO_ELEMENT_AND_EXECUTE_STEP",
            title: "Save element for macro and execute step",
            contexts: ["page", "link", "image", "video", "audio"]
        });

        chrome.contextMenus.create({
            id: "SAVE_MACRO_TEXT",
            title: "Save selected text for macro",
            contexts: ["selection"]
        });
    });
}

function saveMacroStep(step) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({ macroSteps: [] }, (data) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            const macroSteps = Array.isArray(data.macroSteps) ? data.macroSteps : [];
            const updatedSteps = [...macroSteps, step];

            chrome.storage.local.set({ macroSteps: updatedSteps }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                resolve(updatedSteps);
            });
        });
    });
}

function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (!response?.ok) {
                reject(new Error(response?.error || "The page did not respond."));
                return;
            }

            resolve(response);
        });
    });
}

async function saveElementForMacro(tab) {
    if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
        throw new Error("content script is not available on this page.");
    }

    const response = await sendTabMessage(tab.id, { type: "SAVE_MACRO_ELEMENT" });
    const updatedSteps = await saveMacroStep(response.step);

    return {
        step: response.step,
        stepIndex: updatedSteps.length - 1
    };
}

async function saveElementForMacroAndExecuteStep(tab) {
    const saved = await saveElementForMacro(tab);
    await sendTabMessage(tab.id, {
        type: "RUN_MACRO_STEP",
        stepIndex: saved.stepIndex,
        tabId: tab.id
    });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);
createContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) {
        return;
    }

    if (info.menuItemId === "SAVE_MACRO_ELEMENT") {
        saveElementForMacro(tab).catch((error) => {
            console.warn("[MacroTap] Could not save element:", error.message, tab.url);
        });

        return;
    }

    if (info.menuItemId === "SAVE_MACRO_ELEMENT_AND_EXECUTE_STEP") {
        saveElementForMacroAndExecuteStep(tab).catch((error) => {
            console.warn("[MacroTap] Could not save element and execute step:", error.message, tab.url);
        });

        return;
    }

    if (info.menuItemId === "SAVE_MACRO_TEXT") {
        const text = info.selectionText?.trim();

        if (!text) {
            console.warn("[MacroTap] Could not save selected text: no selection text available.");
            return;
        }

        saveMacroStep({
            type: "text",
            text,
            description: `Text: ${text.length > 60 ? `${text.slice(0, 57)}...` : text}`
        }).catch((error) => {
            console.warn("[MacroTap] Could not save selected text:", error.message);
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "GET_TAB_ID") {
        return false;
    }

    if (!sender.tab?.id) {
        sendResponse({ ok: false, error: "No sender tab found." });
        return true;
    }

    sendResponse({ ok: true, tabId: sender.tab.id });
    return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(`macroExecution:${tabId}`);
});
