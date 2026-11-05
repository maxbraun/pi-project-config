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
  for (const key of Object.keys(value)) if (!['layout', 'extensions'].includes(key)) throw new Error(`${label}: unknown key ${key}`);
  if (value.layout !== undefined && typeof value.layout !== 'string') throw new Error(`${label}.layout must be a string`);
  if (value.extensions !== undefined && (!Array.isArray(value.extensions) || value.extensions.some(x => typeof x !== 'string'))) throw new Error(`${label}.extensions must be an array of names`);
  return value;
}
export function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}
export function findProject(cwd) {
  let dir = resolve(cwd);
  while (true) {
    const path = join(dir, '.pi', 'project.json');
    if (existsSync(path)) return path;
    // Do not inherit another project's config across a repository boundary.
    if (existsSync(join(dir, '.git'))) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
export function loadConfig(cwd, globalPath) {
  const global = existsSync(globalPath) ? read(globalPath) : {};
  object(global, globalPath);
  for (const key of Object.keys(global)) if (!['defaults', 'rules', 'extensions', 'layouts'].includes(key)) throw new Error(`${globalPath}: unknown key ${key}`);
  const registry = global.extensions ?? {};
  const layouts = global.layouts ?? {};
  object(registry, 'extensions'); object(layouts, 'layouts');
  for (const [name, path] of [...Object.entries(registry), ...Object.entries(layouts)]) {
    if (!name || typeof path !== 'string' || !path) throw new Error(`Invalid registry entry ${name}`);
  }
  if (global.rules !== undefined && !Array.isArray(global.rules)) throw new Error('rules must be an array');
  let layout = 'default';
  const names = new Set();
  function merge(value, label) {
    selection(value, label);
    if (value.layout !== undefined) layout = value.layout;
    for (const name of value.extensions ?? []) names.add(name);
  }
  merge(global.defaults ?? {}, 'defaults');
  for (const rule of global.rules ?? []) {
    object(rule, 'rule');
    if (typeof rule.path !== 'string') throw new Error('rule.path must be a string');
    const { path, ...settings } = rule;
    selection(settings, 'rule');
    if (isWithin(resolve(dirname(globalPath), path), resolve(cwd))) merge(settings, 'rule');
  }
  const projectPath = findProject(cwd);
  if (projectPath) merge(read(projectPath), projectPath);
  for (const name of names) if (!Object.hasOwn(registry, name)) throw new Error(`Unknown extension: ${name}`);
  if (!['default', 'compact'].includes(layout) && !Object.hasOwn(layouts, layout)) throw new Error(`Unknown layout: ${layout}`);
  const base = dirname(globalPath);
  const modules = [...names].map(name => ({ name, path: resolve(base, registry[name]) }));
  if (Object.hasOwn(layouts, layout)) modules.push({ name: `layout:${layout}`, path: resolve(base, layouts[layout]) });
  return { layout, extensions: [...names], modules, projectPath, globalPath };
}
