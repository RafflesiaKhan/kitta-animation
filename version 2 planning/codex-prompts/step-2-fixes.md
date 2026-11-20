# Step 2 fixes from Claude's review

Read `version 2 planning/codex-prompts/shared-rules.md` and follow it. This is a small fix round, so one implementer and one fresh reviewer are enough. Don't start step 3.

Each of items 1-4 was reproduced against commit `95f8ca4`. Write its failing test first.

## Fix

1. **SVG check hangs and rejects real files**, in `matchesMedia` in `server/projects.ts`.
   - The regex has exponential backtracking. A file starting with many `<!--a-->` comments doubles the time with each comment: 26 comments took 225 ms, so about 50 would block the whole server for hours.
   - It also rejects valid SVGs with a `<!DOCTYPE svg …>` line, which Adobe Illustrator exports commonly include, and a prefixed root such as `<svg:svg …>`.
   - Replace the regex with a small linear scan: skip a BOM, whitespace, `<?…?>`, `<!--…-->`, and `<!DOCTYPE …>` using `indexOf`, then require a root named `svg` or `<prefix>:svg`.
   - Test: the DOCTYPE and prefixed files are accepted, non-SVG text is rejected, and 100,000 repeated comments finish quickly.

2. **`.m4a` uploads are rejected when labelled `audio/x-m4a`**, the type browsers commonly use for these files. Version 1 advertises m4a uploads.
   - Accept `audio/x-m4a`, validate it with the same `ftyp` check as `audio/mp4`, store it as `audio/mp4`, and add it to the file picker's `accept` list in `src/Projects.tsx`.

3. **The 25 MB limit rejects ordinary long audio.** A 3-minute stereo 16-bit WAV is 31.8 MB, while the app's own audio upload allows 100 MB.
   - Use 100 MB for project imports, and update the error message.
   - With the bigger limit, the deferred review finding now matters: check that the project exists before multer buffers the upload. A bad project ID must return 404 without reading the file into memory. Test this with the route's order, not only its status code.

4. **A saved scene with a deleted AI character gives only "Something went wrong"** with a 500. `hydrateScene` lets the missing-character error escape, in `/api/scenes/:name`, the project scene route, and the render route.
   - Return a clear error naming the problem, for example 409 `This scene uses an AI character that no longer exists.`, and have `Projects.tsx` show it.
   - Make `npm run scene` print the same message.
   - Don't change how character deletion works.

5. **The Projects pages don't match the app's style.** Their buttons are the browser's default grey (`rgb(239, 239, 239)`), and asset links are default blue. The shared rules ask to match the existing style.
   - Use the existing `.btn`, `.btn.secondary`, `.pill`, and form styles from `src/styles.css` in `src/Projects.tsx`, including the tabs and rows.
   - Check the Projects list, a project's tabs, and an episode page by screenshot.

6. **Small clean-ups:**
   - `sceneImages` in `server/scene.ts` is now used only by tests. Remove it, and change those tests to use `captureScene`.
   - `GET /api/projects` returns projects in folder order, which looks random. Add `createdAt` to new projects and list newest first. Projects without it sort last.
   - An SVG project's Overview says "Bring in a saved character", but it has no character picker. An AI project with no saved characters shows no explanation. Give each an accurate sentence pointing to Character Studio.

## Leave alone

- Support for older draft records, and the local "Mango Lane" draft project in the other checkout.
- Render progress, which is step 7.
- Making Projects the home page, with the old flow at `/?character-studio`.

## Acceptance

1. Import an SVG with a DOCTYPE, an `.m4a` in Chrome, and a 30 MB WAV through the UI, then reopen the project.
2. Import the 100,000-comment file, and confirm the server still answers other requests right after.
3. Open a saved scene whose AI character is missing, using a temporary fixture you remove afterwards. The page shows the clear error.
4. Save the first scene in an episode, and confirm the render's frame hashes still match the step 1 export.
5. Today's four-step flow still works.

Write the report as `version 2 planning/codex-reports/step-2-fixes.md`.
