function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "SAVE_MACRO_ELEMENT",
            title: "Save element for macro",
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
    chrome.storage.local.get({ macroSteps: [] }, (data) => {
        const macroSteps = Array.isArray(data.macroSteps) ? data.macroSteps : [];
        chrome.storage.local.set({ macroSteps: [...macroSteps, step] });
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
        if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
            console.warn("[Macro Clicker] Could not save element: content script is not available on this page.");
            return;
        }

        chrome.tabs.sendMessage(tab.id, { type: "SAVE_MACRO_ELEMENT" }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(
                    "[Macro Clicker] Could not save element: content script is missing or unavailable in the target tab.",
                    chrome.runtime.lastError.message,
                    tab.url
                );
                return;
            }

            if (!response?.ok) {
                console.warn("[Macro Clicker] Could not save element:", response?.error);
                return;
            }

            saveMacroStep(response.step);
        });

        return;
    }

    if (info.menuItemId === "SAVE_MACRO_TEXT") {
        const text = info.selectionText?.trim();

        if (!text) {
            console.warn("[Macro Clicker] Could not save selected text: no selection text available.");
            return;
        }

        saveMacroStep({
            type: "text",
            text,
            description: `Text: ${text.length > 60 ? `${text.slice(0, 57)}...` : text}`
        });
    }
});
