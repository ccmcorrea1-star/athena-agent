# Development Rules

## Style

- Short, technical, no emojis, no filler.
- Answer before implementing.
- Disagree explicitly before changing.

## Code Quality

- Read files fully before broad changes. No search-snippet edits.
- No `any`. No inline imports. No `enum`/`namespace`/parameter properties.
- Inline helpers with one call site. Check `node_modules` for external types.
- Never modify `models.generated.ts` directly; update `scripts/generate-models.ts`.
- Never hardcode key checks — add to `DEFAULT_EDITOR_KEYBINDINGS` / `DEFAULT_APP_KEYBINDINGS`.
- Never remove or downgrade code to fix outdated dep type errors; upgrade the dep.
- Always ask before removing intentional functionality.

## Commands

- After code changes: `npm run check` (full output). Fix all errors/warnings/infos.
- Never run `npm run build` or `npm test` unless requested.
- Never run the full vitest suite directly (includes e2e with env vars). Use `./test.sh` from repo root, or from package root: `node ../../node_modules/vitest/dist/cli.js --run test/specific.test.ts`.
- For `test/suite/`, use `harness.ts` + faux provider. No real APIs/keys.
- Regressions go in `test/suite/regressions/<issue>-<slug>.test.ts`.
- Ad-hoc scripts: write to `/tmp`, run, remove. Don't embed in `bash` commands.
- Never commit unless asked.

## Dependencies

- Treat npm dep and lockfile changes as reviewed code. Pin direct deps to exact versions.
- Local: `npm install --ignore-scripts`. CI-clean: `npm ci --ignore-scripts`.
- Lockfile refresh: `npm install --package-lock-only --ignore-scripts`.
- Shrinkwrap regen: `node scripts/generate-coding-agent-shrinkwrap.mjs`.
- Pre-commit blocks lockfile commits unless `ATHENA_ALLOW_LOCKFILE_CHANGE=1`.

## Git

Multiple athena sessions may run concurrently. Only commit YOUR files.

- Stage explicit paths. Never `git add -A` / `git add .`.
- Message format: `{feat,fix,docs}[(ai,tui,agent,coding-agent)]: <message>`.
- `models.generated.ts` may always be included alongside your files.

Never run: `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash`, `git add -A`, `git add .`, `git commit --no-verify`.

Rebase conflicts: resolve only in files you modified. If conflict is in a file you didn't modify, abort. Never force push.

## Issues and PRs

When reviewing PRs: use `gh pr view`, `gh pr diff`, `gh api`, `git show`/`git diff` — never `gh pr checkout` or `git switch`.

When creating issues: add `pkg:*` labels (`pkg:agent`, `pkg:ai`, `pkg:coding-agent`, `pkg:tui`).

Comments: write to temp file, post with `--body-file`. End AI comments with disclaimer line.

Closing via commit: include `fixes #N` or `closes #N`. For multiple, repeat per issue.

## Changelog

Location: `packages/*/CHANGELOG.md`. Entries under `## [Unreleased]`: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`. Released sections are immutable.

Attribution: internal `Fixed X ([#N](url))`, external `Added X ([#N](url) by [@user](url))`.

## Releasing

Lockstep versioning: all packages share one version. `patch` = fixes, `minor` = breaking.

1. Run `/cl` on latest `main` commit first.
2. Local smoke test outside the repo:
   ```bash
   npm run release:local -- --out /tmp/athena-local-release --force
   /tmp/athena-local-release/node/athena --help
   /tmp/athena-local-release/bun/athena -p "Say exactly: ok"
   ```
3. Release: `ATHENA_ALLOW_LOCKFILE_CHANGE=1 npm_config_min_release_age=0 npm run release:patch`
4. Push tag triggers CI publish via GitHub Actions OIDC. No local npm publish.
5. If CI fails: fix and rerun the tag workflow. Don't rerun release script for same version.

## Tmux Testing

```bash
tmux new-session -d -s athena-test -x 80 -y 24
tmux send-keys -t athena-test "./athena-test.sh" Enter
sleep 3 && tmux capture-pane -t athena-test -p
tmux send-keys -t athena-test "your prompt here" Enter
tmux kill-session -t athena-test
```

## User Override

If the user's instructions conflict with any rule, ask for explicit confirmation before overriding.
