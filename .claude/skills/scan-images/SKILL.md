---
name: scan-images
description: Build the IssueBoard api and web Docker images and run the same Trivy scan CI runs, then fix any CRITICAL findings. Use when a Dockerfile, a base image (including Dependabot docker bumps) or dependencies change, or when CI's "images" job fails on "Scan API image" / "Scan web image".
---

# Scan images like CI

CI fails on CRITICAL vulnerabilities that have a fix available. Reproduce that locally:

```sh
for app in api web; do
  docker build -q -t "issueboard-${app}:scan" "./${app}" >/dev/null || { echo "${app} build failed"; continue; }
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image \
    --exit-code 1 --severity CRITICAL --ignore-unfixed --no-progress -q "issueboard-${app}:scan" \
    > "/tmp/trivy-${app}.txt" 2>&1
  echo "${app}: trivy exit $?"
done
grep -h 'CRITICAL' /tmp/trivy-*.txt
```

Keep the braces in `${app}`: the shell is zsh, where `$app:scan` is read as the `:s` substitution modifier and fails with `bad substitution`.

Exit 0 means it passes CI. Each finding's table row names the library, installed version and fixed version, and the target path shows where it lives.

## Fixing findings

Work out which layer the vulnerable package comes from, and fix it there:

| Where | Fix |
|---|---|
| `/usr/local/lib/node_modules/npm/...` in the API image | The runtime stage doesn't need npm; it is already removed after `npm ci`. If it shows up again, the removal step was lost |
| Alpine package (`apk`) in the web (nginx) image | The stage already runs `apk upgrade --no-cache` as root, then `USER 101`. Rebuild with `--no-cache` to get the newest packages |
| Alpine package in the API image | Add `apk upgrade --no-cache` before `USER 1000` in the runtime stage |
| `app/node_modules/<pkg>` | Our dependency: `npm update <pkg>` or bump the parent in `package.json`, then rerun the tests |
| Fixed only in a newer base image | Bump the `FROM` tag. Prefer even-numbered (LTS) Node majors; odd majors like 25 go out of support after about 6 months |

After fixing, rescan and check that the image still works. The web image must still run as UID 101 (`docker run --rm --entrypoint id issueboard-web:scan -u`), and the API must start (`node dist/server.js` needs a DB; at least confirm the image builds and `node -v` runs).
