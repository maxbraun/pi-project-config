import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, findProject, isWithin } from '../src/config.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pi-project-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(path.endsWith('/settings.json') ? { projectConfig: value } : value)); };
  return { root, write, global: join(root, 'agent/settings.json') };
}
test('defaults, ordered rules and nearest project merge additively with deduplication', t => {
  const f = fixture(t);
  f.write('agent/settings.json', { defaults: { extensions: ['base'] }, extensions: { base: './base.ts', work: './work.ts', local: './local.ts' }, rules: [{ path: '../work', layout: 'compact', extensions: ['work'] }] });
  f.write('work/.pi/settings.json', { layout: 'default', extensions: ['local', 'base'] });
  const c = loadConfig(join(f.root, 'work/src/nested'), f.global);
  assert.equal(c.layout, 'default'); assert.deepEqual(c.extensions, ['base', 'work', 'local']);
  assert.equal(c.modules[0].path, join(f.root, 'agent/base.ts'));
});
test('directory names are boundary matched', () => {
  assert.equal(isWithin('/work/foo', '/work/foobar'), false);
  assert.equal(isWithin('/work/foo', '/work/foo/src'), true);
});
test('all ancestor configs are discovered across repository boundaries', t => {
  const f = fixture(t);
  f.write('.pi/settings.json', { layout: 'compact' });
  f.write('repo/.git', 'gitdir: elsewhere');
  assert.equal(findProject(join(f.root, 'repo/src')), join(f.root, '.pi/settings.json'));
  assert.equal(loadConfig(join(f.root, 'repo/src'), f.global).layout, 'compact');
  f.write('repo/.pi/settings.json', { layout: 'default' });
  assert.equal(findProject(join(f.root, 'repo/src')), join(f.root, 'repo/.pi/settings.json'));
});
test('project cannot supply executable paths or unknown names', t => {
  const f = fixture(t);
  f.write('project/.pi/settings.json', { extensions: ['./bad.ts'] });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /Unknown extension/);
  f.write('project/.pi/settings.json', { layout: 'missing' });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /Unknown layout/);
  f.write('project/.pi/settings.json', { extensions: 'bad' });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /array of names/);
});
test('custom layout registry resolves to module and no config uses default', t => {
  const f = fixture(t);
  assert.equal(loadConfig(f.root, f.global).layout, 'default');
  f.write('agent/settings.json', { defaults: { layout: 'wide' }, layouts: { wide: './wide.ts' } });
  assert.equal(loadConfig(f.root, f.global).modules[0].path, join(f.root, 'agent/wide.ts'));
});
test('malformed JSON includes source filename', t => {
  const f = fixture(t);
  f.write('project/.pi/settings.json', {});
  writeFileSync(join(f.root, 'project/.pi/settings.json'), '{');
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /settings.json/);
});

test('hierarchy merges outer to inner, excludes inherited names, and resolves local skills per file', t => {
  const f = fixture(t);
  f.write('agent/settings.json', {
    extensions: { base: './base.ts', extra: './extra.ts' },
    skills: { shared: './shared', omit: './omit' },
    defaults: { extensions: ['base'], skills: ['shared', 'omit'] },
  });
  f.write('.pi/settings.json', { layout: 'compact', extensions: ['extra'], skillPaths: ['./skills'] });
  f.write('repo/.git', 'gitdir: elsewhere');
  f.write('repo/.pi/settings.json', { skills: ['shared'], skillPaths: ['./skills'], exclude: { extensions: ['base'], skills: ['omit'] } });
  f.write('repo/src/.pi/settings.json', { layout: 'default', extensions: [] });
  const c = loadConfig(join(f.root, 'repo/src'), f.global);
  assert.equal(c.projectPaths.length, 3);
  assert.equal(c.layout, 'default');
  assert.deepEqual(c.extensions, ['extra']);
  assert.deepEqual(c.skills, ['shared']);
  assert.deepEqual(c.skillPaths, [join(f.root, 'agent/shared'), join(f.root, '.pi/skills'), join(f.root, 'repo/.pi/skills')]);
});
test('deeper config can re-enable names, and exclusion wins within a layer', t => {
  const f = fixture(t);
  f.write('agent/settings.json', { extensions: { a: './a.ts' }, defaults: { extensions: ['a'], exclude: { extensions: ['a'] } } });
  assert.deepEqual(loadConfig(f.root, f.global).extensions, []);
  f.write('.pi/settings.json', { extensions: ['a'] });
  assert.deepEqual(loadConfig(f.root, f.global).extensions, ['a']);
});
test('invalid skills, exclusions and ancestor configs fail with diagnostics', t => {
  const f = fixture(t);
  for (const [value, pattern] of [
    [{ skills: ['unknown'] }, /Unknown skill/],
    [{ skills: 'bad' }, /skills must be an array/],
    [{ skillPaths: [''] }, /skillPaths must be an array/],
    [{ exclude: [] }, /exclude must be an object/],
    [{ exclude: { skills: 'bad' } }, /exclude.skills must be an array/],
    [{ exclude: { typo: [] } }, /unknown key/],
    [{ typo: true }, /unknown key/],
  ]) {
    f.write('.pi/settings.json', value);
    assert.throws(() => loadConfig(join(f.root, 'repo/src'), f.global), pattern);
  }
});

test('extension initializes duplicate modules once and provides skills through native discovery', async t => {
  const f = fixture(t);
  const previousDir = process.cwd();
  const previousAgent = process.env.PI_CODING_AGENT_DIR;
  t.after(() => {
    process.chdir(previousDir);
    if (previousAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgent;
  });
  f.write('agent/settings.json', {
    extensions: { one: './child.mjs', alias: './child.mjs' },
    skills: { shared: './skills' },
    defaults: { extensions: ['one', 'alias'], skills: ['shared'] },
  });
  writeFileSync(join(f.root, 'agent/child.mjs'), 'export default function(pi) { pi.childLoads++; }');
  process.chdir(f.root);
  process.env.PI_CODING_AGENT_DIR = join(f.root, 'agent');
  const handlers = new Map();
  const pi = { childLoads: 0, on: (name, fn) => handlers.set(name, fn), registerCommand() {} };
  const { default: extension } = await import('../src/extension.ts');
  await extension(pi);
  assert.equal(pi.childLoads, 1);
  for (const reason of ['startup', 'reload']) {
    assert.deepEqual(handlers.get('resources_discover')({ reason, cwd: f.root }), { skillPaths: [join(f.root, 'agent/skills')] });
  }
});

test('native Pi settings coexist without becoming hierarchical plugin fields', t => {
  const f = fixture(t);
  f.write('agent/settings.json', { defaults: { layout: 'compact' } });
  const global = {};
  global.defaultModel = 'native-model';
  global.extensions = ['./native.ts'];
  global.projectConfig = { defaults: { layout: 'compact' } };
  writeFileSync(f.global, JSON.stringify(global));
  f.write('.pi/settings.json', {});
  writeFileSync(join(f.root, '.pi/settings.json'), JSON.stringify({ theme: 'dark', extensions: ['./native-only.ts'] }));
  const c = loadConfig(f.root, f.global);
  assert.equal(c.layout, 'compact');
  assert.deepEqual(c.modules, []);
  assert.deepEqual(c.projectPaths, []);
});

test('global disable wins before validating selections or reading folder settings', t => {
  const f = fixture(t);
  f.write('agent/settings.json', { enabled: false, defaults: 'invalid' });
  f.write('.pi/settings.json', { enabled: true, extensions: ['missing'] });
  const c = loadConfig(f.root, f.global);
  assert.equal(c.enabled, false);
  assert.deepEqual(c.modules, []);
  writeFileSync(join(f.root, '.pi/settings.json'), '{');
  assert.deepEqual(loadConfig(f.root, f.global).projectPaths, []);
});

test('enabled is boolean, folders may skip their layer, legacy files are ignored', t => {
  const f = fixture(t);
  f.write('agent/settings.json', { enabled: 'false' });
  assert.throws(() => loadConfig(f.root, f.global), /enabled must be a boolean/);
  f.write('agent/settings.json', { defaults: { layout: 'compact' } });
  f.write('.pi/settings.json', { enabled: false, layout: 'default' });
  f.write('.pi/project.json', { layout: 'default' });
  f.write('agent/project-config.json', { defaults: { layout: 'default' } });
  assert.equal(loadConfig(f.root, f.global).layout, 'compact');
});

test('reload reinitialization reads updated selections and disable switch silently', async t => {
  const f = fixture(t);
  const previousDir = process.cwd();
  const previousAgent = process.env.PI_CODING_AGENT_DIR;
  t.after(() => {
    process.chdir(previousDir);
    if (previousAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgent;
  });
  process.chdir(f.root);
  process.env.PI_CODING_AGENT_DIR = join(f.root, 'agent');
  const { default: extension } = await import('../src/extension.ts');
  async function initialize() {
    const handlers = new Map();
    await extension({ on: (name, fn) => handlers.set(name, fn), registerCommand() {} });
    return handlers.get('resources_discover')({ reason: 'reload', cwd: f.root });
  }
  f.write('agent/settings.json', { defaults: { skillPaths: ['./first'] } });
  assert.deepEqual(await initialize(), { skillPaths: [join(f.root, 'agent/first')] });
  f.write('agent/settings.json', { defaults: { skillPaths: ['./second'] } });
  assert.deepEqual(await initialize(), { skillPaths: [join(f.root, 'agent/second')] });
  f.write('agent/settings.json', { enabled: false });
  assert.deepEqual(await initialize(), { skillPaths: [] });
});


test('invalid namespaces fail consistently in global and folder settings', t => {
  const f = fixture(t);
  for (const value of [null, [], true, 'invalid']) {
    f.write('agent/settings.json', value);
    assert.throws(() => loadConfig(f.root, f.global), /projectConfig must be an object/);
    f.write('agent/settings.json', {});
    f.write('.pi/settings.json', value);
    assert.throws(() => loadConfig(f.root, f.global), /projectConfig must be an object/);
  }
});
