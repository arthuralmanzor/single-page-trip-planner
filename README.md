# Trip planner

A one-page trip plan for a phone. It shows where you should be now, what's next and how to get
there, and it follows the clock through the trip.

You don't edit the plan here. The plan lives in Google Sheets that you own, and you keep it up to
date by talking to an AI. Gemini, Claude, ChatGPT or any other works, as long as it can edit your
Google Sheets.
You say "move the Peak Tram to 5pm", it edits the Sheet, and the page shows the change the next
time you open it.

The site: https://arthuralmanzor.github.io/single-page-trip-planner/

The page holds no trip details. On first open it asks for the link to your Plan Sheet and keeps
it on that phone, with a copy of the plan for when there's no signal.

## How it works

1. You give your AI the skill in this repo, [`skill/trip-assistant`](skill/trip-assistant/SKILL.md).
   It says how the Sheets are laid out and how to change them safely.
2. You hand it your plan in any form (notes, a document, an old itinerary) and ask it to set the
   trip up. It creates the Sheets.
3. You share the Plan Sheet as "Anyone with the link can view" and paste its link into the site.
4. From then on you ask for changes in plain words. The AI edits the Sheet and logs what changed.

## Give your AI the skill

The skill is one file, `SKILL.md`. The AI needs it, and it needs to be able to edit Google Sheets
in your Drive.

**Gemini** (on a computer, at gemini.google.com)

1. Download the `skill/trip-assistant` folder from this repo.
2. In the sidebar click Customize, then Skills, then Create, then Upload.
3. Pick the folder and click Create.

The skill then works in the Gemini phone app too. Type `/` in a chat to pick it, or just ask
about your trip.

**Claude**

1. Zip the `skill/trip-assistant` folder.
2. In Settings, open Capabilities, then Skills, and upload the zip.
3. Connect Google Drive in Settings, under Connectors.

**ChatGPT, or anything else**

Start the chat by pasting the contents of `SKILL.md`, or put it in a project's or a custom
assistant's instructions. Connect Google Drive so it can edit your Sheets.

If your AI can read your Sheets but not edit them, it can still answer questions about the trip,
and tell you which cell to change by hand.

## Start the conversation

To set up a trip:

> Here is my trip plan. Set it up as Sheets for the trip planner, following the trip-assistant
> skill. Ask me for anything that's missing.

During the trip:

> Move D3-05 to 5pm and fix whatever no longer fits after it.

> We're skipping the museum tomorrow. What should we do with the morning?

> What's next, and how do we get there?

Each stop has a code like D3-05, shown beside it on the site. Using it makes a request exact.

## Keep private details private

Anyone with a shared Sheet's link can read it. Booking numbers, full names and document details
go in a separate Sheet that you don't share. The skill tells the AI to keep them there. Ticket
images stay as private files in Drive, and the Plan holds only their links, which open for you
alone.

## For developers

Plain HTML, CSS and JavaScript modules. No framework, no build step, no dependencies.

    python3 -m http.server 8765
    npm test

- `js/plan.js` and `js/reference.js` turn the Sheets' text into what the page shows. The tests
  cover them.
- `js/app.js` draws the page. `js/sheets.js` fetches the tabs. `sw.js` keeps the page available
  with no signal.
- A row the page can't read is flagged on screen and the rest still loads.
- Words used in the code and the Sheets: [GLOSSARY.md](GLOSSARY.md). Why the plan is in Sheets
  and not in this repo: [docs/adr](docs/adr/0001-plan-lives-in-google-sheets.md).
