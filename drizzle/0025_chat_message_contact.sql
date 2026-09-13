-- 025 — contacto compartido en el chat interno (025_chat_message_contact)
-- Diego: "los contactos se puedan compartir dentro de un chat directo o con un
-- chat grupal ... sea del CRM o de el sistema para que el empleado ejecute
-- algo con ese cliente". kind='contact' + payload con el snapshot.
ALTER TABLE "chat_message" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'text';
ALTER TABLE "chat_message" ADD COLUMN IF NOT EXISTS "payload" jsonb;
