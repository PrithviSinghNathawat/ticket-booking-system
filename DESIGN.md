# Design notes (partial — full pass in Phase 8)

## Seat hold TTL and lazy expiry

Expiry is a property of the data, not a scheduled job. A `HELD` `SeatAllocation` row carries an `expiresAt`; every code path that decides whether a seat is available treats a `HELD` row with `expiresAt` in the past as free. That logic lives once, in `lib/allocations.ts`, and every call site (seat map, hold creation, the "already holds a seat" guard, the holds-summary endpoint, the sweep) uses it, so the definition of "active" cannot drift between call sites.

`POST /api/cron/sweep`, run daily by `vercel.json`'s cron entry, deletes rows that are already expired. This is best-effort table hygiene, not the mechanism that enforces the ten-minute window — Vercel's Hobby plan runs cron at most once a day, which is nowhere near tight enough to be a TTL enforcer. The actual guarantee is that lazy expiry makes an expired hold invisible to every reader within milliseconds, regardless of when the sweep last ran. Deliberately, `GET /api/shows/[id]/seats` does not delete expired rows itself — it only computes status — so a read stays a read; physical cleanup is confined to the hold-creation transaction (for the seats it's about to claim) and the sweep.

## Concurrency

`SeatAllocation` has a unique index on `(showId, seatId)`. Holding a seat is delete-expired-then-insert in one transaction; a losing concurrent request hits the unique constraint (Postgres `23505`, surfaced by Prisma as `P2002`) and gets translated to `409` with the specific seat ids that were lost. The unique index — not an application-level lock or a higher Prisma isolation level — is what makes this safe under real concurrent serverless invocations, which is why `scripts/concurrency-test.ts` is run against the live Vercel URL, not just localhost.

## Waitlist and time-limited offers

(Filled in when Phase 6 lands.)
