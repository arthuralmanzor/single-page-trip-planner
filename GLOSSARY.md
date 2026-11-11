# Trip planner

The plan for one family trip: where the family should be and when, what is booked, and what to
bring.

## The plan

**Plan**:
The current version of every Day and Stop. The only source of truth for where the family should be
and when.
_Avoid_: state, trip book

**Day**:
One date of the trip, with a title and a pace note. Day 1 also holds the travel that leads into it.
_Avoid_: date, page

**Stop**:
One timed entry in a Day: a place to be, a ride, or a meal. Named by its stop code, like D3-05.
_Avoid_: item, event, activity

**Booking**:
Something paid or reserved ahead (a flight, the hotel, park tickets, the eSIM), named by its booking code, like BK-03.
_Avoid_: reservation, ticket

**Ticket image**:
A screenshot of a Booking's receipt or ticket.
_Avoid_: receipt, attachment

**Change**:
One edit to the Plan, logged with when it happened, the Stop, and the old and new value.
_Avoid_: change request, proposal

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
