---
name: verify-production
description: Check that the GKE production deployment of IssueBoard is healthy and serving the expected commit, and diagnose it when it is not. Use after a deploy finishes or is approved, when the user asks "is it ready/live/working", or when the site, /api, pods or a rollout look broken (503, ImagePullBackOff, CrashLoopBackOff, rollout timeout).
---

# Verify production

Run the read-only check (it pins the GKE context, so it is safe whatever context is active):

```sh
.claude/skills/verify-production/verify.sh            # expects origin/main's SHA
.claude/skills/verify-production/verify.sh <sha>      # expects a specific commit
```

It reports pods, the image tag of both Deployments, the mounted DB password file, `/readyz` from inside an api pod, and `/`, `/api/version`, `/api/issues` through the Gateway. Exit 0 means healthy.

Readiness and startup probe warnings from the first ~30 s of a pod's life are normal: the proxy sidecar and the API need a moment to start. Only warnings from the last few minutes on current pods matter.

## If something fails

Find the cause before changing anything. Common causes in this project, in the order they have actually happened:

| Symptom | Likely cause | Check |
|---|---|---|
| `ImagePullBackOff` | Image tag never pushed, or pushed to the wrong project (e.g. a `PROJECT_ID` placeholder) | `gcloud artifacts docker images list $AR --include-tags` |
| `ContainerCreating` stuck | Secret volume can't mount: placeholder in `secretproviderclass.yaml`, or IAM | `kubectl -n issueboard describe pod <pod>` events |
| `CreateContainerConfigError` | Referenced ConfigMap/Secret missing | `describe pod` |
| api `1/2` Ready, rollout times out | `/readyz` failing: DB unreachable or a bad release | `kubectl -n issueboard logs <pod> -c api` and `-c cloud-sql-proxy` |
| Gateway 503 `no healthy upstream` right after a rollout | LB health checks haven't passed yet | wait 1–2 min, rerun |
| Gateway 503 `unconditional drop overload` | No ready backend pods at all | pods above |
| Gateway has no address | Gateway just created (takes 5–10 min) | `kubectl -n issueboard get gateway` |

The NetworkPolicy blocks debug pods from reaching the API. Use `kubectl exec` into an api pod (it has `node`, so use `node -e 'fetch(...)'`, there's no curl).

## Recovering

Report what's broken and propose a fix; don't change production unasked. The options, with their trade-off:
- **Fast:** `kubectl -n issueboard rollout undo deployment/api`. Production is fixed in seconds, but the cluster no longer matches `main`.
- **Correct:** `git revert` the bad commit via a PR (see the `ship` skill). The pipeline redeploys, and Git stays the source of truth.
