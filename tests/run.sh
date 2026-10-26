#!/usr/bin/env bash
# Build the site, then run every playtester browser test against it.
# Needs Node and Playwright with Chromium: `npm install` then `npx playwright install chromium`.
# PW (path to the playwright module) and CHROMIUM (browser binary) can point at an existing install.
set -u
cd "$(dirname "$0")/.."
npx vite build >/dev/null && python3 build.py >/dev/null || exit 1
# the importer page loads ES modules, which browsers only allow over http
python3 -m http.server 4173 --bind 127.0.0.1 --directory site >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1
pass=0; fail=0
for t in tests/playtester/test_*.js tests/importer/test_*.js; do
  out=$(cd "$(dirname "$t")" && timeout 180 node "$(basename "$t")" 2>&1)
  if [ $? -eq 0 ] && echo "$out" | grep -Eq "errors:? \[\]"; then pass=$((pass + 1)); echo "ok    $(basename "$t")"
  else fail=$((fail + 1)); echo "FAIL  $(basename "$t")"; echo "$out" | tail -5 | sed 's/^/      /'; fi
done
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
