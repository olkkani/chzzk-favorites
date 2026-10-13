## Communication Style

- Keep explanations brief and focused on code changes and why they were made.
- Avoid restating the prompt, thanking, or apologizing.
- Do not repeat unmodified code; show only changed parts.
- End with a summary of at most 1-3 sentences; no long recaps.
- Do not suggest alternatives or follow-ups unless asked.
- Respond in Korean.

## Tool Calls

- Always write Korean and other non-ASCII strings in tool-call parameters as literal UTF-8; never as `\uXXXX` escape sequences.
-

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Git worktree layout (bare repo)

- The repository is a bare repo at `.bare/`. Every branch is checked out as a sibling worktree: `ledger-for-him-front/<dir>` (e.g. `develop/`, `main/`, `feature-main-ui/`).
- The workspace root has no `.git`; run git commands from inside a worktree, targeting `../.bare`.

## Creating a worktree (overrides superpowers:using-git-worktrees defaults)

- When starting new feature work, ALWAYS create a new worktree, even if the current directory is already a linked worktree (do not apply the skill's Step 0 "already isolated → skip" rule).
- Do NOT use `EnterWorktree` or a `.worktrees/` directory. Do not modify `.gitignore` for worktrees.
- Steps:
  1. Update local develop: `git -C ../develop pull --ff-only origin develop`
  2. Create: `git -C ../.bare worktree add -b <type>/<name> ../<type>-<name> develop`
     - Base branch is always `develop`.
     - Directory name = branch name with `/` replaced by `-` (`feature/deploy` → `feature-deploy`).
  3. `cd ../<type>-<name>` and run `pnpm install`.
  4. Verify baseline with `pnpm test`; report failures and ask before proceeding.
