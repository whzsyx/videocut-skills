"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inventoryDigest } = require("./plugin-inventory.cjs");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "check-plugin-update.cjs");
const windowsResolverTest = path.join(
  root,
  "scripts",
  "check-plugin-update-windows-shim.test.cjs",
);
const pluginVersion = require(path.join(root, "package.json")).version;
const oldVersion = "0.10.5";
const oldSnapshot = "1111111111111111111111111111111111111111";
const candidateSnapshot = "2222222222222222222222222222222222222222";
const movedSnapshot = "4444444444444444444444444444444444444444";
const contentRevision = "3333333333333333333333333333333333333333";
const officialSource =
  "https://github.com/Agentchengfeng/chengfeng-videocut-skills.git";
const temporaryRoot = fs.realpathSync.native(
  fs.mkdtempSync(
    path.join(os.tmpdir(), "videocut-plugin-update-test-"),
  ),
);
const fakeCodexDriver = path.join(temporaryRoot, "codex-driver.cjs");
const fakeCodex = path.join(
  temporaryRoot,
  process.platform === "win32" ? "codex.cmd" : "codex",
);
const fakeGitDriver = path.join(temporaryRoot, "git-driver.cjs");
const fakeGit = path.join(
  temporaryRoot,
  process.platform === "win32" ? "git.cmd" : "git",
);
const callsPath = path.join(temporaryRoot, "calls.jsonl");
const temporaryHomesPath = path.join(
  temporaryRoot,
  "temporary-homes.txt",
);
const fakeStatePath = path.join(temporaryRoot, "fake-state.json");
const candidateTemplate = path.join(
  temporaryRoot,
  "candidate-template",
);
const oldTemplate = path.join(temporaryRoot, "old-template");
const userHome = path.join(temporaryRoot, "user-codex-home");
const cleanupExternal = path.join(temporaryRoot, "cleanup-external");
const userMarketplace = path.join(
  userHome,
  ".tmp",
  "marketplaces",
  "test",
);
const userCacheBase = path.join(
  userHome,
  "plugins",
  "cache",
  "test",
  "chengfeng-videocut",
);

function makeBundle(directory, version, payload) {
  fs.mkdirSync(path.join(directory, ".codex-plugin"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(directory, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "chengfeng-videocut", version }),
  );
  fs.writeFileSync(path.join(directory, "payload.txt"), payload);
}

function sealBundle(directory, version) {
  const digest = inventoryDigest(directory);
  fs.writeFileSync(
    path.join(
      directory,
      ".codex-plugin",
      "update-provenance.json",
    ),
    JSON.stringify({
      name: "chengfeng-videocut",
      version,
      immutableRef: contentRevision,
      publisherChecksum: digest,
    }),
  );
  return digest;
}

makeBundle(candidateTemplate, pluginVersion, "candidate");
const candidateDigest = sealBundle(candidateTemplate, pluginVersion);
makeBundle(oldTemplate, oldVersion, "legacy-installed");
const oldDigest = inventoryDigest(oldTemplate);
const higherTemplate = path.join(temporaryRoot, "higher-template");
const higherVersion = pluginVersion.replace(
  /(\d+)$/,
  (_, patch) => String(Number(patch) + 1),
);
makeBundle(higherTemplate, higherVersion, "higher-installed");
sealBundle(higherTemplate, higherVersion);
const equivalentTemplate = path.join(
  temporaryRoot,
  "equivalent-template",
);
const equivalentVersion = `${pluginVersion}+shadow`;
makeBundle(
  equivalentTemplate,
  equivalentVersion,
  "equivalent-installed",
);
sealBundle(equivalentTemplate, equivalentVersion);

fs.writeFileSync(
  fakeCodexDriver,
  `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const home = path.resolve(process.env.CODEX_HOME);
const userHome = path.resolve(process.env.FAKE_USER_CODEX_HOME);
const isolated = home !== userHome;
const callsPath = process.env.FAKE_CALLS;
const temporaryHomesPath = process.env.FAKE_TEMP_HOMES;
const statePath = process.env.FAKE_STATE;
const candidateTemplate = process.env.FAKE_CANDIDATE;
const oldTemplate = process.env.FAKE_OLD;
const cleanupExternal = process.env.FAKE_CLEANUP_EXTERNAL;
const marketplace = "test";
const plugin = "chengfeng-videocut";
const officialSource = "${officialSource}";
const candidateSnapshot = process.env.FAKE_STAGE_SNAPSHOT || "${candidateSnapshot}";
const oldSnapshot = "${oldSnapshot}";
const movedSnapshot = "${movedSnapshot}";
const pluginVersion = "${pluginVersion}";
const oldVersion = "${oldVersion}";
const marketRoot = (codexHome) =>
  path.join(codexHome, ".tmp", "marketplaces", marketplace);
const cacheBase = path.join(userHome, "plugins", "cache", marketplace, plugin);
const log = () =>
  fs.appendFileSync(
    callsPath,
    JSON.stringify({ scope: isolated ? "isolated" : "user", home, args }) + "\\n",
  );
const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
};
const writeState = (state) =>
  fs.writeFileSync(statePath, JSON.stringify(state));
const copy = (source, destination) => {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
};
const metadata = (root, refName, revision, source = officialSource) => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source,
      ref_name: refName,
      sparse_paths: [],
      revision,
    }),
  );
};
const installCache = (source, version) => {
  fs.rmSync(cacheBase, { recursive: true, force: true });
  copy(source, path.join(cacheBase, version));
};
const upgradeJson = (root) => ({
  selectedMarketplaces: [marketplace],
  upgradedRoots: [root],
  errors: [],
});

log();

if (
  args[0] === "plugin"
  && args[1] === "marketplace"
  && args[2] === "add"
) {
  const refIndex = args.indexOf("--ref");
  const refName = refIndex >= 0 ? args[refIndex + 1] : null;
  const root = marketRoot(home);
  if (isolated) {
    fs.appendFileSync(temporaryHomesPath, home + "\\n");
    if (
      args[3] !== "Agentchengfeng/chengfeng-videocut-skills"
      || refName !== "stable"
    ) {
      process.exit(81);
    }
    if (process.env.FAKE_STAGE_ADD_FAIL) process.exit(9);
    copy(
      candidateTemplate,
      path.join(root, "plugins", plugin),
    );
    if (process.env.FAKE_CANDIDATE_TAMPER) {
      fs.writeFileSync(
        path.join(root, "plugins", plugin, "payload.txt"),
        "tampered",
      );
    }
    metadata(
      root,
      "stable",
      candidateSnapshot,
      process.env.FAKE_STAGE_FOREIGN_SOURCE
        ? "https://github.com/example/foreign.git"
        : officialSource,
    );
    console.log(
      JSON.stringify({
        marketplaceName: marketplace,
        installedRoot: root,
        alreadyAdded: false,
      }),
    );
    process.exit(0);
  }

  const state = readState();
  const isTarget = refName === candidateSnapshot;
  const isRollback = refName === oldSnapshot;
  if (!isTarget && !isRollback) process.exit(82);
  metadata(root, refName, refName);
  writeState({ ...state, configuredRef: refName });
  if (isTarget && process.env.FAKE_TARGET_ADD_FAIL) process.exit(9);
  if (isRollback && process.env.FAKE_ROLLBACK_ADD_FAIL) process.exit(9);
  console.log(
    JSON.stringify({
      marketplaceName: marketplace,
      installedRoot: root,
      alreadyAdded: false,
    }),
  );
  process.exit(0);
}

if (
  args[0] === "plugin"
  && args[1] === "marketplace"
  && args[2] === "remove"
) {
  if (isolated) process.exit(83);
  const state = readState();
  const removeCount = (state.removeCount || 0) + 1;
  writeState({ ...state, removeCount });
  const root = marketRoot(home);
  if (removeCount === 1 && process.env.FAKE_REMOVE_NO_CHANGE_FAIL) {
    process.stderr.write("Access is denied. (os error 5)");
    process.exit(9);
  }
  if (removeCount === 1 && process.env.FAKE_REMOVE_PARTIAL_FAIL) {
    fs.rmSync(root, { recursive: true, force: true });
    process.exit(9);
  }
  if (removeCount > 1 && process.env.FAKE_ROLLBACK_REMOVE_FAIL) {
    process.exit(9);
  }
  const existed = fs.existsSync(root);
  fs.rmSync(root, { recursive: true, force: true });
  if (!existed) process.exit(9);
  console.log(
    JSON.stringify({
      marketplaceName: marketplace,
      installedRoot: root,
    }),
  );
  process.exit(0);
}

if (
  args[0] === "plugin"
  && args[1] === "marketplace"
  && args[2] === "upgrade"
) {
  const root = marketRoot(home);
  if (isolated) {
    if (process.env.FAKE_STAGE_UPGRADE_FAIL) process.exit(9);
    if (process.env.FAKE_STAGE_SCHEMA_INVALID) {
      console.log("{}");
      process.exit(0);
    }
    console.log(JSON.stringify(upgradeJson(root)));
    process.exit(0);
  }

  let installedMetadata;
  try {
    installedMetadata = JSON.parse(
      fs.readFileSync(
        path.join(root, ".codex-marketplace-install.json"),
        "utf8",
      ),
    );
  } catch {
    process.exit(9);
  }
  if (installedMetadata.ref_name === candidateSnapshot) {
    if (process.env.FAKE_CACHE_LOCK) {
      if (process.env.FAKE_ROLLBACK_FAIL) {
        installCache(candidateTemplate, pluginVersion);
      }
      process.stderr.write(
        "failed to back up plugin cache entry: Access is denied. (os error 5)",
      );
      process.exit(9);
    }
    installCache(candidateTemplate, pluginVersion);
    if (process.env.FAKE_ACTIVATION_TAMPER) {
      fs.writeFileSync(
        path.join(cacheBase, pluginVersion, "payload.txt"),
        "tampered-after-activation",
      );
    }
    console.log(JSON.stringify(upgradeJson(root)));
    process.exit(0);
  }
  if (installedMetadata.ref_name === oldSnapshot) {
    if (process.env.FAKE_ROLLBACK_FAIL) process.exit(9);
    installCache(oldTemplate, oldVersion);
    console.log(JSON.stringify(upgradeJson(root)));
    process.exit(0);
  }
  process.exit(9);
}

if (args[0] === "plugin" && args[1] === "list") {
  if (!isolated) process.exit(84);
  const root = marketRoot(home);
  const sourcePath = process.env.FAKE_MIXED_SOURCE_PATH
    ? candidateTemplate
    : path.join(root, "plugins", plugin);
  const row = {
    pluginId: plugin + "@" + marketplace,
    name: plugin,
    marketplaceName: marketplace,
    version: process.env.FAKE_MIXED_ROW_VERSION
      ? "${oldVersion}"
      : pluginVersion,
    installed: false,
    enabled: false,
    source: { source: "local", path: sourcePath },
    marketplaceSource: {
      sourceType: "git",
      source: officialSource,
    },
    installPolicy: "available",
    authPolicy: "on-install",
  };
  if (process.env.FAKE_CLEANUP_SYMLINK) {
    fs.rmSync(cleanupExternal, { recursive: true, force: true });
    fs.cpSync(home, cleanupExternal, { recursive: true });
    fs.rmSync(home, { recursive: true, force: true });
    try {
      fs.symlinkSync(
        cleanupExternal,
        home,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      process.stderr.write("cleanup symlink fixture failed: " + error.message);
      process.exit(85);
    }
  }
  if (process.env.FAKE_CONCURRENT_USER_CHANGE) {
    metadata(marketRoot(userHome), movedSnapshot, movedSnapshot);
  }
  const installed = process.env.FAKE_STAGE_INSTALLED
    ? [{
        pluginId: plugin + "@" + marketplace,
        name: plugin,
        marketplaceName: marketplace,
        version: oldVersion,
        installed: true,
      }]
    : [];
  console.log(JSON.stringify({ installed, available: [row] }));
  process.exit(0);
}

process.exit(7);
`,
  "utf8",
);
if (process.platform === "win32") {
  fs.writeFileSync(
    fakeCodex,
    `@echo off\r\n"${process.execPath}" "${fakeCodexDriver}" %*\r\n`,
    "utf8",
  );
} else {
  fs.writeFileSync(
    fakeCodex,
    `#!/bin/sh\nexec "${process.execPath}" "${fakeCodexDriver}" "$@"\n`,
    { mode: 0o755 },
  );
}
fs.writeFileSync(fakeGitDriver, `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] !== "-C" || !args[1]) process.exit(70);
const root = path.resolve(args[1]);
const command = args.slice(2);
const userMarketplace = path.join(
  path.resolve(process.env.FAKE_USER_CODEX_HOME),
  ".tmp",
  "marketplaces",
  "test",
);
let snapshot = process.env.FAKE_STAGE_SNAPSHOT || "${candidateSnapshot}";
if (root === userMarketplace) {
  snapshot = JSON.parse(
    fs.readFileSync(
      path.join(root, ".codex-marketplace-install.json"),
      "utf8",
    ),
  ).revision;
}
if (command.join(" ") === "rev-parse --show-toplevel") {
  console.log(root);
  process.exit(0);
}
if (command.join(" ") === "remote get-url origin") {
  console.log(
    process.env.FAKE_GIT_FOREIGN_ORIGIN && root !== userMarketplace
      ? "https://github.com/example/foreign.git"
      : "${officialSource}",
  );
  process.exit(0);
}
if (command.join(" ") === "rev-parse HEAD^{commit}") {
  console.log(
    process.env.FAKE_GIT_HEAD_MISMATCH && root !== userMarketplace
      ? "${oldSnapshot}"
      : snapshot,
  );
  process.exit(0);
}
if (command[0] === "cat-file" && command[1] === "-e") {
  process.exit(process.env.FAKE_GIT_CONTENT_MISSING ? 1 : 0);
}
if (command[0] === "merge-base" && command[1] === "--is-ancestor") {
  process.exit(process.env.FAKE_GIT_CONTENT_NOT_ANCESTOR ? 1 : 0);
}
if (command[0] === "status") {
  if (process.env.FAKE_GIT_DIRTY && root !== userMarketplace) {
    process.stdout.write(" M plugins/chengfeng-videocut/payload.txt\\n");
  }
  process.exit(0);
}
if (command[0] === "diff" && command[1] === "--quiet") {
  process.exit(process.env.FAKE_GIT_TREE_MISMATCH ? 1 : 0);
}
process.exit(71);
`, "utf8");
if (process.platform === "win32") {
  fs.writeFileSync(
    fakeGit,
    `@echo off\r\n"${process.execPath}" "${fakeGitDriver}" %*\r\n`,
    "utf8",
  );
} else {
  fs.writeFileSync(
    fakeGit,
    `#!/bin/sh\nexec "${process.execPath}" "${fakeGitDriver}" "$@"\n`,
    { mode: 0o755 },
  );
}

function writeMetadata(
  rootPath,
  refName,
  revision,
  source = officialSource,
) {
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(
    path.join(rootPath, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source,
      ref_name: refName,
      sparse_paths: [],
      revision,
    }),
  );
}

function resetUser({ current = false, unsafeRef, foreign = false } = {}) {
  fs.rmSync(userHome, { recursive: true, force: true });
  fs.mkdirSync(userHome, { recursive: true });
  fs.rmSync(callsPath, { force: true });
  fs.rmSync(temporaryHomesPath, { force: true });
  fs.rmSync(fakeStatePath, { force: true });
  fs.rmSync(cleanupExternal, { recursive: true, force: true });
  if (current) {
    writeMetadata(
      userMarketplace,
      candidateSnapshot,
      candidateSnapshot,
    );
    fs.cpSync(
      candidateTemplate,
      path.join(userCacheBase, pluginVersion),
      { recursive: true },
    );
    fs.cpSync(
      candidateTemplate,
      path.join(
        userMarketplace,
        "plugins",
        "chengfeng-videocut",
      ),
      { recursive: true },
    );
    return;
  }
  writeMetadata(
    userMarketplace,
    unsafeRef || oldSnapshot,
    oldSnapshot,
    foreign ? "https://github.com/example/foreign.git" : officialSource,
  );
  fs.cpSync(
    oldTemplate,
    path.join(
      userMarketplace,
      "plugins",
      "chengfeng-videocut",
    ),
    { recursive: true },
  );
  fs.cpSync(oldTemplate, path.join(userCacheBase, oldVersion), {
    recursive: true,
  });
}

function invoke(args, extra = {}) {
  return spawnSync(
    process.execPath,
    [script, "--marketplace", "test", ...args, "--json"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_BIN: fakeCodex,
        GIT_BIN: fakeGit,
        CODEX_HOME: userHome,
        FAKE_USER_CODEX_HOME: userHome,
        FAKE_CALLS: callsPath,
        FAKE_TEMP_HOMES: temporaryHomesPath,
        FAKE_STATE: fakeStatePath,
        FAKE_CANDIDATE: candidateTemplate,
        FAKE_OLD: oldTemplate,
        FAKE_CLEANUP_EXTERNAL: cleanupExternal,
        ...extra,
      },
    },
  );
}

function invokeInstalled(args, extra = {}) {
  const installedRoot = path.join(userCacheBase, oldVersion);
  const installedScripts = path.join(installedRoot, "scripts");
  const marketplaceScripts = path.join(
    userMarketplace,
    "plugins",
    "chengfeng-videocut",
    "scripts",
  );
  fs.mkdirSync(installedScripts, { recursive: true });
  fs.mkdirSync(marketplaceScripts, { recursive: true });
  fs.copyFileSync(
    script,
    path.join(installedScripts, "check-plugin-update.cjs"),
  );
  fs.copyFileSync(
    script,
    path.join(marketplaceScripts, "check-plugin-update.cjs"),
  );
  fs.copyFileSync(
    path.join(root, "scripts", "plugin-inventory.cjs"),
    path.join(installedScripts, "plugin-inventory.cjs"),
  );
  fs.copyFileSync(
    path.join(root, "scripts", "plugin-inventory.cjs"),
    path.join(marketplaceScripts, "plugin-inventory.cjs"),
  );
  return spawnSync(
    process.execPath,
    [
      path.join(installedScripts, "check-plugin-update.cjs"),
      "--marketplace",
      "test",
      ...args,
      "--json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_BIN: fakeCodex,
        GIT_BIN: fakeGit,
        CODEX_HOME: userHome,
        FAKE_USER_CODEX_HOME: userHome,
        FAKE_CALLS: callsPath,
        FAKE_TEMP_HOMES: temporaryHomesPath,
        FAKE_STATE: fakeStatePath,
        FAKE_CANDIDATE: candidateTemplate,
        FAKE_OLD: oldTemplate,
        FAKE_CLEANUP_EXTERNAL: cleanupExternal,
        ...extra,
      },
    },
  );
}

function invokeInstalledCurrent(args, extra = {}) {
  const installedRoot = path.join(userCacheBase, pluginVersion);
  const marketplaceRoot = path.join(
    userMarketplace,
    "plugins",
    "chengfeng-videocut",
  );
  for (const bundleRoot of [installedRoot, marketplaceRoot]) {
    const scripts = path.join(bundleRoot, "scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.copyFileSync(
      script,
      path.join(scripts, "check-plugin-update.cjs"),
    );
    fs.copyFileSync(
      path.join(root, "scripts", "plugin-inventory.cjs"),
      path.join(scripts, "plugin-inventory.cjs"),
    );
    const provenancePath = path.join(
      bundleRoot,
      ".codex-plugin",
      "update-provenance.json",
    );
    const provenance = JSON.parse(
      fs.readFileSync(provenancePath, "utf8"),
    );
    provenance.publisherChecksum = inventoryDigest(bundleRoot);
    fs.writeFileSync(
      provenancePath,
      JSON.stringify(provenance),
    );
  }
  return spawnSync(
    process.execPath,
    [
      path.join(
        installedRoot,
        "scripts",
        "check-plugin-update.cjs",
      ),
      "--marketplace",
      "test",
      ...args,
      "--json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_BIN: fakeCodex,
        GIT_BIN: fakeGit,
        CODEX_HOME: userHome,
        FAKE_USER_CODEX_HOME: userHome,
        FAKE_CALLS: callsPath,
        FAKE_TEMP_HOMES: temporaryHomesPath,
        FAKE_STATE: fakeStatePath,
        FAKE_CANDIDATE: candidateTemplate,
        FAKE_OLD: oldTemplate,
        FAKE_CLEANUP_EXTERNAL: cleanupExternal,
        ...extra,
      },
    },
  );
}

function output(result) {
  assert.ok(
    result.stdout,
    `expected JSON stdout; stderr=${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

function calls() {
  if (!fs.existsSync(callsPath)) return [];
  return fs
    .readFileSync(callsPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

function userCalls() {
  return calls().filter((call) => call.scope === "user");
}

function isolatedCalls() {
  return calls().filter((call) => call.scope === "isolated");
}

function assertNoUserCli(label) {
  assert.deepEqual(
    userCalls(),
    [],
    `${label} must make zero Codex CLI calls in the user CODEX_HOME`,
  );
}

function assertStageSequence(label) {
  assert.deepEqual(
    isolatedCalls().map((call) => call.args),
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
      [
        "plugin",
        "marketplace",
        "upgrade",
        "test",
        "--json",
      ],
      [
        "plugin",
        "list",
        "--marketplace",
        "test",
        "--available",
        "--json",
      ],
    ],
    `${label} must use the isolated add-upgrade-list sequence`,
  );
}

function assertTemporaryHomesRemoved(label) {
  if (!fs.existsSync(temporaryHomesPath)) return;
  const homes = fs
    .readFileSync(temporaryHomesPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const home of new Set(homes)) {
    assert.equal(
      fs.existsSync(home),
      false,
      `${label} leaked temporary CODEX_HOME ${home}`,
    );
  }
}

function activeCacheDigest() {
  const versions = fs.readdirSync(userCacheBase);
  assert.equal(versions.length, 1);
  return inventoryDigest(path.join(userCacheBase, versions[0]));
}

const activationArgs = [
  "--activate",
  "--confirmed",
  "--expected-version",
  pluginVersion,
  "--expected-snapshot-revision",
  candidateSnapshot,
  "--expected-content-revision",
  contentRevision,
  "--expected-sha256",
  candidateDigest,
];

try {
  resetUser();
  let result = invoke(["--inspect"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const inspect = output(result);
  assert.equal(inspect.status, "inspected_no_refresh");
  assert.equal(inspect.legacyInstalledIdentity, true);
  assert.equal(inspect.userCodexCliCalls, 0);
  assertNoUserCli("inspect");
  assert.equal(isolatedCalls().length, 0);

  resetUser();
  fs.writeFileSync(
    path.join(
      userMarketplace,
      "plugins",
      "chengfeng-videocut",
      "payload.txt",
    ),
    "legacy source differs from installed cache",
  );
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("legacy source/cache mismatch");

  resetUser();
  result = invokeInstalled(["--inspect"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(output(result).status, "inspected_no_refresh");
  assertNoUserCli("installed cache context");

  resetUser();
  result = invokeInstalled(["--inspect"], {
    CODEX_HOME: path.join(temporaryRoot, "different-user-home"),
  });
  assert.equal(output(result).status, "installed_context_mismatch");
  assertNoUserCli("installed CODEX_HOME mismatch");

  resetUser();
  result = invokeInstalled([
    "--marketplace",
    "other",
    "--inspect",
  ]);
  assert.equal(output(result).status, "installed_context_mismatch");
  assertNoUserCli("installed marketplace mismatch");

  resetUser({ current: true });
  fs.cpSync(
    oldTemplate,
    path.join(userCacheBase, oldVersion),
    { recursive: true },
  );
  result = invokeInstalledCurrent(["--inspect"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(output(result).status, "inspected_no_refresh");
  assert.equal(output(result).installed.version, pluginVersion);
  assertNoUserCli("old cache residue with current active version");

  resetUser();
  result = invoke([]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const checked = output(result);
  assert.equal(
    checked.status,
    "update_available_confirmation_required",
  );
  assert.equal(checked.legacyInstalledIdentity, true);
  assert.equal(
    checked.candidate.snapshotRevision,
    candidateSnapshot,
  );
  assert.equal(
    checked.candidate.contentRevision,
    contentRevision,
  );
  assert.equal(
    checked.candidate.publisherChecksum,
    candidateDigest,
  );
  assertNoUserCli("check");
  assertStageSequence("check");
  assertTemporaryHomesRemoved("check");
  assert.equal(activeCacheDigest(), oldDigest);

  resetUser({ current: true });
  result = invoke([]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(output(result).status, "current");
  assertNoUserCli("current");
  assertStageSequence("current");
  assertTemporaryHomesRemoved("current");

  resetUser({ current: true });
  fs.cpSync(
    equivalentTemplate,
    path.join(userCacheBase, equivalentVersion),
    { recursive: true },
  );
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("equivalent highest semver precedence");

  resetUser({ current: true });
  fs.cpSync(
    higherTemplate,
    path.join(userCacheBase, higherVersion),
    { recursive: true },
  );
  fs.rmSync(
    path.join(
      userMarketplace,
      "plugins",
      "chengfeng-videocut",
    ),
    { recursive: true, force: true },
  );
  fs.cpSync(
    higherTemplate,
    path.join(
      userMarketplace,
      "plugins",
      "chengfeng-videocut",
    ),
    { recursive: true },
  );
  result = invoke([]);
  assert.equal(output(result).status, "candidate_older_than_installed");
  assertNoUserCli("higher installed version");
  assertStageSequence("higher installed version");
  assertTemporaryHomesRemoved("higher installed version");

  resetUser({ current: true });
  const tamperedCurrentCache = path.join(
    userCacheBase,
    pluginVersion,
  );
  fs.writeFileSync(
    path.join(tamperedCurrentCache, "payload.txt"),
    "locally tampered installed cache",
  );
  const rewrittenProvenancePath = path.join(
    tamperedCurrentCache,
    ".codex-plugin",
    "update-provenance.json",
  );
  const rewrittenProvenance = JSON.parse(
    fs.readFileSync(rewrittenProvenancePath, "utf8"),
  );
  rewrittenProvenance.publisherChecksum = inventoryDigest(
    tamperedCurrentCache,
  );
  fs.writeFileSync(
    rewrittenProvenancePath,
    JSON.stringify(rewrittenProvenance),
  );
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("self-consistent but source-mismatched cache");

  resetUser({ current: true });
  result = invoke(["--inspect"], {
    FAKE_GIT_CONTENT_MISSING: "1",
  });
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("installed content commit missing");

  resetUser({ current: true });
  result = invoke(["--inspect"], {
    FAKE_GIT_CONTENT_NOT_ANCESTOR: "1",
  });
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("installed content commit not ancestor");

  resetUser({ unsafeRef: "stable" });
  result = invoke([]);
  assert.equal(output(result).status, "marketplace_ref_unsafe");
  assertNoUserCli("unsafe movable user ref");
  assert.equal(isolatedCalls().length, 0);

  resetUser({ foreign: true });
  result = invoke([]);
  assert.equal(
    output(result).status,
    "marketplace_source_untrusted",
  );
  assertNoUserCli("foreign user source");
  assert.equal(isolatedCalls().length, 0);

  resetUser();
  fs.mkdirSync(path.join(userCacheBase, "local"), { recursive: true });
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("local development cache");

  resetUser();
  fs.mkdirSync(path.join(userCacheBase, "zzzz"), { recursive: true });
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("unsupported active cache version");

  resetUser();
  fs.rmSync(userCacheBase, { recursive: true, force: true });
  makeBundle(
    path.join(userCacheBase, pluginVersion),
    pluginVersion,
    "unprovenanced-new-version",
  );
  result = invoke(["--inspect"]);
  assert.equal(output(result).status, "installed_identity_untrusted");
  assertNoUserCli("new cache without provenance");

  for (const [label, env, expectedStatus] of [
    [
      "stage add failure",
      { FAKE_STAGE_ADD_FAIL: "1" },
      "isolated_stage_failed",
    ],
    [
      "stage upgrade failure",
      { FAKE_STAGE_UPGRADE_FAIL: "1" },
      "isolated_stage_failed",
    ],
    [
      "stage schema failure",
      { FAKE_STAGE_SCHEMA_INVALID: "1" },
      "isolated_stage_schema_invalid",
    ],
    [
      "stage source failure",
      { FAKE_STAGE_FOREIGN_SOURCE: "1" },
      "marketplace_source_untrusted",
    ],
    [
      "candidate digest failure",
      { FAKE_CANDIDATE_TAMPER: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate row identity mix",
      { FAKE_MIXED_ROW_VERSION: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate path identity mix",
      { FAKE_MIXED_SOURCE_PATH: "1" },
      "update_metadata_untrusted",
    ],
    [
      "isolated home already has target plugin",
      { FAKE_STAGE_INSTALLED: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate Git origin mismatch",
      { FAKE_GIT_FOREIGN_ORIGIN: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate Git HEAD mismatch",
      { FAKE_GIT_HEAD_MISMATCH: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate content commit missing",
      { FAKE_GIT_CONTENT_MISSING: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate content commit is not snapshot ancestor",
      { FAKE_GIT_CONTENT_NOT_ANCESTOR: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate Git checkout is dirty",
      { FAKE_GIT_DIRTY: "1" },
      "update_metadata_untrusted",
    ],
    [
      "candidate content tree differs from snapshot",
      { FAKE_GIT_TREE_MISMATCH: "1" },
      "update_metadata_untrusted",
    ],
  ]) {
    resetUser();
    result = invoke([], env);
    assert.equal(output(result).status, expectedStatus, label);
    assertNoUserCli(label);
    assertTemporaryHomesRemoved(label);
    assert.equal(activeCacheDigest(), oldDigest, label);
  }

  resetUser();
  result = invoke(["--activate"]);
  assert.equal(output(result).status, "confirmation_required");
  assertNoUserCli("unconfirmed activation");
  assertTemporaryHomesRemoved("unconfirmed activation");

  resetUser();
  result = invoke(activationArgs, {
    FAKE_STAGE_SNAPSHOT: movedSnapshot,
  });
  assert.equal(output(result).status, "confirmation_mismatch");
  assertNoUserCli("stable moved after confirmation");
  assertTemporaryHomesRemoved("stable moved after confirmation");
  assert.equal(activeCacheDigest(), oldDigest);

  resetUser();
  result = invoke(activationArgs, {
    FAKE_CONCURRENT_USER_CHANGE: "1",
  });
  assert.equal(output(result).status, "activation_state_changed");
  assertNoUserCli("concurrent user state change");
  assertTemporaryHomesRemoved("concurrent user state change");
  assert.equal(activeCacheDigest(), oldDigest);

  resetUser();
  result = invoke(activationArgs);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const activated = output(result);
  assert.equal(activated.status, "activated");
  assert.equal(
    activated.permanentMarketplacePin,
    candidateSnapshot,
  );
  assert.equal(activated.pluginAddInvoked, false);
  assert.equal(activated.previousLegacyInstalledIdentity, true);
  assert.deepEqual(
    userCalls().map((call) => call.args),
    [
      [
        "plugin",
        "marketplace",
        "remove",
        "test",
        "--json",
      ],
      [
        "plugin",
        "marketplace",
        "add",
        "Agentchengfeng/chengfeng-videocut-skills",
        "--ref",
        candidateSnapshot,
        "--json",
      ],
      [
        "plugin",
        "marketplace",
        "upgrade",
        "test",
        "--json",
      ],
    ],
    "activation must permanently pin B and must never call plugin add",
  );
  const activeMetadata = JSON.parse(
    fs.readFileSync(
      path.join(
        userMarketplace,
        ".codex-marketplace-install.json",
      ),
      "utf8",
    ),
  );
  assert.equal(activeMetadata.ref_name, candidateSnapshot);
  assert.equal(activeMetadata.revision, candidateSnapshot);
  assert.equal(activeCacheDigest(), candidateDigest);
  assertTemporaryHomesRemoved("exact pinned activation");

  resetUser();
  result = invoke(activationArgs, {
    FAKE_REMOVE_NO_CHANGE_FAIL: "1",
  });
  const unchangedFailure = output(result);
  assert.equal(unchangedFailure.status, "activation_failed_no_change");
  assert.equal(unchangedFailure.activationState, "unchanged");
  assert.deepEqual(unchangedFailure.rollbackAttempts, []);
  assert.equal(activeCacheDigest(), oldDigest);
  assert.equal(userCalls().length, 1);
  assertTemporaryHomesRemoved("pre-mutation failure");

  resetUser();
  result = invoke(activationArgs, { FAKE_CACHE_LOCK: "1" });
  const locked = output(result);
  assert.equal(
    locked.status,
    "activation_cache_locked_rolled_back",
  );
  assert.equal(locked.activationState, "rolled_back");
  assert.equal(activeCacheDigest(), oldDigest);
  const rolledBackMetadata = JSON.parse(
    fs.readFileSync(
      path.join(
        userMarketplace,
        ".codex-marketplace-install.json",
      ),
      "utf8",
    ),
  );
  assert.equal(rolledBackMetadata.ref_name, oldSnapshot);
  assert.equal(rolledBackMetadata.revision, oldSnapshot);
  assert.equal(
    userCalls().some(
      (call) =>
        call.args[0] === "plugin"
        && call.args[1] === "add",
    ),
    false,
  );
  assertTemporaryHomesRemoved("cache lock rollback");

  resetUser();
  result = invoke(activationArgs, {
    FAKE_REMOVE_PARTIAL_FAIL: "1",
  });
  const partialRemove = output(result);
  assert.equal(
    partialRemove.status,
    "activation_failed_rolled_back",
  );
  assert.equal(partialRemove.activationState, "rolled_back");
  assert.equal(activeCacheDigest(), oldDigest);
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(
          userMarketplace,
          ".codex-marketplace-install.json",
        ),
        "utf8",
      ),
    ).revision,
    oldSnapshot,
  );
  assertTemporaryHomesRemoved("partial remove rollback");

  resetUser();
  result = invoke(activationArgs, {
    FAKE_ACTIVATION_TAMPER: "1",
  });
  assert.equal(
    output(result).status,
    "activation_failed_rolled_back",
  );
  assert.equal(activeCacheDigest(), oldDigest);
  assertTemporaryHomesRemoved("verification rollback");

  resetUser();
  result = invoke(activationArgs, {
    FAKE_CACHE_LOCK: "1",
    FAKE_ROLLBACK_FAIL: "1",
  });
  const incomplete = output(result);
  assert.equal(
    incomplete.status,
    "activation_failed_rollback_incomplete",
  );
  assert.equal(incomplete.activationState, "incomplete");
  assert.notEqual(activeCacheDigest(), oldDigest);
  assertTemporaryHomesRemoved("incomplete rollback");

  if (process.platform !== "win32") {
    resetUser();
    result = invoke([], { FAKE_CLEANUP_SYMLINK: "1" });
    assert.equal(output(result).status, "isolated_cleanup_failed");
    assertNoUserCli("cleanup boundary");
    assert.equal(
      fs.existsSync(
        path.join(cleanupExternal, ".tmp", "marketplaces", "test"),
      ),
      true,
      "cleanup refusal must not delete an external symlink target",
    );
    for (const home of fs
      .readFileSync(temporaryHomesPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)) {
      try {
        fs.unlinkSync(home);
      } catch {
        // The checker may have already removed a non-symlink fixture.
      }
    }
  }

  const resolverResult = spawnSync(
    process.execPath,
    [windowsResolverTest],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  assert.equal(
    resolverResult.status,
    0,
    resolverResult.stderr || resolverResult.stdout,
  );

  console.log(
    JSON.stringify({
      userCheckHasZeroCodexCliCalls: true,
      isolatedStableAddUpgradeList: true,
      snapshotAndContentRevisionsBound: true,
      stableMoveRejectedBeforeUserMutation: true,
      mixedIdentityRejected: true,
      isolatedInstalledTargetRejected: true,
      candidateGitSnapshotVerified: true,
      installedCacheContextBound: true,
      oldCacheResidueUsesUniqueHighestVersion: true,
      equivalentHighestSemverRejected: true,
      candidateOlderThanHigherActiveVersionRejected: true,
      unsupportedActiveCacheRejected: true,
      postMigrationProvenanceRequired: true,
      provenancedCacheBoundToPinnedSnapshot: true,
      legacyBytesBoundToPinnedSnapshot: true,
      legacyInstalledIdentityMigrates: true,
      concurrentUserStateChangeRejected: true,
      exactShaActivationWithoutPluginAdd: true,
      preMutationFailureDoesNotRollback: true,
      cacheLockRollbackVerified: true,
      partialRemoveRollbackVerified: true,
      rollbackIncompleteDistinguished: true,
      temporaryCleanupBoundedAndRetried: true,
      windowsResolverRegressionTest:
        process.platform === "win32"
          ? "passed"
          : "registered_for_windows_ci",
    }),
  );
} finally {
  fs.rmSync(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
