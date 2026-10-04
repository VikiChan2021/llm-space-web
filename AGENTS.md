# LLM Space agent contract

LLM Space is a Bun-workspace monorepo for prompt and Agent development. It
ships a native Electrobun desktop app plus web surfaces for the landing page,
shared-thread viewer, and bounded guest workbench. Treat current source and
tests as authoritative; do not infer deployment or production status from old
Kaizen logs.

## Start here

- Use `mise` as the task front door and Bun as the package manager/runtime.
  Never use npm, pnpm, or yarn in this repository.
- Before editing, run `git status --short` and preserve unrelated user changes.
- Use `mise tasks ls` when a task is not listed below.
- For architecture and evidence, open `docs/codemap/codemap.html` or inspect
  `docs/codemap/codemap.json`; do not duplicate the full architecture here.

Common commands:

| Purpose | Command |
| --- | --- |
| Setup | `mise run setup` |
| Desktop dev | `mise run dev` |
| Desktop CEF/CDP dev | `mise run dev:cef` |
| Web dev | `mise run dev:web` |
| Tests | `mise run test` |
| Changed-file checks | `mise run check:changed` |
| Full CI parity | `mise run lint && mise run typecheck` |
| Web build | `mise run build:web` |
| Desktop canary/stable build | `mise run build:canary` / `mise run build:stable` |

For ordinary work, prefer `mise run check:changed`. Use full lint/typecheck for
release preparation, CI parity, or an explicit user request. Tests belong in
`packages/<package>/tests/` with paths mirroring `src/`; do not colocate new
package tests under `src/`.

Shared dependency versions belong in the root `package.json` catalog. Add a
dependency with `bun add` inside its target workspace. Add shadcn components
from `packages/ui` with `bunx --bun shadcn@latest add <component>`.

## Architecture boundaries

- `packages/core` owns browser-safe Thread/message/template/client semantics and
  Node/Bun-only server storage and Agent streaming behind explicit exports.
- `packages/ui` owns the Electrobun-free React design system and Thread
  Playground. Host capabilities enter only through `HostServices`; model access
  enters through `ModelClient`. Use relative imports inside this package.
- `packages/runtime` owns runtime routing, models, tools, MCP, Skills, plugins,
  traces, and local/remote protocol contracts.
- `apps/desktop` owns the Electrobun renderer, Bun main process, typed RPC,
  commands, native filesystem/window/auth/update behavior, and remote runtime
  management.
- `apps/server` exposes the headless bearer-authenticated runtime over HTTP/RPC
  and SSE.
- `apps/web` owns the landing page, shared-thread viewer, and bounded browser
  guest workbench. Guest capabilities must remain browser-safe and must never
  expose provider secrets, host filesystem/Bash, stdio MCP, or desktop-only
  privileges.
- `apps/cloud` owns hosted identity/session and bounded guest API behavior. Keep
  credentials server-side and preserve tenant/quota boundaries.

Never import `@llm-space/core/server` into a renderer or web bundle. Never
import Electrobun, desktop clients, or desktop commands into `packages/ui`.
Shared UI does not imply equal Desktop, Guest, Viewer, and Remote privileges.

The core local run remains:

`ThreadPlayground store -> RuntimeClient/transport -> desktop RPC or remote SSE
-> streamAgent -> Agent events -> reduceMessages -> UI`.

Cross-boundary desktop actions are typed `Command` values from
`apps/desktop/src/shared/commands.ts`; route them through the command layer.
Process-scoped Bun managers are composed in
`apps/desktop/src/bun/app/start-desktop-app.ts`; do not add import-time manager
singletons or service-locator access.

## Persistence and prompt parity

- User-authored Threads live under `workspace/`; derived run snapshots live
  under `history/`; configuration lives under `settings/`. Never place derived
  state beside user content.
- Preserve copy/move/re-key/prune semantics for `RunHistoryStore`; deleting a
  Thread intentionally retains recoverable history until orphan maintenance.
- Prompt semantics have TypeScript and generated Python implementations. When
  changing a built-in variable, function, filter, or macro, update both
  `packages/core/src/thread/` and `packages/core/src/generator/langgraph/`.
- Add generator regression tests and execute generated Python at least once;
  string or snapshot assertions alone are insufficient.

## Desktop and browser verification

For the real desktop renderer, use
`.agents/skills/electrobun-cdp-debug/SKILL.md`. Start `mise run dev:cef`; normal
`mise run dev` does not expose CDP. Do not mock `electrobun.rpc` in a browser.

Put isolated `LLM_SPACE_HOME` runtime data in the system temporary directory,
not under the repo. Keep only durable, redacted acceptance evidence in
`.agents/`; routine workspaces, settings, caches, stdout/stderr logs, and app
data do not belong there.

For visible UI changes, verify the rendered surface plus relevant console,
network, interaction, layout, and overflow behavior. A running process or raw
HTTP response is not visual acceptance evidence.

## Releases

- `apps/desktop/package.json` is the version source of truth.
- Before every stable release, update matching English and Chinese changelog
  sections, then require `mise run lint` to exit with zero warnings/errors.
- Preserve the separate regular and Performance update feeds. Never delete
  rolling-release `.patch` files; old installs may need the patch chain.
- Do not ship CEF with a default remote-debugging port.
- Do not widen the macOS x64 headerpad fixer without revalidating the actual
  binaries it signs.
- If the pinned `@earendil-works/pi-ai` workaround is still present, check the
  current official package before release and remove the patch when upstream
  contains the fix.

The web site publishes through `.github/workflows/pages.yml` after merge to
`main`; Pages source must remain GitHub Actions. Respect `base: "/llm-space/"`
and use `import.meta.env.BASE_URL` for absolute public assets.

## Code conventions

- TypeScript is strict ESNext with bundler resolution.
- Every `.ts`/`.tsx` filename is kebab-case. Components, classes, and types are
  PascalCase; functions, variables, hooks, and command discriminants are
  camelCase; module constants are UPPER_SNAKE_CASE.
- Prefix non-exported module helpers and private class members with `_`.
- Use 2 spaces, double quotes, semicolons, ES5 trailing commas, and the existing
  ESLint/Prettier import and Tailwind ordering.
- `packages/ui/src/ui/` is generated shadcn code; add components through the
  generator and prefer app-level wrappers.
- Use shared confirmation dialogs for destructive actions and shared empty-state
  primitives for empty or filtered collections.
- Menu/command labels use Title Case; ordinary UI copy uses sentence case.
- On hot streaming/list paths, use narrow store selectors and stable props.
  Add `memo()` only where the render path or profiling justifies it.

## Change discipline

- Keep edits within the approved product or maintenance scope.
- Preserve secrets and auth material; never print tokens, raw headers, or
  private external payloads.
- Review the diff, run checks proportional to risk, and report separately what
  was implemented, locally verified, deployed, and production-confirmed.
- For a product Kaizen request, follow `.agents/skills/kaizen-loop/SKILL.md` and
  wait at its approval gate before editing product code.
