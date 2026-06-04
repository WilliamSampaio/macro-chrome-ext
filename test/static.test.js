const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.resolve(__dirname, "..");

function readProjectFile(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(readProjectFile(filePath));
}

test("manifest uses the MacroTap brand and Manifest V3", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "MacroTap");
  assert.equal(manifest.action.default_title, "MacroTap");
  assert.match(manifest.description, /macro steps/i);
});

test("manifest keeps permissions narrow for the current feature set", () => {
  const manifest = readJson("manifest.json");

  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "contextMenus", "storage"].sort());
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
});

test("context menu can save an element and execute only the saved step", () => {
  const background = readProjectFile("src/background.js");

  assert.match(background, /SAVE_MACRO_ELEMENT_AND_EXECUTE_STEP/);
  assert.match(background, /Save element for macro and execute step/);
  assert.match(background, /type:\s*"RUN_MACRO_STEP"/);
  assert.match(background, /stepIndex:\s*saved\.stepIndex/);
});

test("extension sources avoid dynamic code execution and remote script loading", () => {
  const files = [
    "src/background.js",
    "src/content.js",
    "popup/popup.js",
    "popup/popup.html"
  ];

  for (const file of files) {
    const source = readProjectFile(file);

    assert.doesNotMatch(source, /\beval\s*\(/, `${file} should not use eval`);
    assert.doesNotMatch(source, /\bnew\s+Function\s*\(/, `${file} should not use Function constructor`);
    assert.doesNotMatch(source, /<script[^>]+src=["']https?:\/\//i, `${file} should not load remote scripts`);
  }
});

test("popup renders saved step labels with textContent instead of HTML injection", () => {
  const popup = readProjectFile("popup/popup.js");

  assert.match(popup, /labelElement\.textContent/);
  assert.match(popup, /item\.textContent/);
  assert.doesNotMatch(popup, /insertAdjacentHTML/);
});
