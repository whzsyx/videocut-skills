#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const PLUGIN = "chengfeng-videocut";
const PROVENANCE = path.join(".codex-plugin", "update-provenance.json");
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const sha256 = /^[a-f0-9]{64}$/i, commit = /^[a-f0-9]{40}$/i;
function out(v, c = 0) { process.stdout.write(`${JSON.stringify(v)}\n`); process.exit(c); }
function stop(status, message, extra = {}, code = 20) { out({ schemaVersion: 1, ok: false, status, error: { code: status, message }, ...extra }, code); }
function parseArgs() {
  const a = { mode: "check", marketplace: null, confirmed: false };
  for (let i = 2; i < process.argv.length; i += 1) { const x = process.argv[i];
    if (x === "--json") continue; if (x === "--inspect") { a.mode = "inspect"; continue; }
    if (x === "--activate") { a.mode = "activate"; continue; } if (x === "--confirmed") { a.confirmed = true; continue; }
    if (x === "--marketplace") { a.marketplace = process.argv[++i]; continue; }
    if (x === "--expected-version") { a.expectedVersion = process.argv[++i]; continue; }
    if (x === "--expected-ref") { a.expectedRef = process.argv[++i]; continue; }
    if (x === "--expected-sha256") { a.expectedChecksum = process.argv[++i]; continue; }
    stop("invalid_arguments", `unknown argument: ${x}`);
  }
  if (!a.marketplace) stop("invalid_arguments", "--marketplace is required"); return a;
}
function run(bin, argv) { const r = spawnSync(bin, argv, { encoding: "utf8", env: process.env }); if (r.error || r.status !== 0) return { ok: false, command: [bin, ...argv], status: r.status, stderr: (r.stderr || r.error?.message || "").trim() }; try { return { ok: true, command: [bin, ...argv], data: JSON.parse(r.stdout) }; } catch { return { ok: false, command: [bin, ...argv], status: r.status, stderr: "Codex command did not return JSON" }; } }
function rows(v) { if (Array.isArray(v)) return v; for (const k of ["marketplaces", "plugins", "items", "data"]) if (Array.isArray(v?.[k])) return v[k]; return []; }
function marketName(v) { return v?.name || v?.id || v?.marketplace?.name; }
function git(v) { const s = JSON.stringify(v).toLowerCase(); return v?.type === "git" || v?.kind === "git" || /\bgit\b|github\.com|https?:\/\//.test(s); }
function bundleIdentity(bundlePath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(bundlePath, ".codex-plugin", "plugin.json"), "utf8"));
    let provenance = {};
    try { provenance = JSON.parse(fs.readFileSync(path.join(bundlePath, PROVENANCE), "utf8")); } catch { /* absent provenance remains fail-closed when needed */ }
    return { name: manifest.name || provenance.name, version: manifest.version || provenance.version, immutableRef: provenance.immutableRef || provenance.commit, publisherChecksum: provenance.publisherChecksum || provenance.sha256, bundlePath };
  } catch { return { bundlePath }; }
}
function identity(v = {}) {
  const p = v.manifest || v.plugin || v, bundlePath = v.bundlePath || v.source?.path || p.bundlePath || p.source?.path;
  const fromBundle = bundlePath ? bundleIdentity(bundlePath) : {};
  return { name: p.name || v.name || fromBundle.name, version: p.version || v.version || fromBundle.version, immutableRef: v.immutableRef || v.commit || v.revision || p.immutableRef || p.commit || fromBundle.immutableRef, publisherChecksum: v.publisherChecksum || v.sha256 || p.publisherChecksum || p.sha256 || fromBundle.publisherChecksum, bundlePath };
}
function plugin(v, installed) {
  const list = installed
    ? (Array.isArray(v?.installed) ? v.installed : rows(v))
    : (Array.isArray(v?.available) ? [...v.available, ...(v.installed || [])] : rows(v));
  return list.find((x) => (identity(x).name === PLUGIN || String(x.pluginId || "").startsWith(`${PLUGIN}@`)) && (!installed || x.installed));
}
function cmp(a, b) { const x = semver.exec(a || ""), y = semver.exec(b || ""); if (!x || !y) return null; for (let i = 1; i < 4; i += 1) { const d = Number(x[i]) - Number(y[i]); if (d) return Math.sign(d); } if (!x[4] && y[4]) return 1; if (x[4] && !y[4]) return -1; return (x[4] || "").localeCompare(y[4] || ""); }
function inventoryDigest(root) {
  try {
    if (!root || !fs.statSync(root).isDirectory()) return null;
    const files = [];
    const visit = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
      const full = path.join(dir, entry.name); if (entry.isSymbolicLink()) throw new Error("symlink");
      if (entry.isDirectory()) return visit(full); if (!entry.isFile()) throw new Error("non-file"); if (path.relative(root, full) !== PROVENANCE) files.push(full);
    }); visit(root);
    const hash = crypto.createHash("sha256"); for (const file of files) { hash.update(path.relative(root, file)); hash.update("\0"); hash.update(fs.readFileSync(file)); hash.update("\0"); }
    return hash.digest("hex");
  } catch { return null; }
}
function trusted(v) { const digest = inventoryDigest(v.bundlePath); return { ok: Boolean(commit.test(v.immutableRef || "") && sha256.test(v.publisherChecksum || "") && digest && digest.toLowerCase() === v.publisherChecksum.toLowerCase()), digest }; }
const input = parseArgs(), bin = process.env.CODEX_BIN || "codex";
const markets = run(bin, ["plugin", "marketplace", "list", "--json"]); if (!markets.ok) stop("marketplace_inspect_failed", "could not inspect Codex marketplaces", { detail: markets });
const market = rows(markets.data).find((x) => marketName(x) === input.marketplace); if (!market) stop("marketplace_not_found", `marketplace ${input.marketplace} is not configured`);
if (input.mode === "inspect") { const listed = run(bin, ["plugin", "list", "--marketplace", input.marketplace, "--available", "--json"]); if (!listed.ok) stop("marketplace_inspect_failed", "could not inspect marketplace snapshot", { detail: listed }); out({ schemaVersion: 1, ok: true, status: "inspected_no_refresh", marketplace: input.marketplace, refreshPerformed: false, installed: identity(plugin(listed.data, true)), available: identity(plugin(listed.data, false)) }); }
if (!git(market)) stop("marketplace_not_refreshable", "local marketplace is not a remote update source", { marketplace: input.marketplace, refreshPerformed: false });
const refreshed = run(bin, ["plugin", "marketplace", "upgrade", input.marketplace, "--json"]); if (!refreshed.ok) stop("marketplace_refresh_failed", "official Codex marketplace refresh failed", { marketplace: input.marketplace, detail: refreshed });
const listed = run(bin, ["plugin", "list", "--marketplace", input.marketplace, "--available", "--json"]); if (!listed.ok) stop("marketplace_inspect_failed", "could not inspect refreshed marketplace snapshot", { marketplace: input.marketplace, detail: listed });
const available = identity(plugin(listed.data, false)), installed = identity(plugin(listed.data, true)); if (!available.name || !available.version) stop("plugin_not_found", "plugin absent from refreshed marketplace snapshot", { marketplace: input.marketplace });
if (!installed.name || !installed.version) stop("installed_identity_missing", "installed plugin identity is required; do not compare against a guessed current version", { marketplace: input.marketplace, available });
const comparison = cmp(available.version, installed.version || available.version); if (comparison === null) stop("invalid_plugin_version", "installed or available version is not strict semver", { installed, available });
const proof = trusted(available); if (!proof.ok) stop("update_metadata_untrusted", "40-hex immutable commit, publisher SHA-256, and an exactly matching readable marketplace bundle are required before activation", { marketplace: input.marketplace, installed, available, refreshed: true, bundleVerified: false });
if (comparison <= 0) out({ schemaVersion: 1, ok: true, status: "current", marketplace: input.marketplace, installed, available, refreshed: true });
if (input.mode === "check") out({ schemaVersion: 1, ok: true, status: "update_available_confirmation_required", marketplace: input.marketplace, installed, available, refreshed: true, activation: "not_started" });
if (!input.confirmed) stop("confirmation_required", "activation requires explicit confirmation after showing this exact candidate", { marketplace: input.marketplace, installed, available });
if (input.expectedVersion !== available.version || input.expectedRef !== available.immutableRef || input.expectedChecksum !== available.publisherChecksum) stop("confirmation_mismatch", "activation arguments do not bind to the refreshed candidate that the user saw", { marketplace: input.marketplace, expected: { version: available.version, immutableRef: available.immutableRef, publisherChecksum: available.publisherChecksum }, received: { version: input.expectedVersion, immutableRef: input.expectedRef, publisherChecksum: input.expectedChecksum } });
const added = run(bin, ["plugin", "add", `${PLUGIN}@${input.marketplace}`, "--json"]); if (!added.ok) stop("plugin_activation_unsupported", "official Codex plugin add did not activate candidate atomically", { marketplace: input.marketplace, installed, available, detail: added });
const reread = run(bin, ["plugin", "list", "--marketplace", input.marketplace, "--available", "--json"]);
const listedActual = reread.ok ? identity(plugin(reread.data, true)) : {};
const installedPath = added.data?.installedPath || added.data?.installPath;
const cachedActual = installedPath ? bundleIdentity(installedPath) : {};
const identityFields = ["name", "version", "immutableRef", "publisherChecksum"];
const listProvenanceConflict = identityFields.some((field) => listedActual[field] && cachedActual[field] && listedActual[field] !== cachedActual[field]);
const cacheProvenanceComplete = identityFields.every((field) => Boolean(cachedActual[field]));
const actual = { ...cachedActual, bundlePath: installedPath || cachedActual.bundlePath };
const actualDigest = inventoryDigest(actual.bundlePath);
if (!reread.ok || !cacheProvenanceComplete || listProvenanceConflict || !actual.bundlePath || actual.name !== available.name || actual.version !== available.version || actual.immutableRef !== available.immutableRef || actual.publisherChecksum !== available.publisherChecksum || !actualDigest || actualDigest !== proof.digest || actualDigest.toLowerCase() !== available.publisherChecksum.toLowerCase()) stop("plugin_activation_unsupported", "activation did not reread matching installed provenance and exact cache bundle digest", { marketplace: input.marketplace, expected: { ...available, bundleDigest: proof.digest }, listedActual, actual: { ...actual, bundleDigest: actualDigest }, cacheProvenanceComplete, listProvenanceConflict, detail: reread.ok ? undefined : reread });
out({ schemaVersion: 1, ok: true, status: "activated", marketplace: input.marketplace, installed: actual, available, restartRequired: true });
