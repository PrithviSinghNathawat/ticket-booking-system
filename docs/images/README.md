# Screenshots

All seven captured by `scripts/screenshots.ts` (Playwright, driven against the production URL — see that file's header comment for how to re-run it; it needs a temporary local `npm i -D playwright && npx playwright install chromium`, removed again once done).

| File | Shot | Used in |
|---|---|---|
| `seat-map.png` | The seat map on `/shows/[showId]`: available, held-by-another, booked, and selected-by-you seats in one frame (desktop, 1440x900) | README (hero, top of file) |
| `seat-map-mobile.png` | The same seat map at 390x844, proving the horizontal scroll is contained to the seat grid, not the page | README (Screenshots section) |
| `checkout.png` | `/checkout/[showId]` with the live hold countdown visible | README (Screenshots section) |
| `ticket.png` | A confirmed booking's page (`/bookings/[reference]`) showing the ticket stub and QR code | README (Screenshots section) |
| `confirmation-email.png` | The booking confirmation email's actual HTML, rendered in a browser via `renderBookingConfirmationEmailPreview` (not a `MAIL_DRY_RUN` log line, not a mail client) | linked from README's Testing section |
| `demo-race.png` | `/demo` mid-race: ten simultaneous hold requests against one seat, every request's outcome, and the single winner | README (Screenshots section) |
| `organiser-revenue.png` | The organiser event summary (`/organiser/events/[id]`) with real, non-zero revenue from a real booking | README (Screenshots section) |
| `admin-venue-builder.png` | The admin venue layout builder with the live seat-map preview populated | README (Screenshots section) |

Note on `seat-map.png`: a customer who already holds a seat on a show can't select further seats (the app correctly blocks it — one hold per show at a time), so "selected by you" and "held by you" can never both appear for the same viewer in a single frame. This screenshot captures four of the five states genuinely, at the moment of active selection before any hold is submitted; see `docs/ENGINEERING-LOG.md`.

Re-running `scripts/screenshots.ts` creates its own throwaway venue/event/show/users each time (named plainly, e.g. "Riverside Cinema") — safe to run repeatedly without touching real seed data.
