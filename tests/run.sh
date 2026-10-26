#!/usr/bin/env bash
# Build the site, then run every playtester browser test against it.
# Needs Node and Playwright with Chromium: `npm install` then `npx playwright install chromium`.
# PW (path to the playwright module) and CHROMIUM (browser binary) can point at an existing install.
set -u
cd "$(dirname "$0")/.."
python3 build.py >/dev/null || exit 1
pass=0; fail=0
for t in tests/playtester/test_*.js; do
  out=$(cd tests/playtester && timeout 180 node "$(basename "$t")" 2>&1)
  if [ $? -eq 0 ] && echo "$out" | grep -Eq "errors:? \[\]"; then pass=$((pass + 1)); echo "ok    $(basename "$t")"
  else fail=$((fail + 1)); echo "FAIL  $(basename "$t")"; echo "$out" | tail -5 | sed 's/^/      /'; fi
done
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
