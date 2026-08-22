import { randomBytes } from "crypto";

export function generateBookingReference(): string {
  return `BK-${randomBytes(5).toString("hex").toUpperCase()}`;
}
