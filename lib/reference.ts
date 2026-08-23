import { randomBytes } from "crypto";

let forcedUsesRemaining = Number(process.env.FORCE_BOOKING_REFERENCE_USES ?? 0);

export function generateBookingReference(): string {
  const forced = process.env.FORCE_BOOKING_REFERENCE_FOR_TEST;
  if (forced && forcedUsesRemaining > 0) {
    forcedUsesRemaining -= 1;
    return forced;
  }
  return `BK-${randomBytes(5).toString("hex").toUpperCase()}`;
}
