import type { ZodType } from "zod";
import { apiError } from "@/lib/errors";

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: ReturnType<typeof apiError> };

export async function parseBody<T>(
  schema: ZodType<T>,
  request: Request
): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError(400, "Invalid JSON body", "INVALID_JSON"),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "Validation failed",
        "VALIDATION_FAILED",
        result.error.flatten().fieldErrors
      ),
    };
  }

  return { ok: true, data: result.data };
}
