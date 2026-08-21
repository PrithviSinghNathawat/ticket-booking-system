# Ticket Booking Platform

A movies-and-concerts ticket booking platform. Next.js 15 (App Router) + TypeScript, Neon Postgres + Prisma, deployed as a single Vercel project.

Live URL: https://unthinkable-two.vercel.app

> This README is filled in incrementally as phases land. Setup steps, the full API table, and the DB schema description arrive in full in the Phase 8 deliverable pass.

## Seat holds, TTL, and the sweep

A held seat is a row in `SeatAllocation` with `status = HELD` and an `expiresAt` timestamp. **The ten-minute guarantee comes entirely from how that row is read, not from anything that deletes it.** Every place that decides whether a seat is available — the seat map, the hold-creation transaction, the "do you already hold something" check — treats a `HELD` row with `expiresAt` in the past as if it doesn't exist. That's a pure function of the row and the current time (`lib/allocations.ts`), so it's correct the instant the TTL lapses, with no scheduled job in the loop.

`POST /api/cron/sweep`, guarded by `Authorization: Bearer <CRON_SECRET>`, and `vercel.json`'s daily cron entry pointing at it, exist purely to keep the `SeatAllocation` table from accumulating stale expired rows forever. **This is best-effort housekeeping, not the enforcement mechanism.** Vercel's Hobby plan only runs a cron once per day, so if this were the only thing freeing expired holds, a seat held at 00:01 would stay locked until the next day's sweep — nowhere near ten minutes. Because expiry is lazy and read-time, that limitation is harmless: the seat map and hold path are correct within milliseconds of expiry regardless of when the cron last ran.

One consequence worth being explicit about: `GET /api/shows/[id]/seats` does **not** delete expired rows as a side effect of a read. It computes status correctly (via the same lazy-expiry logic) without mutating anything, so a `GET` stays a pure read. Physical row cleanup happens via the hold-creation transaction (which deletes expired rows for the specific seats it's about to claim) and the daily sweep — never as a side effect of viewing the seat map.

## Organiser signup

`POST /api/auth/register` accepts `role: "CUSTOMER" | "ORGANISER"`. `ADMIN` is not reachable through any public endpoint — it only exists via the seed script. Registering as `ORGANISER` additionally requires an `inviteCode` matching the `ORGANISER_SIGNUP_CODE` environment variable; a missing or wrong code returns `403` with a message that doesn't reveal whether a code exists at all. This is how the assignment's requirement that organisers can self-register is satisfied without leaving open self-service escalation to a role that can create events.
