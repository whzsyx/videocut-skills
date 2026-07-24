"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const skills = ["cut-talking-head", "finish-talking-head", "report-videocut-bug", "check-videocut-updates"];
for (const name of skills) {
  const text = fs.readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
  assert.doesNotMatch(text, /\$SKILL_DIR|SKILL_DIR=/, `${name} must not require an injected SKILL_DIR`);
  assert.match(text, /codex plugin list --json/, `${name} must resolve the enabled plugin via Codex`);
  assert.match(text, /x\.enabled && x\.name === "chengfeng-videocut" && x\.source && x\.source\.path/, `${name} must select one enabled source.path`);
  assert.match(text, /test -n "\$PLUGIN_ROOT" && test -f "\$PLUGIN_ROOT\/\.codex-plugin\/plugin\.json"/, `${name} must validate the resolved root`);
}
console.log(JSON.stringify({ fourSkills: true, skillDirAssumptionRemoved: true, explicitPluginRootContract: true }));
