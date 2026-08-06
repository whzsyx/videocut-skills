"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inventoryDigest } = require("./plugin-inventory.cjs");

if (process.platform !== "win32") {
  console.log(JSON.stringify({ windowsPnpmShim: "skipped_non_windows" }));
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const checker = path.join(root, "scripts", "check-plugin-update.cjs");
const pluginVersion = require(path.join(root, "package.json")).version;
const tmp = fs.realpathSync.native(
  fs.mkdtempSync(path.join(os.tmpdir(), "videocut plugin shim ")),
);
const shimDir = path.join(tmp, "pnpm-bin");
const driver = path.join(tmp, "fake-codex.cjs");
const gitDriver = path.join(tmp, "fake-git.cjs");
const unixShim = path.join(shimDir, "codex");
const cmdShim = path.join(shimDir, "codex.cmd");
const gitShim = path.join(shimDir, "git.cmd");
const receipt = path.join(tmp, "cmd-shim-ran.jsonl");
const userHome = path.join(tmp, "user-home");
const userMarketplace = path.join(
  userHome,
  ".tmp",
  "marketplaces",
  "test",
);
const userCache = path.join(
  userHome,
  "plugins",
  "cache",
  "test",
  "chengfeng-videocut",
  "0.10.5",
);
const candidateTemplate = path.join(tmp, "candidate-template");
const oldSnapshot = "1".repeat(40);
const candidateSnapshot = "2".repeat(40);
const contentRevision = "3".repeat(40);
const officialSource =
  "https://github.com/Agentchengfeng/chengfeng-videocut-skills.git";

function writeBundle(directory, version, payload) {
  fs.mkdirSync(path.join(directory, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "chengfeng-videocut", version }),
  );
  fs.writeFileSync(path.join(directory, "payload.txt"), payload);
}

function writeMetadata(directory, refName, revision) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source: officialSource,
      ref_name: refName,
      sparse_paths: [],
      revision,
    }),
  );
}

function invoke(codexBin) {
  const env = {
    ...process.env,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH || ""}`,
    PATHEXT: ".CMD;.EXE;.BAT;.COM",
    CODEX_HOME: userHome,
    GIT_BIN: gitShim,
    FAKE_CODEX_RECEIPT: receipt,
    FAKE_USER_HOME: userHome,
    FAKE_CANDIDATE: candidateTemplate,
  };
  if (codexBin === null) delete env.CODEX_BIN;
  else env.CODEX_BIN = codexBin;
  return spawnSync(
    process.execPath,
    [checker, "--marketplace", "test", "--json"],
    { encoding: "utf8", env },
  );
}

function assertSuccessfulStage(result, label) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    JSON.parse(result.stdout).status,
    "update_available_confirmation_required",
  );
  const calls = fs
    .readFileSync(receipt, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      [
        "plugin",
        "marketplace",
        "add",
        "Agentchengfeng/chengfeng-videocut-skills",
        "--ref",
        "stable",
        "--json",
      ],
      ["plugin", "marketplace", "upgrade", "test", "--json"],
      [
        "plugin",
        "list",
        "--marketplace",
        "test",
        "--available",
        "--json",
      ],
    ],
    label,
  );
  assert.equal(
    calls.some((call) => path.resolve(call.home) === path.resolve(userHome)),
    false,
    `${label} must never invoke Codex against the user home`,
  );
}

try {
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(
    unixShim,
    "#!/usr/bin/env node\nprocess.exit(91);\n",
  );
  writeBundle(userCache, "0.10.5", "legacy-installed");
  writeMetadata(userMarketplace, oldSnapshot, oldSnapshot);
  writeBundle(
    path.join(
      userMarketplace,
      "plugins",
      "chengfeng-videocut",
    ),
    "0.10.5",
    "legacy-installed",
  );
  writeBundle(candidateTemplate, pluginVersion, "candidate");
  const candidateDigest = inventoryDigest(candidateTemplate);
  fs.writeFileSync(
    path.join(
      candidateTemplate,
      ".codex-plugin",
      "update-provenance.json",
    ),
    JSON.stringify({
      name: "chengfeng-videocut",
      version: pluginVersion,
      immutableRef: contentRevision,
      publisherChecksum: candidateDigest,
    }),
  );

  fs.writeFileSync(driver, `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const home = path.resolve(process.env.CODEX_HOME);
const userHome = path.resolve(process.env.FAKE_USER_HOME);
const candidateTemplate = process.env.FAKE_CANDIDATE;
const receipt = process.env.FAKE_CODEX_RECEIPT;
const marketplace = "test";
const plugin = "chengfeng-videocut";
const officialSource = "${officialSource}";
const snapshot = "${candidateSnapshot}";
const marketRoot = path.join(home, ".tmp", "marketplaces", marketplace);
const candidatePath = path.join(marketRoot, "plugins", plugin);
fs.appendFileSync(receipt, JSON.stringify({ home, args }) + "\\n");
if (home === userHome) process.exit(93);
if (args.slice(0, 3).join(" ") === "plugin marketplace add") {
  fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
  fs.cpSync(candidateTemplate, candidatePath, { recursive: true });
  console.log(JSON.stringify({
    marketplaceName: marketplace,
    installedRoot: marketRoot,
    alreadyAdded: false,
  }));
  process.exit(0);
}
if (args.join(" ") === "plugin marketplace upgrade test --json") {
  fs.writeFileSync(
    path.join(marketRoot, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source: officialSource,
      ref_name: "stable",
      sparse_paths: [],
      revision: snapshot,
    }),
  );
  console.log(JSON.stringify({
    selectedMarketplaces: [marketplace],
    upgradedRoots: [marketRoot],
    errors: [],
  }));
  process.exit(0);
}
if (args.slice(0, 2).join(" ") === "plugin list") {
  console.log(JSON.stringify({
    installed: [],
    available: [{
      pluginId: plugin + "@" + marketplace,
      name: plugin,
      marketplaceName: marketplace,
      version: "${pluginVersion}",
      installed: false,
      source: { source: "local", path: candidatePath },
      marketplaceSource: {
        sourceType: "git",
        source: officialSource,
      },
    }],
  }));
  process.exit(0);
}
process.exit(92);
`, "utf8");
  fs.writeFileSync(
    cmdShim,
    `@echo off\r\n"${process.execPath}" "${driver}" %*\r\n`,
    "utf8",
  );
  fs.writeFileSync(gitDriver, `"use strict";
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] !== "-C" || !args[1]) process.exit(70);
const root = path.resolve(args[1]);
const command = args.slice(2);
const userMarketplace = path.join(
  path.resolve(process.env.FAKE_USER_HOME),
  ".tmp",
  "marketplaces",
  "test",
);
if (command.join(" ") === "rev-parse --show-toplevel") {
  console.log(root);
  process.exit(0);
}
if (command.join(" ") === "remote get-url origin") {
  console.log("${officialSource}");
  process.exit(0);
}
if (command.join(" ") === "rev-parse HEAD^{commit}") {
  console.log(
    root === userMarketplace
      ? "${oldSnapshot}"
      : "${candidateSnapshot}",
  );
  process.exit(0);
}
if (command[0] === "cat-file" && command[1] === "-e") process.exit(0);
if (command[0] === "merge-base" && command[1] === "--is-ancestor") process.exit(0);
if (command[0] === "status") process.exit(0);
if (command[0] === "diff" && command[1] === "--quiet") process.exit(0);
process.exit(71);
`, "utf8");
  fs.writeFileSync(
    gitShim,
    `@echo off\r\n"${process.execPath}" "${gitDriver}" %*\r\n`,
    "utf8",
  );

  let result = invoke(null);
  assertSuccessfulStage(result, "PATH resolution must prefer codex.cmd");

  fs.rmSync(receipt, { force: true });
  result = invoke(cmdShim);
  assertSuccessfulStage(result, "explicit codex.cmd must be wrapped safely");

  console.log(JSON.stringify({
    windowsPnpmShimPreferred: true,
    explicitCmdShimWrapped: true,
    userHomeCodexCalls: 0,
  }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
