# Direct try-on frontend core checks

Platform: macOS Darwin 25.6.0 arm64, zsh. Scope: domain matching, request contract, owner-scoped hook; no browser/provider generation.

- Test-first baseline: `fitting-domain-red.log` records 10 failed / 1 passed; `tryon-hook-red.log` records 4 failed / 8 passed. `core-partial.log` captures 3 command-matching regressions before fixes; `suit-red.log` captures unsupported suit classification before the contract fix.
- Final focused tests: from `frontend`, `./node_modules/.bin/vitest run tests/fitting-room.test.ts tests/tryon-hook.test.tsx --maxWorkers=1` → **28 / 28 passed**, 0 failed. Log: `core-green.log`. `spoken-category-red.log` separately records the spoken `t shirt` regression before common category aliases were fixed.
- Scoped ESLint: `./node_modules/.bin/eslint lib/fitting-room.ts lib/looks/tryon-types.ts lib/hooks/use-tryon.ts tests/fitting-room.test.ts tests/tryon-hook.test.tsx --max-warnings=0` → exit 0, empty log `core-eslint.log`.
- `./node_modules/.bin/tsc --noEmit --incremental false` → exit 0, empty log `core-typecheck.log`. Initial ES5 Set iteration error was corrected with `Array.from` before this final check.
- Prettier: cached offline formatter completed, `core-format.log`.

New multi-item inputs are mutually exclusive with legacy `itemId`, use ordered JSON `item_ids`, and honor returned capability limits. Invalid/duplicate IDs fail before image decode. Old task responses normalize to `item_ids: [item_id]`; contradictory returned item selections are rejected. Uncertain retries reuse a key only for the same ordered IDs and File identity. Existing account fencing, abort, authenticated image reads, and GET-only polling tests remain passing.

Command matching is deterministic local metadata matching, not general language understanding. It supports common Chinese/English color, category and style aliases; exact owned names take priority, tied best matches return all candidates for confirmation, and unknown requests return no selection. It never calls a provider or submits a generation.
