# Codex toolkit cleanup audit

Generated: 2026-08-24 (Asia/Hong_Kong)

## Backup and recovery

- Backup: `C:\Users\陈伟记\.codex\backups\2026-08-24-155148-toolkit-cleanup`
- Archive: `C:\Users\陈伟记\.codex\archives\2026-08-24-155148-toolkit-cleanup`
- 135 source files / 3,392,002 bytes were copied before mutation.
- Five critical source/backup SHA-256 comparisons passed. See the backup `MANIFEST.md`.
- Archives are recoverable moves, not deletions.

## What was cleaned

| Area | Before | Action | After |
| --- | --- | --- | --- |
| Repository AGENTS.md | 258 lines, 8,408 tokens; stale desktop-only and display-only Web claims | Rewrote as a concise current execution contract; detailed architecture routes to the code map | 148 lines, 1,663 tokens |
| Kaizen skill | 203 lines, 2,778 tokens; referenced unavailable `$grill-me` and `$product-design:audit` skills | Replaced broken dependencies with explicit requirement and rendered-product gates | 99 lines, 916 tokens |
| Langfuse | Global workflow skill plus docs-only MCP | Removed docs-only MCP; retained CLI/docs workflow skill | 4 MCP tools removed; 7,177 schema-description characters no longer load after restart |
| PDF | Older global skill plus current primary-runtime PDF plugin | Archived older skill | One active PDF workflow |
| Approval rules | 73 complete historical commands | Archived and reset | Comment-only policy file; no persisted one-off approvals |
| Plugin config | Five entries marked enabled although not installed | Removed Cloudflare, Build Web Apps, Supabase, Figma, and Sentry residual tables | Config matches installed/available toolkit more closely |
| Project trust | 30 empty temporary projects | Removed trust entries and moved empty directories to archive | Active trust list contains real projects only |
| Project agent history | 22 old logs, 8 untracked old audit dirs, 4 runtime logs in discovery paths | Archived; kept recent logs and tracked evidence | Faster current-evidence discovery |
| App state | 35 abandoned state temp files and two plugin staging directories | Archived | Active state/cache roots are less noisy |
| Automations/commands/agents | No recurring automation, prompt, command, or custom-agent directory | Verified; retained valid Alt+V keybinding and turn-ended notifier | Minimal |

The archived approval rules included 49 BookSim-specific commands, 21 destructive
or process-control commands, 6 commands handling auth-token material, and 5
deploy/release commands. Resetting them narrows permission rather than broadening
it; future sensitive commands should require a fresh decision.

## Context saved

- Exact always-loaded repository guidance reduction: **6,745 tokens per task**
  using `o200k_base` (8,408 -> 1,663).
- Removed Langfuse MCP definitions: 4 tools / 7,177 description-schema
  characters, conservatively about **1,800 tokens per new task**.
- Conservative routine saving after restart/new task: **about 8,500 tokens per
  llm-space-web task**.
- When Kaizen is selected, its full skill is another **1,862 tokens smaller**;
  estimated total saving for a Kaizen task is **about 10,400 tokens**.

The `config.toml` reduction (3,140 -> 1,937 token-equivalents) and
`default.rules` reduction (12,469 -> 59 token-equivalents) are not counted as
ordinary prompt-context savings because those files are configuration/policy,
not normally injected verbatim.

## Plugin and MCP state

- GitHub and Sites are installed and inherit the global **Allow low-risk
  actions** app permission.
- Internal Browser, Chrome, Computer Use, artifact-runtime, Visualize, and
  Codex app bundles remain enabled because their execution surfaces are distinct.
- The twenty Default Templates are explicit-only (implicit invocation disabled),
  so they do not compete for routine triggers.
- `node_repl` is retained; its executable and every configured path exist, and
  the current projected history contains 9 calls.
- The removed Langfuse docs MCP overlapped the retained Langfuse skill's current
  docs workflow.

## Ten most valuable tools/tool groups to keep

1. **Repository AGENTS.md** - small, current boundary contract for every task.
2. **OpenAI Docs skill** - current official Codex/OpenAI behavior.
3. **Kaizen Loop skill** - disciplined next-capability decisions and approval gate.
4. **Electrobun CDP skill** - the only correct route to the real desktop CEF renderer.
5. **Playwright skill** - reproducible terminal browser acceptance.
6. **In-app Browser plugin** - generic signed-in browser interaction.
7. **Chrome plugin + node_repl** - actual Chrome state with persistent JS control.
8. **GitHub plugin** - repository, PR, issue, and CI workflows.
9. **Artifact runtime plugins** - Documents, Spreadsheets, Presentations, PDF, and templates.
10. **Langfuse skill** - tracing, prompt, dataset, score, and evaluation workflows.

## What still needs a user decision

1. Restart Codex or start a new task to unload the archived PDF skill and removed
   Langfuse MCP tool schemas; the current task retains its startup context.
2. Decide whether the two local MiMo provider identities and three profiles are
   separate accounts. They were preserved because deduplicating credentials by
   inference would be unsafe.
3. If Windows GUI control is rare, disable Computer Use and keep Browser/Chrome;
   do not remove it automatically while voice/desktop workflows still exist.
4. If named artifact templates remain unused, uninstall OpenAI Templates; its
   20 skills are explicit-only, so this is low priority.
5. `C:\Users\陈伟记\.codex\logs_2.sqlite` is about 437 MB and active while Codex runs.
   Do not delete it live. Use an app-supported retention/export workflow or close
   Codex before any separate storage cleanup.
6. Let the plugin manager reclaim old version caches. Do not manually delete the
   remaining Chrome rollback cache while the current plugin is active.

## Verification

- Backup hashes matched before mutation.
- Final TOML parses successfully; sensitive values were never printed or copied
  into this report/map.
- Active MCP/notifier/script paths exist.
- Broken Kaizen skill references are gone.
- The toolkit JSON and embedded HTML data are identical and source paths are
  checked by `toolkit.lock`.
- Browser verification covers offline/HTTP load, all 20 nodes, selection,
  search, category filtering, overlap navigation, and zero console errors.
