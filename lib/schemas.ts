import { z } from "zod";
import { MAX_HOLD_SEATS_PER_REQUEST } from "@/lib/config";

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    role: z.enum(["CUSTOMER", "ORGANISER"]).default("CUSTOMER"),
    inviteCode: z.string().optional(),
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const confirmBookingSchema = z
  .object({
    showId: z.string().min(1),
    contactName: z.string().min(1),
    contactEmail: z.string().email(),
    contactPhone: z.string().min(1),
  })
  .strict();

export const holdRequestSchema = z
  .object({
    seatIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_HOLD_SEATS_PER_REQUEST),
  })
  .strict();

export const joinWaitlistSchema = z
  .object({
    categoryId: z.string().min(1),
  })
  .strict();

export const claimWaitlistSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();

const venueRowSchema = z.object({
  label: z.string().min(1),
  seatCount: z.number().int().min(1).max(50),
  categoryName: z.string().min(1),
});

export const createVenueSchema = z
  .object({
    name: z.string().min(1),
    address: z.string().min(1),
    categories: z.array(z.object({ name: z.string().min(1) })).min(1),
    rows: z.array(venueRowSchema).min(1),
  })
  .strict();

export const updateVenueSchema = z
  .object({
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    categories: z.array(z.object({ name: z.string().min(1) })).min(1).optional(),
    rows: z.array(venueRowSchema).min(1).optional(),
  })
  .strict();

export const createEventSchema = z
  .object({
    title: z.string().min(1),
    type: z.enum(["MOVIE", "CONCERT"]),
    description: z.string().min(1),
  })
  .strict();

export const updateEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    type: z.enum(["MOVIE", "CONCERT"]).optional(),
    description: z.string().min(1).optional(),
  })
  .strict();

export const createShowSchema = z
  .object({
    venueId: z.string().min(1),
    startsAt: z.string().datetime(),
    prices: z.array(z.object({ categoryId: z.string().min(1), price: z.number().positive() })).min(1),
  })
  .strict();

export const updateShowSchema = z
  .object({
    startsAt: z.string().datetime().optional(),
    prices: z.array(z.object({ categoryId: z.string().min(1), price: z.number().positive() })).min(1).optional(),
  })
  .strict();
