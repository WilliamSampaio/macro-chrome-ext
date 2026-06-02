# Radio Selector Clicker

A small Manifest V3 Chrome extension that selects a radio input and clicks a button on the current page.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `/home/william/Documentos/dev/ext`.

## Use

1. Open the page you want to automate.
2. Right-click an element and choose **Save element for macro**.
3. Save one or more elements in the order you want them to run.
4. Click the extension icon.
5. Set the delay between actions and click **Run macro**.

Example saved step identifiers are generated automatically and stored in order.

The popup displays all saved steps and lets you clear the list.

## Files

- `manifest.json`: Chrome extension manifest.
- `src/content.js`: Runs on pages and performs the radio selection and button click.
- `popup/popup.html`: Popup UI.
- `popup/popup.css`: Popup styles.
- `popup/popup.js`: Saves settings and triggers the content script.
