# Design notes (partial — full pass in Phase 8)

## Seat hold TTL and lazy expiry

Expiry is a property of the data, not a scheduled job. A `HELD` `SeatAllocation` row carries an `expiresAt`; every code path that decides whether a seat is available treats a `HELD` row with `expiresAt` in the past as free. That logic lives once, in `lib/allocations.ts`, and every call site (seat map, hold creation, the "already holds a seat" guard, the holds-summary endpoint, the sweep) uses it, so the definition of "active" cannot drift between call sites.

`POST /api/cron/sweep`, run daily by `vercel.json`'s cron entry, deletes rows that are already expired. This is best-effort table hygiene, not the mechanism that enforces the ten-minute window — Vercel's Hobby plan runs cron at most once a day, which is nowhere near tight enough to be a TTL enforcer. The actual guarantee is that lazy expiry makes an expired hold invisible to every reader within milliseconds, regardless of when the sweep last ran.

`GET /api/shows/[id]/seats` deliberately performs no writes, and the real reason is load, not tidiness: it's polled every 3 seconds by every connected client. An inline sweep would turn every read into a write, multiplying database load by the number of open tabs on that show — the exact opposite of what a hot polling endpoint should do. Physical cleanup is confined to two places that already have a reason to touch the row: the hold-creation transaction (deleting expired rows for the specific seats it's about to claim) and the daily sweep.

## Concurrency

`SeatAllocation` has a unique index on `(showId, seatId)`. Holding a seat is delete-expired-then-insert in one transaction; a losing concurrent request hits the unique constraint (Postgres `23505`, surfaced by Prisma as `P2002`) and gets translated to `409` with the specific seat ids that were lost. The unique index — not an application-level lock or a higher Prisma isolation level — is what makes this safe under real concurrent serverless invocations, which is why `scripts/concurrency-test.ts` is run against the live Vercel URL, not just localhost.

## QR ticket forgery

A QR code that just encodes the booking reference is trivially forgeable — anyone with a QR generator and a guessed or overheard reference can produce a "valid-looking" ticket. The QR instead encodes `<reference>.<hmac>`, where the HMAC is SHA-256 over the reference keyed by a server-only `QR_SIGNING_SECRET`; `/api/verify/[payload]` recomputes the HMAC with `crypto.timingSafeEqual` before trusting the reference at all, so a forged or tampered payload is rejected before it ever touches the database. A cancelled booking still verifies as structurally valid (correct signature) but reports `status: CANCELLED`, because a gate agent needs to distinguish "this ticket was forged" from "this ticket was real but refunded" — those are different operational responses.

## Waitlist and time-limited offers

(Filled in when Phase 6 lands.)
