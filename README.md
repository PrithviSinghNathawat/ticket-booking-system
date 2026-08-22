# Ticket Booking Platform

A movies-and-concerts ticket booking platform. Next.js 15 (App Router) + TypeScript, Neon Postgres + Prisma, deployed as a single Vercel project.

Live URL: https://unthinkable-two.vercel.app

> This README is filled in incrementally as phases land. Setup steps, the full API table, and the DB schema description arrive in full in the Phase 8 deliverable pass.

## Seat holds, TTL, and the sweep

A held seat is a row in `SeatAllocation` with `status = HELD` and an `expiresAt` timestamp. **The ten-minute guarantee comes entirely from how that row is read, not from anything that deletes it.** Every place that decides whether a seat is available — the seat map, the hold-creation transaction, the "do you already hold something" check — treats a `HELD` row with `expiresAt` in the past as if it doesn't exist. That's a pure function of the row and the current time (`lib/allocations.ts`), so it's correct the instant the TTL lapses, with no scheduled job in the loop.

`POST /api/cron/sweep`, guarded by `Authorization: Bearer <CRON_SECRET>`, and `vercel.json`'s daily cron entry pointing at it, exist purely to keep the `SeatAllocation` table from accumulating stale expired rows forever. **This is best-effort housekeeping, not the enforcement mechanism.** Vercel's Hobby plan only runs a cron once per day, so if this were the only thing freeing expired holds, a seat held at 00:01 would stay locked until the next day's sweep — nowhere near ten minutes. Because expiry is lazy and read-time, that limitation is harmless: the seat map and hold path are correct within milliseconds of expiry regardless of when the cron last ran.

One consequence worth being explicit about: `GET /api/shows/[id]/seats` does **not** delete expired rows as a side effect of a read. The real reason is load, not tidiness: this endpoint is polled every 3 seconds by every connected client, so an inline delete would turn every read into a write and multiply database load by the number of open tabs on that show. It computes status correctly (via the same lazy-expiry logic) without mutating anything. Physical row cleanup happens via the hold-creation transaction (which deletes expired rows for the specific seats it's about to claim) and the daily sweep — never as a side effect of viewing the seat map.

## Known limitations

- **Ambiguous hold outcomes under heavy concurrency.** A hold request can fail in a way that doesn't tell the customer whether they got the seat (a dropped connection, a serverless cold start, a Neon pool timeout) — the request never resolves cleanly to a `2xx` or a `409`. `GET /api/holds/me` is the reconciliation path: it always reflects the true server-side state of what a customer currently holds, so a client that isn't sure what happened should call it rather than guess. This is treated as a handled case, not an edge case that got missed.
- **Neon free-tier cold start.** The database can take a few seconds to wake up after a period of inactivity, which shows up as slow first requests rather than errors.
- **Seeded email addresses aren't real by default.** `alice@ticketing.test` and friends aren't a deliverable domain — Nodemailer's `250 OK` from Gmail means Gmail accepted the message, not that it reached anyone. Set `DEMO_RECIPIENT_EMAIL` and the seed script gives alice, bob and carol `you+alice@…`, `you+bob@…`, `you+carol@…` (Gmail's `+tag` addressing) instead, so every seeded account's mail — booking confirmations and waitlist offers alike — lands in one real inbox you can actually check, while each login email stays unique. Leave it unset and the seed falls back to the non-deliverable `@ticketing.test` addresses.

## Organiser signup

`POST /api/auth/register` accepts `role: "CUSTOMER" | "ORGANISER"`. `ADMIN` is not reachable through any public endpoint — it only exists via the seed script. Registering as `ORGANISER` additionally requires an `inviteCode` matching the `ORGANISER_SIGNUP_CODE` environment variable; a missing or wrong code returns `403` with a message that doesn't reveal whether a code exists at all. This is how the assignment's requirement that organisers can self-register is satisfied without leaving open self-service escalation to a role that can create events.

## Visual direction

One typeface throughout: **Space Grotesk** — its geometric proportions and ticket-stub-style numerals suit a booking product better than the default Inter/system-ui sans everyone reaches for. Palette is warm off-white chrome over a near-black seat map, with a gold/amber accent (not `blue-500`) for primary actions and selection. The five seat states are built to survive greyscale on purpose: each combines a distinct hue with its own border weight/style (thin solid, medium solid, thick solid, thick solid, dashed) and its own glyph (blank, `•`, `×`, `✓`, `⏱`), so no two states rely on color alone to be told apart.
