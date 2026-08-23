# System Design

## Seat hold and TTL

Expiry is a property of the data rather than a scheduled job. Every `HELD` row in `SeatAllocation` carries an `expiresAt`, and every code path deciding whether a seat is available treats a held row whose `expiresAt` has passed as free. That definition lives in one place, `lib/allocations.ts`, reused by the seat map, hold creation, the guard preventing a second concurrent hold, the holds summary and the sweep, so the boundary cannot drift between call sites.

A daily Vercel cron calls `POST /api/cron/sweep`, which deletes rows that have already lapsed. This is table hygiene, not enforcement: the Hobby plan runs cron at most once a day, nowhere near the granularity a ten-minute TTL requires. The guarantee comes entirely from lazy evaluation — an expired hold becomes invisible to every reader the moment it lapses, whatever the sweep last did.

`GET /api/shows/[id]/seats` performs no writes. The reason is load rather than purity: it is polled every three seconds by every connected client, so an inline sweep would convert each read into a write and multiply database traffic by the number of open tabs. Physical deletion is confined to the two paths that already have cause to touch those rows — the hold transaction, which clears lapsed rows for the seats it is about to claim, and the daily sweep.

## Concurrency prevention

`SeatAllocation` carries a unique index on `(showId, seatId)`, and that index — not an application-level check, not a raised isolation level — is the mechanism. Claiming seats is a single transaction that deletes lapsed rows for those seats and then inserts new ones with `createMany`. A losing request violates the constraint, Postgres raises `23505`, Prisma surfaces `P2002`, and the handler translates it into `409` naming the seats that were lost.

Two properties follow. Because the insert is one statement, a partial claim is unreachable: a customer selecting three seats gets all three or none. And because seat identifiers are sorted before the transaction opens, every transaction acquires row locks in the same order, so two requests over overlapping sets cannot deadlock.

The same pattern guards every later state change. Confirming a booking is an `updateMany` whose `where` clause requires the row to still exist, to be held by that user, and to be unexpired; the handler asserts the affected count equals the seat count and rolls back otherwise. Promoting a waitlist entry requires its status to still be `WAITING` and checks the count likewise. Nothing reads a row and then acts on what it read.

`scripts/concurrency-test.ts` runs against the deployed URL rather than only localhost, because a single Node process does not reproduce contention across concurrent serverless invocations.

## Waitlist auto-assignment

When a booking is cancelled its allocations are deleted and each freed seat is handed to the oldest waiting entry for that show and seat category, inside the same transaction. Deleting first and committing before offering would leave the seat genuinely available for a few hundred milliseconds, and with a three-second poll running in every open tab a browsing customer would take it before the waitlist ever saw it. Creating the offer's `HELD` allocation in that same transaction means the seat is never publicly available at any point between one owner and the next.

The handoff is set-based: one query for the oldest waiting entry per freed category, one guarded update moving them to `OFFERED`, one insert for the offers, one for their allocations. An earlier per-seat loop took roughly 5.7 seconds for an eight-seat cancellation and exceeded Prisma's default transaction timeout in production; the batched form completes in well under a second.

## Time-limited offers

An offer carries a random token and an `expiresAt` derived from `WAITLIST_OFFER_TTL_SECONDS`. Its paired allocation uses that same instant, so reservation and offer lapse together. The window is not extended on claim: the specification requires the booking to be completed within the time limit, so the offer period is the whole period.

Cascading on expiry cannot be driven by the seat map read, since that endpoint is deliberately write-free. Instead one idempotent function, `processWaitlist(showId)`, expires lapsed offers, releases their seats and promotes the next entries in line. It is called from every path that already writes — cancellation, claim attempts, the daily sweep, and a single call when a show page mounts — and never from the poll. Each step is guarded, so concurrent invocations are safe by construction rather than by locking.

## Limitations

A production system would enqueue a delayed job per offer so promotion fires exactly on expiry. This design has no durable queue, so staleness is bounded by the next write to or view of that show; a show with no traffic could hold an expired offer until the daily cron runs. That is a free-tier constraint the design acknowledges rather than conceals.
