-- 031 — «macheo» etapa ↔ estado de la ALERTA (tablero de gestiones).
-- Cada columna del tablero de gestiones queda atada al estado REAL del
-- sistema (mismos nombres): mover la tarjeta escribe ese estado en la tabla
-- ALERTA y el estado del sistema reacomoda la tarjeta.

ALTER TABLE "pipeline_stage" ADD COLUMN IF NOT EXISTS "estado" text;--> statement-breakpoint

-- Etapas sembradas por 028 → nombres/estados del sistema (solo si conservan
-- su nombre original; una etapa renombrada a mano se respeta).
UPDATE "pipeline_stage" SET "name" = 'Pendiente', "estado" = 'PENDIENTE'
 WHERE "board" = 'gestiones' AND "name" = 'Nueva' AND "estado" IS NULL;--> statement-breakpoint
UPDATE "pipeline_stage" SET "name" = 'En progreso', "estado" = 'EN_PROGRESO'
 WHERE "board" = 'gestiones' AND "name" = 'En curso' AND "estado" IS NULL;--> statement-breakpoint
UPDATE "pipeline_stage" SET "name" = 'Concluida', "estado" = 'CONCLUIDA'
 WHERE "board" = 'gestiones' AND "name" = 'Resuelta' AND "estado" IS NULL;--> statement-breakpoint

-- Resto del tablero sin estado (p.ej. renombradas): por su ancla.
UPDATE "pipeline_stage"
   SET "estado" = CASE WHEN "kind" = 'won' THEN 'CONCLUIDA' ELSE 'EN_PROGRESO' END
 WHERE "board" = 'gestiones' AND "estado" IS NULL;--> statement-breakpoint

-- Faltantes por organización: Turno confirmado (abierta) y Anulada (perdida).
INSERT INTO "pipeline_stage" ("id", "organization_id", "name", "position", "kind", "board", "estado")
SELECT 'stg_' || substr(md5(o."id" || '_g_tc'), 1, 20), o."id", 'Turno confirmado', 2, 'open', 'gestiones', 'TURNO_CONFIRMADO'
FROM "organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "pipeline_stage" s
  WHERE s."organization_id" = o."id" AND s."board" = 'gestiones' AND s."estado" = 'TURNO_CONFIRMADO'
);--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id", "organization_id", "name", "position", "kind", "board", "estado")
SELECT 'stg_' || substr(md5(o."id" || '_g_an'), 1, 20), o."id", 'Anulada', 4, 'lost', 'gestiones', 'ANULADA'
FROM "organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "pipeline_stage" s
  WHERE s."organization_id" = o."id" AND s."board" = 'gestiones' AND s."estado" = 'ANULADA'
);--> statement-breakpoint

-- Orden de columnas: Pendiente · En progreso · Turno confirmado · Concluida · Anulada.
UPDATE "pipeline_stage" SET "position" = CASE "estado"
    WHEN 'PENDIENTE' THEN 0
    WHEN 'EN_PROGRESO' THEN 1
    WHEN 'TURNO_CONFIRMADO' THEN 2
    WHEN 'CONCLUIDA' THEN 3
    WHEN 'ANULADA' THEN 4
    ELSE "position" END
 WHERE "board" = 'gestiones' AND "estado" IS NOT NULL;
