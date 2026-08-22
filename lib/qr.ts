import { createHmac, timingSafeEqual } from "crypto";

const HMAC_HEX_LENGTH = 16;

function getSecret(): string {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) throw new Error("QR_SIGNING_SECRET is not set");
  return secret;
}

function signReference(reference: string): string {
  return createHmac("sha256", getSecret()).update(reference).digest("hex").slice(0, HMAC_HEX_LENGTH);
}

export function buildQrPayload(reference: string): string {
  return `${reference}.${signReference(reference)}`;
}

export function verifyQrPayload(payload: string): { valid: boolean; reference?: string } {
  const separatorIndex = payload.lastIndexOf(".");
  if (separatorIndex === -1) return { valid: false };

  const reference = payload.slice(0, separatorIndex);
  const providedHmac = payload.slice(separatorIndex + 1);
  const expectedHmac = signReference(reference);

  const provided = Buffer.from(providedHmac, "hex");
  const expected = Buffer.from(expectedHmac, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false };
  }

  return { valid: true, reference };
}
