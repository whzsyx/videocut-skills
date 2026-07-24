#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'installer-manifest.json');
const HEX40 = /^[0-9a-f]{40}$/i;
const EXPECTED = {
  installerId: 'chengfeng-videocut-github-npx-bootstrap-v1',
  source: 'Agentchengfeng/chengfeng-videocut-skills',
  marketplace: 'chengfeng-videocut',
  plugin: 'chengfeng-videocut'
};
const ALLOWED_COMMANDS = [
  'codex plugin marketplace add',
  'codex plugin add',
  'codex plugin marketplace list',
  'codex plugin list'
];

function fail(message) {
  const error = new Error(message);
  error.code = 'BOOTSTRAP_REFUSED';
  throw error;
}

function identityUnverified(detail) {
  fail(`marketplace_identity_unverified: ${detail}`);
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} did not return JSON; refusing to continue.`);
  }
}

function readManifest() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    fail('Installer manifest is missing or invalid; refusing to continue.');
  }
  for (const [key, value] of Object.entries(EXPECTED)) {
    if (manifest[key] !== value) fail(`Installer manifest ${key} is not the expected identity.`);
  }
  if (manifest.schemaVersion !== 1 || manifest.runtimeInstall !== false) {
    fail('Installer manifest has an unsupported scope.');
  }
  if (!Array.isArray(manifest.allowedCommands) || manifest.allowedCommands.length !== ALLOWED_COMMANDS.length ||
      !manifest.allowedCommands.every((command, index) => command === ALLOWED_COMMANDS[index])) {
    fail('Installer manifest command surface is not the expected official Codex Plugin surface.');
  }
  if (!HEX40.test(manifest.pluginRef || '')) {
    fail('No published immutable 40-hex pluginRef is configured; refusing to bootstrap an unpublished candidate.');
  }
  return { ...manifest, pluginRef: manifest.pluginRef.toLowerCase() };
}

function runCodex(args) {
  const result = childProcess.spawnSync('codex', args, { encoding: 'utf8' });
  if (result.error) fail(`Cannot execute Codex CLI: ${result.error.message}`);
  if (result.status !== 0) fail(`Codex CLI failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  return readJson(result.stdout, `codex ${args.join(' ')}`);
}

function runCloneGit(installedRoot, args, label) {
  const result = childProcess.spawnSync('git', ['-C', installedRoot, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    identityUnverified(`${label} could not be read from the Codex marketplace clone.`);
  }
  return result.stdout.trim();
}

function marketplaceEntries(result) {
  return Array.isArray(result && result.marketplaces) ? result.marketplaces : fail('Marketplace readback has no marketplaces array.');
}

function pluginEntries(result) {
  return Array.isArray(result && result.installed) ? result.installed : fail('Plugin readback has no installed array.');
}

function canonicalGitHubSource(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash) return null;
    const pathname = url.pathname.replace(/\/$/, '').toLowerCase();
    if (!pathname.endsWith('.git')) return null;
    return `https://github.com${pathname}`;
  } catch {
    return null;
  }
}

function expectedRemote(manifest) {
  return canonicalGitHubSource(`https://github.com/${manifest.source}.git`);
}

function preflightCollisions(manifest) {
  const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
  const sameMarketplace = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  if (sameMarketplace) {
    fail(`Marketplace ${manifest.marketplace} already exists; its exact source/ref cannot be safely replaced or migrated.`);
  }
  const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
  const collision = plugins.find((entry) => entry && entry.name === manifest.plugin && entry.marketplaceName !== manifest.marketplace);
  if (collision) {
    fail(`Plugin ${manifest.plugin} is already installed from ${collision.marketplaceName || 'an unknown marketplace'}; refusing to remove or overwrite it.`);
  }
}

function verifyMarketplaceClone(market, manifest, receiptRoot) {
  if (!market || typeof market.root !== 'string' || !path.isAbsolute(market.root)) {
    identityUnverified('Marketplace readback did not contain an absolute target root.');
  }
  const marketplaceRoot = path.resolve(market.root);
  if (path.basename(marketplaceRoot) !== manifest.marketplace || path.basename(path.dirname(marketplaceRoot)) !== 'marketplaces') {
    identityUnverified('Marketplace readback root is not the target Codex marketplace clone.');
  }
  if (receiptRoot !== undefined) {
    if (typeof receiptRoot !== 'string' || !path.isAbsolute(receiptRoot)) {
      identityUnverified('Marketplace add receipt did not provide an absolute installedRoot.');
    }
    if (path.resolve(receiptRoot) !== marketplaceRoot) {
      identityUnverified('Marketplace receipt root is not the target Codex marketplace clone.');
    }
  }
  if (!fs.existsSync(marketplaceRoot)) {
    identityUnverified('Marketplace installedRoot does not exist.');
  }
  const expected = expectedRemote(manifest);
  const listed = canonicalGitHubSource(market.marketplaceSource && market.marketplaceSource.source);
  if (!market.marketplaceSource || market.marketplaceSource.sourceType !== 'git' || !expected || listed !== expected) {
    identityUnverified('Marketplace readback source is not the expected normalized GitHub source.');
  }
  const head = runCloneGit(marketplaceRoot, ['rev-parse', 'HEAD'], 'Marketplace clone HEAD').toLowerCase();
  if (!HEX40.test(head) || head !== manifest.pluginRef) {
    identityUnverified('Marketplace clone HEAD does not equal manifest pluginRef.');
  }
  const origin = canonicalGitHubSource(runCloneGit(marketplaceRoot, ['remote', 'get-url', 'origin'], 'Marketplace clone origin'));
  if (origin !== expected) {
    identityUnverified('Marketplace clone origin is not the expected normalized GitHub source.');
  }
}

function verifyMarketplaceIdentity(receipt, marketplaces, manifest) {
  if (!receipt || receipt.marketplaceName !== manifest.marketplace || receipt.alreadyAdded !== false) {
    identityUnverified('Marketplace add receipt did not prove a newly-added target marketplace.');
  }
  if (typeof receipt.installedRoot !== 'string' || !path.isAbsolute(receipt.installedRoot)) {
    identityUnverified('Marketplace add receipt did not provide an absolute installedRoot.');
  }
  const market = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  verifyMarketplaceClone(market, manifest, receipt.installedRoot);
}

function verifyInstalledPlugin(plugins, manifest) {
  const collision = plugins.find((entry) => entry && entry.name === manifest.plugin && entry.marketplaceName !== manifest.marketplace);
  if (collision) {
    identityUnverified(`Plugin ${manifest.plugin} is installed from ${collision.marketplaceName || 'an unknown marketplace'}.`);
  }
  if (!plugins.some((entry) => entry && entry.name === manifest.plugin && entry.marketplaceName === manifest.marketplace && entry.installed)) {
    identityUnverified(`Plugin ${manifest.plugin} is not installed from ${manifest.marketplace}.`);
  }
}

function install(manifest) {
  preflightCollisions(manifest);
  const receipt = runCodex(['plugin', 'marketplace', 'add', manifest.source, '--ref', manifest.pluginRef, '--json']);
  const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
  verifyMarketplaceIdentity(receipt, marketplaces, manifest);
  runCodex(['plugin', 'add', `${manifest.plugin}@${manifest.marketplace}`, '--json']);
  const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
  verifyInstalledPlugin(plugins, manifest);
  process.stdout.write('INSTALLED_OK runtime_unchanged\n');
}

function doctor(manifest) {
  const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
  const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
  const market = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  verifyMarketplaceClone(market, manifest);
  verifyInstalledPlugin(plugins, manifest);
  process.stdout.write('DOCTOR_OK no_install_attempted\n');
}

function plan(command, manifest) {
  const commands = command === 'install'
    ? [
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['codex', 'plugin', 'list', '--json'],
        ['codex', 'plugin', 'marketplace', 'add', manifest.source, '--ref', manifest.pluginRef, '--json'],
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['git', '-C', '<codex-installedRoot>', 'rev-parse', 'HEAD'],
        ['git', '-C', '<codex-installedRoot>', 'remote', 'get-url', 'origin'],
        ['codex', 'plugin', 'add', `${manifest.plugin}@${manifest.marketplace}`, '--json'],
        ['codex', 'plugin', 'list', '--json']
      ]
    : [
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['codex', 'plugin', 'list', '--json']
      ];
  commands.forEach((argv) => process.stdout.write(`DRY_RUN ${JSON.stringify(argv)}\n`));
  process.stdout.write(command === 'install' ? 'DRY_RUN_OK runtime_unchanged\n' : 'DRY_RUN_DOCTOR_OK runtime_unchanged\n');
}

function usage() {
  process.stdout.write([
    'chengfeng-videocut-skills bootstrap',
    '',
    'Usage:',
    '  npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> install',
    '  npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> doctor',
    '  npx -y github:Agentchengfeng/chengfeng-videocut-skills#<published-40hex-bootstrap-commit> install --dry-run',
    '',
    'This bootstrap only adds the Codex marketplace/plugin. It never installs, upgrades, starts, or edits the Product Runtime.'
  ].join('\n') + '\n');
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const dryRun = argv.includes('--dry-run');
  if (command === 'help' || command === '--help' || command === '-h') return usage();
  if (!['install', 'doctor'].includes(command) || argv.some((arg) => !['install', 'doctor', '--dry-run'].includes(arg))) {
    fail('Unsupported command. Use install, doctor, or help.');
  }
  const manifest = readManifest();
  if (dryRun) return plan(command, manifest);
  if (command === 'install') return install(manifest);
  return doctor(manifest);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`REFUSED ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, readManifest, verifyMarketplaceIdentity };
