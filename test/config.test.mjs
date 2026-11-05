import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, findProject, isWithin } from '../src/config.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pi-project-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(value)); };
  return { root, write, global: join(root, 'agent/project-config.json') };
}
test('defaults, ordered rules and nearest project merge additively with deduplication', t => {
  const f = fixture(t);
  f.write('agent/project-config.json', { defaults: { extensions: ['base'] }, extensions: { base: './base.ts', work: './work.ts', local: './local.ts' }, rules: [{ path: '../work', layout: 'compact', extensions: ['work'] }] });
  f.write('work/.pi/project.json', { layout: 'default', extensions: ['local', 'base'] });
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
  f.write('.pi/project.json', { layout: 'compact' });
  f.write('repo/.git', 'gitdir: elsewhere');
  assert.equal(findProject(join(f.root, 'repo/src')), join(f.root, '.pi/project.json'));
  assert.equal(loadConfig(join(f.root, 'repo/src'), f.global).layout, 'compact');
  f.write('repo/.pi/project.json', { layout: 'default' });
  assert.equal(findProject(join(f.root, 'repo/src')), join(f.root, 'repo/.pi/project.json'));
});
test('project cannot supply executable paths or unknown names', t => {
  const f = fixture(t);
  f.write('project/.pi/project.json', { extensions: ['./bad.ts'] });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /Unknown extension/);
  f.write('project/.pi/project.json', { layout: 'missing' });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /Unknown layout/);
  f.write('project/.pi/project.json', { extensions: 'bad' });
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /array of names/);
});
test('custom layout registry resolves to module and no config uses default', t => {
  const f = fixture(t);
  assert.equal(loadConfig(f.root, f.global).layout, 'default');
  f.write('agent/project-config.json', { defaults: { layout: 'wide' }, layouts: { wide: './wide.ts' } });
  assert.equal(loadConfig(f.root, f.global).modules[0].path, join(f.root, 'agent/wide.ts'));
});
test('malformed JSON includes source filename', t => {
  const f = fixture(t);
  f.write('project/.pi/project.json', {});
  writeFileSync(join(f.root, 'project/.pi/project.json'), '{');
  assert.throws(() => loadConfig(join(f.root, 'project'), f.global), /project.json/);
});

test('hierarchy merges outer to inner, excludes inherited names, and resolves local skills per file', t => {
  const f = fixture(t);
  f.write('agent/project-config.json', {
    extensions: { base: './base.ts', extra: './extra.ts' },
    skills: { shared: './shared', omit: './omit' },
    defaults: { extensions: ['base'], skills: ['shared', 'omit'] },
  });
  f.write('.pi/project.json', { layout: 'compact', extensions: ['extra'], skillPaths: ['./skills'] });
  f.write('repo/.git', 'gitdir: elsewhere');
  f.write('repo/.pi/project.json', { skills: ['shared'], skillPaths: ['./skills'], exclude: { extensions: ['base'], skills: ['omit'] } });
  f.write('repo/src/.pi/project.json', { layout: 'default', extensions: [] });
  const c = loadConfig(join(f.root, 'repo/src'), f.global);
  assert.equal(c.projectPaths.length, 3);
  assert.equal(c.layout, 'default');
  assert.deepEqual(c.extensions, ['extra']);
  assert.deepEqual(c.skills, ['shared']);
  assert.deepEqual(c.skillPaths, [join(f.root, 'agent/shared'), join(f.root, '.pi/skills'), join(f.root, 'repo/.pi/skills')]);
});
test('deeper config can re-enable names, and exclusion wins within a layer', t => {
  const f = fixture(t);
  f.write('agent/project-config.json', { extensions: { a: './a.ts' }, defaults: { extensions: ['a'], exclude: { extensions: ['a'] } } });
  assert.deepEqual(loadConfig(f.root, f.global).extensions, []);
  f.write('.pi/project.json', { extensions: ['a'] });
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
    f.write('.pi/project.json', value);
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
  f.write('agent/project-config.json', {
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
