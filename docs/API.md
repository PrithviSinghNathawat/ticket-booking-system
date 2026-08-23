# API Reference

Every route in `app/api/`. Every error response, from every route, has the same shape: `{ error: string, code: string, details?: unknown }` — built by the shared `apiError()` helper in [`lib/errors.ts`](../lib/errors.ts), never assembled ad hoc per route. `error` is the human-readable message; `code` is a stable, machine-checkable string safe to switch on; `details` is present only where there's structured extra data (validation field errors, conflicting seat ids).

Unless noted "public," a route enforces `requireRole([...])` from [`lib/auth.ts`](../lib/auth.ts):

- **No session** → `401 { "error": "Unauthorized", "code": "UNAUTHORIZED" }`
- **Session exists, wrong role** → `403 { "error": "Forbidden", "code": "FORBIDDEN" }`

Every route with a JSON body validates it against a Zod schema in [`lib/schemas.ts`](../lib/schemas.ts) via `parseBody`, which on failure returns:

- Malformed JSON → `400 { "error": "Invalid JSON body", "code": "INVALID_JSON" }`
- Schema mismatch → `400 { "error": "Validation failed", "code": "VALIDATION_FAILED", "details": { ... zod field errors ... } }`

Those two are omitted from each route's error list below to avoid repeating them on every mutating endpoint — assume they apply to any `POST`/`PATCH` with a body. Every response not shown as an error is JSON, `Content-Type: application/json`.

## Contents

- [Auth](#auth)
- [Bookings](#bookings)
- [Cron](#cron)
- [Events \& shows](#events--shows)
- [Holds](#holds)
- [Organiser](#organiser)
- [Venues](#venues)
- [Waitlist](#waitlist)
- [Verify](#verify)
- [Health](#health)
- [Demo](#demo)

## Auth

### `POST /api/auth/register`
Public. `{ email, password (min 8), name, role: "CUSTOMER"|"ORGANISER" (default CUSTOMER), inviteCode? }`
201 `{ id, email, name, role }`.
Errors: `403 INVITE_CODE_REQUIRED` — `role=ORGANISER` with a missing/wrong `inviteCode` (must match `ORGANISER_SIGNUP_CODE`). `409 EMAIL_IN_USE` — email already registered.

### `POST /api/auth/login`
Public. `{ email, password }`. 200 `{ id, email, name, role }`.
Errors: `401 INVALID_CREDENTIALS` — no matching user or wrong password (one message either way, doesn't reveal which).

### `POST /api/auth/logout`
Public. No body. 200 `{ ok: true }`. Clears the session cookie.

### `GET /api/auth/me`
Authenticated, any role. 200 `{ userId, role, email }`.
Errors: `401 UNAUTHORIZED` — no valid session.

## Bookings

### `GET /api/bookings`
`CUSTOMER`. 200 `{ bookings: [{ reference, status, eventTitle, venueName, startsAt, totalAmount, createdAt }] }` — caller's own, newest first.

### `POST /api/bookings`
`CUSTOMER`. `{ showId, contactName, contactEmail, contactPhone }`. 201 `{ id, reference }`. Fires the confirmation email via `after()`.
Errors: `404 SHOW_NOT_FOUND` — show not found. `409 HOLD_LAPSED` — no active hold on this show (expired, released, or never held). `500 REFERENCE_COLLISION` — booking reference collided on every retry (see [`DESIGN.md`](../DESIGN.md) for why this retries at all).

### `GET /api/bookings/[reference]`
`CUSTOMER`. 200 `{ reference, status, contactName, contactEmail, contactPhone, eventTitle, venueName, startsAt, totalAmount, createdAt, seats: [{ rowLabel, seatNumber, categoryName, price }] }`.
Errors: `404 NOT_FOUND` — not found, **or** found but belongs to a different customer (cross-tenant reads look identical to nonexistent, on purpose).

### `POST /api/bookings/[reference]/cancel`
`CUSTOMER`. No body. 200 `{ reference, status: "CANCELLED" }`. Releases the seats and, in the same transaction, offers them to the next waitlisted customer per category; fires waitlist-offer emails via `after()` if any offers were made.
Errors: `404 NOT_FOUND` — not found or not owned by caller. `409 ALREADY_CANCELLED` — already cancelled.

## Cron

### `POST /api/cron/sweep` (also `GET`, identical behaviour)
Bearer-token auth: `Authorization: Bearer <CRON_SECRET>`, not `requireRole`. 200 `{ deletedHolds, expiredOffers, promotedWaitlistEntries, durationMs }`.
Errors: `401 UNAUTHORIZED` — `CRON_SECRET` unset, or header missing/wrong.

## Events & shows

### `GET /api/events`
Public. Query: `type` (`MOVIE`|`CONCERT`), `date` (`YYYY-MM-DD`), `q` (title search), `venueId`. 200 `{ events: [{ eventId, title, type, description, venueName, nextShowAt, priceMin, priceMax, soldOut, showCount }] }`. Excludes any event whose title ends with `(internal)` (the `/demo` fixtures).
Errors: `400 VALIDATION_FAILED` — invalid `type` or unparsable `date`.

### `POST /api/events`
`ORGANISER`. `{ title, type, description }`. 201 `{ id, title, type, description }`.

### `PATCH /api/events/[id]`
`ORGANISER`, owner only. `{ title?, type?, description? }`. 200 the updated event.
Errors: `404 NOT_FOUND` — not found or not owned by caller.

### `DELETE /api/events/[id]`
`ORGANISER`, owner only. 200 `{ deleted: true }`.
Errors: `404 NOT_FOUND` — not found/not owned. `409 EVENT_HAS_SHOWS` — event has shows and can't be deleted.

### `POST /api/events/[id]/shows`
`ORGANISER`, owner only. `{ venueId, startsAt (ISO), prices: [{ categoryId, price }] }`. 201 `{ id, startsAt, venueId }`.
Errors: `404 NOT_FOUND` — parent event not found/not owned. `404 VENUE_NOT_FOUND` — venue not found. `400 STARTS_AT_IN_PAST` — `startsAt` not in the future. `400 PRICE_COVERAGE_MISMATCH` — `prices` doesn't cover every category at the venue exactly (missing a category, or referencing one that doesn't exist there).

### `PATCH /api/events/[id]/shows/[showId]`
`ORGANISER`, owner only. `{ startsAt?, prices? }`. 200 the updated show.
Errors: `404 NOT_FOUND` — event not owned, or show not found for that event. `400 STARTS_AT_IN_PAST` / `400 PRICE_COVERAGE_MISMATCH` — same coverage rules as creation.

### `DELETE /api/events/[id]/shows/[showId]`
`ORGANISER`, owner only. 200 `{ deleted: true }` — cascades its waitlist offers/entries, seat allocations, and prices.
Errors: `404 NOT_FOUND` — event not owned, or show mismatch. `409 SHOW_HAS_BOOKINGS` — show has confirmed bookings.

## Holds

### `GET /api/holds/me`
`CUSTOMER`. 200 `{ holds: [{ showId, title, venueName, startsAt, expiresAt, seats: [{ seatId, rowLabel, seatNumber }] }] }` — the reconciliation endpoint for an ambiguous hold response (see [Known Limitations](../README.md#known-limitations)).

### `POST /api/shows/[showId]/holds`
`CUSTOMER`. `{ seatIds: string[] (1–10) }`. 201 `{ seatIds, expiresAt }`.
Errors: `400 DUPLICATE_SEAT_IDS` — duplicate seat ids. `404 SHOW_NOT_FOUND` — show not found. `400 INVALID_SEATS` — a seat id doesn't belong to this show's venue. `409 ACTIVE_HOLD_EXISTS` — caller already holds an active allocation on this show. `409 SEAT_CONFLICT` (`details: { conflictingSeatIds }`) — one or more requested seats were just claimed by someone else (the unique-constraint race, surfaced with the specific seats that were lost).

### `DELETE /api/shows/[showId]/holds`
`CUSTOMER`. No body. 200 `{ releasedSeatIds }` — releases all of caller's held seats on this show.

## Organiser

### `GET /api/organiser/events/[id]/summary`
`ORGANISER` (owner) or `ADMIN`. 200:
```
{
  eventId, title,
  shows: [{
    showId, startsAt, seatsTotal, seatsSold, seatsHeld, seatsAvailable,
    occupancyPercent, confirmedRevenue, confirmedBookingsCount,
    cancelledBookingsCount, cancelledValue,
    waitlistDepth: [{ categoryId, categoryName, waiting }]
  }],
  eventTotal: { confirmedRevenue, cancelledValue, seatsSold },
  notes
}
```
`confirmedRevenue` sums `BookingSeat` price snapshots, not live `ShowPrice` — see [`DESIGN.md`](../DESIGN.md).
Errors: `404 NOT_FOUND` — event not found, or caller is an `ORGANISER` who doesn't own it (`ADMIN` bypasses ownership).

### `GET /api/shows/[showId]/seats`
Public (uses the session only to flag which seats are "yours," doesn't require one). Polled every 3s by the seat map. 200 `{ show, prices, seats: [{ seatId, rowLabel, seatNumber, categoryId, categoryName, price, status: "AVAILABLE"|"HELD"|"BOOKED"|"HELD_BY_YOU", expiresAt, mine }], serverNow }`. Never writes — see [`DESIGN.md`](../DESIGN.md) for why.
Errors: `404 SHOW_NOT_FOUND` — show not found.

## Venues

### `GET /api/venues`
Public. 200 `{ venues: [{ id, name, address, categories: [{ id, name, seatCount }] }] }`.

### `POST /api/venues`
`ADMIN`. `{ name, address, categories: [{ name }], rows: [{ label, seatCount (1–50), categoryName }] }`. 201 `{ id, name, address }`.
Errors: `400 DUPLICATE_ROW_LABEL` — duplicate row labels. `400 UNKNOWN_CATEGORY` — a row references an unknown category.

### `GET /api/venues/[id]`
Public. 200 `{ id, name, address, categories }`.
Errors: `404 NOT_FOUND` — not found.

### `PATCH /api/venues/[id]`
`ADMIN`. `{ name?, address?, categories?, rows? }`. Supplying `categories`/`rows` rebuilds the entire seat layout (delete + recreate). 200 `{ id, name, address }`.
Errors: `404 NOT_FOUND` — not found. `400 LAYOUT_FIELDS_INCOMPLETE` — only one of `categories`/`rows` supplied. `400 DUPLICATE_ROW_LABEL` / `400 UNKNOWN_CATEGORY` — duplicate labels, or an unknown category reference. `409 VENUE_HAS_BOOKINGS` — the venue has confirmed bookings, so its layout can't change (see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md#decisions)).

### `DELETE /api/venues/[id]`
`ADMIN`. 200 `{ deleted: true }`.
Errors: `404 NOT_FOUND` — not found. `409 VENUE_HAS_SHOWS` — venue has shows referencing it.

## Waitlist

### `POST /api/shows/[showId]/waitlist`
`CUSTOMER`. `{ categoryId }`. 200 (idempotent re-return of an existing `WAITING`/`OFFERED` entry) or 201 (new entry) `{ id, status }`.
Errors: `404 SHOW_NOT_FOUND` / `404 CATEGORY_NOT_FOUND` — show or category not found. `400 ALREADY_CONVERTED` — caller already converted a seat from this waitlist. `400 NOT_SOLD_OUT` — the category isn't actually sold out right now.

### `DELETE /api/shows/[showId]/waitlist?categoryId=...`
`CUSTOMER`. 200 `{ left: boolean }`. If the entry was `OFFERED`, also expires the pending offer, releases its held seat, and re-runs the promotion cascade for the next waiter.
Errors: `400 MISSING_QUERY_PARAM` — missing `categoryId` query param.

### `POST /api/shows/[showId]/waitlist/process`
Public, no auth. Fired once when a show page mounts to catch any lapsed offer the poll itself can never write. 200, body is whatever `processWaitlist` returns.

### `POST /api/waitlist/claim`
`CUSTOMER`. `{ token }`. 200 `{ showId }` — hands back the show for the client to complete checkout with the now-held seat.
Errors: `404 NOT_FOUND` — no such offer, or it belongs to someone else. `410 OFFER_EXPIRED` — offer already claimed/expired, or its TTL has lapsed.

### `GET /api/waitlist/me`
`CUSTOMER`. 200 `{ entries: [{ id, showId, eventTitle, venueName, startsAt, categoryId, categoryName, status, position, offer: { token, expiresAt, rowLabel, seatNumber } | null }], serverNow }` — only `WAITING`/`OFFERED` entries, oldest first; `position` is the 1-based queue position when waiting.

## Verify

### `GET /api/verify/[payload]`
Public. Recomputes the HMAC over `<reference>.<hmac>` before trusting it — see [`DESIGN.md`](../DESIGN.md). Always `200`, never an error status:
- `{ valid: false }` — bad signature, malformed payload, or no matching booking.
- `{ valid: true, status, reference, event, venue, showtime, seats: [{ rowLabel, seatNumber, categoryName, price }], totalAmount }` — a genuine booking, `status` distinguishing `CONFIRMED` from `CANCELLED`.

## Health

### `GET /api/health`
Public. Verifies database connectivity and reports the running commit. 200 `{ status: "healthy", commit, timestamp }`.
Errors: `503 { status: "unhealthy", commit, timestamp, error }` — the database ping failed.

## Demo

Gated behind `ENABLE_DEMO_ROUTES` / `DEMO_RESET_ENABLED`; each self-provisions its own fixtures (venue, event, show, users) on first call, so none of these depend on the seed script having run. See [`lib/demo.ts`](../lib/demo.ts).

### `POST /api/demo/race`
Public. No body. Fires `DEMO_RACE_SEAT_COUNT` (10) simultaneous hold requests at one seat from pre-provisioned `demo-racer-N@ticketing.test` accounts. 200 `{ results: [{ email, status, ms, won, error? }], winner: string | null, rowCount, seatId, showId }`.
Errors: `404 DEMO_DISABLED` — `ENABLE_DEMO_ROUTES` is not `true`.

### `POST /api/demo/waitlist-cascade`
Public. No body. Cancels a pre-provisioned confirmed booking on a sold-out seat with a waiter already in line. 200 `{ cancelStatus, cancelBody, waiterEntryStatus, offer: { status, expiresAt } | null, currentSeatStatus }`.
Errors: `404 DEMO_DISABLED` — `ENABLE_DEMO_ROUTES` is not `true`.

### `POST /api/demo/reset`
Public. No body. Wipes and re-provisions both fixture sets above. 200 `{ reset: true }`.
Errors: `404 DEMO_DISABLED` — `DEMO_RESET_ENABLED` is not `true`.
