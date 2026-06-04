# MacroTap

MacroTap is a lightweight Manifest V3 Chrome extension for saving visible page elements as macro steps and replaying them later. It is useful for repeated clicks, radio selections, simple page workflows, and looped browser interactions that do not need a full automation framework.

## Features

- Save a page element from the right-click context menu.
- Save an element and immediately execute that newly saved step.
- Save selected text as a macro target.
- Run one saved step from the popup.
- Run the full macro sequence with a configurable delay between actions.
- Run the macro sequence in a loop.
- Keep a small run log in the popup while it is open.
- Resume in-progress macro execution after page navigation when possible.

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder: `/home/william/Documentos/dev/ext`.
5. Pin MacroTap from the extensions menu if you want quick access to the popup.

Reload the extension from `chrome://extensions` after changing source files.

## Use

1. Open the page you want to automate.
2. Right-click the target element.
3. Choose one of the MacroTap context menu actions:
   - `Save element for macro`
   - `Save element for macro and execute step`
   - `Save selected text for macro` when text is selected
4. Open the MacroTap popup.
5. Set `Delay between actions, ms` and save it.
6. Set `Loop count` if you want repeated runs.
7. Use `Run` on an individual step, `Run macro` for the full sequence, or `Run loop` for repeated full-sequence execution.

## How Matching Works

MacroTap stores element identifiers generated from the element you right-clicked:

- A CSS selector when one can be built.
- An XPath fallback.
- A short human-readable description for the popup.

For text steps, MacroTap searches visible page elements whose text contains the saved selected text.

If a page changes its markup, a saved step may stop matching. Remove the stale step and save the element again.

## Permissions

MacroTap uses these Chrome extension permissions:

- `contextMenus`: adds right-click actions for saving macro steps.
- `storage`: stores saved steps, delay, loop count, and per-tab execution state locally.
- `activeTab`: lets the popup address the current tab.
- `<all_urls>` host access: allows the content script to run on pages where you may want to save and replay steps.

MacroTap does not request network permissions, does not call external services, and does not load remote scripts.

## Security Notes

The current security review checks:

- Manifest V3 is used.
- No `eval` or `new Function` usage.
- No remote script loading.
- Popup step labels are rendered with `textContent`, not injected HTML.
- Stored macro steps remain in `chrome.storage.local`.
- Runtime messages are handled by the extension's own scripts.

Important operating limits:

- MacroTap clicks and changes elements on pages where it is enabled, so only use it on pages you trust.
- Saved selectors and selected text can reflect page content. Treat exported browser profiles or extension storage as potentially sensitive.
- `<all_urls>` is intentionally broad because MacroTap is a general page automation tool. If you only need specific sites, narrow `host_permissions` and `content_scripts.matches` in `manifest.json`.

## Development

Run syntax and manifest checks:

```sh
npm run check
```

Run the static test suite:

```sh
npm test
```

The tests use Node's built-in `node:test` runner and require no installed dependencies.

## Project Structure

- `manifest.json`: Chrome extension manifest and permissions.
- `src/background.js`: context menu setup, step persistence, tab messaging, and cleanup.
- `src/content.js`: element detection, macro execution, loop execution, and resume logic.
- `popup/popup.html`: popup markup.
- `popup/popup.css`: popup styles.
- `popup/popup.js`: popup state, controls, logging, and user-triggered execution.
- `test/static.test.js`: static tests for branding, manifest shape, context menu behavior, and security-sensitive patterns.

## Troubleshooting

If a context menu action does nothing:

- Confirm the page URL is `http` or `https`.
- Reload the target page after reloading the extension.
- Check the extension service worker console in `chrome://extensions`.

If a saved step cannot be found:

- The page layout or text may have changed.
- Remove the stale step and save it again.
- Prefer clicking stable elements with IDs or consistent labels.

If a loop appears to stop after navigation:

- Wait for the page to finish loading.
- Confirm the saved next step exists on the new page.
- Increase the delay if the target page renders slowly.
