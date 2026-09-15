import { apiError, withAuth } from "@/lib/api";
import { isOrgMember, listBoardCards } from "@/server/pipeline/board";
import { getBranding } from "@/server/branding";
import { seesWholeTeam } from "@/lib/pipeline";
import type { PipelineBoard } from "@/lib/types";

export const dynamic = "force-dynamic";

const BOARDS = ["ventas", "gestiones"] as const;

/**
 * 029 — el tablero del pipeline personal.
 * `board` elige la pestaña; `assignee` (solo para quien ve todo el equipo)
 * filtra "me" | "all" | <userId>. Un member no tiene parámetro que lo saque
 * de sus propias tarjetas.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const boardParam = url.searchParams.get("board") ?? "ventas";
  if (!BOARDS.includes(boardParam as (typeof BOARDS)[number])) {
    return apiError(422, "invalid_board", "Tablero inexistente");
  }
  const board = boardParam as PipelineBoard;

  let assignee = url.searchParams.get("assignee");
  if (!seesWholeTeam(session.role)) {
    assignee = null; // un member jamás sale de lo suyo, aunque lo pida
  } else if (assignee && assignee !== "me" && assignee !== "all") {
    const ok = await isOrgMember(session.organizationId, assignee);
    if (!ok) return apiError(422, "invalid_assignee", "Ese usuario no es del equipo");
  }

  const { stages, cards } = await listBoardCards({
    organizationId: session.organizationId,
    viewerUserId: session.userId,
    viewerRole: session.role,
    board,
    assignee,
  });

  // La moneda del negocio viaja con el tablero: el cliente suma sus columnas y
  // necesita saber cuál es la única sumable, sin adivinarla ni pedirla aparte.
  const { currency } = await getBranding(session.organizationId);

  return Response.json({
    board,
    currency,
    stages,
    cards,
    seesWholeTeam: seesWholeTeam(session.role),
  });
});
