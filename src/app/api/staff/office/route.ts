import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  getTodayOffice,
  OfficeDayError,
  setTodayOffice,
} from "@/server/internal/office-day";

export const dynamic = "force-dynamic";

/** 023 — Sucursal marcada hoy por el empleado (selector de ingreso). */
export const GET = withAuth(async (session) => {
  const today = await getTodayOffice(session.organizationId, session.userId);
  return Response.json({ today });
});

const postSchema = z.object({ officeId: z.string().trim().min(1) });

/** 023 — Marca (o cambia) la sucursal de hoy; una por día, upsert. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  try {
    const today = await setTodayOffice({
      organizationId: session.organizationId,
      userId: session.userId,
      officeId: body.data.officeId,
    });
    return Response.json({ today });
  } catch (err) {
    if (err instanceof OfficeDayError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
});
