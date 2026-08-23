# API Reference

Every route in `app/api/`. Unless noted "public," a route enforces `requireRole([...])` from [`lib/auth.ts`](../lib/auth.ts):

- **No session** → `401 { "error": "Unauthorized" }`
- **Session exists, wrong role** → `403 { "error": "Forbidden" }`

Every route with a JSON body validates it against a Zod schema in [`lib/schemas.ts`](../lib/schemas.ts) via `parseBody`, which on failure returns:

- Malformed JSON → `400 { "error": "Invalid JSON body" }`
- Schema mismatch → `400 { "error": "Validation failed", "fields": { ... zod field errors ... } }`

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

## Auth

### `POST /api/auth/register`
Public. `{ email, password (min 8), name, role: "CUSTOMER"|"ORGANISER" (default CUSTOMER), inviteCode? }`
201 `{ id, email, name, role }`.
Errors: `403` — `role=ORGANISER` with a missing/wrong `inviteCode` (must match `ORGANISER_SIGNUP_CODE`). `409` — email already registered.

### `POST /api/auth/login`
Public. `{ email, password }`. 200 `{ id, email, name, role }`.
Errors: `401` — no matching user or wrong password (one message either way, doesn't reveal which).

### `POST /api/auth/logout`
Public. No body. 200 `{ ok: true }`. Clears the session cookie.

### `GET /api/auth/me`
Authenticated, any role. 200 `{ userId, role, email }`.
Errors: `401` — no valid session.

## Bookings

### `GET /api/bookings`
`CUSTOMER`. 200 `{ bookings: [{ reference, status, eventTitle, venueName, startsAt, totalAmount, createdAt }] }` — caller's own, newest first.

### `POST /api/bookings`
`CUSTOMER`. `{ showId, contactName, contactEmail, contactPhone }`. 201 `{ id, reference }`. Fires the confirmation email via `after()`.
Errors: `404` — show not found. `409` — no active hold on this show (expired, released, or never held). `500` — booking reference collided on every retry (see [`DESIGN.md`](../DESIGN.md) for why this retries at all).

### `GET /api/bookings/[reference]`
`CUSTOMER`. 200 `{ reference, status, contactName, contactEmail, contactPhone, eventTitle, venueName, startsAt, totalAmount, createdAt, seats: [{ rowLabel, seatNumber, categoryName, price }] }`.
Errors: `404` — not found, **or** found but belongs to a different customer (cross-tenant reads look identical to nonexistent, on purpose).

### `POST /api/bookings/[reference]/cancel`
`CUSTOMER`. No body. 200 `{ reference, status: "CANCELLED" }`. Releases the seats and, in the same transaction, offers them to the next waitlisted customer per category; fires waitlist-offer emails via `after()` if any offers were made.
Errors: `404` — not found or not owned by caller. `409` — already cancelled.

## Cron

### `POST /api/cron/sweep` (also `GET`, identical behaviour)
Bearer-token auth: `Authorization: Bearer <CRON_SECRET>`, not `requireRole`. 200 `{ deletedHolds, expiredOffers, promotedWaitlistEntries, durationMs }`.
Errors: `401` — `CRON_SECRET` unset, or header missing/wrong.

## Events & shows

### `GET /api/events`
Public. Query: `type` (`MOVIE`|`CONCERT`), `date` (`YYYY-MM-DD`), `q` (title search), `venueId`. 200 `{ events: [{ eventId, title, type, description, venueName, nextShowAt, priceMin, priceMax, soldOut, showCount }] }`.
Errors: `400` — invalid `type` or unparsable `date`.

### `POST /api/events`
`ORGANISER`. `{ title, type, description }`. 201 `{ id, title, type, description }`.

### `PATCH /api/events/[id]`
`ORGANISER`, owner only. `{ title?, type?, description? }`. 200 the updated event.
Errors: `404` — not found or not owned by caller.

### `DELETE /api/events/[id]`
`ORGANISER`, owner only. 200 `{ deleted: true }`.
Errors: `404` — not found/not owned. `409` — event has shows and can't be deleted.

### `POST /api/events/[id]/shows`
`ORGANISER`, owner only. `{ venueId, startsAt (ISO), prices: [{ categoryId, price }] }`. 201 `{ id, startsAt, venueId }`.
Errors: `404` — parent event not found/not owned, or venue not found. `400` — `startsAt` not in the future, or `prices` doesn't cover every category at the venue exactly (missing a category, or referencing one that doesn't exist there).

### `PATCH /api/events/[id]/shows/[showId]`
`ORGANISER`, owner only. `{ startsAt?, prices? }`. 200 the updated show.
Errors: `404` — event not owned, or show not found for that event. `400` — same `startsAt`/`prices` coverage rules as creation.

### `DELETE /api/events/[id]/shows/[showId]`
`ORGANISER`, owner only. 200 `{ deleted: true }` — cascades its waitlist offers/entries, seat allocations, and prices.
Errors: `404` — event not owned, or show mismatch. `409` — show has confirmed bookings.

## Holds

### `GET /api/holds/me`
`CUSTOMER`. 200 `{ holds: [{ showId, title, venueName, startsAt, expiresAt, seats: [{ seatId, rowLabel, seatNumber }] }] }` — the reconciliation endpoint for an ambiguous hold response (see [Known Limitations](../README.md#known-limitations)).

### `POST /api/shows/[showId]/holds`
`CUSTOMER`. `{ seatIds: string[] (1–10) }`. 201 `{ seatIds, expiresAt }`.
Errors: `400` — duplicate seat ids. `404` — show not found. `400` — a seat id doesn't belong to this show's venue. `409` — caller already holds an active allocation on this show. `409 { conflictingSeatIds }` — one or more requested seats were just claimed by someone else (the unique-constraint race, surfaced with the specific seats that were lost).

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
Errors: `404` — event not found, or caller is an `ORGANISER` who doesn't own it (`ADMIN` bypasses ownership).

### `GET /api/shows/[showId]/seats`
Public (uses the session only to flag which seats are "yours," doesn't require one). Polled every 3s by the seat map. 200 `{ show, prices, seats: [{ seatId, rowLabel, seatNumber, categoryId, categoryName, price, status: "AVAILABLE"|"HELD"|"BOOKED"|"HELD_BY_YOU", expiresAt, mine }], serverNow }`. Never writes — see [`DESIGN.md`](../DESIGN.md) for why.
Errors: `404` — show not found.

## Venues

### `GET /api/venues`
Public. 200 `{ venues: [{ id, name, address, categories: [{ id, name, seatCount }] }] }`.

### `POST /api/venues`
`ADMIN`. `{ name, address, categories: [{ name }], rows: [{ label, seatCount (1–50), categoryName }] }`. 201 `{ id, name, address }`.
Errors: `400` — duplicate row labels, or a row references an unknown category.

### `GET /api/venues/[id]`
Public. 200 `{ id, name, address, categories }`.
Errors: `404` — not found.

### `PATCH /api/venues/[id]`
`ADMIN`. `{ name?, address?, categories?, rows? }`. Supplying `categories`/`rows` rebuilds the entire seat layout (delete + recreate). 200 `{ id, name, address }`.
Errors: `404` — not found. `400` — only one of `categories`/`rows` supplied, duplicate labels, or an unknown category reference. `409` — the venue has confirmed bookings, so its layout can't change (see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md#decisions)).

### `DELETE /api/venues/[id]`
`ADMIN`. 200 `{ deleted: true }`.
Errors: `404` — not found. `409` — venue has shows referencing it.

## Waitlist

### `POST /api/shows/[showId]/waitlist`
`CUSTOMER`. `{ categoryId }`. 200 (idempotent re-return of an existing `WAITING`/`OFFERED` entry) or 201 (new entry) `{ id, status }`.
Errors: `404` — show or category not found. `400` — caller already converted a seat from this waitlist, or the category isn't actually sold out right now.

### `DELETE /api/shows/[showId]/waitlist?categoryId=...`
`CUSTOMER`. 200 `{ left: boolean }`. If the entry was `OFFERED`, also expires the pending offer, releases its held seat, and re-runs the promotion cascade for the next waiter.
Errors: `400` — missing `categoryId` query param.

### `POST /api/shows/[showId]/waitlist/process`
Public, no auth. Fired once when a show page mounts to catch any lapsed offer the poll itself can never write. 200, body is whatever `processWaitlist` returns.

### `POST /api/waitlist/claim`
`CUSTOMER`. `{ token }`. 200 `{ showId }` — hands back the show for the client to complete checkout with the now-held seat.
Errors: `404` — no such offer, or it belongs to someone else. `410` — offer already claimed/expired, or its TTL has lapsed.

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
Errors: `503 { status: "unhealthy", error }` — the database ping failed.
