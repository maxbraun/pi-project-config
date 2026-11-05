import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';

function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`${path}: ${error.message}`); }
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function selection(value, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!['layout', 'extensions', 'skills', 'skillPaths', 'exclude'].includes(key)) throw new Error(`${label}: unknown key ${key}`);
  if (value.layout !== undefined && typeof value.layout !== 'string') throw new Error(`${label}.layout must be a string`);
  if (value.extensions !== undefined && (!Array.isArray(value.extensions) || value.extensions.some(x => typeof x !== 'string'))) throw new Error(`${label}.extensions must be an array of names`);
  for (const key of ['skills', 'skillPaths']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(x => typeof x !== 'string' || !x))) throw new Error(`${label}.${key} must be an array of nonempty strings`);
  }
  if (value.exclude !== undefined) {
    object(value.exclude, `${label}.exclude`);
    for (const [key, names] of Object.entries(value.exclude)) {
      if (!['extensions', 'skills'].includes(key)) throw new Error(`${label}.exclude: unknown key ${key}`);
      if (!Array.isArray(names) || names.some(x => typeof x !== 'string')) throw new Error(`${label}.exclude.${key} must be an array of names`);
    }
  }
  return value;
}
export function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}
export function findProjects(cwd) {
  const paths = [];
  let dir = resolve(cwd);
  while (true) {
    const path = join(dir, '.pi', 'settings.json');
    if (existsSync(path)) paths.unshift(path);
    const parent = dirname(dir);
    if (parent === dir) return paths;
    dir = parent;
  }
}
export function findProject(cwd) { return findProjects(cwd).at(-1); }
export function loadConfig(cwd, globalPath) {
  const settings = existsSync(globalPath) ? read(globalPath) : {};
  object(settings, globalPath);
  const global = Object.hasOwn(settings, 'projectConfig') ? settings.projectConfig : {};
  object(global, `${globalPath}.projectConfig`);
  if (global.enabled !== undefined && typeof global.enabled !== 'boolean') throw new Error('projectConfig.enabled must be a boolean');
  if (global.enabled === false) return { enabled: false, layout: 'default', extensions: [], modules: [], skills: [], skillPaths: [], projectPaths: [], globalPath };
  for (const key of Object.keys(global)) if (!['enabled', 'defaults', 'rules', 'extensions', 'layouts', 'skills'].includes(key)) throw new Error(`${globalPath}: unknown key ${key}`);
  const registry = global.extensions ?? {};
  const skills = global.skills ?? {};
  object(skills, 'skills');
  const layouts = global.layouts ?? {};
  object(registry, 'extensions'); object(layouts, 'layouts');
  for (const [name, path] of [...Object.entries(registry), ...Object.entries(layouts), ...Object.entries(skills)]) {
    if (!name || typeof path !== 'string' || !path) throw new Error(`Invalid registry entry ${name}`);
  }
  if (global.rules !== undefined && !Array.isArray(global.rules)) throw new Error('rules must be an array');
  let layout = 'default';
  const names = new Set();
  const skillNames = new Set();
  const localSkills = new Set();
  function merge(value, label, base = dirname(globalPath)) {
    selection(value, label);
    if (value.layout !== undefined) layout = value.layout;
    for (const name of value.extensions ?? []) names.add(name);
    for (const name of value.skills ?? []) skillNames.add(name);
    for (const path of value.skillPaths ?? []) localSkills.add(resolve(base, path));
    for (const name of value.exclude?.extensions ?? []) names.delete(name);
    for (const name of value.exclude?.skills ?? []) skillNames.delete(name);
  }
  merge(global.defaults ?? {}, 'defaults');
  for (const rule of global.rules ?? []) {
    object(rule, 'rule');
    if (typeof rule.path !== 'string') throw new Error('rule.path must be a string');
    const { path, ...settings } = rule;
    selection(settings, 'rule');
    if (isWithin(resolve(dirname(globalPath), path), resolve(cwd))) merge(settings, 'rule');
  }
  const projectPaths = [];
  for (const path of findProjects(cwd)) {
    if (resolve(path) === resolve(globalPath)) continue;
    const settings = read(path);
    object(settings, path);
    if (!Object.hasOwn(settings, 'projectConfig')) continue;
    const local = settings.projectConfig;
    object(local, `${path}.projectConfig`);
    const { enabled, ...values } = local;
    if (enabled !== undefined && typeof enabled !== 'boolean') throw new Error(`${path}: projectConfig.enabled must be a boolean`);
    // Folder opt-outs skip that layer; they cannot override the global kill switch.
    if (enabled === false) continue;
    merge(values, `${path}.projectConfig`, dirname(path));
    projectPaths.push(path);
  }
  const projectPath = projectPaths.at(-1);
  for (const name of names) if (!Object.hasOwn(registry, name)) throw new Error(`Unknown extension: ${name}`);
  if (!['default', 'compact'].includes(layout) && !Object.hasOwn(layouts, layout)) throw new Error(`Unknown layout: ${layout}`);
  for (const name of skillNames) if (!Object.hasOwn(skills, name)) throw new Error(`Unknown skill: ${name}`);
  const base = dirname(globalPath);
  const skillPaths = [...new Set([...skillNames].map(name => resolve(base, skills[name])).concat([...localSkills]))];
  const modules = [...names].map(name => ({ name, path: resolve(base, registry[name]) }));
  if (Object.hasOwn(layouts, layout)) modules.push({ name: `layout:${layout}`, path: resolve(base, layouts[layout]) });
  return { enabled: true, layout, extensions: [...names], modules, skills: [...skillNames], skillPaths, projectPath, projectPaths, globalPath };
}
