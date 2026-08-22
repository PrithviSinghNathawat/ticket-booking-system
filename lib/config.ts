export const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 600);

export const WAITLIST_OFFER_TTL_SECONDS = Number(
  process.env.WAITLIST_OFFER_TTL_SECONDS ?? 900
);

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const MAIL_DRY_RUN = process.env.MAIL_DRY_RUN === "true";

export const MAX_HOLD_SEATS_PER_REQUEST = 10;

export const DEMO_RECIPIENT_EMAIL = process.env.DEMO_RECIPIENT_EMAIL || null;
