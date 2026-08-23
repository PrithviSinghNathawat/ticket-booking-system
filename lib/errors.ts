import { NextResponse } from "next/server";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "NOT_FOUND"
  | "ALREADY_CANCELLED"
  | "HOLD_LAPSED"
  | "ACTIVE_HOLD_EXISTS"
  | "SEAT_CONFLICT"
  | "DUPLICATE_SEAT_IDS"
  | "INVALID_SEATS"
  | "SHOW_NOT_FOUND"
  | "VENUE_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "EVENT_HAS_SHOWS"
  | "SHOW_HAS_BOOKINGS"
  | "VENUE_HAS_SHOWS"
  | "VENUE_HAS_BOOKINGS"
  | "STARTS_AT_IN_PAST"
  | "PRICE_COVERAGE_MISMATCH"
  | "DUPLICATE_ROW_LABEL"
  | "UNKNOWN_CATEGORY"
  | "LAYOUT_FIELDS_INCOMPLETE"
  | "EMAIL_IN_USE"
  | "INVALID_CREDENTIALS"
  | "INVITE_CODE_REQUIRED"
  | "ALREADY_CONVERTED"
  | "NOT_SOLD_OUT"
  | "MISSING_QUERY_PARAM"
  | "OFFER_EXPIRED"
  | "DEMO_DISABLED"
  | "REFERENCE_COLLISION";

export function apiError(
  status: number,
  error: string,
  code: ErrorCode,
  details?: unknown
) {
  return NextResponse.json(
    details !== undefined ? { error, code, details } : { error, code },
    { status }
  );
}
