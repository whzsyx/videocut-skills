"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  PROVENANCE_RELATIVE_PATH,
  digestInventoryEntries,
  inventoryDigest,
} = require("./plugin-inventory.cjs");

const scriptsRoot = __dirname;
const repositoryRoot = path.resolve(scriptsRoot, "..", "..", "..");
const writer = path.join(scriptsRoot, "write-update-provenance.cjs");
const checker = path.join(scriptsRoot, "check-plugin-update.cjs");
const temporaryRoot = fs.realpathSync.native(
  fs.mkdtempSync(path.join(os.tmpdir(), "videocut-provenance-test-")),
);
const sourceRepository = path.join(temporaryRoot, "source");
const sourcePlugin = path.join(sourceRepository, "plugins", "chengfeng-videocut");
const checkout = path.join(temporaryRoot, "windows-clone");
const checkoutPlugin = path.join(checkout, "plugins", "chengfeng-videocut");
const standalonePlugin = path.join(temporaryRoot, "standalone-bundle");
const checkerUserHome = path.join(temporaryRoot, "checker-user-home");
const legacyRepository = path.join(temporaryRoot, "legacy-source");
const legacyPlugin = path.join(
  legacyRepository,
  "plugins",
  "chengfeng-videocut",
);
const checkerMarketplaceRoot = path.join(
  checkerUserHome,
  ".tmp",
  "marketplaces",
  "test",
);
const checkerCacheRoot = path.join(
  checkerUserHome,
  "plugins",
  "cache",
  "test",
  "chengfeng-videocut",
  "0.10.5",
);
const pluginVersion = "9.8.7";
let checkerSnapshotRevision;
let checkerOldRevision;
const officialSource =
  "https://github.com/Agentchengfeng/chengfeng-videocut-skills.git";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding === undefined ? "utf8" : options.encoding,
    env: { ...process.env, ...options.env },
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function git(cwd, args, options = {}) {
  const result = run("git", ["-C", cwd, ...args], options);
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${String(result.stderr || result.error || "")}`,
  );
  return result.stdout;
}

function readJsonOutput(result) {
  assert.ok(result.stdout, `expected JSON stdout; stderr=${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function makeFakeCodex(bundlePath) {
  const driver = path.join(temporaryRoot, "fake-codex-driver.cjs");
  fs.writeFileSync(
    driver,
    `"use strict";
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const bundlePath = process.env.FAKE_BUNDLE;
const bundleRepository = path.resolve(bundlePath, "..", "..");
const home = path.resolve(process.env.CODEX_HOME);
const userHome = path.resolve(process.env.FAKE_USER_HOME);
if (home === userHome) process.exit(88);
const marketplaceRoot = path.join(home, ".tmp", "marketplaces", "test");
const candidatePath = path.join(
  marketplaceRoot,
  "plugins",
  "chengfeng-videocut",
);
const metadata = () => {
  fs.mkdirSync(marketplaceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(marketplaceRoot, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source: "${officialSource}",
      ref_name: "stable",
      sparse_paths: [],
      revision: "${checkerSnapshotRevision}",
    }),
  );
};
if (
  args.join(" ")
  === "plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref stable --json"
) {
  fs.mkdirSync(path.dirname(marketplaceRoot), { recursive: true });
  fs.cpSync(bundleRepository, marketplaceRoot, { recursive: true });
  metadata();
  console.log(JSON.stringify({
    marketplaceName: "test",
    installedRoot: marketplaceRoot,
    alreadyAdded: false,
  }));
  process.exit(0);
}
if (args.join(" ") === "plugin marketplace upgrade test --json") {
  console.log(JSON.stringify({
    selectedMarketplaces: ["test"],
    upgradedRoots: [marketplaceRoot],
    errors: [],
  }));
  process.exit(0);
}
if (args.slice(0, 2).join(" ") === "plugin list") {
  console.log(JSON.stringify({
    installed: [],
    available: [{
      pluginId: "chengfeng-videocut@test",
      name: "chengfeng-videocut",
      marketplaceName: "test",
      version: "${pluginVersion}",
      installed: false,
      enabled: false,
      source: { source: "local", path: candidatePath },
      marketplaceSource: {
        sourceType: "git",
        source: "${officialSource}",
      },
    }],
  }));
  process.exit(0);
}
process.exit(7);
`,
    "utf8",
  );
  if (process.platform === "win32") {
    const wrapper = path.join(temporaryRoot, "fake-codex.cmd");
    fs.writeFileSync(
      wrapper,
      `@echo off\r\n"${process.execPath}" "${driver}" %*\r\n`,
      "utf8",
    );
    return wrapper;
  }
  const wrapper = path.join(temporaryRoot, "fake-codex");
  fs.writeFileSync(
    wrapper,
    `#!/bin/sh\nexec "${process.execPath}" "${driver}" "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
  return wrapper;
}

try {
  assert.notEqual(
    digestInventoryEntries([
      { relativePath: "a", content: Buffer.from("x\0b\0y") },
    ]),
    digestInventoryEntries([
      { relativePath: "a", content: Buffer.from("x") },
      { relativePath: "b", content: Buffer.from("y") },
    ]),
    "length framing must prevent ambiguous inventory encodings",
  );

  fs.mkdirSync(path.join(sourcePlugin, ".codex-plugin"), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, ".gitattributes"),
    path.join(sourceRepository, ".gitattributes"),
  );
  fs.writeFileSync(
    path.join(sourcePlugin, ".codex-plugin", "plugin.json"),
    `${JSON.stringify({ name: "chengfeng-videocut", version: pluginVersion }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(path.join(sourcePlugin, "payload.txt"), "line one\r\nline two\r\n", "utf8");

  git(sourceRepository, ["init", "-q", "--object-format=sha1"]);
  git(sourceRepository, ["config", "user.name", "Provenance Test"]);
  git(sourceRepository, ["config", "user.email", "provenance@example.invalid"]);
  git(sourceRepository, ["add", "."]);
  git(sourceRepository, ["commit", "-qm", "content snapshot"]);
  const immutableRef = git(sourceRepository, ["rev-parse", "HEAD"]).trim();
  assert.match(immutableRef, /^[a-f0-9]{40}$/);
  assert.match(
    git(sourceRepository, ["check-attr", "eol", "--", "plugins/chengfeng-videocut/payload.txt"]),
    /eol: lf/,
  );
  const committedPayload = git(
    sourceRepository,
    ["show", `${immutableRef}:plugins/chengfeng-videocut/payload.txt`],
    { encoding: null },
  );
  assert.equal(committedPayload.includes(13), false, "Git snapshot must contain LF text");

  let result = run(process.execPath, [
    writer,
    "--plugin-root",
    sourcePlugin,
    "--immutable-ref",
    immutableRef,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const written = readJsonOutput(result);
  assert.equal(written.source, "git-tree");
  const provenancePath = path.join(
    sourcePlugin,
    ...PROVENANCE_RELATIVE_PATH.split("/"),
  );
  const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  assert.deepEqual(Object.keys(provenance), [
    "name",
    "version",
    "immutableRef",
    "publisherChecksum",
  ]);
  assert.equal(provenance.name, "chengfeng-videocut");
  assert.equal(provenance.version, pluginVersion);
  assert.equal(provenance.immutableRef, immutableRef);
  assert.match(provenance.publisherChecksum, /^[a-f0-9]{64}$/);
  git(sourceRepository, ["add", "plugins/chengfeng-videocut/.codex-plugin/update-provenance.json"]);
  git(sourceRepository, ["commit", "-qm", "bind update provenance"]);
  checkerSnapshotRevision = git(
    sourceRepository,
    ["rev-parse", "HEAD"],
  ).trim();
  assert.notEqual(checkerSnapshotRevision, immutableRef);

  result = run(
    "git",
    [
      "-c",
      "core.autocrlf=true",
      "clone",
      "-q",
      "--no-local",
      sourceRepository,
      checkout,
    ],
  );
  assert.equal(result.status, 0, result.stderr);
  git(checkout, ["remote", "set-url", "origin", officialSource]);
  assert.equal(
    fs.readFileSync(path.join(checkoutPlugin, "payload.txt")).includes(13),
    false,
    "eol=lf must survive a Windows-style checkout",
  );
  assert.equal(
    inventoryDigest(checkoutPlugin),
    provenance.publisherChecksum,
    "filesystem inventory must match the Git snapshot inventory",
  );

  fs.mkdirSync(path.join(legacyPlugin, ".codex-plugin"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(legacyPlugin, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: "chengfeng-videocut",
      version: "0.10.5",
    }),
  );
  fs.writeFileSync(
    path.join(legacyPlugin, "payload.txt"),
    "legacy checker cache",
  );
  git(legacyRepository, ["init", "-q", "--object-format=sha1"]);
  git(legacyRepository, ["config", "user.name", "Legacy Test"]);
  git(legacyRepository, ["config", "user.email", "legacy@example.invalid"]);
  git(legacyRepository, ["add", "."]);
  git(legacyRepository, ["commit", "-qm", "legacy snapshot"]);
  checkerOldRevision = git(
    legacyRepository,
    ["rev-parse", "HEAD"],
  ).trim();
  fs.mkdirSync(path.dirname(checkerMarketplaceRoot), { recursive: true });
  result = run(
    "git",
    ["clone", "-q", "--no-local", legacyRepository, checkerMarketplaceRoot],
  );
  assert.equal(result.status, 0, result.stderr);
  git(checkerMarketplaceRoot, ["remote", "set-url", "origin", officialSource]);
  fs.writeFileSync(
    path.join(checkerMarketplaceRoot, ".codex-marketplace-install.json"),
    JSON.stringify({
      source_type: "git",
      source: officialSource,
      ref_name: checkerOldRevision,
      sparse_paths: [],
      revision: checkerOldRevision,
    }),
  );
  fs.cpSync(
    path.join(checkerMarketplaceRoot, "plugins", "chengfeng-videocut"),
    checkerCacheRoot,
    { recursive: true },
  );

  const fakeCodex = makeFakeCodex(checkoutPlugin);
  const invokeChecker = () =>
    run(
      process.execPath,
      [checker, "--marketplace", "test", "--json"],
      {
        env: {
          CODEX_BIN: fakeCodex,
          CODEX_HOME: checkerUserHome,
          FAKE_USER_HOME: checkerUserHome,
          FAKE_BUNDLE: checkoutPlugin,
        },
      },
    );
  result = invokeChecker();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(readJsonOutput(result).status, "update_available_confirmation_required");

  fs.cpSync(checkoutPlugin, standalonePlugin, { recursive: true });
  result = run(process.execPath, [
    writer,
    "--plugin-root",
    standalonePlugin,
    "--immutable-ref",
    immutableRef,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /must be inside a Git repository; filesystem-only provenance is forbidden/,
  );

  result = run(process.execPath, [
    writer,
    "--plugin-root",
    sourcePlugin,
    "--immutable-ref",
    "f".repeat(40),
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /immutable ref must equal the repository HEAD/);

  const uncommittedPath = path.join(sourcePlugin, "uncommitted.txt");
  fs.writeFileSync(uncommittedPath, "must not be silently omitted\n", "utf8");
  result = run(process.execPath, [
    writer,
    "--plugin-root",
    sourcePlugin,
    "--immutable-ref",
    checkerSnapshotRevision,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /uncommitted inventory entries/);
  fs.rmSync(uncommittedPath);

  fs.writeFileSync(path.join(checkoutPlugin, "payload.txt"), "tampered\n", "utf8");
  result = invokeChecker();
  assert.notEqual(result.status, 0);
  assert.equal(readJsonOutput(result).status, "update_metadata_untrusted");

  const symlinkTarget = path.join(checkoutPlugin, "symlink-target");
  const symlinkPath = path.join(checkoutPlugin, "forbidden-link");
  fs.mkdirSync(symlinkTarget);
  try {
    fs.symlinkSync(
      symlinkTarget,
      symlinkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => inventoryDigest(checkoutPlugin),
      /symbolic links are forbidden/,
    );
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }

  const linkBlob = git(
    sourceRepository,
    ["hash-object", "-w", "--stdin"],
    { input: "payload.txt\n" },
  ).trim();
  git(sourceRepository, [
    "update-index",
    "--add",
    "--cacheinfo",
    `120000,${linkBlob},plugins/chengfeng-videocut/tracked-link`,
  ]);
  git(sourceRepository, ["commit", "-qm", "add forbidden symlink"]);
  const symlinkRef = git(sourceRepository, ["rev-parse", "HEAD"]).trim();
  result = run(process.execPath, [
    writer,
    "--plugin-root",
    sourcePlugin,
    "--immutable-ref",
    symlinkRef,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symbolic links are forbidden/);

  result = run(process.execPath, [
    writer,
    "--plugin-root",
    sourcePlugin,
    "--immutable-ref",
    "not-a-commit",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /40 hexadecimal/);

  console.log(
    JSON.stringify({
      gitSnapshotDigest: true,
      unambiguousDigestFraming: true,
      filesystemOnlyWriterRejected: true,
      provenanceExcluded: true,
      dirtyWorktreeRejected: true,
      windowsLfCheckoutStable: true,
      checkerTrustsWrittenProvenance: true,
      tamperRejected: true,
      symlinkRejected: true,
      nonexistentFormattedRefRejected: true,
      immutableRefValidated: true,
    }),
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
