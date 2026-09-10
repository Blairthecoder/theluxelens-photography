# Repository change policy

This file applies to any AI coding agent working in this repository (Claude
Code, Codex, or otherwise). Follow it for every task unless the user
explicitly overrides a specific rule in their request.

This is a static HTML site (no build step, no package.json). Netlify deploys
directly from this repo's `main` branch via its GitHub integration and posts
a Deploy Preview check on every pull request.

- Begin every task from a clean branch based on current `origin/main`.
  Never continue work on a stale local branch or an old checkout that
  predates this policy.
- Edit only files explicitly named or clearly required by the prompt. Do not
  perform drive-by cleanup, renames, or "while I'm in here" fixes on files
  outside the task's scope.
- If another file appears necessary, stop and request approval before
  editing it.
- Never modify `_headers`, `_redirects`, GitHub configuration, or sitewide
  assets (shared CSS/JS under `assets/`) unless explicitly requested.
- Before committing, run `git diff --name-only origin/main...HEAD` and
  confirm every changed file is explained by the task. If a file you didn't
  intend to touch shows up (e.g. because it was already dirty in the
  working tree from a prior session), stop and report it instead of
  committing it.
- If your working tree already has unrelated local or uncommitted changes
  when a task starts, do not fold them into your commit. Report what you
  found and ask how to handle it before writing any new commits.
- Commit and push only the current feature branch.
- Never push directly to `main`.
- Open a GitHub pull request and use its Netlify Deploy Preview to verify
  changes before merging.
- If you discover that `main` has moved (new commits you didn't expect)
  since you branched, stop before merging or force-pushing. Diff your
  branch against the new `origin/main` and report what's actually different
  before reconciling — another agent or session may have already covered
  the same ground.
