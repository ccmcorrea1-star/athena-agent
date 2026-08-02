# Development

See [AGENTS.md](../../AGENTS.md) for code quality, git, testing, and release rules.

## Setup

```bash
git clone https://github.com/earendil-works/athena-agent
cd athena-agent
npm install
npm run build
```

Run from source: `./athena-test.sh` from repo root.

## Forking / Rebranding

Configure via `package.json`:

```json
{
  "piConfig": {
    "name": "athena",
    "configDir": ".athena"
  }
}
```

Change `name`, `configDir`, and `bin` field for your fork. Affects CLI banner, config paths, and environment variable names.

## Path Resolution

Three execution modes: npm install, standalone binary, tsx from source.

**Always use `src/config.ts`** for package assets:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Never use `__dirname` directly for package assets.

## Debug Command

`/debug` (hidden) writes to `~/.athena/agent/athena-debug.log`:
- Rendered TUI lines with ANSI codes
- Last messages sent to the LLM

## Project Structure

```
packages/
  ai/             # LLM provider abstraction, compat layer, OAuth
  agent/          # Agent core, harness, compaction, tools
  tui/            # Terminal UI components (general-purpose)
  coding-agent/   # CLI, interactive mode, extensions, skills
  client/         # RPC client
  server/         # Server-side agent hosting
  protocol/       # Wire protocol (JSONL session format)
  evals/          # Evaluation harness
  storage/        # SQLite session backends
```

## Plans

Future architectural work is tracked in `plans/`:

- `plans/T9-interactive-mode-split.md` — Split 6125-line interactive-mode.ts into focused modules
- `plans/T10-tui-decouple.md` — Decouple TUI from coding-agent types, split extensions/types.ts
