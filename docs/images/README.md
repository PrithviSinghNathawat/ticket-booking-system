# Screenshot shot list

Claude Code can't take screenshots of a live browser session for this repo, so this is the shot list plus the exact filenames the rest of the documentation already references. Drop files in with these names and every image reference in the root README and `docs/` resolves without further edits.

| File | Shot | Used in |
|---|---|---|
| `seat-map.png` | The seat map on `/shows/[showId]`, all five states visible at once (available, held by others, booked, selected by you, held by you) — pick a show mid-race so more than one state is naturally present | README (hero, top of file) |
| `checkout.png` | `/checkout/[showId]` with the live hold countdown visible | README (Screenshots section) |
| `ticket.png` | A confirmed booking's page (`/bookings/[reference]`) showing the QR code and stub | README (Screenshots section) |
| `confirmation-email.png` | The booking confirmation email as actually received in an inbox (not the `MAIL_DRY_RUN` console log) | not yet embedded; drop in and link from README's Testing section once captured |
| `demo-race.png` | The `/demo` page mid-race, N simultaneous hold requests against one seat, showing every request's status and the single winner | not embeddable yet, `/demo` itself is still unbuilt (see `docs/TRACEABILITY.md`) |
| `organiser-revenue.png` | The organiser event summary (`/organiser/events/[id]`) showing the revenue/occupancy breakdown | README (Screenshots section) |
| `admin-venue-builder.png` | The admin venue layout builder, mid-edit | README (Screenshots section) |

Each is referenced as `docs/images/<file>` with alt text already in place — no other markdown changes needed once the files exist.
