import { chromium, type Browser, type BrowserContext } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { buildQrPayload } from "@/lib/qr";
import { renderBookingConfirmationEmailPreview } from "@/lib/mail";

const BASE_URL = process.env.BASE_URL ?? "https://unthinkable-two.vercel.app";
const OUT_DIR = "docs/images";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ADMIN = { email: "admin@ticketing.test", password: "AdminPass123!" };
const ORGANISER = { email: "organiser@ticketing.test", password: "OrganiserPass123!" };

mkdirSync(OUT_DIR, { recursive: true });

async function loginCookie(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`no session cookie for ${email}`);
  return cookie;
}

async function registerCookie(email: string, name: string, password: string): Promise<{ cookie: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, password, role: "CUSTOMER" }),
  });
  if (!res.ok) throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`no session cookie for ${email}`);
  const body = (await res.json()) as { id: string };
  return { cookie, userId: body.id };
}

async function setBrowserCookie(context: BrowserContext, cookie: string) {
  const [pair] = cookie.split(";");
  const [name, value] = pair.split("=");
  const url = new URL(BASE_URL);
  await context.addCookies([
    { name, value, domain: url.hostname, path: "/", httpOnly: true, secure: url.protocol === "https:" },
  ]);
}

async function main() {
  console.log(`Capturing screenshots against BASE_URL=${BASE_URL}`);
  const browser: Browser = await chromium.launch();

  // --- Set up a dedicated venue + event + show for the seat-map/checkout/ticket/revenue shots ---
  const adminCookie = await loginCookie(ADMIN.email, ADMIN.password);
  const venueRes = await fetch(`${BASE_URL}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      name: `Screenshot Venue ${Date.now()}`,
      address: "For docs/images capture only",
      categories: [{ name: "Premium" }],
      rows: [{ label: "A", seatCount: 10, categoryName: "Premium" }],
    }),
  });
  const venue = await venueRes.json();
  console.log("venue created:", venueRes.status, venue.id);

  const venueDetail = await (await fetch(`${BASE_URL}/api/venues/${venue.id}`)).json();
  const categoryId = venueDetail.categories[0].id;

  const organiserCookie = await loginCookie(ORGANISER.email, ORGANISER.password);
  const eventRes = await fetch(`${BASE_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: organiserCookie },
    body: JSON.stringify({ title: "Screenshot Screening", type: "MOVIE", description: "For docs/images capture only." }),
  });
  const event = await eventRes.json();
  console.log("event created:", eventRes.status, event.id);

  const showRes = await fetch(`${BASE_URL}/api/events/${event.id}/shows`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: organiserCookie },
    body: JSON.stringify({
      venueId: venue.id,
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      prices: [{ categoryId, price: 500 }],
    }),
  });
  const show = await showRes.json();
  console.log("show created:", showRes.status, show.id);

  const seatsRes = await fetch(`${BASE_URL}/api/shows/${show.id}/seats`);
  const seatsBody = await seatsRes.json();
  const seats = seatsBody.seats as { seatId: string }[];

  // Seat 1 -> BOOKED (a separate buyer completes a booking)
  const buyer = await registerCookie(`screenshot-buyer-${Date.now()}@ticketing.test`, "Screenshot Buyer", "Password123!");
  await fetch(`${BASE_URL}/api/shows/${show.id}/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: buyer.cookie },
    body: JSON.stringify({ seatIds: [seats[0].seatId] }),
  });
  const buyerBookingRes = await fetch(`${BASE_URL}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: buyer.cookie },
    body: JSON.stringify({
      showId: show.id,
      contactName: "Screenshot Buyer",
      contactEmail: `screenshot-buyer@ticketing.test`,
      contactPhone: "+1-555-0100",
    }),
  });
  const buyerBooking = await buyerBookingRes.json();
  console.log("buyer booking:", buyerBookingRes.status, buyerBooking.reference);

  // Seat 2 -> HELD (another customer holds it and never books, so it stays HELD)
  const holder = await registerCookie(`screenshot-holder-${Date.now()}@ticketing.test`, "Screenshot Holder", "Password123!");
  await fetch(`${BASE_URL}/api/shows/${show.id}/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: holder.cookie },
    body: JSON.stringify({ seatIds: [seats[1].seatId] }),
  });

  // The viewer whose browser we screenshot
  const viewer = await registerCookie(`screenshot-viewer-${Date.now()}@ticketing.test`, "Screenshot Viewer", "Password123!");

  // ================= 1. Seat map: available + held-by-other + booked + selected =================
  // Note: a customer who already holds a seat on a show cannot select further seats (the app
  // correctly blocks it - one hold per show at a time), so "selected" and "held by you" cannot
  // both appear for the same viewer in a single frame. This frame captures four of the five
  // states genuinely, at the moment of active seat selection, before any hold is submitted.
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    await setBrowserCookie(context, viewer.cookie);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/shows/${show.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    // click two more available seats to produce the "selected" state
    const availableButtons = await page.locator('button[data-status="AVAILABLE"]').all();
    await availableButtons[0].click();
    await availableButtons[1].click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/seat-map.png` });
    console.log("saved seat-map.png");

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/seat-map-mobile.png` });
    console.log("saved seat-map-mobile.png");
    await context.close();
  }

  // ================= 2. Checkout with live countdown =================
  // ================= 3. Ticket with QR =================
  let viewerReference = "";
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    await setBrowserCookie(context, viewer.cookie);
    const page = await context.newPage();

    await fetch(`${BASE_URL}/api/shows/${show.id}/holds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: viewer.cookie },
      body: JSON.stringify({ seatIds: [seats[2].seatId, seats[3].seatId] }),
    });

    await page.goto(`${BASE_URL}/checkout/${show.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT_DIR}/checkout.png` });
    console.log("saved checkout.png");

    await page.getByLabel("Contact phone").fill("+1-555-0101");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/bookings\//, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT_DIR}/ticket.png` });
    console.log("saved ticket.png");

    viewerReference = page.url().split("/bookings/")[1];
    await context.close();
  }

  // ================= 4. Confirmation email (rendered HTML, not a mail client) =================
  {
    const bookingRes = await fetch(`${BASE_URL}/api/bookings/${viewerReference}`, {
      headers: { Cookie: viewer.cookie },
    });
    const booking = await bookingRes.json();
    const html = await renderBookingConfirmationEmailPreview({
      reference: booking.reference,
      contactEmail: booking.contactEmail,
      contactName: booking.contactName,
      eventTitle: booking.eventTitle,
      venueName: booking.venueName,
      startsAt: new Date(booking.startsAt),
      seats: booking.seats.map((s: { rowLabel: string; seatNumber: number; categoryName: string; price: string }) => ({
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        categoryName: s.categoryName,
        price: Number(s.price),
      })),
      totalAmount: Number(booking.totalAmount),
      qrPayload: buildQrPayload(booking.reference),
    });
    const wrapped = `<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#f4f4f4">${html}</body></html>`;
    const tmpPath = `${OUT_DIR}/.confirmation-email-preview.html`;
    writeFileSync(tmpPath, wrapped);

    const context = await browser.newContext({ viewport: { width: 500, height: 500 } });
    const page = await context.newPage();
    await page.goto(`file://${process.cwd()}/${tmpPath}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/confirmation-email.png` });
    console.log("saved confirmation-email.png");
    await context.close();
  }

  // ================= 5. /demo mid-race =================
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/demo`, { waitUntil: "domcontentloaded" });
    await page.click("text=Fire");
    await page.waitForSelector("text=Winner:", { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/demo-race.png` });
    console.log("saved demo-race.png");
    await context.close();
  }

  // ================= 6. Organiser revenue with real numbers =================
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    await setBrowserCookie(context, organiserCookie);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/organiser/events/${event.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT_DIR}/organiser-revenue.png` });
    console.log("saved organiser-revenue.png");
    await context.close();
  }

  // ================= 7. Admin venue layout builder, live preview populated =================
  // The form's draft state defaults to one populated row, so the live preview seat map renders
  // as soon as the page loads, before any typing.
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    await setBrowserCookie(context, adminCookie);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/admin/venues`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.getByLabel("Venue name").fill("Preview Cinema");
    await page.getByLabel("Address").fill("1 Preview Street");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT_DIR}/admin-venue-builder.png` });
    console.log("saved admin-venue-builder.png");
    await context.close();
  }

  await browser.close();
  console.log("\nDone. Screenshots written to docs/images/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
