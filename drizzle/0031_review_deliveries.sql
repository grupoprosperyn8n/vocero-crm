-- 033b — Multi-destino de la tarjeta de revisión de envío (pedido Diego 16Sep:
-- «el dueño puede elegir VARIOS destinos»): cada regla activa del tipo
-- REVISION_ENVIO_SINIESTRO recibe su propia copia de la tarjeta en el chat
-- interno (empleados y/o grupos) y una sola decisión actualiza todas las copias.
--
-- `deliveries`: array [{roomId, messageId, kind, targetId, name}] por fila de
-- review_request. Backfill: las filas existentes tienen UNA sola entrega
-- (room_id/message_id) — el código cae a esa pareja cuando `deliveries` es null.
ALTER TABLE "review_request" ADD COLUMN IF NOT EXISTS "deliveries" jsonb;--> statement-breakpoint
UPDATE "review_request"
SET "deliveries" = jsonb_build_array(
  jsonb_build_object('roomId', "room_id", 'messageId', "message_id")
)
WHERE "deliveries" IS NULL;
