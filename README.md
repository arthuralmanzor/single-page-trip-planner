# Trip planner

A one-page trip plan for a phone. It shows where you should be now, what's next and how to get
there, and it follows the clock through the trip.

The page holds no trip details. The plan lives in Google Sheets that you own, so it can change
during the trip, by hand or by asking Gemini. On first open the page asks for the link to your
Plan Sheet and keeps it on that phone. It also keeps a copy of the plan for when there's no
signal.

## Set up a trip

1. Make the Plan Sheet with the tabs `Trip`, `Days`, one tab per day, and `Bookings`. The column
   formats are in [the Gemini skill](skill/trip-assistant/SKILL.md).
2. Share it as "Anyone with the link can view".
3. Open the site and paste the link.

Checklists and the pharmacy kit are separate Sheets. Put their links in the `Trip` tab, in the
rows `Checklists sheet` and `Pharmacy and info sheet`, and share them the same way.

Booking numbers, names and ticket images don't belong in a shared Sheet. Keep them in a Sheet
that isn't shared.

## Asking Gemini to change the plan

Add the folder `skill/trip-assistant` to Gemini as a skill. It tells Gemini where the plan is,
how each column is written, and to write every change into the Sheet.

## Run it locally

    python3 -m http.server 8765
    npm test

Why the plan is in Sheets and not in this repo: [docs/adr](docs/adr/0001-plan-lives-in-google-sheets.md).
