import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadConfig } from './config.mjs';

export default async function (pi: ExtensionAPI) {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  const config = loadConfig(process.cwd(), join(agentDir, 'settings.json'));
  const seen = new Set<string>();
  for (const module of config.modules) {
    if (seen.has(module.path)) continue;
    seen.add(module.path);
    const child = await import(pathToFileURL(module.path).href);
    if (typeof child.default !== 'function') throw new Error(`${module.path} must export a default extension function`);
    await child.default(pi);
  }
  pi.on('resources_discover', () => ({ skillPaths: config.skillPaths }));
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    if (config.layout === 'compact') {
      const project = config.projectPath ? basename(dirname(dirname(config.projectPath))) : basename(ctx.cwd);
      ctx.ui.setHeader((_tui, theme) => ({
        render: () => [theme.fg('accent', `pi · ${project}`)],
        invalidate() {},
      }));
    }
  });
  pi.registerCommand('project-config', {
    description: 'Show effective project configuration (reload Pi to apply changes)',
    handler: async (_args, ctx) => {
      ctx.ui.notify(JSON.stringify({ ...config, modules: config.modules.map(m => m.name) }, null, 2), 'info');
    },
  });
}
