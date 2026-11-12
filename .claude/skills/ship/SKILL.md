---
name: ship
description: Ship a change in IssueBoard from the working tree to production - new branch from the latest main, commit, push, PR, wait for CI, merge, then hand the production approval to the owner and verify. Use when the user asks to commit, push, open a PR, merge, ship, or deploy changes.
---

# Ship a change

Do only the steps the user asked for (e.g. "commit and open a PR" stops at step 4). Each step below exists because skipping it went wrong before.

## 1. Look before branching

```sh
git fetch -q origin && git branch --show-current && git status --short && git diff --stat
gh pr list --state open
```

- If the current branch's PR is already merged (`gh pr view --json state`), don't commit there. Start a new branch.
- Review the diff for leftover course placeholders (`PROJECT_ID`, `REGION`, `your-github-user`) and secrets. Real values are in CLAUDE.md.
- If the working tree holds unrelated changes, ask which belong in this PR.

## 2. Branch from the latest main, carrying the changes

```sh
git switch -c <short-kebab-name> origin/main && git branch --unset-upstream
```

Uncommitted changes come along. If the switch refuses because of conflicts, use `git stash push -u`, switch, then `git stash pop`.

## 3. Check locally what CI will check

Only for the parts that changed:
- `api/`: `npm run lint && npm test` (plus the integration tests against a throwaway Postgres if routes or SQL changed; see CLAUDE.md).
- `web/`: `npm run lint && npm run build`.
- `k8s/`: `kubectl kustomize k8s/overlays/gke >/dev/null && kubectl kustomize k8s/overlays/local >/dev/null`. For GKE changes, also run `kubectl --context gke_issueboard-25603_europe-west3_issueboard apply -k k8s/overlays/gke --dry-run=server`.
- `Dockerfile` or base image changes: use the `scan-images` skill. Otherwise Trivy fails in CI.

## 4. Commit, push, open the PR

Stage the specific paths (not `git add -A` when unrelated files are around). End the commit message with the Co-Authored-By line, and the PR body with the Claude Code line. Write the PR body as a short summary plus a test plan, with what you checked ticked.

```sh
git push -u origin <branch>
gh pr create --base main --title "..." --body "..."
```

## 5. Wait for CI, then merge

Wait in the background so a long CI run doesn't time out the shell:

```sh
gh pr checks <n> --watch --interval 15 >/dev/null 2>&1; gh pr checks <n>
gh pr view <n> --json mergeStateStatus --jq .mergeStateStatus
```

- `images` shows `skipping` when nothing under `api/` or `web/` changed. That's expected, but then Trivy hasn't run, so say so.
- `images` fails: read `gh run view <run> --log-failed`; it's usually a CRITICAL CVE in a base image. Fix it with `scan-images` and push to the same branch.
- `BEHIND`: run `gh pr update-branch <n>`, wait for CI again, then merge. Never use `--admin`.
- Merge with `gh pr merge <n> --merge`.

## 6. Production approval belongs to the owner

Merging into `main` starts `deploy.yml`, which builds, pushes, then waits on the `production` environment. Don't approve, reject or cancel deployment runs, even when asked to "approve the deploy": the permission check blocks it, and the course wants approvals recorded under the owner's name. Instead:

```sh
gh run list --workflow=deploy.yml --limit 3
```

- Give the owner the link to the waiting run: Actions → run → Review deployments → Approve.
- If an **older** run is still `waiting`, the new one is queued behind it (deploys run one at a time). Explain that and let the owner reject or approve the old one.
- Mention anything risky the deploy will ship (e.g. a base-image major bump that came in from Dependabot).

## 7. After approval

Wait for the run to finish (`gh run watch <id> --exit-status`), then use the `verify-production` skill with the merge commit SHA.
