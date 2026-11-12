# Coding standards

What a review checks on top of `npm test`, which already covers syntax, text under 12px and the
files kept for use with no signal.

- **Words.** Names in the code and words on the page come from [GLOSSARY.md](GLOSSARY.md). A new
  idea gets its entry there in the same change.
- **Sheet text.** Every value from a Sheet reaches the page's HTML through `esc()` in `js/app.js`.
  Fixed strings written in the code go in as they are.
- **Kept on the phone.** Anything the page saves goes through `store` in `js/app.js`, under a key
  that starts with `trip-`. "Use a different Sheet" drops what came from the old Sheet and keeps
  the family's own ticks and notes.
- **Where logic goes.** Code that turns Sheet text into what the page shows lives in a module with
  no page code, with tests in `test/`. What `js/app.js` draws is checked in a browser at phone
  width.
- **Offline copy.** A change to any file in the `FILES` list of `sw.js` bumps `SHELL`. The comment
  above it says why.
- **Comments.** One to three lines on why, only where the code can't say it, describing the code
  as it is now.
- **Trip data.** Tests, code and screenshots use made-up trips. The family's real plan and its
  Sheet links stay out of the repo.
