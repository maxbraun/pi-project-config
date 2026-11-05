# pi-project-config

A standard Pi extension package for central, additive startup rules and project-local layout selection. Requires Pi 1.5.0+. No runtime dependencies beyond Pi.

## Install

```sh
pi install git:github.com/maxbraun/pi-project-config
```

This adds the package to your normal Pi configuration. To try it without changing settings:

```sh
git clone https://github.com/maxbraun/pi-project-config.git
cd pi-project-config
pi -e ./src/extension.ts
```

## Project configuration

Commit `.pi/project.json` in your project:

```json
{
  "layout": "compact",
  "extensions": ["git", "tasks"]
}
```

`extensions` can be omitted. Names must exist in your central registry; projects cannot import arbitrary code paths through this file. Unknown names, unknown fields and malformed config produce startup errors rather than being silently ignored.

## Central registry and directory rules

Create `~/.pi/agent/project-config.json` (or use `PI_CODING_AGENT_DIR`):

```json
{
  "defaults": { "layout": "default", "extensions": [] },
  "extensions": {
    "git": "/absolute/path/to/git.ts",
    "tasks": "/absolute/path/to/tasks.ts"
  },
  "layouts": { "wide": "/absolute/path/to/wide-layout.ts" },
  "rules": [
    { "path": "/home/you/work", "layout": "compact", "extensions": ["git"] },
    { "path": "/home/you/work/special", "extensions": ["tasks"] }
  ]
}
```

Registry entries must point to individual modules exporting a default Pi extension function. Relative registry and rule paths resolve from the central config directory. No automatic package installation or remote fetching occurs.

Precedence: defaults → matching directory rules in listed order → nearest project config. Layout is overridden; extension names accumulate and are deduplicated. Explicit `[]` does not disable inherited extensions. A module is initialized once even if referenced by multiple names.

Project discovery walks up from the startup directory, stopping at the nearest config, Git repository root, or filesystem root. Parent project configs are not merged. Directory matching respects path boundaries (`foo` does not match `foobar`). Paths are lexical, not symlink-canonicalized.

## Layouts

- `default`: leave Pi's UI unchanged.
- `compact`: replace the startup header with `pi · <project>`; editor, footer and chat remain unchanged.
- Custom names such as `wide`: load the centrally registered layout extension. That extension owns the actual UI changes; there is no built-in split-pane/wide layout.

Custom modules use standard Pi extension APIs. Child modules share this loader's extension identity and are not independently managed by Pi. Their default functions receive the Pi API only, so ordinary extensions work unchanged. Do not also install the same child independently.

`/project-config` displays the effective selection and config paths. Use `/reload` after editing configuration. Non-TUI modes resolve/load modules but skip the built-in compact header. Project config is declarative, but selected registered modules are executable code and should be trusted. This loader does not reuse Pi's project-package trust prompt.

## Checks

```sh
npm test
```
