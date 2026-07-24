"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const skills = ["chengfeng-cut-talking-head", "chengfeng-finish-talking-head", "chengfeng-report-videocut-bug", "chengfeng-check-videocut-updates"];
for (const name of skills) {
  const text = fs.readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
  assert.match(text, new RegExp(`^name: ${name}$`, "m"), `${name} must match its directory and frontmatter`);
  assert.match(name, /^chengfeng-/, `${name} must use the public chengfeng- prefix`);
  assert.doesNotMatch(text, /\$SKILL_DIR|SKILL_DIR=/, `${name} must not require an injected SKILL_DIR`);
  assert.match(text, /codex plugin list --json/, `${name} must resolve the enabled plugin via Codex`);
  assert.match(text, /x\.enabled && x\.name === "chengfeng-videocut" && x\.source && x\.source\.path/, `${name} must select one enabled source.path`);
  assert.match(text, /test -n "\$PLUGIN_ROOT" && test -f "\$PLUGIN_ROOT\/\.codex-plugin\/plugin\.json"/, `${name} must validate the resolved root`);
}
assert.deepEqual(fs.readdirSync(path.join(root, "skills")).sort(), skills.slice().sort(), "only the four prefixed public skills may be discovered");
console.log(JSON.stringify({ fourSkills: true, prefixedPublicSkillIds: true, skillDirAssumptionRemoved: true, explicitPluginRootContract: true }));
