# pi-project-config

A standard Pi extension package for hierarchical folder configuration of extensions, skills and layouts. Requires Pi 1.5.0+. No runtime dependencies beyond Pi.

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
  "extensions": ["git", "tasks"],
  "skills": ["review"],
  "skillPaths": ["./skills"],
  "exclude": { "extensions": [], "skills": [] }
}
```

All selection fields can be omitted. Extension and skill names must exist in your central registry; projects cannot import arbitrary code paths through this file. Unknown names, unknown fields and malformed config produce startup errors rather than being silently ignored.

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
  "skills": { "review": "/absolute/path/to/review/SKILL.md" },
  "rules": [
    { "path": "/home/you/work", "layout": "compact", "extensions": ["git"] },
    { "path": "/home/you/work/special", "extensions": ["tasks"] }
  ]
}
```

Registry entries must point to individual modules exporting a default Pi extension function. Relative registry and rule paths resolve from the central config directory. No automatic package installation or remote fetching occurs.

## Hierarchy and merging

Precedence: global defaults → matching central rules in listed order → every ancestor
`.pi/project.json`, from filesystem root down to the startup folder. This intentionally
crosses Git repository boundaries, so `~/work/.pi/project.json` applies inside
`~/work/foo`, and `~/work/foo/src/.pi/project.json` can refine it when Pi starts there.
This replaces the original nearest-config-only behavior.

- `layout`: the nearest explicit value wins.
- `extensions` and `skills`: additive registered names, deduplicated in first-seen order.
- `skillPaths`: additive paths, deduplicated after resolution. Relative paths resolve
  from the config file's directory (so `./skills` means `.pi/skills` in project configs).
- `exclude.extensions` and `exclude.skills`: remove registered names selected so far.
  Exclusions run after additions in the same layer; a deeper layer may re-enable a name.
  They do not disable resources independently installed in Pi or direct `skillPaths`.
- An empty array adds nothing; it does not clear inherited selections.

Extension/layout registry paths, skill registry paths and central rule paths resolve
relative to the central config file. Projects select executable extensions by registered
name only. Directory matching respects path boundaries (`foo` does not match `foobar`).
Paths are lexical, not symlink-canonicalized. An extension module initializes once even
if referenced through multiple names.

Skills use Pi's native `resources_discover` hook on startup/reload. A skill path may
point to a skill directory or `SKILL.md` (Pi also supports directories containing skills).
Keep conditional skills outside Pi's normal auto-discovery directories if they should
only load when selected here. Pi handles skill content and resource diagnostics.

For example, `~/work/.pi/project.json` can select shared extensions and skills, while
`~/work/foo/.pi/project.json` adds Foo-specific ones and excludes an inherited name.
`/project-config` lists all contributing config paths and the effective selections.

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

GitHub Actions runs the dependency-free test suite on Node 22 and 24 for every push
and pull request, and supports manual dispatch. The suite includes a native skill
discovery hook and module-deduplication integration test.
