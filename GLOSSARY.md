# Trip planner

The plan for one family trip: where the family should be and when, what is booked, and what to
bring.

## The plan

**Plan**:
The current version of every Day and Stop. The only source of truth for where the family should be
and when.
_Avoid_: itinerary data, trip book

**Day**:
One date of the trip, with a title and a pace note. Day 1 also holds the travel that leads into it.
_Avoid_: date, page

**Stop**:
One timed entry in a Day: a place to be, a ride, or a meal. Named by its stop code, like D3-05.
_Avoid_: item, event, activity

**Ride**:
A Stop that takes the family from one place to the next, with when it leaves and about when it
arrives. No Stop after it starts before it arrives. Rides that start together are the group
splitting up.
_Avoid_: trip, journey

**Place**:
Somewhere a Stop goes, with what to search for it in Google Maps.

**Local address**:
A Place's address in the local language, shown full-screen for a taxi driver. Optional.
_Avoid_: translation

**Booking**:
Something paid or reserved ahead (a flight, the hotel, park tickets, the eSIM), named by its booking code, like BK-03.
_Avoid_: reservation, ticket

**Ticket image**:
A screenshot of a Booking's receipt or ticket.
_Avoid_: receipt, attachment

**Change**:
One edit to the Plan, logged with when it happened, the Stop, and the old and new value.
_Avoid_: change request, proposal

**Changed stop**:
A Stop that is new, different or removed since this phone last showed it. Each phone works this out
for itself, apart from the logged Changes.

**Family link**:
A link to this page that opens the Plan on another phone with nothing to paste. Anyone who has it
can read the Plan, the same as with the Plan Sheet's own link.
_Avoid_: invite, share code

## Reference

**Checklist**:
A named list of things to get, confirm or pack.

**Tick**:
A mark that one Checklist line is done. Not part of the Plan.
_Avoid_: state, done flag

**Pharmacy kit**:
The medicines and first aid the family carries, with who each is for.

**Info**:
The fixed facts for the trip: travelers, hotel, emergency numbers, MTR and Octopus tips, and
Filipino food near each Day's plan.

## The family

**Travelers**:
The people on the trip.

**Seniors**:
The older travelers. The plan gives them lifts, rest breaks and food they like.

**Kids**:
The children on the trip.
