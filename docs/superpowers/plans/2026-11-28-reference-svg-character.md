# Reference SVG character implementation tasks

Checkout: kitta-animation-talking-scene; branch: better-character.
Full feature specification: `version 2 planning/reference-svg-character-plan.md`.
Preserve existing character and project formats. No new dependencies or paid calls in tests.

1. Core: `shared/svg-rig.ts`, `shared/character/SvgRigCharacter.tsx`, diagnostic fixture and focused tests. Define validated structured SVG parts, six views, facial presets, speech variants, gesture/action clips; deterministic time-based composition and framing.
2. Service: `server/svg-rig-create.ts`, `server/svg-rig-storage.ts`, `shared/svg-rig-job.ts`, routes. Reuse provider adapters with bounded output, persisted stages and resume/cancel. Validate complete packs before immutable publication. Load focused skill/reference documents per stage and record usage. Mock providers in tests.
3. Integration: add explicit type guard and renderer dispatch; validated saved SVG reference for scene/project/export. Never trust browser-supplied artwork for export. Preserve instance options and pack version. Verify round-trip and existing records.
4. UI: additional create tile, reference upload/provider/model form, durable job cards, full preset preview and supported instance controls. Reuse in SVG project flow without nested forms. Existing options remain available.
5. Review and verification: independent review; fix material findings; full Vitest/typecheck, browser checks from this checkout and offline export. Record actual results and unverified live-generation quality in a report. Request paid-provider approval only when a concrete bounded test is ready.

Baseline before source edits: 65 test files, 543 tests passed. Local dev server started from target checkout at ports5173/5175; no existing listeners found. One implementer at a time under shared rules; parent coordinates and runs integration verification. No automatic branch change/push follows the old v2 step branch instructions, because this task explicitly targets better-character.
