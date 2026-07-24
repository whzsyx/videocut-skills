"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ensureRunning = path.join(root, "scripts", "ensure-running.cjs");
const cutSkill = fs.readFileSync(path.join(root, "skills", "cut-talking-head", "SKILL.md"), "utf8");
const finishSkill = fs.readFileSync(path.join(root, "skills", "finish-talking-head", "SKILL.md"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-ensure-running-test-"));

function writeExecutable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function run(binary) {
  return spawnSync(process.execPath, [ensureRunning, "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHENGFENG_VIDEOCUT_BIN: binary,
      CHENGFENG_VIDEOCUT_DIR: "",
      PATH: "",
    },
  });
}

try {
  const argsFile = path.join(tmp, "args.txt");
  const readyBin = path.join(tmp, "ready", "chengfeng-videocut");
  writeExecutable(readyBin, `#!/bin/sh
printf '%s\n' "$*" > "${argsFile}"
printf '%s\n' '{"schemaVersion":1,"product":"chengfeng-videocut","command":"service.ensure","ok":true,"data":{"serviceApiVersion":1,"action":"ensure","state":"running","ready":true,"healthy":true,"configured":true,"runtimeMode":"launchd","productVersion":"0.2.0","studioBuildId":"build-123","pid":1234,"url":"http://127.0.0.1:5190/","identity":{"product":"chengfeng-videocut","productVersion":"0.2.0","pid":1234,"runtimeMode":"launchd","studioBuildId":"build-123"}}}'
`);
  const ready = run(readyBin);
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(JSON.parse(ready.stdout).data.healthy, true);
  assert.equal(fs.readFileSync(argsFile, "utf8").trim(), "service ensure --json");

  const foregroundBin = path.join(tmp, "foreground", "chengfeng-videocut");
  writeExecutable(foregroundBin, `#!/bin/sh
printf '%s\n' '{"schemaVersion":1,"product":"chengfeng-videocut","command":"service.ensure","ok":true,"data":{"serviceApiVersion":1,"action":"ensure","state":"running","ready":true,"healthy":true,"configured":true,"runtimeMode":"foreground","productVersion":"0.2.0","studioBuildId":"build-4321","pid":4321,"url":"http://127.0.0.1:5190/","identity":{"product":"chengfeng-videocut","productVersion":"0.2.0","pid":4321,"runtimeMode":"foreground","studioBuildId":"build-4321"}}}'
`);
  const foreground = run(foregroundBin);
  assert.equal(foreground.status, 21);
  assert.equal(JSON.parse(foreground.stdout).error.code, "service_identity_mismatch");

  const conflictBin = path.join(tmp, "conflict", "chengfeng-videocut");
  writeExecutable(conflictBin, `#!/bin/sh
printf '%s\n' '{"schemaVersion":1,"product":"chengfeng-videocut","command":"service.ensure","ok":false,"error":{"code":"service_port_conflict","message":"port conflict"}}'
exit 6
`);
  const conflict = run(conflictBin);
  assert.equal(conflict.status, 6);
  assert.equal(JSON.parse(conflict.stdout).error.code, "service_port_conflict");

  const forgedBin = path.join(tmp, "forged", "chengfeng-videocut");
  writeExecutable(forgedBin, `#!/bin/sh
printf '%s\n' '{"schemaVersion":1,"product":"another-product","command":"service.ensure","ok":true,"data":{"serviceApiVersion":1,"action":"ensure","state":"running","ready":true,"healthy":true,"configured":true,"runtimeMode":"launchd","productVersion":"0.2.0","studioBuildId":"build-123","pid":1234,"url":"http://127.0.0.1:5190/","identity":{"product":"chengfeng-videocut","productVersion":"0.2.0","pid":1234,"runtimeMode":"launchd","studioBuildId":"build-123"}}}'
`);
  const forged = run(forgedBin);
  assert.equal(forged.status, 21);
  assert.equal(JSON.parse(forged.stdout).error.code, "service_identity_mismatch");

  const malformedBin = path.join(tmp, "malformed", "chengfeng-videocut");
  writeExecutable(malformedBin, "#!/bin/sh\nprintf '%s\\n' 'not-json'\nexit 0\n");
  const malformed = run(malformedBin);
  assert.equal(malformed.status, 20);
  assert.equal(JSON.parse(malformed.stdout).error.code, "service_ensure_failed");

  const missing = run(path.join(tmp, "missing", "chengfeng-videocut"));
  assert.equal(missing.status, 10);
  assert.equal(JSON.parse(missing.stdout).error.code, "runtime_missing");

  const script = fs.readFileSync(ensureRunning, "utf8");
  assert.doesNotMatch(script, /launchctl|nohup/);

  const cutCreate = cutSkill.indexOf('node "$VC" project create');
  const cutEnsure = cutSkill.indexOf('node "$RUNNING" --json');
  const firstCutsApi = cutSkill.indexOf('node "$VC" cuts get');
  assert.ok(cutCreate >= 0 && cutCreate < cutEnsure && cutEnsure < firstCutsApi);
  const cutReview = cutSkill.indexOf("## 3. 到人工审核时才打开 Studio");
  const cutReviewEnsure = cutSkill.indexOf('node "$RUNNING" --json', cutReview);
  const cutReviewOpen = cutSkill.indexOf('node "$VC" open "$jobDir" --json', cutReview);
  assert.ok(cutReview < cutReviewEnsure && cutReviewEnsure < cutReviewOpen);
  assert.match(cutSkill, /审核完成后：[\s\S]*node "\$RUNNING" --json/);
  assert.doesNotMatch(cutSkill, /node "\$VC" start|nohup|launchctl/);

  const runtimeEnsure = finishSkill.indexOf('node "$ENSURE" --install-if-missing --json');
  const serviceEnsure = finishSkill.indexOf('node "$RUNNING" --json');
  const firstWorkflowApi = finishSkill.indexOf('node "$VC" workflow get');
  assert.ok(runtimeEnsure >= 0 && runtimeEnsure < serviceEnsure && serviceEnsure < firstWorkflowApi);
  const firstReview = finishSkill.indexOf("首次进入 storyboard");
  const firstReviewEnsure = finishSkill.indexOf('node "$RUNNING" --json', firstReview);
  const firstReviewOpen = finishSkill.indexOf('node "$VC" open "$jobDir" --json', firstReview);
  const firstReviewGate = finishSkill.indexOf('node "$STUDIO" --url "$productUrl"', firstReview);
  assert.ok(firstReview < firstReviewEnsure && firstReviewEnsure < firstReviewOpen && firstReviewOpen < firstReviewGate);
  for (const action of [
    "continue_finish_storyboard",
    "continue_finish_animation",
    "continue_finish_timeline",
    "return_finish_storyboard",
    "return_finish_animation",
    "return_finish_timeline",
  ]) {
    let actionPosition = -1;
    let guardedByRealCommand = false;
    while ((actionPosition = finishSkill.indexOf(`action=${action}`, actionPosition + 1)) >= 0) {
      const ensurePosition = finishSkill.indexOf('node "$RUNNING" --json', actionPosition);
      if (ensurePosition > actionPosition && ensurePosition - actionPosition < 500) {
        guardedByRealCommand = true;
        break;
      }
    }
    assert.ok(guardedByRealCommand, `${action} must execute the real ensure-running command before resuming`);
  }
  assert.doesNotMatch(finishSkill, /node "\$VC" start|nohup|launchctl/);

  console.log(JSON.stringify({ ready: true, foregroundRejected: true, conflictForwarded: true, malformedFailedClosed: true, missing: true, skillOrdering: true }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
