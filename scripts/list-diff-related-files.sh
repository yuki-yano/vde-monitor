#!/usr/bin/env bash
set -euo pipefail

resolve_base_ref() {
  if [[ -n "${1:-}" ]]; then
    printf '%s\n' "$1"
    return
  fi

  local symbolic_ref
  symbolic_ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [[ -n "$symbolic_ref" ]]; then
    printf '%s\n' "$symbolic_ref"
    return
  fi

  local head_branch
  head_branch="$(git remote show origin 2>/dev/null | sed -n 's/^[[:space:]]*HEAD branch:[[:space:]]*//p' | head -n 1)"
  if [[ -n "$head_branch" ]]; then
    printf 'origin/%s\n' "$head_branch"
    return
  fi

  local fallback
  for fallback in origin/main origin/master main master; do
    if git rev-parse --verify --quiet "${fallback}^{commit}" >/dev/null; then
      printf '%s\n' "$fallback"
      return
    fi
  done

  echo "failed to resolve origin default branch. pass base ref with CI_DIFF_BASE." >&2
  exit 1
}

base_ref="$(resolve_base_ref "${CI_DIFF_BASE:-}")"
merge_base="$(git merge-base HEAD "$base_ref")"

{
  git diff --name-only --diff-filter=ACMR "${merge_base}...HEAD"
  git diff --name-only --diff-filter=ACMR HEAD
  git diff --name-only --cached --diff-filter=ACMR HEAD
  git ls-files --others --exclude-standard
} |
  awk 'NF { print $0 }' |
  sort -u |
  awk '/^(apps|packages)\/.*\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/' |
  awk '!/\.d\.ts$/' |
  while IFS= read -r file_path; do
    [[ -f "$file_path" ]] && printf '%s\n' "$file_path"
  done
