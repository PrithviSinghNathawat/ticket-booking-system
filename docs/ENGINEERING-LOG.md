# Engineering log

Bugs found by testing rather than by writing. Each entry is symptom, root cause, fix — in that order, because that's the order they were actually found in.

## Booking transaction: foreign-key ordering (`P2003`)

**Symptom.** Confirming a booking failed with Prisma `P2003`, "Foreign key constraint failed on the field."

**Root cause.** `BookingSeat.bookingId` and `SeatAllocation.bookingId` both reference `Booking.id`. Creating either of them before the `Booking` row exists violates the foreign key, deterministically, every time — not an edge case, the very first booking ever attempted would fail this way.

**Fix.** The transaction in [`app/api/bookings/route.ts`](../app/api/bookings/route.ts) creates `Booking` first (line 99), then updates `SeatAllocation` rows to reference it (line 113), then creates `BookingSeat` snapshots last (line 149). Every one of `scripts/booking-test.ts`'s scenarios exercises this ordering; a regression here fails the whole suite immediately, not just one assertion.

## Cancellation transaction timeout (`P2028`)

**Symptom.** Cancelling a booking with several seats occasionally failed with Prisma `P2028`, "Transaction already closed," under real network latency (not on localhost, where the same test passed every time).

**Root cause.** The cancellation transaction does up to `MAX_HOLD_SEATS_PER_REQUEST` sequential waitlist offer-handoffs, each a round trip to Postgres. Prisma's interactive-transaction default timeout is 5 seconds; against real latency to Neon, an 8-seat cancellation measured at roughly 5.7 seconds — past the default, intermittently.

**Fix, in two parts.** Short-term: [`app/api/bookings/[reference]/cancel/route.ts`](../app/api/bookings/[reference]/cancel/route.ts) sets an explicit `timeout: 10000` and `maxDuration = 15`, bounded because the work inside is bounded (capped at the hold endpoint's own seat limit). Real fix, found afterward: see the region-mismatch entry below — the 5.7 seconds was never really about statement count.

## Vercel/Neon region mismatch

**Symptom.** Every database round trip carried roughly 700-800ms of fixed latency, on every endpoint, including the 3-second seat-map poll. This was the actual cause of the `P2028` above, and plausibly of an earlier unreproduced burst anomaly under concurrent load — both are symptoms of the same latency tax, not independent bugs.

**Root cause.** Vercel functions defaulted to `iad1` (Washington DC); Neon's project runs in `ap-southeast-1` (Singapore). Every statement paid transpacific round-trip latency, not "fixed per-statement overhead" as it was first described.

**Fix.** `vercel.json`'s `regions` pinned to `sin1`, matching Neon. Before/after, measured directly:

| Endpoint | Before | After |
|---|---|---|
| 8-seat cancellation | ~5,756ms | ~170ms warm, ~1s on a cold Neon connection |
| `GET /api/shows/[id]/seats` (polled every 3s) | ~2,000-2,400ms | ~180-400ms |

`waitlist-test.ts`'s offer-lapse scenario, which previously needed an inflated TTL to survive the latency, passes at its original short TTL after the fix — independent confirmation this was the real cause, not a coincidence.

## Write amplification on the polled seat map

**Symptom.** Never actually happened in production — caught during design review, before it could.

**Root cause.** `GET /api/shows/[id]/seats` is polled every 3 seconds by every open tab on a show. The obvious implementation — delete expired holds as a side effect of the read that discovers them — turns every read into a write, multiplying database load by the number of connected clients on that specific hot path.

**Fix.** The endpoint computes seat status via lazy expiry (`lib/allocations.ts`: a `HELD` row with `expiresAt` in the past is treated as absent) without deleting anything. Physical cleanup happens only where a write was already happening for another reason: the hold-creation transaction (which deletes expired rows for the seats it's about to claim) and the daily sweep.

## Invisible seat-map legend

**Symptom.** `SeatLegend`'s text was there in the DOM, and every automated check that reads page text found it — but a sighted user would not have been able to read it. It rendered in `text-[var(--panel-dark-fg)]` (a near-white color meant for the seat map's dark panel) directly on the page's near-white background, not inside that panel.

**Root cause.** The legend was a sibling of the dark seat-map panel, not inside it, so its "light text for a dark background" styling had no dark background to sit on.

**Fix.** `components/SeatLegend.tsx` now renders on its own `bg-[var(--panel-dark)]` strip, matching the seat map's visual language instead of the page's. Found during the Phase 9 UI consistency pass by reasoning about what background each color token assumes, not by a test asserting on contrast ratios — worth automating if this project continues.

## Sold-out shows with no link to the waitlist

**Symptom.** The waitlist feature was fully implemented, fully tested (`scripts/waitlist-test.ts`), and unreachable through normal browsing. A sold-out show rendered as an inert `SOLD OUT` badge — a `<span>`, not a link — on `app/events/[id]/page.tsx`. There was no way to click through to join the waitlist without already knowing the show's raw id.

**Root cause.** The non-sold-out branch of the conditional rendered a `<Link>`; the sold-out branch rendered a plain badge, evidently on the assumption that a sold-out show has "nothing to click through to." It has a waitlist.

**Fix.** The sold-out badge is now itself a link to `/shows/[id]`, where the seat map's own sold-out-category UI (join/leave waitlist, offer countdown, claim) already existed and worked — it just needed a door. Found by literally trying to reach the waitlist as a cold reviewer would, during the Phase 8 incognito-timing exercise, not by reading the code.

## `HOLD_TTL_SECONDS` reverted to a leftover test value

**Symptom.** A hold made moments earlier showed "Time remaining: 0:01" in production.

**Root cause.** The Phase 8 region-mismatch investigation temporarily set `HOLD_TTL_SECONDS=5` and `WAITLIST_OFFER_TTL_SECONDS=5` in production to make re-measurement fast. The values were reset via `vercel env` afterward, but production was never redeployed with the change — Vercel doesn't apply an env var update to already-running functions, so the short TTL silently survived until the next deploy.

**Fix.** Reset both values and redeployed. This is exactly the audit item Part F of this phase named in advance ("A leftover 5-second `HOLD_TTL_SECONDS` survived a previous audit") — it happened again, was caught the same way (an incognito walkthrough, not a config diff), and is now something `test:all` run against production would itself catch, since `ttl-test`/`waitlist-test` assert on the actual configured TTL rather than a hardcoded expectation.

## `Input`/`Select` label association was silently broken

**Symptom.** No visible symptom — every form still worked by mouse. Found while writing `scripts/screenshots.ts` and reaching for `page.getByLabel(...)`, which failed to find fields that were visibly, correctly labelled on screen.

**Root cause.** `components/ui/Input.tsx` and `Select` only set an `id` (and the `<label>`'s matching `htmlFor`) when the call site passed an explicit `id` or `name` prop. Almost none did, since the visual result looked identical either way. The label and input were unconnected `<div>` siblings with no `for`/`id` relationship at all — invisible to a mouse user, real to a screen reader or any `getByLabel`-style lookup.

**Fix.** Both components now fall back to React's `useId()` when neither `id` nor `name` is supplied, so every instance gets a stable, unique, correctly-wired id regardless of what the caller passes.

## Five seat-map states can't all appear for one viewer at once

**Symptom.** Attempting to screenshot the seat map with all five states — available, held-by-another, booked, selected-by-you, held-by-you — in one frame for a single logged-in customer.

**Root cause.** This isn't a bug; it's the concurrency model working as designed, encountered while trying to stage a screenshot. `ShowSeatMapClient.tsx`'s `toggleSeat` refuses to select a new seat once the caller has any active hold on that show (`activeHold` from `mySeats.length > 0`), since a customer can only have one hold per show at a time. "Selected" is inherently a pre-hold state; "held by you" is inherently a post-hold state, for the same user, on the same show.

**Fix.** None needed — the behavior is correct. `docs/images/seat-map.png` shows four of the five states genuinely, at the moment of active seat selection before a hold is submitted; see `docs/images/README.md` for the full note.
