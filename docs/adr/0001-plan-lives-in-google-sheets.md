# The plan lives in Google Sheets, not in the repo

The plan changes during the trip, from a phone, by asking Gemini. Gemini can edit a Google Sheet
in place, but it can't save to GitHub or edit other Drive files. So the Sheets are the only source
of truth, and the repo holds code only.

The site reads the Sheets by a link saved on the phone. The repo is public and the plan is
personal, so the link never goes in the code. Booking numbers and names sit in a Sheet that isn't
shared at all, and ticket images stay as private Drive files.

The plan is split into one Sheet per topic (plan, changes, checklists, pharmacy and info,
bookings) so a change to a stop never loads the rest.

## Considered options

- JSON files in the repo: every change needed a paste and a GitHub key on the phone.
- Google sign-in to a fully private Sheet: needs a Google Cloud project and a new sign-in about
  every hour.
