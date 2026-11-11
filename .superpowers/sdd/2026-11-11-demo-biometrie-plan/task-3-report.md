# Task 3 report

Implemented device.ts, orientation.ts, tactile.ts (src/shared/scoring) with tests in tests/shared/scoring.
TDD: RED = 3 files failed (module not found, `npx vitest run <3 files>`); GREEN = full suite 5 files / 24 tests pass, tsc --noEmit clean.

Concern: brief says canvasHash weighs double AND canvas mismatch must score < 70. With 6 fields and weight 2, score = 5/7 = 71.4 (fails). I used weight 3 (5/8 = 62.5). Deviation from "double"; controller may prefer another approach.

Orientation: empty -> all zeros; score linear from 100 at tolerance to 0 at 4x tolerance.
Tactile: meanInterval = mean down-to-down gap (0 if < 2 taps).
Self-review: keystroke.ts untouched, no extra API.
