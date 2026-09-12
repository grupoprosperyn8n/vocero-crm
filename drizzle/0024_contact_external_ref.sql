-- 0024_contact_external_ref — Vínculo del contacto del CRM con su registro
-- en el sistema de gestión externo (Airtable SGSA). Formato `sgsa:<recordId>`.
-- Es la llave del matching backend↔CRM (pedido Diego 2026-09-12): sobrevive
-- cambios de teléfono y evita duplicar contactos.
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "external_ref" text;
