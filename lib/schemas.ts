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
