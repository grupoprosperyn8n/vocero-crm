import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveProposalResponse } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** 30 respuestas / hora por IP y pieza (páginas públicas, sin sesión). */
const RESPOND_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 30 };

const schema = z.object({
  /** [{label, value}] — lo que la persona completó en el formulario/encuesta. */
  data: z
    .array(
      z.object({
        label: z.string().trim().max(200),
        value: z.string().trim().max(2000),
      })
    )
    .min(1)
    .max(20),
});

/**
 * 044b-B11 — respuesta enviada desde la página pública de un formulario o
 * encuesta. Sin sesión (la página es abierta), con límite de tasa por IP.
 */
export async function POST(req: Request, ctx: Params) {
  const { token } = await ctx.params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const gate = checkRateLimit(`respond:${ip}:${token}`, RESPOND_RATE_LIMIT);
  if (!gate.allowed) {
    return apiError(429, "rate_limited", "Demasiados envíos seguidos. Probá de nuevo en un rato.");
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const result = await saveProposalResponse({ token, data: body.data.data });
  if (!result.ok) {
    const msg =
      result.code === "not_a_widget"
        ? "Esta página no recibe respuestas"
        : result.code === "empty"
          ? "Completá al menos un campo"
          : "La publicación no está disponible";
    return apiError(result.code === "not_found" ? 404 : 400, result.code, msg);
  }
  return Response.json({ ok: true }, { status: 201 });
}
