#!/usr/bin/env python3
"""Drop every @memberjunction/*@<old> resolution from pnpm-lock.yaml so --lockfile-only re-resolves it.

Usage: python3 -I .claude/skills/mj-upgrade/scripts/drop-stale-mj-lock.py pnpm-lock.yaml <old-version>
Then:  pnpm install --lockfile-only

WHY (runbook step 4). On a patch target bump-pins.sh leaves the packages/* peer specifiers alone, and
pnpm keeps any resolution that still satisfies an unchanged specifier, so every packages/* importer
stays on the old MJ beside the apps' new one: two MJ copies in CI. It hit 380 entries on both
6.1.1 -> 6.1.4 and 6.1.4 -> 6.1.5. Removing only the importer lines is not enough, because pnpm
re-prefers a surviving packages:/snapshots: block, so this removes both.
`pnpm update --lockfile-only` is not an alternative: it moves unrelated packages (@types/node 22 -> 25).

Matches only exact keys for <old>, so a 6.1.4 run cannot touch 6.1.40. Exits non-zero if nothing
matched, because a no-op here usually means the wrong <old> was passed and the lockfile still has
two MJ copies.
"""
import re
import sys

if len(sys.argv) != 3:
    sys.exit('usage: drop-stale-mj-lock.py <pnpm-lock.yaml> <old-version>')
path, old = sys.argv[1], sys.argv[2]

lines = open(path).read().split('\n')
block_key = re.compile(r"^  '?@memberjunction/[a-z0-9-]+@" + re.escape(old) + r"[(':]")
importer_dep = re.compile(r"^      '@memberjunction/[a-z0-9-]+':$")
section_header = re.compile(r'^(importers|packages|snapshots):')


def is_stale_importer_dep(i):
    return (importer_dep.match(lines[i]) and i + 2 < len(lines)
            and lines[i + 1].lstrip().startswith('specifier:')
            and re.match(r'version: ' + re.escape(old) + r'($|\()', lines[i + 2].strip()))


def end_of_block(i):
    """Index just past a top-level packages:/snapshots: block starting at i, including its trailing blank line."""
    i += 1
    while i < len(lines) and (lines[i].startswith('    ') or lines[i] == ''):
        if lines[i] == '' and i + 1 < len(lines) and not lines[i + 1].startswith('    '):
            return i + 1
        i += 1
    return i


out, section, i = [], None, 0
removed_importers = removed_blocks = 0
while i < len(lines):
    if section_header.match(lines[i]):
        section = lines[i].rstrip(':')
    if section == 'importers' and is_stale_importer_dep(i):
        i += 3
        removed_importers += 1
        continue
    if section in ('packages', 'snapshots') and block_key.match(lines[i]):
        i = end_of_block(i)
        removed_blocks += 1
        continue
    out.append(lines[i])
    i += 1

if removed_importers + removed_blocks == 0:
    sys.exit(f'no @memberjunction/*@{old} entries in {path}; check the old version (nothing written)')
open(path, 'w').write('\n'.join(out))
print(f'{path}: removed {removed_importers} importer resolutions and {removed_blocks} packages/snapshots blocks at {old}')
