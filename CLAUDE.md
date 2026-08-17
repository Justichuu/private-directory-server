# Working agreement

## Task handoff protocol

Default to a **plan-and-hand-off** flow, not a do-it-all-inline flow.

For any non-trivial request:

1. **Audit first.** Read the actual code before proposing work. Findings must cite real
   files and lines, never speculation.
2. **Break the work into small tasks** via the task tools (`TaskCreate` / `TaskUpdate` /
   `TaskList`). Each task must be:
   - scoped to one file or one mechanism,
   - completable and verifiable on its own,
   - within reach of Haiku or Sonnet without re-deriving the audit.
   Split anything composite (e.g. "add caching" → helper module, wire into assets, wire
   into downloads, tests) into separate tasks.
3. **Wire dependencies** with `addBlockedBy` so walking the list in ID order never hits a
   blocked task.
4. **Stop before implementing.** Do not start coding the tasks unless explicitly asked to.
5. **Request the model change and supply a paste-ready prompt.** Name which model fits
   (Haiku for mechanical/single-file edits, Sonnet for anything needing judgement), and
   write one self-contained prompt the user can paste after switching.

## What the handoff prompt must contain

The receiving session starts cold. The prompt carries the reasoning so it does not have to
be rediscovered:

- Repo path, branch, build/test commands, and setup state.
- Which files to read first.
- **Every trap found during the audit** — generated files that must not be hand-edited,
  data-loss hazards, spec details (header precedence, granularity), settings that break
  things at defaults, tests that must keep passing unchanged.
- Per-task implementation notes keyed to task IDs.
- Explicit instruction to work in ID order, mark `in_progress` before and `completed` only
  after build + tests pass, and not to expand scope.
- Whether to commit/push, and whether to open a PR (default: no PR unless asked).

Keep the prompt one pasteable block. Save it to a file and send it with `SendUserFile`.
