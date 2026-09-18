/*
 * 041d — CONTENEDOR UNIVERSAL DE ARCHIVOS (imágenes y videos).
 *
 * Un solo estante para todo el equipo: se sube desde cualquier ficha, se
 * elige desde ahí para armar las publicidades y lo que sube dueño/
 * propietario/gerente queda PROTEGIDO (no se quita). Bytes en base64 en la
 * DB porque el disco del contenedor no persiste entre despliegues.
 */

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeAdImage, esRasterProcesable } from "@/server/images/normalize";

import {
  canDeleteLibraryItem,
  isProtectedUploaderRole,
  isManagerOrAbove,
} from "@/server/proposals/permissions";
import { sniffLibraryMedia, type LibraryKind } from "./media";

export class LibraryError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** 40 MB por archivo: un video de celular corto entra; uno largo no. */
export const MAX_LIBRARY_UPLOAD_BYTES = 40 * 1024 * 1024;

export type LibraryAssetDto = {
  id: string;
  name: string;
  kind: LibraryKind;
  mime: string;
  byteSize: number;
  url: string;
  uploaderName: string | null;
  uploaderRole: string;
  protected: boolean;
  canDelete: boolean;
  createdAt: string;
};

function toDto(
  row: {
    id: string;
    name: string;
    kind: string;
    mime: string;
    byteSize: number;
    uploadedBy: string | null;
    uploadedByRole: string;
    protected: boolean;
    createdAt: Date;
  },
  uploaderName: string | null,
  viewer: { userId: string | null; role: string }
): LibraryAssetDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "video" ? "video" : "image",
    mime: row.mime,
    byteSize: row.byteSize,
    url: `/api/library/${row.id}/raw`,
    uploaderName,
    uploaderRole: row.uploadedByRole,
    protected: row.protected,
    canDelete: canDeleteLibraryItem({
      viewerRole: viewer.role,
      viewerId: viewer.userId,
      uploadedBy: row.uploadedBy,
      protected: row.protected,
    }),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLibraryAssets(input: {
  organizationId: string;
  viewerUserId: string | null;
  viewerRole: string;
  kind?: string | null;
}): Promise<LibraryAssetDto[]> {
  const db = getDb();
  const filtros = [
    scoped(schema.libraryAsset.organizationId, input.organizationId),
    isNull(schema.libraryAsset.deletedAt),
  ];

  if (input.kind === "image" || input.kind === "video") {
    filtros.push(eq(schema.libraryAsset.kind, input.kind));
  }

  const rows = await db
    .select({ a: schema.libraryAsset, uploaderName: schema.user.name })
    .from(schema.libraryAsset)
    .leftJoin(schema.user, eq(schema.libraryAsset.uploadedBy, schema.user.id))
    .where(and(...filtros))
    .orderBy(desc(schema.libraryAsset.createdAt))
    .limit(300);

  return rows.map(({ a, uploaderName }) =>
    toDto(a, uploaderName, { userId: input.viewerUserId, role: input.viewerRole })
  );
}

export async function createLibraryAsset(input: {
  organizationId: string;
  userId: string;
  userRole: string;
  name: string;
  bytes: Uint8Array;
}): Promise<LibraryAssetDto> {
  if (input.bytes.byteLength === 0) {
    throw new LibraryError("El archivo llegó vacío", 400, "empty_file");
  }

  if (input.bytes.byteLength > MAX_LIBRARY_UPLOAD_BYTES) {
    throw new LibraryError(
      "El archivo no puede pasar de 40 MB",
      413,
      "too_large"
    );
  }

  const sniffed = sniffLibraryMedia(input.bytes);

  if (!sniffed) {
    throw new LibraryError(
      "No reconocemos el formato del archivo (imágenes o videos)",
      415,
      "bad_mime"
    );
  }

  let data = input.bytes;
  let mime = sniffed.mime;

  // Las imágenes ráster se adaptan (WebP ≤1920): viajan livianas a la pieza
  // y a WhatsApp. SVG/ICO y videos van tal cual.
  if (sniffed.kind === "image" && esRasterProcesable(mime)) {
    try {
      const normalizada = await normalizeAdImage(input.bytes);

      data = normalizada.data;
      mime = normalizada.mime;
    } catch {
      // Si sharp no puede, se guarda el original: el archivo es válido.
    }
  }

  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || `archivo-${Date.now()}`;

  const id = newId("libraryAsset");
  const db = getDb();

  await db.insert(schema.libraryAsset).values({
    id,
    organizationId: input.organizationId,
    name,
    kind: sniffed.kind,
    mime,
    byteSize: data.byteLength,
    data: Buffer.from(data).toString("base64"),
    uploadedBy: input.userId,
    uploadedByRole: input.userRole,
    protected: isProtectedUploaderRole(input.userRole),
  });

  return getLibraryAsset({
    organizationId: input.organizationId,
    id,
    viewer: { userId: input.userId, role: input.userRole },
  });
}

export async function getLibraryAsset(input: {
  organizationId: string;
  id: string;
  viewer: { userId: string | null; role: string };
}): Promise<LibraryAssetDto> {
  const db = getDb();
  const rows = await db
    .select({ a: schema.libraryAsset, uploaderName: schema.user.name })
    .from(schema.libraryAsset)
    .leftJoin(schema.user, eq(schema.libraryAsset.uploadedBy, schema.user.id))
    .where(
      and(
        scoped(schema.libraryAsset.organizationId, input.organizationId),
        eq(schema.libraryAsset.id, input.id),
        isNull(schema.libraryAsset.deletedAt)
      )
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw new LibraryError("Archivo no encontrado", 404, "not_found");
  }

  return toDto(row.a, row.uploaderName, input.viewer);
}

/** Bytes crudos (para servir el archivo). */
export async function loadLibraryAssetBytes(input: {
  organizationId: string;
  id: string;
}): Promise<{ mime: string; name: string; data: Buffer } | null> {
  const db = getDb();
  const rows = await db
    .select({
      mime: schema.libraryAsset.mime,
      name: schema.libraryAsset.name,
      data: schema.libraryAsset.data,
    })
    .from(schema.libraryAsset)
    .where(
      and(
        scoped(schema.libraryAsset.organizationId, input.organizationId),
        eq(schema.libraryAsset.id, input.id),
        isNull(schema.libraryAsset.deletedAt)
      )
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return { mime: row.mime, name: row.name, data: Buffer.from(row.data, "base64") };
}

export async function deleteLibraryAsset(input: {
  organizationId: string;
  id: string;
  viewer: { userId: string | null; role: string };
}): Promise<{ name: string }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.libraryAsset)
    .where(
      and(
        scoped(schema.libraryAsset.organizationId, input.organizationId),
        eq(schema.libraryAsset.id, input.id),
        isNull(schema.libraryAsset.deletedAt)
      )
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
    throw new LibraryError("Archivo no encontrado", 404, "not_found");
  }

  const permitido = canDeleteLibraryItem({
    viewerRole: input.viewer.role,
    viewerId: input.viewer.userId,
    uploadedBy: row.uploadedBy,
    protected: row.protected,
  });

  if (!permitido) {
    throw row.protected
      ? new LibraryError(
          "Lo subió el dueño o un gerente: no se puede quitar",
          403,
          "protected"
        )
      : new LibraryError("No podés quitar ese archivo", 403, "forbidden");
  }

  await db
    .update(schema.libraryAsset)
    .set({ deletedAt: new Date() })
    .where(
      and(
        scoped(schema.libraryAsset.organizationId, input.organizationId),
        eq(schema.libraryAsset.id, input.id)
      )
    );

  return { name: row.name };
}

/** ¿Puede gestionar (subir/borrar de todo)? Para la UI. */
export function libraryViewerRoleLabel(role: string): string {
  return isManagerOrAbove(role) ? "manager+" : "member";
}
