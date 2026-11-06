# Step 2 fixes

## Commits

- 9ed9011 — fix: address Step 2 project and scene review

The branch fast-forwarded to 9d4b2af before work. That commit added the review prompt without changing the implementation from 95f8ca4. The implementer wrote regression tests and supplied the patch. Subagent write approvals had stalled in the previous round, so the coordinator applied it. A fresh reviewer checked the patch and rechecked the follow-up tests.

## Acceptance

Chrome ran against checkout-owned listeners on 5193 and 5195. I checked the listeners' working directory and removed the temporary projects, scene, and legacy flow media after the run.

| Check | Result | Evidence |
| --- | --- | --- |
| Import and reopen | Passed | Imported an Illustrator-style SVG with an external DOCTYPE, a real AAC M4A, and a 31,752,078-byte stereo PCM WAV. Chrome reported audio/x-m4a, and the asset record stored audio/mp4. All three assets were visible after reload and reopen. |
| 100,000 SVG comments | Passed | Chrome imported the comment-heavy SVG, and the immediately following project list request succeeded. The upload, next request, and UI update took about 50 ms on this run. The regression test also rejects 100,000 comments followed by a non-SVG root and checks the next response. |
| Deleted AI character | Passed | Opening the temporary saved episode showed “This scene uses an AI character that no longer exists.” The render endpoint returned 409, and npm run scene printed the same text. Automated checks also cover the standalone scene API and both project endpoints. |
| Step 1 render parity | Passed | Saved the first scene into a new episode and rendered and downloaded it in Chrome. FFmpeg frame MD5 output matched the Step 1 export, including decoded audio. SHA-256 of the frame hash listing was 40bb19f73bb5edec414e7c756ec4b6ee73082872ab19a6a76cf1582fc6f615b7. |
| Existing four-step workflow | Passed | Opened Character Studio from Projects, uploaded a WAV, received lip-sync cues, opened Animate, and generated a downloadable MP4. |
| Projects styling | Passed | Reviewed screenshots of the project list, asset tab with the project tab bar, and the episode preview. Also reviewed the missing-character alert screenshot. Browser checks confirmed that the controls and asset links use the shared button styles. |

## Tests

- Before the fix, the SVG prolog and prefix, M4A, 30 MiB WAV, pre-parser lookup, and missing-character tests failed against the original code. A malformed multipart body distinguishes reaching Multer from the early 404. The pathological 100,000-comment input ran against the replacement scanner.
- **npx vitest run** passed 308 tests in 37 files.
- **npx tsc --noEmit -p .** exited 0 with no diagnostics.

## Decisions I made

- Keep SVG validation at the UTF-8 file-signature boundary. The scan handles a BOM, processing instructions, comments, DOCTYPE declarations with quoted or internal content, and prefixed roots. It does not parse or validate the whole XML document.
- Keep in-memory uploads at the requested 100 MB limit for known projects. The route looks up the project before Multer and reads it again before saving, so an upload cannot overwrite changes made while its body was arriving. Concurrent valid uploads can each use memory up to the configured limit.
- Store UTC creation timestamps on newly created projects. Older records stay undated, sort last, and require no migration.
- Map missing AI references to one shared scene error for preview and render, including a character that disappears during export capture. Character deletion still uses its existing behavior.

## Not done or not verified

- Render comparison used decoded hashes. I did not perform a separate listening audition.
- Screenshots were checked at a desktop viewport. No mobile screenshot pass.

## Review findings left open

- None. The final source re-review found no remaining critical or important findings.
