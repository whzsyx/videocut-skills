"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { spawn } = require("node:child_process");

if (process.platform !== "win32") {
  console.log(JSON.stringify({ mcpCacheDirectoryReleased: "skipped_non_windows" }));
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut mcp cache "));
const versionRoot = path.join(tmp, "cache", "chengfeng-videocut", "0.10.6");
const backupRoot = path.join(tmp, "cache", "chengfeng-videocut", "0.10.6.backup");
const distDir = path.join(versionRoot, "dist");
let child;

async function renameWhenReleased(source, destination, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (child.exitCode !== null) return false;
    try {
      fs.renameSync(source, destination);
      return true;
    } catch (error) {
      if (
        Date.now() >= deadline ||
        !["EACCES", "EBUSY", "EPERM"].includes(error?.code)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function main() {
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(path.join(root, "dist", "server.mjs"), path.join(distDir, "server.mjs"));
  child = spawn(process.execPath, ["dist/server.mjs"], {
    cwd: versionRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const renamed = await renameWhenReleased(versionRoot, backupRoot);
  assert.equal(renamed, true, `MCP exited before cache rename: ${stderr}`);
  assert.equal(fs.existsSync(versionRoot), false);
  assert.equal(fs.existsSync(path.join(backupRoot, "dist", "server.mjs")), true);
  console.log(JSON.stringify({ mcpCacheDirectoryReleased: true }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});
