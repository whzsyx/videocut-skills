'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'Agentchengfeng/chengfeng-videocut-skills';
const ORIGIN = `https://github.com/${SOURCE}.git`;

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function createClone(dir, { origin = ORIGIN } = {}) {
  const clone = path.join(dir, 'codex-home', '.tmp', 'marketplaces', 'chengfeng-videocut');
  fs.mkdirSync(clone, { recursive: true });
  run('git', ['init', '-q', clone]);
  run('git', ['-C', clone, 'config', 'user.email', 'test@example.invalid']);
  run('git', ['-C', clone, 'config', 'user.name', 'Bootstrap Test']);
  fs.writeFileSync(path.join(clone, 'marketplace.txt'), 'fixture\n');
  run('git', ['-C', clone, 'add', '.']);
  run('git', ['-C', clone, 'commit', '-qm', 'fixture']);
  run('git', ['-C', clone, 'remote', 'add', 'origin', origin]);
  return { clone, commit: run('git', ['-C', clone, 'rev-parse', 'HEAD']).trim() };
}

function writeMockCodex(dir) {
  const mockBin = path.join(dir, 'mock-bin');
  fs.mkdirSync(mockBin, { recursive: true });
  const mock = path.join(mockBin, 'codex');
  fs.writeFileSync(mock, `#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const a=process.argv.slice(2), log=process.env.MOCK_LOG, mode=process.env.MOCK_MODE||'';
const before=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';
fs.appendFileSync(log,JSON.stringify(a)+'\\n');
const added=before.includes('marketplace","add');
const pluginAdded=before.includes('plugin","add","chengfeng-videocut@chengfeng-videocut');
const doctorInstalled=process.env.MOCK_DOCTOR_INSTALLED&&mode!=='doctor-missing-plugin';
const root=process.env.MOCK_ROOT;
const source=mode==='list-source-mismatch'?'https://github.com/example/other.git':'https://github.com/Agentchengfeng/chengfeng-videocut-skills.git';
if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='list'){
  const marketplaces=process.env.MOCK_MARKETPLACE_COLLISION||doctorInstalled||added?[{name:'chengfeng-videocut',root,marketplaceSource:{sourceType:'git',source}}]:[];
  console.log(JSON.stringify({marketplaces}));
}else if(a[0]==='plugin'&&a[1]==='list'){
  const installed=process.env.MOCK_PLUGIN_COLLISION?[{name:'chengfeng-videocut',marketplaceName:'other-marketplace',installed:true}]:doctorInstalled||pluginAdded?[{name:'chengfeng-videocut',marketplaceName:'chengfeng-videocut',installed:true}]:[];
  console.log(JSON.stringify({installed}));
}else if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='add'){
  const receipt={marketplaceName:'chengfeng-videocut',alreadyAdded:mode==='already-added'};
  if(mode!=='missing-root')receipt.installedRoot=root;
  console.log(JSON.stringify(receipt));
}else if(a[0]==='plugin'&&a[1]==='add')console.log(JSON.stringify({ok:true}));
else process.exit(9);
`);
  fs.chmodSync(mock, 0o755);
  return mockBin;
}

function fixture({ packageRoot = ROOT, manifest = {}, clone = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'videocut-bootstrap-'));
  const packageDir = path.join(dir, 'package');
  fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'bin', 'install.cjs'), path.join(packageDir, 'bin', 'install.cjs'));
  const configured = { ...JSON.parse(fs.readFileSync(path.join(packageRoot, 'installer-manifest.json'), 'utf8')), ...manifest };
  const marketplaceClone = createClone(dir, clone);
  if (!Object.prototype.hasOwnProperty.call(manifest, 'pluginRef')) configured.pluginRef = marketplaceClone.commit;
  fs.writeFileSync(path.join(packageDir, 'installer-manifest.json'), JSON.stringify(configured, null, 2) + '\n');
  const mockBin = writeMockCodex(dir);
  return { dir, packageDir, clone: marketplaceClone.clone, pluginRef: configured.pluginRef, log: path.join(dir, 'calls.jsonl'), mockBin };
}

function invoke(f, args = ['install'], env = {}) {
  return childProcess.spawnSync('node', [path.join(f.packageDir, 'bin', 'install.cjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: path.join(f.dir, 'home'), CODEX_HOME: path.join(f.dir, 'codex-home'), PATH: `${f.mockBin}${path.delimiter}${process.env.PATH}`, MOCK_LOG: f.log, MOCK_ROOT: f.clone, ...env }
  });
}

function calls(f) {
  return fs.readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse);
}

function expectedInstallCalls(f) {
  return [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'add', 'chengfeng-videocut@chengfeng-videocut', '--json'],
    ['plugin', 'list', '--json']
  ];
}

test('unpublished or malformed pluginRef refuses before Codex calls', () => {
  const f = fixture({ manifest: { pluginRef: 'UNPUBLISHED_REPLACE_WITH_40_HEX_COMMIT' } });
  const result = invoke(f);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No published immutable 40-hex pluginRef/);
  assert.equal(fs.existsSync(f.log), false);
});

test('source identity mutation refuses before Codex calls', () => {
  const f = fixture({ manifest: { source: 'example/other' } });
  const result = invoke(f);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /source is not the expected identity/);
  assert.equal(fs.existsSync(f.log), false);
});

test('tarball-shaped package without .git installs only through pinned official Codex argv', () => {
  const f = fixture();
  assert.equal(fs.existsSync(path.join(f.packageDir, '.git')), false);
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /INSTALLED_OK runtime_unchanged/);
  assert.deepEqual(calls(f), expectedInstallCalls(f));
});

test('same-name marketplace collision stops without add, plugin add, remove, or cache migration', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_MARKETPLACE_COLLISION: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /already exists/);
  assert.deepEqual(calls(f), [['plugin', 'marketplace', 'list', '--json']]);
});

test('non-target plugin collision stops before marketplace add', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_PLUGIN_COLLISION: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to remove or overwrite/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
});

test('receipt without installedRoot stops before plugin activation', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_MODE: 'missing-root' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /marketplace_identity_unverified/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
    ['plugin', 'marketplace', 'list', '--json']
  ]);
});

test('receipt alreadyAdded or marketplace list source mismatch stops before plugin activation', () => {
  const alreadyAdded = fixture();
  const alreadyAddedResult = invoke(alreadyAdded, ['install'], { MOCK_MODE: 'already-added' });
  assert.equal(alreadyAddedResult.status, 2);
  assert.match(alreadyAddedResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(alreadyAdded).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const sourceMismatch = fixture();
  const sourceMismatchResult = invoke(sourceMismatch, ['install'], { MOCK_MODE: 'list-source-mismatch' });
  assert.equal(sourceMismatchResult.status, 2);
  assert.match(sourceMismatchResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(sourceMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);
});

test('Codex clone HEAD or origin mismatch stops before plugin activation', () => {
  const headMismatch = fixture({ manifest: { pluginRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
  const headResult = invoke(headMismatch);
  assert.equal(headResult.status, 2);
  assert.match(headResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(headMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const originMismatch = fixture({ clone: { origin: 'https://github.com/example/other.git' } });
  const originResult = invoke(originMismatch);
  assert.equal(originResult.status, 2);
  assert.match(originResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(originMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);
});

test('dry-run makes no Codex or Git calls', () => {
  const f = fixture();
  const result = invoke(f, ['install', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY_RUN_OK runtime_unchanged/);
  assert.match(result.stdout, /DRY_RUN \["git","-C","<codex-installedRoot>","rev-parse","HEAD"\]/);
  assert.doesNotMatch(result.stdout, /\["codex","git"/);
  assert.equal(fs.existsSync(f.log), false);
});

test('doctor validates an installed marketplace and plugin through read-only commands', () => {
  const f = fixture();
  const result = invoke(f, ['doctor'], { MOCK_DOCTOR_INSTALLED: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DOCTOR_OK no_install_attempted/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
});

test('doctor fails closed for missing marketplace/plugin or source/clone identity mismatch', () => {
  const scenarios = [
    { name: 'missing marketplace', env: {} },
    { name: 'missing plugin', env: { MOCK_DOCTOR_INSTALLED: '1', MOCK_MODE: 'doctor-missing-plugin' } },
    { name: 'list source mismatch', env: { MOCK_DOCTOR_INSTALLED: '1', MOCK_MODE: 'list-source-mismatch' } },
    { name: 'clone HEAD mismatch', manifest: { pluginRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, env: { MOCK_DOCTOR_INSTALLED: '1' } },
    { name: 'clone origin mismatch', clone: { origin: 'https://github.com/example/other.git' }, env: { MOCK_DOCTOR_INSTALLED: '1' } }
  ];
  for (const scenario of scenarios) {
    const f = fixture({ manifest: scenario.manifest, clone: scenario.clone });
    const result = invoke(f, ['doctor'], scenario.env);
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, /marketplace_identity_unverified/, scenario.name);
    assert.deepEqual(calls(f), [
      ['plugin', 'marketplace', 'list', '--json'],
      ['plugin', 'list', '--json']
    ], scenario.name);
  }
});

test('real npm pack extraction has no .git and can complete the same mocked install', () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'videocut-bootstrap-pack-'));
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', packDir], { cwd: ROOT });
  const archive = fs.readdirSync(packDir).find((name) => name.endsWith('.tgz'));
  assert.ok(archive, 'npm pack should create a tarball');
  const unpack = path.join(packDir, 'unpack');
  fs.mkdirSync(unpack);
  run('tar', ['-xzf', path.join(packDir, archive), '-C', unpack]);
  const f = fixture({ packageRoot: path.join(unpack, 'package') });
  assert.equal(fs.existsSync(path.join(f.packageDir, '.git')), false);
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(f), expectedInstallCalls(f));
});
