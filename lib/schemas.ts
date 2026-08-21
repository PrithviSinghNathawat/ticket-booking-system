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

export const holdRequestSchema = z
  .object({
    seatIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_HOLD_SEATS_PER_REQUEST),
  })
  .strict();
