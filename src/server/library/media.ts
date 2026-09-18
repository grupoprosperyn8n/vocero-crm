/*
 * 041d — Qué es de verdad un archivo del contenedor universal.
 *
 * Igual que con el icono del CRM, no se confía en el content-type que manda
 * el navegador: se miran los primeros bytes. Imágenes como en `lib/favicon`
 * (PNG, JPEG, WebP, GIF, HEIC/AVIF, ICO, SVG) y video por su firma
 * (MP4/MOV, WebM, AVI, Ogg). Si no se reconoce, no se guarda.
 */

import { sniffFaviconMime } from "@/lib/favicon";

export type LibraryKind = "image" | "video";

export type SniffedMedia = {
  kind: LibraryKind;
  mime: string;
};

/** Video que aceptamos guardar (los que graban celulares y editores). */
export const LIBRARY_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg",
  "video/x-msvideo",
] as const;

export function isLibraryVideoMime(value: string): boolean {
  return (LIBRARY_VIDEO_MIMES as readonly string[]).includes(value);
}

export function sniffLibraryMedia(bytes: Uint8Array): SniffedMedia | null {
  const ascii = (i: number, s: string) =>
    [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));

  // Imágenes primero: reusa el sniffer del icono (PNG/JPEG/ICO/WebP/GIF/HEIC/AVIF/SVG).
  const imagen = sniffFaviconMime(bytes);

  if (imagen) {
    return { kind: "image", mime: imagen };
  }

  // MP4 / MOV: caja ISO-BMFF — "ftyp" en [4,8), marca mayor en [8,12).
  if (ascii(4, "ftyp")) {
    const marca = String.fromCharCode(
      bytes[8] ?? 0,
      bytes[9] ?? 0,
      bytes[10] ?? 0,
      bytes[11] ?? 0
    );

    if (marca === "qt  ") {
      return { kind: "video", mime: "video/quicktime" };
    }

    if (
      ["isom", "iso2", "mp41", "mp42", "M4V ", "avc1", "dash", "msdh"].includes(
        marca
      )
    ) {
      return { kind: "video", mime: "video/mp4" };
    }

    return null;
  }

  // WebM / Matroska: 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { kind: "video", mime: "video/webm" };
  }

  // AVI: "RIFF" .... "AVI "
  if (ascii(0, "RIFF") && ascii(8, "AVI ")) {
    return { kind: "video", mime: "video/x-msvideo" };
  }

  // Ogg: "OggS" (en este contenedor lo tratamos como video/ogg).
  if (ascii(0, "OggS")) {
    return { kind: "video", mime: "video/ogg" };
  }

  return null;
}
