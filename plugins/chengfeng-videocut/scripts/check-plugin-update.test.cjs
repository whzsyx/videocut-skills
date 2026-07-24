"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), script = path.join(root, "scripts", "check-plugin-update.cjs"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-plugin-update-test-"));
const fake = path.join(tmp, "codex"), state = path.join(tmp, "state"), touched = path.join(tmp, "touched"), bundle = path.join(tmp, "bundle"), installed = path.join(tmp, "installed"), ref = "0123456789abcdef0123456789abcdef01234567";
fs.mkdirSync(path.join(bundle, ".codex-plugin"), { recursive: true });
const manifest = JSON.stringify({ name: "chengfeng-videocut", version: "0.2.1" }); fs.writeFileSync(path.join(bundle, ".codex-plugin", "plugin.json"), manifest); fs.writeFileSync(path.join(bundle, "payload.txt"), "candidate");
const bundleHash = crypto.createHash("sha256").update(".codex-plugin/plugin.json").update("\0").update(manifest).update("\0").update("payload.txt").update("\0").update("candidate").update("\0").digest("hex");
fs.writeFileSync(path.join(bundle, ".codex-plugin", "update-provenance.json"), JSON.stringify({ immutableRef: ref, publisherChecksum: bundleHash }));
fs.writeFileSync(fake, `#!/usr/bin/env node
const fs=require('fs'); const a=process.argv.slice(2), state=process.env.FAKE_STATE, touched=process.env.FAKE_TOUCHED, bundle=process.env.FAKE_BUNDLE, installedPath=process.env.FAKE_INSTALLED;
const candidate={name:'chengfeng-videocut',version:'0.2.1',bundlePath:bundle,installed:false,...(process.env.FAKE_UNTRUSTED?{publisherChecksum:'b'.repeat(64)}:{}),...(process.env.FAKE_REF?{immutableRef:process.env.FAKE_REF}:{})};
const installed=()=>({pluginId:'chengfeng-videocut@test',name:fs.existsSync(state)&&process.env.FAKE_AFTER_NAME?process.env.FAKE_AFTER_NAME:'chengfeng-videocut',version:fs.existsSync(state)?'0.2.1':'0.2.0',installed:true,...(fs.existsSync(state)&&process.env.FAKE_AFTER_REF?{immutableRef:process.env.FAKE_AFTER_REF}:{}),...(fs.existsSync(state)&&process.env.FAKE_AFTER_HASH?{publisherChecksum:process.env.FAKE_AFTER_HASH}:{})});
if(a.join(' ')==='plugin marketplace list --json'){console.log(JSON.stringify({marketplaces:[{name:'test',marketplaceSource:{sourceType:process.env.FAKE_LOCAL?'local':'git'}}]}));process.exit(0)}
if(a.slice(0,3).join(' ')==='plugin marketplace upgrade'){if(process.env.FAKE_REFRESH_FAIL)process.exit(9);fs.appendFileSync(touched,'upgrade\\n');console.log('{}');process.exit(0)}
if(a.slice(0,2).join(' ')==='plugin list'){const payload=process.env.FAKE_NO_INSTALLED?{installed:[],available:[candidate]}:{installed:[installed()],available:[candidate]};console.log(JSON.stringify(process.env.FAKE_AVAILABLE_FIRST?{available:payload.available,installed:payload.installed}:payload));process.exit(0)}
if(a.slice(0,3).join(' ')==='plugin add chengfeng-videocut@test'){fs.rmSync(installedPath,{recursive:true,force:true});fs.cpSync(bundle,installedPath,{recursive:true});if(process.env.FAKE_TAMPER)fs.writeFileSync(installedPath+'/payload.txt','tampered');if(process.env.FAKE_REMOVE_PROVENANCE)fs.rmSync(installedPath+'/.codex-plugin/update-provenance.json');fs.writeFileSync(state,'activated');fs.appendFileSync(touched,'add\\n');console.log(JSON.stringify({installedPath}));process.exit(0)} process.exit(7);`, { mode: 0o755 });
function invoke(args, extra = {}) { return spawnSync(process.execPath, [script, "--marketplace", "test", ...args, "--json"], { encoding: "utf8", env: { ...process.env, CODEX_BIN: fake, FAKE_STATE: state, FAKE_TOUCHED: touched, FAKE_BUNDLE: bundle, FAKE_INSTALLED: installed, ...extra } }); }
const activate = (extra = {}) => invoke(["--activate", "--confirmed", "--expected-version", "0.2.1", "--expected-ref", ref, "--expected-sha256", bundleHash], extra);
try {
  let r = invoke(["--inspect"]); assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).status, "inspected_no_refresh"); assert.equal(fs.existsSync(touched), false);
  r = invoke([], { FAKE_LOCAL: "1" }); assert.equal(JSON.parse(r.stdout).status, "marketplace_not_refreshable"); assert.equal(fs.existsSync(touched), false);
  r = invoke([], { FAKE_REFRESH_FAIL: "1" }); assert.equal(JSON.parse(r.stdout).status, "marketplace_refresh_failed"); assert.equal(fs.existsSync(state), false);
  r = invoke([]); assert.equal(JSON.parse(r.stdout).status, "update_available_confirmation_required"); fs.rmSync(touched);
  r = invoke([], { FAKE_AVAILABLE_FIRST: "1" }); assert.equal(JSON.parse(r.stdout).status, "update_available_confirmation_required"); fs.rmSync(touched);
  r = invoke([], { FAKE_NO_INSTALLED: "1" }); assert.equal(JSON.parse(r.stdout).status, "installed_identity_missing"); fs.rmSync(touched);
  r = invoke(["--activate"]); assert.equal(JSON.parse(r.stdout).status, "confirmation_required"); assert.equal(fs.existsSync(state), false);
  r = invoke(["--activate", "--confirmed", "--expected-version", "0.2.1", "--expected-ref", "wrong", "--expected-sha256", bundleHash]); assert.equal(JSON.parse(r.stdout).status, "confirmation_mismatch");
  r = activate(); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).status, "activated"); assert.match(fs.readFileSync(touched, "utf8"), /add/);
  for (const [label, env] of [["name", { FAKE_AFTER_NAME: "other-plugin" }], ["ref", { FAKE_AFTER_REF: "wrong" }], ["checksum", { FAKE_AFTER_HASH: "b".repeat(64) }], ["digest", { FAKE_TAMPER: "1" }]]) { fs.rmSync(state, { force: true }); fs.rmSync(touched, { force: true }); r = activate(env); assert.equal(JSON.parse(r.stdout).status, "plugin_activation_unsupported", `${label} mismatch must fail closed`); }
  fs.rmSync(state, { force: true }); fs.rmSync(touched, { force: true }); r = activate({ FAKE_REMOVE_PROVENANCE: "1" }); assert.equal(JSON.parse(r.stdout).status, "plugin_activation_unsupported", "unobservable installed provenance must fail closed");
  fs.rmSync(state, { force: true }); fs.rmSync(touched, { force: true }); r = invoke([], { FAKE_UNTRUSTED: "1" }); assert.equal(JSON.parse(r.stdout).status, "update_metadata_untrusted"); assert.doesNotMatch(fs.readFileSync(touched, "utf8"), /add/);
  for (const tag of ["v0.2.1", "0.2.1"]) { fs.rmSync(state, { force: true }); fs.rmSync(touched, { force: true }); r = invoke([], { FAKE_REF: tag }); assert.equal(JSON.parse(r.stdout).status, "update_metadata_untrusted", `bare tag ${tag} must be untrusted`); assert.doesNotMatch(fs.readFileSync(touched, "utf8"), /add/); }
  console.log(JSON.stringify({ inspectNoRefresh: true, localRejected: true, refreshFailedClosed: true, confirmationBound: true, activationVersionRefChecksumDigestReread: true, installedProvenanceFallback: true, untrustedNoAdd: true }));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
