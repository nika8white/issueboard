#!/usr/bin/env bash
# Checks that production (GKE) is healthy and serving the expected commit.
# Usage: verify.sh [expected-sha]   (defaults to origin/main)
# Read-only: it never changes the cluster.
set -uo pipefail

NS=issueboard
CTX=gke_issueboard-25603_europe-west3_issueboard
K="kubectl --context $CTX -n $NS"
fail=0
ok()  { printf '  ok    %s\n' "$*"; }
bad() { printf '  FAIL  %s\n' "$*"; fail=1; }

git fetch -q origin 2>/dev/null || true
EXPECTED=${1:-$(git rev-parse origin/main)}
echo "Expected version: $EXPECTED"

echo "Pods"
$K get pods -o wide --no-headers 2>&1 | awk '{printf "        %-28s %-5s %-18s restarts=%s\n", $1, $2, $3, $4}'
not_ready=$($K get pods --no-headers 2>/dev/null | awk '{split($2,a,"/"); if (a[1]!=a[2] || $3!="Running") print $1" "$3}')
[ -z "$not_ready" ] && ok "all pods Running and Ready" || bad "not ready: $not_ready"

echo "Images"
for d in api web; do
  img=$($K get deploy $d -o jsonpath="{.spec.template.spec.containers[?(@.name==\"$d\")].image}" 2>/dev/null)
  [[ "$img" == *":$EXPECTED" ]] && ok "$d runs $EXPECTED" || bad "$d image is ${img:-<missing>}"
done

echo "Inside an api pod"
P=$($K get pod -l app=api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$P" ]; then
  $K exec "$P" -c api -- sh -c '[ -s "$DB_PASSWORD_FILE" ]' 2>/dev/null \
    && ok "DB password file mounted at \$DB_PASSWORD_FILE" || bad "DB password file missing or empty"
  ready=$($K exec "$P" -c api -- node -e 'fetch("http://127.0.0.1:3000/readyz").then(async r=>console.log(r.status, await r.text())).catch(e=>console.log("error", e.message))' 2>&1)
  [[ "$ready" == "200 ready" ]] && ok "/readyz: $ready" || bad "/readyz: $ready"
else
  bad "no api pod found"
fi

echo "Through the Gateway"
IP=$($K get gateway issueboard -o jsonpath='{.status.addresses[0].value}' 2>/dev/null)
if [ -n "$IP" ]; then
  v=$(curl -s --max-time 10 "http://$IP/api/version")
  [[ "$v" == *"$EXPECTED"* ]] && ok "http://$IP/api/version → $v" || bad "/api/version → ${v:-<no answer>}"
  for path in / /api/issues; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$IP$path")
    [ "$code" = 200 ] && ok "GET $path → 200" || bad "GET $path → $code"
  done
else
  bad "Gateway has no address yet"
fi

echo "Recent warnings"
$K get events --field-selector type=Warning --sort-by=.lastTimestamp 2>/dev/null | tail -5 | sed 's/^/        /'

echo
[ $fail = 0 ] && echo "PRODUCTION OK" || echo "PRODUCTION HAS PROBLEMS (see FAIL lines)"
exit $fail
