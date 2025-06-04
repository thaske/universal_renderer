## Repository Map

| Path                            | Language                            | What it contains                                                                                   |
| ------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/`                          | Ruby                                | The Ruby gem that plugs into Rails. Most of the business logic lives in `lib/universal_renderer/`. |
| `universal-renderer/`           | TypeScript / Bun                    | Stand-alone SSR server & framework adapters. Source lives in `universal-renderer/src/`.            |
| `benchmark/`                    | TypeScript / Playwright             | Performance & load-testing harness. Generates results into `tmp/reports`.                          |
| `spec/`                         | Ruby                                | RSpec unit & integration tests for the gem.                                                        |
| `bin/`, `tasks/`, `generators/` | Ruby                                | Executables, rake tasks, & Rails generators that ship with the gem.                                |
| `tmp/`, `log/`, `test-results/` | Runtime artifacts – safe to ignore. |

### Inside `universal-renderer/src/`

If you add support for another framework, mirror the existing structure and export from `index.ts` so it appears under the correct sub-path in `package.json` -> `exports`.

## Tooling & Runtime Matrix

| Runtime                | Package manager      | Used for                                                                                                     |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Bun** (`bun` ≥ 1.0)  | `bun install`        | Most TypeScript code, unit tests (`vitest`), benchmarks, and dev server commands. Fast compile via `tsdown`. |
| **Node** (`node` ≥ 20) | `npm` or `bunx node` | Only the `uwebsocket` adapter – Bun does **not** yet support uWebSockets.js' native bindings.                |
| **Ruby** (≥ 3.2)       | `bundler`            | Rails integration gem, Rake tasks, RSpec tests.                                                              |

> ℹ️ When in doubt, default to Bun. Fall back to Node only when you see `uwebsocket` in the path or when native bindings complain.

## Common Commands

### JS / TS (run at repo root)

```bash
# install deps (locks via bun.lock)
bun install

# type-check & build the SSR server
bun run --filter universal-renderer build

# watch mode for local development
bun run --filter universal-renderer watch

# execute Vitest suite
bun run --filter universal-renderer test

# run Playwright load test & analyze
bun run benchmark  # → generates tmp/reports
bun run analyze    # after the benchmark finishes
```

### Ruby

```bash
bundle install       # installs gem dependencies
bundle exec rspec    # runs the RSpec suite

# auto-format & lint
bundle exec rubocop -A
```

## Validation Gate (CI expectations)

A PR is considered **green** when **ALL** of the following pass locally:

1. `bun run --filter universal-renderer test`
2. `bundle exec rspec`
3. `bunx prettier --check .` & `bundle exec rubocop`
4. TypeScript build is error-free: `bun run --filter universal-renderer build`

Playwright benchmarks are **optional** – run them only when touching performance-critical code.

## Style & Conventions

- **TypeScript / JavaScript**: Prettier (no semi-colons, 100 chars, single quotes). Configure once and run via Bun.
- **Ruby**: RuboCop (see `.rubocop.yml`). Autocorrect is allowed.
- **Comments**: Prefer self-explanatory code. Add comments only for non-obvious logic (see user rule 2579682019056564103).
- **Commits / PR titles**: `[scope] Clear imperative sentence` – e.g. `[express] Fix stream headers`.
- **Tests first**: add or update tests for every change; aim for > 90 % coverage in new modules.

## Agent-specific Guidance

1. **Search before coding** – Handlers often share logic; look for similar code in sibling folders.
2. **Prefer minimal edits** – Use the smallest diff that solves the task.
3. **Keep both ecosystems healthy** – When changing shared files (e.g. TypeScript types that Ruby may rely on via JSON), run both test suites.
