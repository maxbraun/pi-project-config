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
test('nearest config wins and repository boundary prevents parent leakage', t => {
  const f = fixture(t);
  f.write('.pi/project.json', { layout: 'compact' });
  f.write('repo/.git', 'gitdir: elsewhere');
  assert.equal(findProject(join(f.root, 'repo/src')), undefined);
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
