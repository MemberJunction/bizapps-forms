#!/bin/bash
# Validates that all @mj-biz-apps packages exist on npm before publishing

echo "Checking for new packages that need npm placeholders..."

MISSING=()
CHECKED=0
MAX_RETRIES=3
RETRY_DELAY=2

for pkg_json in $(find packages -name "package.json" -maxdepth 2 -not -path "*/node_modules/*"); do
  name=$(jq -r '.name // ""' "$pkg_json")

  # Only check @mj-biz-apps scoped packages
  if [[ "$name" != @mj-biz-apps/* ]]; then
    continue
  fi

  CHECKED=$((CHECKED + 1))

  # Check if package exists on npm with retry logic
  EXISTS=false
  for attempt in $(seq 1 $MAX_RETRIES); do
    if output=$(timeout 10 npm view "$name" version 2>&1); then
      EXISTS=true
      break
    fi

    # A 404 is a definitive answer — the package really is absent, so stop retrying. Anything
    # else (timeout, DNS, registry 5xx) is transient and worth another attempt. `npm view` exits
    # 1 for both, so the exit code cannot tell them apart and the message has to.
    #
    # This used to read the exit code from `$?` *after* the `if`, where bash reports the status
    # of the `if` compound command itself — defined as 0 when the condition was false and there
    # is no else branch. It was therefore never 1, the fast path never fired, and a genuinely
    # missing package burned every retry and both sleeps before being reported.
    if echo "$output" | grep -q 'E404'; then
      break
    fi

    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      sleep $RETRY_DELAY
    fi
  done

  if [ "$EXISTS" = false ]; then
    MISSING+=("$name")
  fi

  # Progress indicator
  if [ $((CHECKED % 10)) -eq 0 ]; then
    echo "  Checked $CHECKED @mj-biz-apps packages..."
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo ""
  echo "::error::Found ${#MISSING[@]} package(s) without npm placeholders:"
  for pkg in "${MISSING[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  echo "For each missing package, publish a 0.0.0 placeholder manually before"
  echo "the automated workflow can take over."
  exit 1
fi

echo "All $CHECKED @mj-biz-apps packages exist on npm"
