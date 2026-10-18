# Video reference acceptance — 2026-10-18

Platform: macOS Darwin arm64; local frontend runs in Docker.

## Reference evidence

| Reference | Observed frames | Required experience | Current boundary |
|---|---|---|---|
| 1 — 27.2 seconds | 0.5–26.4s | Real garment prints/folds, hanging horizontal rail, product detail | Existing procedural meshes approximate categories; a texture-less proxy is not a faithful garment scan |
| 2 — 55.1 seconds | 1.1–53.4s | Photoreal same-person outfit changes, garment breakdown, Create 360° | Existing image try-on and extraction work; personal-photo 360° generation has no configured provider |
| 3 — 31.3 seconds | 0.6–30.3s | Spoken incremental outfit changes, stable person/background, saved looks | Existing speech fills text only; selection/removal/context and photographic history need improvement |

Videos are visual requirements, not evidence of their implementation or unedited latency. A rotating flat photograph is not a personal 3D model. Existing static complete-outfit avatars must not be described as deformable personal try-on.

## This implementation

1. Verify the existing real photo-edit service with an original fictional adult reference and an owned garment.
2. Add reversible incremental outfit commands: remove, undo, context-sensitive colors, dopamine metadata; resolve ties explicitly. Speech may update local selection, never submit paid image edits automatically.
3. Build a photographic result carousel with actual private task images, garment thumbnails, explicit reuse, and original-photo-safe comparison.
4. Run focused regression tests, type/i18n checks, build a new immutable frontend release, and verify in the browser.
5. Record remaining visual gaps separately. Do not declare all three video standards met until authentic personal 360° and faithful garment assets are verified.
