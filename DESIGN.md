# Design notes

## Seat hold TTL and lazy expiry

Expiry is a property of the data, not a scheduled job. A `HELD` `SeatAllocation` row carries an `expiresAt`; every code path deciding whether a seat is available treats a `HELD` row with `expiresAt` in the past as free. That logic lives once, in `lib/allocations.ts`, and every call site (seat map, hold creation, the "already holds a seat" guard, the holds-summary endpoint, the sweep) uses it, so "active" cannot drift between call sites.

`POST /api/cron/sweep`, run daily by `vercel.json`'s cron entry, deletes rows already expired. This is best-effort table hygiene, not the enforcement mechanism — Vercel's Hobby plan runs cron at most once a day, nowhere near tight enough to be a TTL enforcer. The actual guarantee is that lazy expiry makes an expired hold invisible to every reader within milliseconds, regardless of when the sweep last ran.

`GET /api/shows/[id]/seats` deliberately performs no writes, and the reason is load, not tidiness: it's polled every 3 seconds by every connected client. An inline sweep would turn every read into a write, multiplying database load by the number of open tabs on that show. Physical cleanup is confined to two places that already have a reason to touch the row: the hold-creation transaction (deleting expired rows for the seats it's about to claim) and the daily sweep.

## Concurrency

`SeatAllocation` has a unique index on `(showId, seatId)`. Holding a seat is delete-expired-then-insert in one transaction; a losing concurrent request hits the unique constraint (Postgres `23505`, surfaced by Prisma as `P2002`) and gets translated to `409` with the specific seat ids that were lost. The unique index, not an application-level lock or a higher isolation level, is what makes this safe under real concurrent serverless invocations — why `scripts/concurrency-test.ts` runs against the live Vercel URL, not just localhost.

## QR ticket forgery

A QR code that just encodes the booking reference is trivially forgeable — anyone with a QR generator and a guessed or overheard reference can produce a valid-looking ticket. The QR instead encodes `<reference>.<hmac>`, an HMAC-SHA256 over the reference keyed by a server-only `QR_SIGNING_SECRET`; `/api/verify/[payload]` recomputes it with `crypto.timingSafeEqual` before trusting the reference at all, so a forged or tampered payload is rejected before it touches the database. A cancelled booking still verifies as structurally valid (correct signature) but reports `status: CANCELLED`, because a gate agent needs to distinguish "forged" from "real but refunded".

## Waitlist and time-limited offers

Keeping `GET /api/shows/[id]/seats` write-free means that read can't be the thing that notices an offer has lapsed and cascades to the next waiter — a poll firing every 3 seconds per tab can't carry that responsibility without reintroducing the write-amplification problem it was built to avoid. The fix is one idempotent, re-entrant function, `processWaitlist(showId)` in `lib/waitlist.ts`, called from every place that already has a legitimate reason to write: booking cancellation, an offer claim (success or failure), the daily sweep, and a one-shot `POST /api/shows/[id]/waitlist/process` fired once when a show page mounts — never from the poll itself. Each cascade step is a guarded `updateMany` (`count === 1` or bail), so calling it concurrently from two write paths at once is safe by construction, not by locking.

A production system would use a durable queue with a delayed job firing expiry-and-promote exactly when the offer lapses. This design has no such mechanism on Vercel's free tier, so staleness is bounded only by "the next time anyone writes to or opens that show" — a show with no viewers and no cancellations could sit with an expired offer un-promoted until the daily cron runs. That's a real free-tier limitation, not something this design pretends to solve.

Cancellation hands a freed seat to the next waiter inside the *same transaction* that deletes the booking's `SeatAllocation` rows — never delete-then-commit-then-offer, because a briefly, genuinely available seat is one a browsing customer's next poll (within 3 seconds) will grab before the waitlist ever sees it. The offer's `HELD` allocation is created in that same transaction, so the seat is never publicly visible as available at any point.

One consequence: cancelling a large booking (up to `MAX_HOLD_SEATS_PER_REQUEST` seats) does up to that many sequential offer-handoffs inside one interactive transaction. Against real network latency to Neon this was originally measured at ~5.7 seconds for an 8-seat cancellation — past Prisma's 5-second interactive-transaction default, surfacing as `P2028` in production testing (cleanly rolled back, nothing left half-done). The root cause was a Vercel/Neon region mismatch (functions defaulted to `iad1`, the database runs in `ap-southeast-1`); pinning `vercel.json`'s `regions` to `sin1` cut the same cancellation to under a second. The transaction still carries an explicit `timeout: 10000` and `maxDuration = 15` as a bound on the still-bounded case — capped at the hold endpoint's own seat limit — not as the fix itself.
