# pi-project-config

A standard Pi extension package for silent hierarchical folder configuration of extensions,
skills and layouts. Requires Pi 1.5.0+. No runtime dependencies beyond Pi.

## Install

```sh
pi install git:github.com/maxbraun/pi-project-config
```

Or try it without changing settings:

```sh
git clone https://github.com/maxbraun/pi-project-config.git
cd pi-project-config
pi -e ./src/extension.ts
```

## Configuration

Use the `projectConfig` key in Pi's existing `settings.json` files. All other keys
belong to Pi and are untouched. No separate project configuration file is loaded.

In `~/.pi/agent/settings.json` (or `PI_CODING_AGENT_DIR/settings.json`), merge this
key into your existing settings; keep your other Pi settings:

```json
{
  "projectConfig": {
    "enabled": true,
    "defaults": { "layout": "default", "extensions": [] },
    "extensions": {
      "git": "/absolute/path/to/git.ts",
      "tasks": "/absolute/path/to/tasks.ts"
    },
    "layouts": { "wide": "/absolute/path/to/wide-layout.ts" },
    "skills": { "review": "/absolute/path/to/review/SKILL.md" },
    "rules": [
      { "path": "/home/you/work", "layout": "compact", "extensions": ["git"] },
      { "path": "/home/you/work/special", "extensions": ["tasks"] }
    ]
  }
}
```

Projects and parent folders use `.pi/settings.json`:

```json
{
  "theme": "dark",
  "projectConfig": {
    "layout": "compact",
    "extensions": ["git", "tasks"],
    "skills": ["review"],
    "skillPaths": ["./skills"],
    "exclude": { "extensions": [], "skills": [] }
  }
}
```

Here `theme` is handled by Pi, not inherited by this loader. All selection fields
are optional. Extension/skill names must exist in the global registry. Folder
configuration cannot declare executable module paths or modify that registry.
Unknown plugin fields, unknown names and malformed JSON produce errors containing
the source filename where available. Native settings and files without a
`projectConfig` key are ignored by the plugin.

### Disable

Set `projectConfig.enabled` to `false` in the **global** settings file:

```json
{
  "projectConfig": { "enabled": false }
}
```

Default: `true`. A global disable stops all plugin selections, module loading,
layout changes and skill discovery. Folder configs are not read and cannot
re-enable it. Pi's native settings/resources continue to work. In a folder,
`enabled: false` skips only that folder's layer, not inherited selections.

## Hierarchy and merging

Precedence: global defaults → matching global rules in listed order → ancestor
`.pi/settings.json` files, from filesystem root down to the startup folder.
Only their `projectConfig` keys participate. This crosses Git repository boundaries.
Loading is silent: no startup notifications or additional prompts.

- `layout`: nearest explicit value wins.
- `extensions` and `skills`: additive registered names, deduplicated in first-seen order.
- `skillPaths`: additive, deduplicated after resolution.
- `exclude.extensions` and `exclude.skills`: remove names selected so far. Exclusions
  run after additions within a layer; a deeper layer can re-enable a name. They do
  not disable resources independently loaded by Pi or direct `skillPaths`.
- Empty arrays add nothing; they do not clear inherited selections.

Relative paths resolve from the file declaring them. In folder settings,
`./skills` means `.pi/skills`; global registry, defaults and rule paths resolve
from the global settings directory. Directory rules respect path boundaries
(`foo` does not match `foobar`). Paths are lexical, not symlink-canonicalized.

Registry entries point to individual modules exporting a default Pi extension
function. No automatic package installation or remote fetching occurs. Duplicate
module paths initialize only once per loader initialization.

Skills use Pi's native `resources_discover` hook. Paths may point to a skill
directory, `SKILL.md`, or a directory containing skills. Keep conditional skills
outside Pi's normal auto-discovery directories if they should load only here.

`/project-config` displays the effective selection, enabled state and contributing
paths. Use `/reload` after changes: Pi reloads the extension and re-reads settings.
A discovery event alone returns the current initialization's selection.

## Layouts and extension boundaries

- `default`: leave Pi's UI unchanged.
- `compact`: replace the startup header with `pi · <project>` (TUI only).
- Custom names such as `wide`: load a globally registered layout extension.

Child modules share this loader's extension identity and receive the Pi API.
Do not also install the same child independently. They are executable code:
only register modules you trust. As before, this loader does **not** reuse Pi's
project-package trust prompt; ancestor configuration can select globally registered
modules. It does not inherit native `extensions`, `packages`, or other native Pi
fields. Use the global switch to disable the loader entirely.

Legacy `.pi/project.json` and `project-config.json` files are no longer read.
Move their contents under `projectConfig` in the respective settings files.

## Checks

```sh
npm test
```

GitHub Actions runs the dependency-free tests on Node 22 and 24. Tests cover
hierarchy, relative paths, native-setting coexistence, global disabling, validation,
registered-code restrictions, module deduplication, native skill discovery and
reload reinitialization.
